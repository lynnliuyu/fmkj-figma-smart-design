#!/usr/bin/env node
// 房间 / 场景图标自检：校验几何 + 渲染对照图，供绘制员自己用眼睛确认。
// 用法: node scripts/space-icons-check.mjs --group rooms|scenes [--out <png路径>]
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { SPACE_ICON_COLORS } from "../lib/space-icons/shared.mjs"
import { renderSpaceIconSvg, validateSpaceIcon } from "../lib/space-icons/render.mjs"

const args = process.argv.slice(2)
const groupFlag = args.indexOf("--group")
const group = groupFlag === -1 ? "" : args[groupFlag + 1]
const outFlag = args.indexOf("--out")
if (!["rooms", "scenes"].includes(group)) {
  console.error("用法: node scripts/space-icons-check.mjs --group rooms|scenes [--out <png路径>]")
  process.exit(2)
}

const ROOT = path.resolve(import.meta.dirname, "..")
const modulePath = path.join(ROOT, "lib/space-icons", `${group}.mjs`)
let definitions
try {
  const loaded = await import(modulePath)
  definitions = loaded[group]
} catch (error) {
  console.error(`✗ 无法导入 ${path.relative(ROOT, modulePath)}: ${error.message}`)
  process.exit(1)
}
if (!definitions || typeof definitions !== "object") {
  console.error(`✗ ${path.relative(ROOT, modulePath)} 没有导出 ${group} 对象`)
  process.exit(1)
}

const ids = Object.keys(definitions)
let problems = []
if (ids.length === 0) problems.push("没有任何图标")
for (const id of ids) problems.push(...validateSpaceIcon(id, definitions[id]))
if (ids.some((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))) {
  problems.push(`slug 命名不规范: ${ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)).join(", ")}`)
}

// 渲染对照图：每格 150px，带棋盘格底，最多 7 列
const color = SPACE_ICON_COLORS[group]
const cell = 160
const columns = Math.min(7, Math.max(1, ids.length))
const rows = Math.ceil(ids.length / columns)
const tiles = []
const rendered = []
for (const [index, id] of ids.entries()) {
  const svg = renderSpaceIconSvg({ commands: definitions[id].commands, color, title: definitions[id].nameZh })
  rendered.push({ id, svg })
  const png = await sharp(Buffer.from(svg), { density: 300 })
    .resize({ width: 120, height: 120, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  tiles.push({ input: png, left: (index % columns) * cell + 20, top: Math.floor(index / columns) * cell + 20 })
}
await mkdir(path.join(ROOT, ".local/space-icons"), { recursive: true })
const outPath = outFlag !== -1 && args[outFlag + 1]
  ? path.resolve(args[outFlag + 1])
  : path.join(ROOT, `.local/space-icons/preview-${group}.png`)
await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: "#ffffff" } })
  .composite(tiles)
  .png()
  .toFile(outPath)
await writeFile(path.join(ROOT, `.local/space-icons/${group}-rendered.json`), `${JSON.stringify(rendered, null, 2)}\n`)

console.log(`共 ${ids.length} 个图标：${ids.join(", ")}`)
console.log(`对照图：${path.relative(ROOT, outPath)}（顺序与上面一致，从左到右、从上到下）`)
if (problems.length) {
  console.log(`\n发现 ${problems.length} 个问题：`)
  for (const problem of problems) console.log(`  ✗ ${problem}`)
  process.exit(1)
}
console.log("\n✓ 结构和几何检查通过")
