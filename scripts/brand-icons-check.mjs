#!/usr/bin/env node
// 采集自检工具：检查 raw 目录里的 SVG / PNG 是否干净可用。
// 用法: node scripts/brand-icons-check.mjs --dir <目录>
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const args = process.argv.slice(2)
const dirFlag = args.indexOf("--dir")
if (dirFlag === -1 || !args[dirFlag + 1]) {
  console.error("用法: node scripts/brand-icons-check.mjs --dir <目录>")
  process.exit(2)
}
const dir = path.resolve(args[dirFlag + 1])

const problems = []
const rows = []

function pngSize(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

async function checkSvg(file, buf) {
  const svg = buf.toString("utf8")
  const issues = []
  if (buf.length < 180) issues.push("文件过小，可能是空图")
  if (buf.length > 800_000) issues.push("文件过大(>800KB)")
  if (!/<svg[\s>]/i.test(svg)) issues.push("不是 SVG")
  if (/<script[\s>]/i.test(svg)) issues.push("含 <script>")
  if (/<foreignObject[\s>]/i.test(svg)) issues.push("含 <foreignObject>")
  if (/<image[^>]+(href|src)\s*=\s*["']https?:/i.test(svg)) issues.push("含外链位图 <image href=http>")
  if (/(href|xlink:href)\s*=\s*["']https?:/i.test(svg)) issues.push("含外链引用")
  if (/@font-face/i.test(svg)) issues.push("含外链字体")
  if (/(width|height)\s*=\s*["']\d{4,}/i.test(svg)) issues.push("写死超大宽高")
  const hasViewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+[\d.]+[\s,]+[\d.]+/i.test(svg)
  if (!hasViewBox) issues.push("缺少 viewBox")
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line|text|g|use)[\s>]/i.test(svg)) issues.push("没有可见图形")
  return issues
}

async function main() {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    console.error(`目录不存在: ${dir}`)
    process.exit(2)
  }
  for (const entry of entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name)
    const ext = path.extname(entry.name).toLowerCase()
    const buf = await readFile(file)
    const { size } = await stat(file)
    let issues = []
    let info = ""
    if (ext === ".svg") {
      issues = await checkSvg(file, buf)
      info = "svg"
    } else if (ext === ".png") {
      const dim = pngSize(buf)
      if (!dim) issues.push("不是合法 PNG")
      else {
        info = `${dim.width}x${dim.height}`
        if (Math.max(dim.width, dim.height) < 180) issues.push("PNG 分辨率过低（长边 < 180px）")
      }
    } else {
      issues.push(`不支持的文件类型 ${ext}`)
    }
    rows.push({ name: entry.name, size, info, issues })
    if (issues.length) problems.push({ name: entry.name, issues })
  }

  const width = Math.max(8, ...rows.map((r) => r.name.length))
  for (const r of rows) {
    const mark = r.issues.length ? "✗" : "✓"
    console.log(`${mark} ${r.name.padEnd(width)}  ${String(r.size).padStart(8)}B  ${r.info.padEnd(10)} ${r.issues.join("; ")}`)
  }
  console.log(`\n共 ${rows.length} 个文件，问题 ${problems.length} 个`)
  process.exit(problems.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
