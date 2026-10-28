#!/usr/bin/env node
// 品牌图标素材包构建脚本（Lead 专用，单一写入者）
// 输入: .local/brand-icon-pack/targets.json + .local/brand-icon-pack/fragments/*.json + raw/<task>/<file>
// 输出: public/assets/brand-icons/**  (标准化 SVG + 1024px 透明 PNG + manifest.json + README.md + 预览.html)
// 用法: node scripts/build-brand-icon-pack.mjs [--check-only]
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const ROOT = path.resolve(import.meta.dirname, "..")
const WORK = path.join(ROOT, ".local/brand-icon-pack")
const OUT = path.join(ROOT, "public/assets/brand-icons")
const CHECK_ONLY = process.argv.includes("--check-only")

const GROUP_LABEL = {
  brands: "厂家品牌",
  platforms: "智能家居平台",
  protocols: "通信协议 / 技术标准",
  ecosystem: "生态兼容徽标",
  certification: "认证与合规标识",
}
const GROUP_DIR = { brands: "brands", platforms: "platforms", protocols: "protocols", ecosystem: "ecosystem", certification: "certification" }

const escapeXml = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const isCjk = (char) => /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(char)

const lineWidth = (text) => [...text].reduce((total, char) => total + (isCjk(char) ? 1 : 0.58), 0)

function layoutLines(label) {
  if (lineWidth(label) <= 4.4) return [label]
  const words = label.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    let best = null
    for (let i = 1; i < words.length; i += 1) {
      const head = words.slice(0, i).join(" ")
      const tail = words.slice(i).join(" ")
      const score = Math.max(lineWidth(head), lineWidth(tail))
      if (!best || score < best.score) best = { score, head, tail }
    }
    return [best.head, best.tail]
  }
  const chars = [...label]
  let best = null
  for (let i = 1; i < chars.length; i += 1) {
    const head = chars.slice(0, i).join("")
    const tail = chars.slice(i).join("")
    const score = Math.max(lineWidth(head), lineWidth(tail))
    if (!best || score < best.score) best = { score, head, tail }
  }
  return [best.head, best.tail]
}

export function textBadgeSvg(label) {
  const lines = layoutLines(label)
  const unit = Math.max(...lines.map((line) => lineWidth(line)))
  const size = Math.min(64, 184 / unit)
  const lineHeight = size * 1.16
  const firstY = lines.length === 1 ? 120 + size * 0.34 : 120 - lineHeight / 2 + size * 0.34
  const spans = lines
    .map((line, index) => (index === 0 ? escapeXml(line) : `<tspan x="120" y="${(firstY + index * lineHeight).toFixed(1)}">${escapeXml(line)}</tspan>`))
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<title>${escapeXml(label)}</title>
<rect width="240" height="240" rx="52" fill="#EEF2F7"/>
<text x="120" y="${firstY.toFixed(1)}" text-anchor="middle" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Helvetica, Arial, sans-serif" font-size="${size.toFixed(1)}" font-weight="600" fill="#0F172A">${spans}</text>
</svg>
`
}

function badgeLabel(meta, item) {
  return String(meta.badgeLabel || item.badge || meta.nameZh || item.nameZh || item.slug)
}

export function normalizeSvg(raw, { title, colorHint }) {
  let svg = raw
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, "")
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, "")
  svg = svg.replace(/<!--[\s\S]*?-->/g, "")
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
  svg = svg.replace(/<title[\s\S]*?<\/title>/gi, "")
  svg = svg.replace(/<desc[\s\S]*?<\/desc>/gi, "")
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "")
  svg = svg.replace(/<script[^>]*\/>/gi, "")
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
  svg = svg.replace(/<image[\s\S]*?<\/image>/gi, "")
  svg = svg.replace(/<image[^>]*\/?>/gi, "")

  const openMatch = svg.match(/<svg\b([^>]*)>/i)
  if (!openMatch) throw new Error("找不到 <svg> 根标签")
  const attrs = openMatch[1]
  let viewBox = (attrs.match(/viewBox\s*=\s*["']([^"']+)["']/i) || [])[1]
  if (!viewBox) {
    const width = parseFloat((attrs.match(/\bwidth\s*=\s*["']([\d.]+)/i) || [])[1])
    const height = parseFloat((attrs.match(/\bheight\s*=\s*["']([\d.]+)/i) || [])[1])
    if (!width || !height) throw new Error("既没有 viewBox 也没有可用的 width/height")
    viewBox = `0 0 ${width} ${height}`
  }
  const numbers = viewBox.trim().split(/[\s,]+/).map(Number)
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) throw new Error(`viewBox 不合法: ${viewBox}`)

  const inner = svg.slice(openMatch.index + openMatch[0].length, svg.lastIndexOf("</svg>"))
  // currentColor 不算"显式颜色"：它由 CSS color 属性决定，可以在根节点统一指定
  const probe = inner.replace(/\s(fill|stroke)\s*=\s*["']currentColor["']/gi, "")
  const hasExplicitColor =
    /fill\s*[:=]\s*["']?\s*(#|rgb|hsl|url)/i.test(probe) || /fill\s*=\s*["'](?!none)/i.test(probe) || /stroke\s*=\s*["'](?!none)/i.test(probe)
  // 单色图标：根节点同时给 color（供 currentColor 引用）和 fill（供无 fill 的路径继承）
  // 注意不能删 stroke/fill="currentColor"，描边类图标（icon-park、MDI）删了就成空白图
  const colorAttr = hasExplicitColor ? "" : ` color="${colorHint || "#111827"}" fill="${colorHint || "#111827"}"`
  const body = inner.trim()
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${numbers.join(" ")}"${colorAttr}>
<title>${escapeXml(title)}</title>
${body}
</svg>
`
}

async function loadFragments() {
  const dir = path.join(WORK, "fragments")
  const map = new Map()
  let files = []
  try {
    files = await readdir(dir)
  } catch {
    return map
  }
  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    const list = JSON.parse(await readFile(path.join(dir, file), "utf8"))
    for (const entry of list) {
      const existing = map.get(entry.slug)
      // 补采产生的重复记录：带真实文件的优先；两个都有文件时按文件名后者覆盖前者
      if (existing && existing.file && !entry.file) continue
      map.set(entry.slug, { ...entry, fragment: file })
    }
  }
  return map
}

// 统一出图：裁掉透明边 → 限制最大边长（不放大，避免糊）→ 四周留 3% 透明边
// 这样每张图的内容都尽量占满画布，放进 PPT / 预览页时视觉大小才一致
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

async function trimToContent(buffer) {
  try {
    const meta = await sharp(buffer).metadata()
    // 没有透明通道的源图（App 图标这类自带方形底色的）没有透明边可裁：
    // 若照裁，sharp 会拿左上角像素色当背景，把整条同色底衬削掉（HDL 就被削成了 1024×814）
    if (!meta.hasAlpha) return buffer
    // 只裁真正的透明边
    const trimmed = await sharp(buffer).trim({ background: TRANSPARENT, threshold: 8 }).png().toBuffer()
    const { width, height } = await sharp(trimmed).metadata()
    if (!width || !height || width < 8 || height < 8) return buffer
    return trimmed
  } catch {
    return buffer
  }
}

async function writePadded(buffer, target, { maxSize }) {
  const trimmed = await trimToContent(buffer)
  const { width, height } = await sharp(trimmed).metadata()
  const fitted = await sharp(trimmed)
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
  const fittedMeta = await sharp(fitted).metadata()
  const padX = Math.max(2, Math.round(fittedMeta.width * 0.03))
  const padY = Math.max(2, Math.round(fittedMeta.height * 0.03))
  await sharp(fitted)
    .extend({ top: padY, bottom: padY, left: padX, right: padX, background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toFile(target)
  return { trimmed: `${width}x${height}`, final: `${fittedMeta.width + padX * 2}x${fittedMeta.height + padY * 2}` }
}

async function renderPng(svg, target) {
  const rendered = await sharp(Buffer.from(svg), { density: 400 })
    .resize({ width: 1000, height: 1000, fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer()
  return writePadded(rendered, target, { maxSize: 1024 })
}

async function main() {
  const targets = JSON.parse(await readFile(path.join(WORK, "targets.json"), "utf8"))
  const fragments = await loadFragments()

  const items = []
  const report = []
  for (const [task, config] of Object.entries(targets.tasks)) {
    for (const target of config.targets) {
      const meta = fragments.get(target.slug)
      const group = config.group
      const record = { task, group, ...target, meta }
      items.push(record)
      if (!meta) report.push(`✗ ${target.slug.padEnd(14)} 缺 fragment 记录`)
    }
  }
  const missing = report.length
  if (missing) {
    console.log(report.join("\n"))
    console.log(`\n共 ${items.length} 个目标，缺元数据 ${missing} 个`)
    if (CHECK_ONLY) process.exit(1)
  }

  if (!CHECK_ONLY) await rm(OUT, { recursive: true, force: true })
  const manifest = []

  for (const item of items) {
    const meta = item.meta || {}
    const groupDir = GROUP_DIR[item.group]
    const kind = meta.kind || "logo"
    const title = [meta.nameZh, meta.nameEn].filter(Boolean).join(" / ") || item.slug
    const colorHint = (meta.colorHint || "").trim()
    let svg
    let sourceKind = kind

    if (kind === "text-badge" || !meta.file) {
      svg = textBadgeSvg(badgeLabel(meta, item))
      sourceKind = "text-badge"
    } else {
      let raw = null
      // 查找顺序：写这条元数据的采集任务目录 → 任务在 targets 里的归属目录 → 其余目录
      const ownDir = (meta.fragment || "").replace(/\.json$/, "")
      const order = [ownDir, item.task].filter(Boolean)
      const candidates = order.map((dir) => path.join(WORK, "raw", dir, meta.file))
      for (const dir of await readdir(path.join(WORK, "raw")).catch(() => [])) {
        if (!order.includes(dir)) candidates.push(path.join(WORK, "raw", dir, meta.file))
      }
      for (const rawPath of candidates) {
        try {
          raw = await readFile(rawPath)
          break
        } catch {
          /* 继续找 */
        }
      }
      if (!raw) {
        report.push(`✗ ${item.slug.padEnd(14)} raw 文件不存在: raw/${item.task}/${meta.file} → 降级为文字徽标`)
        svg = textBadgeSvg(badgeLabel(meta, item))
        sourceKind = "text-badge"
        raw = null
      }
      if (raw) {
        if (meta.file.toLowerCase().endsWith(".png")) {
          // 只有确实没有矢量版时才允许 PNG：裁掉透明边、不放大、四周补 3% 透明边
          const prepared = await sharp(raw).png().toBuffer()
          const tmp = path.join(WORK, `tmp-${item.slug}.png`)
          await mkdir(WORK, { recursive: true })
          await writePadded(prepared, tmp, { maxSize: 2000 })
          svg = `png:${(await readFile(tmp)).toString("base64")}`
          await rm(tmp, { force: true })
          sourceKind = kind
        } else {
          try {
            svg = normalizeSvg(raw.toString("utf8"), { title, colorHint })
          } catch (error) {
            report.push(`✗ ${item.slug.padEnd(14)} SVG 规范化失败: ${error.message} → 降级为文字徽标`)
            svg = textBadgeSvg(badgeLabel(meta, item))
            sourceKind = "text-badge"
          }
        }
      }
    }

    const isBitmap = svg.startsWith("png:")
    const vectorRel = `/assets/brand-icons/${groupDir}/${item.slug}.svg`
    const bitmapRel = `/assets/brand-icons/${groupDir}/${item.slug}.png`
    const pngRel = `/assets/brand-icons/png/${groupDir}/${item.slug}.png`
    if (!CHECK_ONLY) {
      const vectorPath = path.join(OUT, groupDir, `${item.slug}.svg`)
      const pngPath = path.join(OUT, "png", groupDir, `${item.slug}.png`)
      await mkdir(path.dirname(vectorPath), { recursive: true })
      await mkdir(path.dirname(pngPath), { recursive: true })
      if (isBitmap) {
        const buffer = Buffer.from(svg.slice(4), "base64")
        await writeFile(pngPath, buffer)
        await writeFile(path.join(OUT, groupDir, `${item.slug}.png`), buffer) // 只有位图版来源时，原图一并留档
      } else {
        await writeFile(vectorPath, svg)
        await renderPng(svg, pngPath)
      }
    }

    manifest.push({
      slug: item.slug,
      group: item.group,
      nameZh: meta.nameZh || item.nameZh,
      nameEn: meta.nameEn || item.nameEn,
      file: isBitmap ? bitmapRel : vectorRel,
      png: pngRel,
      kind: sourceKind,
      tier: meta.tier || "-",
      source: meta.source || "-",
      sourceUrl: meta.sourceUrl || "",
      sourceName: meta.sourceName || "",
      license: meta.license || (sourceKind === "text-badge" ? "不适用（无第三方素材，徽标由 Lead 生成）" : ""),
      licenseUrl: meta.licenseUrl || "",
      attributionRequired: Boolean(meta.attributionRequired),
      colorHint: meta.colorHint || "",
      trademarkNote: meta.trademarkNote || "",
      usageNote: meta.usageNote || "",
      verifiedAt: meta.verifiedAt || "",
      notes: meta.notes || "",
    })
  }

  if (CHECK_ONLY) {
    console.log(`检查通过：${items.length} 个目标，缺元数据 ${missing} 个`)
    return
  }

  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(path.join(OUT, "README.md"), buildReadme(manifest))
  await writeFile(path.join(OUT, "预览.html"), buildPreview(manifest))
  await buildContactSheet(manifest)

  const byTier = manifest.reduce((acc, entry) => ({ ...acc, [entry.tier]: (acc[entry.tier] || 0) + 1 }), {})
  console.log(`已生成 ${manifest.length} 个图标 → ${path.relative(ROOT, OUT)}`)
  console.log(`tier 分布: ${JSON.stringify(byTier)}，文字徽标 ${manifest.filter((m) => m.kind === "text-badge").length} 个`)
  if (report.length) console.log(`\n需要注意:\n${report.join("\n")}`)
}

function buildReadme(manifest) {
  const groups = ["brands", "platforms", "protocols", "ecosystem", "certification"]
  const attribution = manifest.filter((entry) => entry.attributionRequired)
  const badges = manifest.filter((entry) => entry.kind === "text-badge")
  const table = (group) =>
    manifest
      .filter((entry) => entry.group === group)
      .map((entry) => `| ${entry.nameZh} | ${entry.nameEn} | \`${entry.file.split("/").pop()}\` | ${entry.kind} | ${entry.tier} | ${entry.sourceName || entry.source} | ${entry.license} |`)
      .join("\n")

  return `# 品牌 / 平台 / 协议 / 兼容徽标 / 认证标识 素材包

本目录是"繁梦空间"产品库涉及的品牌与合规标识素材集合，可直接用于方案书、报价单、PPT、官网等场景。

- \`brands/\` — 产品库里出现过的 ${manifest.filter((m) => m.group === "brands").length} 个厂家品牌
- \`platforms/\` — 可能用到的 ${manifest.filter((m) => m.group === "platforms").length} 个智能家居平台
- \`protocols/\` — 可能用到的 ${manifest.filter((m) => m.group === "protocols").length} 个通信协议 / 技术标准
- \`ecosystem/\` — ${manifest.filter((m) => m.group === "ecosystem").length} 个生态兼容徽标（"Works with / 已接入"类）
- \`certification/\` — ${manifest.filter((m) => m.group === "certification").length} 个认证与合规标识（CE / WEEE / 能源之星 / Wi-Fi CERTIFIED 等）
- \`png/<分组>/\` — 同名透明背景 PNG，已裁掉透明边、四周统一留 3% 透明留白，直接拖进 Word / PPT / 设计软件。**尺寸不统一**（长边多在 1000～1100px，宽字标更宽，最大约 2100px），因为每张都按图形本身裁边；官网只给小图的几个按原图尺寸输出、不放大，放大看会略软；米家、HDL 这两张官方 App 图标自带底色方块（按官方 1:1 保留，不做裁边）
- \`manifest.json\` — 每个图标的来源、许可、商标说明（机器可读）
- \`预览.html\` — 双击打开即可看到全部图标和来源

## 怎么用

| 场景 | 用哪个文件 |
| --- | --- |
| PPT / Word / 方案书 | \`png/brands/xiaomi.png\` 这类 PNG，已裁边、四周留白一致 |
| 网页 / 前端 | \`brands/xiaomi.svg\`（矢量，可任意缩放、可改色） |
| 需要灰度版 | 对 SVG 用 \`filter: grayscale(1)\`，PNG 同理 |
| 查来源 / 版权 | \`manifest.json\` 或 \`预览.html\` 上每个图标下面的来源链接 |

## 兼容徽标与认证标识：先看这条

**这两类标识不是"好看的贴纸"，是使用受限的商标/合规标识。**

- 认证类（CE / WEEE / 能源之星 / Wi-Fi CERTIFIED / Zigbee / DALI-2 / KNX）：**只能用在确实取得该认证的产品或方案上**；
- 兼容类（Works with Apple Home / Google Home / Alexa / 已接入米家 / 鸿蒙智联 / Powered by Tuya / 天猫精灵 / 小度 / SmartThings / Matter）：**只能用在确实通过对应认证或接入的产品上**，且不得暗示合作或授权关系。

**10 个兼容徽标已经全部收到真实图形**，来源档位如下（A=商标方官方原件、B=认证伙伴/官方副本、C=非公开渠道取得）：

| 徽标 | 档位 | 来源说明 |
| --- | --- | --- |
| Works with Apple Home | A | Apple 开发者官网直接引用的 SVG 原件 |
| works with alexa | A | Amazon 开发者门户 CDN 的官方 600×200 版 |
| Works with Samsung SmartThings | A | 三星官方品牌规范页徽标包 |
| 鸿蒙智联 HarmonyOS Connect | A | 华为设备伙伴门户在用的官方生态标（非带认证编号的完整认证标） |
| 小度 Xiaodu | A | 百度自有 CDN 上的官方标识锁定版（红蓝方标 + Xiaodu 字标）；具体引用页面未定位到，建议向百度确认 |
| Matter | A | CSA 官网「Logo and Brand Assets Library」的官方 Matter 标志（浅底用深色版）。CSA 没有单独的「Matter Certified」认证标，认证产品对外用的就是 Matter 标志本身。**注意**：它与本包 \`protocols/\` 组里的 Matter 标志是同一图形（一个位图、一个矢量），二者任选其一 |
| works with Google Home | B | 认证伙伴（易来官网）发布的官方版；Google 全域在本机不可达，取不到 Google 自家原件 |
| 已接入米家 MIJIA | B | 易来官方开放平台页伙伴墙的官方 CDN 图（非小米官网原发，需完整版请向米家申请） |
| 天猫精灵 TMALL GENIE | C | 花瓣（huaban.com）用户上传的官方标识锁定版（点阵猫头 + 天猫精灵 + TMALL GENIE）。**注意**：这不是「精灵智控」蓝色药丸认证签——那个只随"精灵打标"申请发放、由淘宝/天猫展示，公开渠道没有独立文件。**分辨率有限（250×150）**：PPT 里宽度控制在 3.5cm 内、打印不超过 1.8cm，再放大会发虚，正式物料请换官方件 |
| Powered by Tuya | C | 从涂鸦官方《包装设计规范》里按标识自身边界框裁出的橙色版（不缩放/不改色） |

**正确用法**：这些只是"图形文件"，不代表你已经取得使用授权。正式对外物料请走对应官方流程索取原件后再用：Apple MFi、Amazon WWA、Google Home 合作伙伴计划、小米 IoT 接入、华为设备伙伴门户、涂鸦 PBT 审核、天猫精灵精灵打标、小度合作计划、CSA 会员。

## 使用前先看这几条

0. **WEEE 那张是位图放大件**：官方文件（丹麦主管机构标识指引 PDF）里的符号本身是 170×194 的小位图，没有矢量版；成品按 600dpi 渲染，放大看边缘会略软。正式印刷物料建议向主管机构索取矢量件。

1. **没有图形的 ${badges.length} 个用了统一文字徽标**（${badges.map((m) => m.nameZh).join("、")}）——这些要么是品牌只提供小位图、要么是技术标准本身没有官方标志（RS-485、PoE、红外、干接点这类）。同风格、可直接替换使用。
2. **有 6 个是"官网只给深色底专用标志，包内改成浅色底可用版"**（只改颜色、形状未动，原件都留档）：Aqara 品牌标（官网白字 → 黑）、Aqara Home 平台标（官网白字 → 深色）、ORVIBO 欧瑞博（官网白字 → 品牌深蓝）、Legrand 罗格朗（官网白字 → 深色）、天猫精灵（官方浅金渐变 → 深灰）、苏米 SUMI（官网白色字标 → 深墨，渐变图形未动）。官网上这几张直接放白底 PPT 是看不见的。
3. **有 4 个做了背景透明化**（官网只给"图形压在底色上"的不透明图，只去背景、图形未动）：领普 Linptech（深灰底上的字标）、杜亚 DOOYA、Modbus、DALI（后三个是白底）。去掉底色后放到深色背景上会比原件略淡，深色底优先用原件或 SVG。
4. **H3C** 官网那张 logo 图里除字标外还带了一行中文标语，包内只保留字标本体（未改色、未缩放）。
5. **海康威视**收录的是官方红色「H」标记，不是 HIKVISION 字标——字标在可访问的官网上没有达到可用分辨率的版本。
6. **Somfy** 收录的是官方专业渠道字标「somfy PRO」，含 PRO 字样，正式物料如介意可向品牌方索取纯字标。
7. **米家、HDL** 用的是官方 App 图标（自带底色方块），不是企业字标；**鹿客**官方英文名已改为 Lockin；**苏米**收录的是官网页头完整锁定版（含小字「智能家居」）。
8. **以太网**用的是通用网口图形（MDI 图标集），不是 IEEE 官方标志；**蓝牙 Mesh** 是蓝牙官方符号 + 「Mesh」文字的合成件。
9. 个别 SVG 里的颜色来自原文件；如果用于深色背景，优先用 SVG 并自行改色。

## 授权与使用边界

素材分四档来源（本包：A 档 ${manifest.filter((m) => m.tier === "A").length} 个、B 档 ${manifest.filter((m) => m.tier === "B").length} 个、C 档 ${manifest.filter((m) => m.tier === "C").length} 个、D 档 ${manifest.filter((m) => m.tier === "D").length} 个）：

- **A 档**：品牌方 / 标准组织 / 认证机构 / 政府 **官网原件**
- **B 档**：**不是商标方官网原件**的官方素材——包括第三方图标库版本（Simple Icons 等，CC0 / CC-BY / MIT / Apache-2.0）与**认证伙伴官网页上的官方副本**；正式物料建议向商标方索取原件；需要署名的会在下面列出
- **C 档**：**非公开渠道**取得（从官方文档/规范图里按标识自身边界框裁切，未缩放未改色），只作内部示意，正式物料必须换官方原件
- **D 档**：找不到可用的官方图形，使用统一制作的文字徽标（\`kind: text-badge\`），共 ${badges.length} 个

${attribution.length ? `### 需要保留署名的图标（${attribution.length} 个，CC-BY-4.0 / Apache-2.0）\n\n${attribution.map((entry) => `- ${entry.nameZh}（${entry.slug}）：${entry.sourceName} — ${entry.sourceUrl}`).join("\n")}\n` : ""}
### 商标声明

**所有品牌标志的商标权归各自品牌方所有。** 这里收录的只是图形文件与来源记录，不代表任何授权、合作或背书关系。使用建议：

1. 只用于"识别/指代该品牌产品"的场景（方案清单、兼容性说明、设备清单），不要用在暗示合作、代理、认证的地方；
2. 不要改动标志的比例、配色和组合方式；
3. 对外正式物料如果需要大尺寸或印刷级 Logo，优先向品牌方索取官方 VI 文件；
4. 品牌更换 VI 后，重新跑一遍生成脚本即可更新（见下）。

### 目录内容一览

${groups
  .map(
    (group) => `#### ${GROUP_LABEL[group]}（${manifest.filter((m) => m.group === group).length}）
| 中文名 | 英文名 | 文件 | 类型 | 来源档 | 来源 | 许可 |
| --- | --- | --- | --- | --- | --- | --- |
${table(group)}`,
  )
  .join("\n\n")}

## 怎么更新

1. 把新的原始图放到 \`.local/brand-icon-pack/raw/<任务名>/\`，并在 \`.local/brand-icon-pack/fragments/<任务名>.json\` 补一条记录；
2. 运行 \`node scripts/brand-icons-check.mjs --dir .local/brand-icon-pack/raw/<任务名>\` 自检；
3. 运行 \`node scripts/build-brand-icon-pack.mjs\` 重新生成整个素材包。

生成日期：${new Date().toISOString().slice(0, 10)}
`
}

function buildPreview(manifest) {
  const groups = ["brands", "platforms", "protocols", "ecosystem", "certification"]
  const tierColor = { A: "#0f766e", B: "#b45309", C: "#7c3aed", D: "#64748b", "-": "#94a3b8" }
  const card = (entry) => `      <figure class="card">
        <div class="thumb"><img src="${entry.png.replace("/assets/brand-icons/", "")}" alt="${escapeXml(entry.nameZh)}" loading="lazy"></div>
        <figcaption>
          <strong>${escapeXml(entry.nameZh)}</strong>
          <span class="en">${escapeXml(entry.nameEn)}</span>
          <span class="meta"><code>${entry.slug}</code><em style="background:${tierColor[entry.tier] || "#94a3b8"}">${entry.tier}</em>${entry.kind === "text-badge" ? '<i class="badge">文字徽标</i>' : ""}</span>
          <a href="${entry.sourceUrl || "#"}" target="_blank" rel="noreferrer">${escapeXml(entry.sourceName || entry.source)}</a>
        </figcaption>
      </figure>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>品牌图标素材包 · 预览</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 28px 80px; font: 15px/1.5 "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
  h1 { margin: 0 0 6px; font-size: 26px; }
  p.lead { margin: 0 0 28px; color: #475569; }
  h2 { margin: 42px 0 14px; font-size: 19px; border-left: 4px solid #0f766e; padding-left: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(178px, 1fr)); gap: 14px; }
  .card { margin: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .thumb { height: 96px; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#f1f5f9 0 25%, #fff 0 50%) 0 0/16px 16px; border-radius: 8px; }
  .thumb img { max-width: 100%; max-height: 88px; object-fit: contain; }
  figcaption { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  .en { color: #64748b; font-size: 12px; }
  .meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  code { background: #f1f5f9; border-radius: 4px; padding: 1px 5px; font-size: 11px; }
  em { color: #fff; font-style: normal; font-size: 11px; border-radius: 4px; padding: 1px 6px; }
  i.badge { font-style: normal; font-size: 11px; color: #475569; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0 5px; }
  a { color: #0f766e; font-size: 11px; text-decoration: none; word-break: break-all; }
  footer { margin-top: 48px; color: #64748b; font-size: 12px; }
</style>
</head>
<body>
<h1>品牌 / 平台 / 协议 图标素材包</h1>
<p class="lead">共 ${manifest.length} 个图标 · 生成于 ${new Date().toISOString().slice(0, 10)} · 每个图标下方是实际来源链接 · 商标归各品牌方所有，仅作品牌识别使用</p>
${groups
  .map(
    (group) => `<h2>${GROUP_LABEL[group]} · ${manifest.filter((m) => m.group === group).length}</h2>
<div class="grid">
${manifest.filter((m) => m.group === group).map(card).join("\n")}
</div>`,
  )
  .join("\n")}
<footer>文件位置：<code>public/assets/brand-icons/</code> · 矢量版在 <code>brands/</code> <code>platforms/</code> <code>protocols/</code>，透明 PNG 在 <code>png/</code> · 来源与许可见 <code>manifest.json</code></footer>
</body>
</html>
`
}

async function buildContactSheet(manifest) {
  const columns = 8
  const cell = 150
  const rows = Math.ceil(manifest.length / columns)
  const tiles = await Promise.all(
    manifest.map(async (entry, index) => {
      const source = path.join(OUT, "png", entry.group, `${entry.slug}.png`)
      const input = await sharp(source).resize({ width: 104, height: 104, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer()
      return { input, left: (index % columns) * cell + 23, top: Math.floor(index / columns) * cell + 12 }
    }),
  )
  const sheet = path.join(WORK, "contact-sheet.png")
  await mkdir(WORK, { recursive: true })
  await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: "#ffffff" } })
    .composite(tiles)
    .png()
    .toFile(sheet)
  console.log(`对照图: ${path.relative(ROOT, sheet)}`)
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
