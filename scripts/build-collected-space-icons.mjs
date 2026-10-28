#!/usr/bin/env node
// 房间 / 场景图标「网上图标库版」素材包构建（Lead 单一写入者）
// 图标全部来自开源图标库 Material Design Icons（经 Iconify 分发，Apache-2.0），不从零手绘。
// 输入: .local/space-icons/collected-map.json
// 输出: public/assets/space-icons-web/**（SVG + 透明 PNG + manifest.json + README.md + 预览.html）
// 用法: node scripts/build-collected-space-icons.mjs [--refresh]
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ROOT = path.resolve(import.meta.dirname, "..")
const MAP = path.join(ROOT, ".local/space-icons/collected-map.json")
const CACHE = path.join(ROOT, ".local/space-icons/collected-raw")
const OUT = path.join(ROOT, "public/assets/space-icons-web")
const REFRESH = process.argv.includes("--refresh")
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const GROUP_LABEL = { rooms: "房间图标", scenes: "场景图标" }

const escapeXml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

async function fetchIcon(iconId, { refresh }) {
  const file = path.join(CACHE, `${iconId.replace(":", "_")}.svg`)
  if (!refresh) {
    try {
      return await readFile(file, "utf8")
    } catch {
      /* 缓存没有就下载 */
    }
  }
  const url = `https://api.iconify.design/${iconId.replace(":", "/")}.svg?height=200`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载失败 ${iconId}: HTTP ${response.status}`)
  const svg = await response.text()
  await mkdir(CACHE, { recursive: true })
  await writeFile(file, svg)
  return svg
}

/** 统一成与仓库其它图标一致的干净 SVG：只留 viewBox、加标题、颜色走根节点。 */
function normalize(svg, { title, color, iconId }) {
  const open = svg.match(/<svg\b[^>]*>/i)
  if (!open) throw new Error(`${iconId} 不是合法 SVG`)
  const viewBox = (open[0].match(/viewBox\s*=\s*["']([^"']+)["']/i) || [])[1]
  if (!viewBox) throw new Error(`${iconId} 缺少 viewBox`)
  let inner = svg.slice(open.index + open[0].length, svg.lastIndexOf("</svg>"))
  inner = inner.replace(/<title[\s\S]*?<\/title>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").trim()
  if (/<image|<foreignObject|<script/i.test(inner)) throw new Error(`${iconId} 含不允许的元素`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" color="${color}" fill="${color}"><title>${escapeXml(title)}</title>${inner}</svg>\n`
}

async function renderPng(svg, target, maxSize = 1024) {
  const rendered = await sharp(Buffer.from(svg), { density: 400 })
    .resize({ width: maxSize, height: maxSize, fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer()
  const meta = await sharp(rendered).metadata()
  const padX = Math.max(2, Math.round(meta.width * 0.03))
  const padY = Math.max(2, Math.round(meta.height * 0.03))
  await sharp(rendered)
    .extend({ top: padY, bottom: padY, left: padX, right: padX, background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toFile(target)
}

function buildReadme(manifest, source) {
  const rows = (group) =>
    manifest
      .filter((entry) => entry.group === group)
      .map((entry) => `| ${entry.nameZh} | ${entry.nameEn} | \`${entry.group}/${entry.id}.svg\` | \`png/${entry.group}/${entry.id}.png\` | ${entry.icon} | ${entry.warning ? "⚠ 见下方注意" : ""} |`)
      .join("\n")
  return `# 房间 / 场景图标（网上图标库版）

这版图标**全部来自开源图标库**，不是手绘：[${source.collectionName}](${source.licenseUrl})，
通过 [Iconify](https://iconify.design/) 分发（源头是 ${source.collection} 集合，许可 ${source.license}，**需保留署名**）。
共 ${manifest.length} 个：${manifest.filter((m) => m.group === "rooms").length} 个房间 + ${manifest.filter((m) => m.group === "scenes").length} 个场景。

- \`rooms/\` \`scenes/\` — 矢量 SVG（24×24 viewBox，单色，颜色已按分组设好）
- \`png/<分组>/\` — 同名透明底 PNG（矢量渲染、已裁边），拖进 Word / PPT / 设计软件直接用
- \`manifest.json\` — 每个图标的中英文名、原始图标 ID、来源与许可
- \`预览.html\` — 双击打开即可看到全部图标

## ⚠ 使用注意

${manifest.filter((m) => m.warning).map((m) => `- **${m.nameZh}（${m.id}，${m.icon}）**：${m.warning}`).join("\n") || "- 无"}

## 署名（必读）

图标来自 **Material Design Icons（Pictogrammers）**，许可 **Apache-2.0**：对外物料里如果直接使用这些图标，
请在物料末尾或说明页保留一句署名，例如「图标：Material Design Icons (Pictogrammers)，Apache-2.0」。
完整来源：https://pictogrammers.com/library/mdi/

## 和另一版（手绘版）怎么选

| | 网上图标库版（本目录） | 手绘版（\`public/assets/space-icons/\`） |
| --- | --- | --- |
| 来源 | Material Design Icons 开源图标库 | 照仓库设备点位图标的线条语言新画 |
| 风格 | 实心填充块面，通用、现代 | 与点位图/设备图标同款 CAD 线条 |
| 适合 | PPT / 方案书 / 网页 / 页面图例 | 与设备图标混排的点位图、图例 |
| 改色 | 改 SVG 的 \`color\`/\`fill\` | 改 SVG 的 \`stroke\` |

## 目录内容一览

${Object.keys(GROUP_LABEL)
  .map(
    (group) => `#### ${GROUP_LABEL[group]}（${manifest.filter((m) => m.group === group).length}）
| 中文名 | 英文名 | 矢量 | 透明 PNG | 原始图标 | 注意 |
| --- | --- | --- | --- | --- | --- |
${rows(group)}`,
  )
  .join("\n\n")}

生成日期：${new Date().toISOString().slice(0, 10)}
`
}

function buildPreview(manifest) {
  const card = (entry) => `      <figure class="card">
        <div class="thumb"><img src="png/${entry.group}/${entry.id}.png" alt="${escapeXml(entry.nameZh)}" loading="lazy"></div>
        <figcaption><strong>${escapeXml(entry.nameZh)}</strong><span>${escapeXml(entry.nameEn)}</span><code>${entry.icon}</code>${entry.warning ? '<em class="warn">⚠ 图形为衣帽架造型，建议配文字或用手绘版</em>' : ""}</figcaption>
      </figure>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>房间 / 场景图标（网上图标库版）· 预览</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 28px 80px; font: 15px/1.5 "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
  h1 { margin: 0 0 6px; font-size: 26px; }
  p.lead { margin: 0 0 8px; color: #475569; }
  p.note { margin: 0 0 28px; color: #b45309; font-size: 13px; }
  h2 { margin: 40px 0 14px; font-size: 19px; border-left: 4px solid #0f766e; padding-left: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 14px; }
  .card { margin: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .thumb { height: 92px; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#f1f5f9 0 25%, #fff 0 50%) 0 0/16px 16px; border-radius: 8px; }
  .thumb img { max-width: 100%; max-height: 84px; object-fit: contain; }
  figcaption { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  figcaption span { color: #64748b; font-size: 12px; }
  code { background: #f1f5f9; border-radius: 4px; padding: 1px 5px; font-size: 11px; }
  em.warn { color: #b45309; font-style: normal; font-size: 11px; }
  footer { margin-top: 48px; color: #64748b; font-size: 12px; }
</style>
</head>
<body>
<h1>房间 / 场景图标（网上图标库版）</h1>
<p class="lead">共 ${manifest.length} 个图标 · 全部来自开源图标库 Material Design Icons（Pictogrammers），Apache-2.0 · 生成于 ${new Date().toISOString().slice(0, 10)}</p>
<p class="note">对外物料请保留署名：图标 Material Design Icons (Pictogrammers)，Apache-2.0</p>
${Object.keys(GROUP_LABEL)
  .map(
    (group) => `<h2>${GROUP_LABEL[group]} · ${manifest.filter((m) => m.group === group).length}</h2>
<div class="grid">
${manifest.filter((m) => m.group === group).map(card).join("\n")}
</div>`,
  )
  .join("\n")}
<footer>文件位置：<code>public/assets/space-icons-web/</code> · 每个图标下面是它在开源图标库里的原始 ID</footer>
</body>
</html>
`
}

async function buildContactSheet(manifest) {
  const columns = 7
  const cell = 150
  const rows = Math.ceil(manifest.length / columns)
  const tiles = await Promise.all(
    manifest.map(async (entry, index) => ({
      input: await sharp(path.join(OUT, "png", entry.group, `${entry.id}.png`))
        .resize({ width: 96, height: 96, fit: "contain", background: TRANSPARENT })
        .png()
        .toBuffer(),
      left: (index % columns) * cell + 27,
      top: Math.floor(index / columns) * cell + 15,
    })),
  )
  const sheet = path.join(ROOT, ".local/space-icons/contact-sheet-web.png")
  await mkdir(path.dirname(sheet), { recursive: true })
  await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: "#ffffff" } })
    .composite(tiles)
    .png()
    .toFile(sheet)
  console.log(`对照图: ${path.relative(ROOT, sheet)}`)
}

async function main() {
  const map = JSON.parse(await readFile(MAP, "utf8"))
  const source = map.source
  const manifest = []
  await rm(OUT, { recursive: true, force: true })
  for (const group of ["rooms", "scenes"]) {
    const color = map.palette[group]
    await mkdir(path.join(OUT, group), { recursive: true })
    await mkdir(path.join(OUT, "png", group), { recursive: true })
    for (const [id, definition] of Object.entries(map[group])) {
      const raw = await fetchIcon(definition.icon, { refresh: REFRESH })
      const title = `${definition.nameZh} ${definition.nameEn}`
      const svg = normalize(raw, { title, color, iconId: definition.icon })
      await writeFile(path.join(OUT, group, `${id}.svg`), svg)
      await renderPng(svg, path.join(OUT, "png", group, `${id}.png`))
      manifest.push({
        id,
        group,
        nameZh: definition.nameZh,
        nameEn: definition.nameEn,
        icon: definition.icon,
        svg: `/assets/space-icons-web/${group}/${id}.svg`,
        png: `/assets/space-icons-web/png/${group}/${id}.png`,
        color,
        notes: definition.notes ?? "",
        warning: definition.warning ?? "",
        sourceUrl: `https://icon-sets.iconify.design/${definition.icon.replace(":", "/")}/`,
        collection: source.collectionName,
        license: source.license,
        licenseUrl: source.licenseUrl,
        attributionRequired: source.attributionRequired,
      })
    }
  }
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(path.join(OUT, "README.md"), buildReadme(manifest, source))
  await writeFile(path.join(OUT, "预览.html"), buildPreview(manifest))
  await buildContactSheet(manifest)
  console.log(`已生成 ${manifest.length} 个图标 → ${path.relative(ROOT, OUT)}（来源：${source.collectionName} ${source.license}）`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
