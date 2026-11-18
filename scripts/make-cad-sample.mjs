/**
 * 生成 issue #178 的合成 DXF 样例（完全虚构的户型平面）。
 *
 * 内容：外墙矩形 + 内隔墙 + 两个设备圆 + 三个房间文字；两层
 * （A-WALL 墙、A-ELEC 设备、A-TEXT 文字）。R12/AC1009 最小结构，便于
 * 浏览器端解析与断言，不包含任何客户数据。
 *
 * 运行：node scripts/make-cad-sample.mjs
 * 输出：public/cad-data/samples/demo-plan.dxf
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'cad-data', 'samples')
mkdirSync(outDir, { recursive: true })

const g = (code, value) => `${code}\n${value}\n`

const layers = [
  { name: 'A-WALL', color: 7 },
  { name: 'A-ELEC', color: 5 },
  { name: 'A-TEXT', color: 7 },
]

let s = ''
s += g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$ACADVER') + g(1, 'AC1009') + g(0, 'ENDSEC')
s += g(0, 'SECTION') + g(2, 'TABLES')
s += g(0, 'TABLE') + g(2, 'LAYER') + g(70, layers.length)
for (const l of layers) {
  s += g(0, 'LAYER') + g(2, l.name) + g(70, 0) + g(62, l.color) + g(6, 'CONTINUOUS')
}
s += g(0, 'ENDTAB') + g(0, 'ENDSEC')

const line = (layer, x1, y1, x2, y2) =>
  g(0, 'LINE') + g(8, layer) + g(10, x1) + g(20, y1) + g(11, x2) + g(21, y2)
const circle = (layer, x, y, r) => g(0, 'CIRCLE') + g(8, layer) + g(10, x) + g(20, y) + g(40, r)
const text = (layer, x, y, h, value) =>
  g(0, 'TEXT') + g(8, layer) + g(10, x) + g(20, y) + g(40, h) + g(1, value)

s += g(0, 'SECTION') + g(2, 'ENTITIES')

// 外墙 12000 × 8000（mm）
s += line('A-WALL', 0, 0, 12000, 0)
s += line('A-WALL', 12000, 0, 12000, 8000)
s += line('A-WALL', 12000, 8000, 0, 8000)
s += line('A-WALL', 0, 8000, 0, 0)

// 内隔墙：客厅 / 主卧
s += line('A-WALL', 7000, 0, 7000, 5000)
s += line('A-WALL', 7000, 5000, 12000, 5000)

// 设备点位（合成）
s += circle('A-ELEC', 3000, 4000, 160)
s += circle('A-ELEC', 9000, 2500, 160)

// 房间文字（ASCII，避免字体/代码页依赖）
s += text('A-TEXT', 2500, 6500, 320, 'LIVING')
s += text('A-TEXT', 8500, 6500, 320, 'BEDROOM')
s += text('A-TEXT', 2500, 1000, 320, 'KITCHEN')

s += g(0, 'ENDSEC') + g(0, 'EOF')

writeFileSync(join(outDir, 'demo-plan.dxf'), s)
console.log(`wrote public/cad-data/samples/demo-plan.dxf (${s.length} bytes)`)
