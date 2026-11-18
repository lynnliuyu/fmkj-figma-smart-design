/**
 * 复制 MLightCAD 的自托管运行时资源（issue #178）。
 *
 * - mtext 渲染 worker：文本/MTEXT 在 worker 里解析，必须同源自托管。
 * - DWG 解析器（libredwg / 商业 dwg-converter）**不复制**：
 *   libredwg 是 GPL-3.0，商业解析器需 $3000 授权，本项目只用 MIT 的 DXF 链路。
 *
 * 运行：node scripts/cad-assets.mjs
 * 说明：worker 文件已随仓库提交（见 public/workers），升级依赖后重跑本脚本刷新。
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'workers')
mkdirSync(dest, { recursive: true })

function packageRoot(name) {
  let dir = dirname(require.resolve(name))
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      const json = JSON.parse(require('node:fs').readFileSync(pkg, 'utf8'))
      if (json.name === name) return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`cannot resolve ${name}`)
}

const from = join(packageRoot('@mlightcad/cad-simple-viewer'), 'dist', 'mtext-renderer-worker.js')
if (!existsSync(from)) {
  console.error(`missing ${from} — 先 pnpm install`)
  process.exit(1)
}
copyFileSync(from, join(dest, 'mtext-renderer-worker.js'))
console.log(`copied mtext-renderer-worker.js -> public/workers/`)
console.log('DWG parsers intentionally not copied (GPL-3.0 / commercial).')
