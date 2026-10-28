#!/usr/bin/env node
// 房间 / 场景图标素材包构建（Lead 单一写入者）
// 输入: lib/space-icons/{rooms,scenes}.mjs 的几何定义
// 输出: public/assets/space-icons/**  (SVG + 512px 透明 PNG + manifest.json + README.md + 预览.html)
// 用法: node scripts/build-space-icon-pack.mjs
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { SPACE_ICON_COLORS } from "../lib/space-icons/shared.mjs"
import { renderSpaceIcon, spaceIconGroups } from "../lib/space-icons.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
const OUT = path.join(ROOT, "public/assets/space-icons")
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const GROUP_LABEL = { rooms: "房间图标", scenes: "场景图标" }
const GROUP_NOTE = {
  rooms: "用于点位图图例、报价单分房小标题、方案书目录",
  scenes: "用于场景面板图例、方案书场景页、面板刻字参考",
}

const escapeXml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** 渲染透明 PNG：裁掉透明边 → 限制最大边长 → 四周补 3% 透明留白（与品牌图标包同一口径）。 */
async function renderPng(svg, target, maxSize = 1024) {
  const rendered = await sharp(Buffer.from(svg), { density: 400 })
    .resize({ width: maxSize, height: maxSize, fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer()
  const trimmed = await sharp(rendered).trim({ background: TRANSPARENT, threshold: 8 }).png().toBuffer().catch(() => rendered)
  const meta = await sharp(trimmed).metadata()
  const padX = Math.max(2, Math.round(meta.width * 0.03))
  const padY = Math.max(2, Math.round(meta.height * 0.03))
  await sharp(trimmed)
    .extend({ top: padY, bottom: padY, left: padX, right: padX, background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toFile(target)
}

function buildReadme(manifest) {
  const rows = (group) =>
    manifest
      .filter((entry) => entry.group === group)
      .map((entry) => `| ${entry.nameZh} | ${entry.nameEn} | \`${entry.group}/${entry.id}.svg\` | \`png/${entry.group}/${entry.id}.png\` |`)
      .join("\n")
  return `# 房间 / 场景图标素材包

与站点里的设备点位图标（\`public/assets/point-icons/v1/\`）**同一套画法**：相同坐标空间、相同线条语言，
可以放心跟设备图标混排；因为线条是矢量且不含文字，任意放大不糊、也能一键改色。

- \`rooms/\` — ${manifest.filter((m) => m.group === "rooms").length} 个房间图标：${GROUP_NOTE.rooms}
- \`scenes/\` — ${manifest.filter((m) => m.group === "scenes").length} 个场景图标：${GROUP_NOTE.scenes}
- \`png/<分组>/\` — 同名透明底 PNG（矢量渲染、已裁边，**长边 578~860px**），拖进 Word / PPT / 设计软件直接用
- \`manifest.json\` — 图标清单（id、中英文名、文件路径、线色），机器可读
- \`预览.html\` — 双击打开即可看到全部图标

## 另一版：网上图标库版

同一批房间/场景还有一套**从开源图标库收集的版本**：\`public/assets/space-icons-web/\`（房间/场景各一组，来源 Material Design Icons，Apache-2.0）。两版怎么选：

| | 手绘版（本目录） | 网上图标库版（\`public/assets/space-icons-web/\`） |
| --- | --- | --- |
| 来源 | 照仓库设备点位图标的线条语言新画 | 开源图标库 Material Design Icons |
| 风格 | 线条（描边），与点位图/设备图标同款 | 实心块面，通用现代 |
| 适合 | 与设备图标混排的点位图、CAD 图例 | PPT / 方案书 / 网页 / 界面图例 |
| 改色 | 改 SVG 的 \`stroke\` | 改 SVG 的 \`color\` / \`fill\` |

> 注意：图标库版里「走廊」那一枚没有合适的现成图形（用的是一个衣帽架造型的图标，已在那边标注），走廊建议用本目录这版。

## 使用注意（已知取舍）

1. **场景图标里的「全开 / 全关」是一对**：全开是亮着的灯泡 + 向上箭头，全关是灯泡 + 斜杠（灭）。建议成对使用、不要拆散；如果只单用一个，请配上文字，避免误读。
2. **「走廊」「老人房」在 24px 以下会偏弱**：走廊是平面俯视画法（两面墙 + 门洞），老人房靠"窄床 + 拐杖"的拐杖钩区分；建议这两个图标的显示尺寸不低于 24px，或配文字标签一起用。
3. **「起夜」画的是"马桶 + 小月牙"**（夜里去卫生间），不要和「睡眠」（月牙 + 星星）放在同一屏相邻位置。
4. 图标都是**一笔一画的线条**、统一线色（房间深灰蓝、场景青），如果要放进深色背景，直接改 SVG 里的 \`stroke\` 即可。

## 怎么用

| 场景 | 用哪个文件 |
| --- | --- |
| PPT / Word / 方案书 | \`png/rooms/living-room.png\` 这类 PNG，透明底 |
| 网页 / 前端 / CAD | \`rooms/living-room.svg\`（矢量，可任意缩放） |
| 想换颜色 | 直接改 SVG 里的 \`stroke\`（房间统一 \`${SPACE_ICON_COLORS.rooms}\`，场景统一 \`${SPACE_ICON_COLORS.scenes}\`），或在网页里用 CSS \`filter\` |

## 画法约定（后面加图标要照着来）

- 坐标空间固定 \`-1.4 ~ 1.4\`，图形控制在 \`-1.1 ~ 1.1\`，y 轴向上（渲染时统一翻转）
- 只有线条没有填充；每张图 3~8 条线；线宽轮廓 0.10~0.13、细节 0.07~0.09
- 不使用文字、字体、位图和圆形元素（圆用采样折线近似）
- 新增或修改图标：改 \`lib/space-icons/rooms.mjs\` / \`scenes.mjs\`，然后依次运行
  \`node scripts/generate-space-icons.mjs\` 与 \`node scripts/build-space-icon-pack.mjs\`

## 目录内容一览

${Object.keys(GROUP_LABEL)
  .map(
    (group) => `#### ${GROUP_LABEL[group]}（${manifest.filter((m) => m.group === group).length}）
| 中文名 | 英文名 | 矢量 | 透明 PNG |
| --- | --- | --- | --- |
${rows(group)}`,
  )
  .join("\n\n")}

生成日期：${new Date().toISOString().slice(0, 10)}
`
}

function buildPreview(manifest) {
  const card = (entry) => `      <figure class="card">
        <div class="thumb"><img src="png/${entry.group}/${entry.id}.png" alt="${escapeXml(entry.nameZh)}" loading="lazy"></div>
        <figcaption><strong>${escapeXml(entry.nameZh)}</strong><span>${escapeXml(entry.nameEn)}</span><code>${entry.id}</code></figcaption>
      </figure>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>房间 / 场景图标素材包 · 预览</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 28px 80px; font: 15px/1.5 "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
  h1 { margin: 0 0 6px; font-size: 26px; }
  p.lead { margin: 0 0 28px; color: #475569; }
  h2 { margin: 40px 0 14px; font-size: 19px; border-left: 4px solid #0f766e; padding-left: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 14px; }
  .card { margin: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .thumb { height: 92px; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#f1f5f9 0 25%, #fff 0 50%) 0 0/16px 16px; border-radius: 8px; }
  .thumb img { max-width: 100%; max-height: 84px; object-fit: contain; }
  figcaption { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  figcaption span { color: #64748b; font-size: 12px; }
  code { background: #f1f5f9; border-radius: 4px; padding: 1px 5px; font-size: 11px; }
  footer { margin-top: 48px; color: #64748b; font-size: 12px; }
</style>
</head>
<body>
<h1>房间 / 场景图标素材包</h1>
<p class="lead">共 ${manifest.length} 个图标 · 与设备点位图标同一套画法 · 生成于 ${new Date().toISOString().slice(0, 10)}</p>
${Object.keys(GROUP_LABEL)
  .map(
    (group) => `<h2>${GROUP_LABEL[group]} · ${manifest.filter((m) => m.group === group).length}</h2>
<div class="grid">
${manifest.filter((m) => m.group === group).map(card).join("\n")}
</div>`,
  )
  .join("\n")}
<footer>文件位置：<code>public/assets/space-icons/</code> · 矢量在 <code>rooms/</code> <code>scenes/</code>，透明 PNG 在 <code>png/</code></footer>
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
        .resize({ width: 104, height: 104, fit: "contain", background: TRANSPARENT })
        .png()
        .toBuffer(),
      left: (index % columns) * cell + 23,
      top: Math.floor(index / columns) * cell + 12,
    })),
  )
  const sheet = path.join(ROOT, ".local/space-icons/contact-sheet.png")
  await mkdir(path.dirname(sheet), { recursive: true })
  await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: "#ffffff" } })
    .composite(tiles)
    .png()
    .toFile(sheet)
  console.log(`对照图: ${path.relative(ROOT, sheet)}`)
}

async function main() {
  await rm(path.join(OUT, "png"), { recursive: true, force: true })
  const manifest = []
  for (const [group, definitions] of Object.entries(spaceIconGroups)) {
    await mkdir(path.join(OUT, group), { recursive: true })
    await mkdir(path.join(OUT, "png", group), { recursive: true })
    for (const [id, definition] of Object.entries(definitions)) {
      const svg = renderSpaceIcon(group, id)
      await writeFile(path.join(OUT, group, `${id}.svg`), svg)
      await renderPng(svg, path.join(OUT, "png", group, `${id}.png`))
      manifest.push({
        id,
        group,
        nameZh: definition.nameZh,
        nameEn: definition.nameEn,
        svg: `/assets/space-icons/${group}/${id}.svg`,
        png: `/assets/space-icons/png/${group}/${id}.png`,
        color: SPACE_ICON_COLORS[group],
        lines: definition.commands.length,
      })
    }
  }
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(path.join(OUT, "README.md"), buildReadme(manifest))
  await writeFile(path.join(OUT, "预览.html"), buildPreview(manifest))
  await buildContactSheet(manifest)
  console.log(`已生成 ${manifest.length} 个图标 → ${path.relative(ROOT, OUT)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
