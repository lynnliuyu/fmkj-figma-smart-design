/**
 * 点位图标：scripts/point-icons/mapping.json 里选定的原图 → public/point-icons/<设备类型>.png
 * 画板、点位面板、导出文档、图例共用。用法：node scripts/build-point-icons.mjs
 *
 * 原则：不改图形，只在原图基础上优化——
 * 1. 裁透明边、主体居中，四周留白 = 主体长边 × PAD（与画板符号一致）；
 * 2. 灰色图标按类别色上色（深灰线条 → 加深的类别色，浅灰填充 → 类别色浅调），本身有颜色的保持原色；
 * 3. 线条加深、加粗：细线图标（灯带、轨道灯等细长图形）加粗更多，缩到画布尺寸仍看得清；
 * 4. 外圈白色描边，压在户型图线条上也能分开；
 * 5. 输出 256px PNG（public/point-icons/<设备类型>.png），同时生成 point-icons.generated.ts（只含版本与主体比例，
 *    不内嵌图片数据，避免把图片打进前端脚本）。
 * 改了素材或参数后把 VERSION 加一，让浏览器重新加载。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { SYMBOL_ASSET_PAD } from '../src/board/packs/smart-home/symbols.generated.ts'
import { categoryOfType, DEVICE_TYPES } from '../src/lib/device-types.ts'

const VERSION = 5
const N = 256 // 输出尺寸（含留白）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'scripts/point-icons')
const OUT = path.join(ROOT, 'public/point-icons')
const GEN = path.join(ROOT, 'src/board/packs/smart-home/point-icons.generated.ts')
const CUSTOM_TYPES = { 'custom-1793550513224': 'ceiling-ap' }

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

async function build(file, type) {
  const color = hex(categoryOfType(type)?.color ?? '#525252')
  const ink = lerp(color, [0, 0, 0], 0.3)
  const tint = lerp(color, [255, 255, 255], 0.78)
  // 1. 裁边 + 居中
  const trimmed = await sharp(file)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .toBuffer({ resolveWithObject: true })
  const { width: tw, height: th } = trimmed.info
  const L = Math.max(tw, th)
  const body = Math.round(N / (1 + 2 * SYMBOL_ASSET_PAD))
  const bw = Math.max(1, Math.round((tw / L) * body))
  const bh = Math.max(1, Math.round((th / L) * body))
  const { data } = await sharp(trimmed.data)
    .resize(bw, bh, { kernel: 'lanczos3' })
    .extend({
      top: Math.floor((N - bh) / 2),
      bottom: Math.ceil((N - bh) / 2),
      left: Math.floor((N - bw) / 2),
      right: Math.ceil((N - bw) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const px = new Float32Array(data)
  // 有的原图用透明度表示深浅（黑色 + 不同透明度）：先按白底换成看得见的颜色，图形内部变为不透明
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255
    if (!a) continue
    for (let k = 0; k < 3; k++) px[i + k] = px[i + k] * a + 255 * (1 - a)
    px[i + 3] = a >= 0.12 ? 255 : px[i + 3]
  }
  // 2. 上色：整张图几乎没有彩色像素才算灰色图标
  let colored = 0
  let solid = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    solid++
    if (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > 40)
      colored++
  }
  const gray = colored < solid * 0.05 || categoryOfType(type)?.slug === 'lock'
  // 3. 线条：比图标自身平均亮度明显更暗的像素
  let sum = 0
  for (let i = 0; i < px.length; i += 4)
    if (px[i + 3] >= 128) sum += lum(px[i], px[i + 1], px[i + 2])
  const avg = sum / Math.max(1, solid)
  // 细长图形（短边不到长边 30%，如灯带、轨道灯）整体当作线条，加粗更多
  const thin = Math.min(tw, th) / L < 0.3
  const isLine = new Uint8Array(N * N)
  for (let p = 0; p < N * N; p++) {
    const i = p * 4
    if (px[i + 3] >= 128 && (thin || lum(px[i], px[i + 1], px[i + 2]) < Math.min(avg - 25, 170)))
      isLine[p] = 1
  }
  for (let p = 0; p < N * N; p++) {
    const i = p * 4
    if (px[i + 3] === 0) continue
    let c = [px[i], px[i + 1], px[i + 2]]
    if (thin) c = lerp(c, ink, 0.75) // 细长图形整体就是线条：直接用加深的类别色
    else if (isLine[p]) c = gray ? ink : lerp(c, [0, 0, 0], 0.15) // 线条：灰色图标用类别色，有色图标稍微加深
    else if (gray) c = lerp(ink, tint, Math.min(1, Math.max(0, (lum(...c) - 90) / 130)) ** 0.6)
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
  }
  const r = thin ? 8 : 2
  const out = new Float32Array(px)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const p = y * N + x
      if (isLine[p]) continue
      let best = -1
      let bd = 1e9
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          const yy = y + dy
          const d = dx * dx + dy * dy
          if (xx < 0 || yy < 0 || xx >= N || yy >= N || d > r * r || d >= bd) continue
          const q = yy * N + xx
          if (isLine[q]) {
            best = q
            bd = d
          }
        }
      if (best < 0) continue
      const i = p * 4
      const j = best * 4
      out[i] = px[j]
      out[i + 1] = px[j + 1]
      out[i + 2] = px[j + 2]
      out[i + 3] = 255
    }
  // 4. 白色外圈：在原图形外面垫一圈白色
  const H = 5
  const alpha = new Uint8Array(N * N)
  for (let p = 0; p < N * N; p++) alpha[p] = out[p * 4 + 3] > 40 ? 1 : 0
  const rgba = Buffer.alloc(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const p = y * N + x
      const i = p * 4
      const a = out[i + 3] / 255
      let halo = 0
      if (a < 1)
        for (let dy = -H; dy <= H && !halo; dy++)
          for (let dx = -H; dx <= H; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (
              xx >= 0 &&
              yy >= 0 &&
              xx < N &&
              yy < N &&
              dx * dx + dy * dy <= H * H &&
              alpha[yy * N + xx]
            ) {
              halo = 1
              break
            }
          }
      // 前景叠在白色光晕上
      const ba = halo ? 1 : 0
      const oa = a + ba * (1 - a)
      rgba[i] = oa ? Math.round((out[i] * a + 255 * ba * (1 - a)) / oa) : 0
      rgba[i + 1] = oa ? Math.round((out[i + 1] * a + 255 * ba * (1 - a)) / oa) : 0
      rgba[i + 2] = oa ? Math.round((out[i + 2] * a + 255 * ba * (1 - a)) / oa) : 0
      rgba[i + 3] = Math.round(oa * 255)
    }
  const png = await sharp(rgba, { raw: { width: N, height: N, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toBuffer()
  return { png, gw: +(tw / L).toFixed(4), gh: +(th / L).toFixed(4) }
}

const mapping = JSON.parse(fs.readFileSync(path.join(SRC, 'mapping.json'), 'utf8'))
const valid = new Set(DEVICE_TYPES.map((t) => t.value))
fs.mkdirSync(OUT, { recursive: true })
for (const f of fs.readdirSync(OUT)) if (/\.(svg|png)$/.test(f)) fs.rmSync(path.join(OUT, f))
const geom = {}
for (const [key, a] of Object.entries(mapping.assignments)) {
  const type = CUSTOM_TYPES[key] ?? key
  if (!valid.has(type) || (mapping.hidden ?? []).includes(type)) continue
  const { png, gw, gh } = await build(path.join(SRC, a.path), type)
  fs.writeFileSync(path.join(OUT, `${type}.png`), png)
  geom[type] = { gw, gh }
  console.log('✓', type)
}
fs.writeFileSync(
  GEN,
  [
    '/** 由 scripts/build-point-icons.mjs 根据 scripts/point-icons/mapping.json 生成，请勿手动修改。 */',
    '',
    `export const POINT_ICON_VERSION = ${VERSION}`,
    '',
    '/** 主体比例（长边 = 1），四周留白与画板符号相同 */',
    `export const POINT_ICON_GEOM: Record<string, { gw: number; gh: number }> = ${JSON.stringify(geom, null, 2)}`,
    '',
  ].join('\n'),
)
console.log(`generated ${Object.keys(geom).length} icons → public/point-icons`)
