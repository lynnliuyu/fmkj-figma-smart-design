#!/usr/bin/env node
// 把房间 / 场景图标的几何定义渲染成站点可用的 SVG 文件。
// 用法: node scripts/generate-space-icons.mjs
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { SPACE_ICON_GROUPS } from "../lib/space-icons/shared.mjs"
import { renderSpaceIcon, spaceIconGroups } from "../lib/space-icons.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
const OUT = path.join(ROOT, "public/assets/space-icons")

let count = 0
for (const group of SPACE_ICON_GROUPS) {
  const ids = Object.keys(spaceIconGroups[group])
  await mkdir(path.join(OUT, group), { recursive: true })
  for (const id of ids) {
    await writeFile(path.join(OUT, group, `${id}.svg`), renderSpaceIcon(group, id))
    count += 1
  }
  process.stdout.write(`${group}: ${ids.length} 个\n`)
}
process.stdout.write(`共生成 ${count} 个图标 → ${path.relative(ROOT, OUT)}\n`)
