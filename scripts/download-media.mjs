// 在服务器上从已发布的 Figma 站点下载全部图片，供 data-import.ts 使用。
// 用法：node scripts/download-media.mjs <import 目录> <已发布站点地址>
//   例：node scripts/download-media.mjs import https://xxx.figma.site
// 需要 import/data.json；图片保存为 import/files/<媒体ID>.<扩展名>，已存在的会跳过。
import fs from 'node:fs'
import path from 'node:path'

const [dir = 'import', site] = process.argv.slice(2)
if (!site) {
  console.error('请提供已发布站点地址，例如 https://xxx.figma.site')
  process.exit(1)
}
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'))
const media = data.collections.media ?? []
fs.mkdirSync(path.join(dir, 'files'), { recursive: true })
let ok = 0
const failed = []
for (const m of media) {
  const ext = path.extname(m.filename || '') || '.bin'
  const dest = path.join(dir, 'files', `${m.id}${ext}`)
  if (fs.existsSync(dest)) {
    ok++
    continue
  }
  const url = new URL(m.url || `/api/media/file/${encodeURIComponent(m.filename)}`, site).toString()
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    ok++
  } catch (e) {
    failed.push(`${m.filename}: ${e.message}`)
  }
  if ((ok + failed.length) % 50 === 0) console.log(`${ok + failed.length}/${media.length}`)
}
console.log(`完成：${ok}/${media.length}`)
if (failed.length) console.log('失败：\n' + failed.join('\n'))
