/**
 * 生成画板「智能家居系统包」的平面符号：
 *
 *   node scripts/build-board-symbols.mjs --src <fmkj-board-system 仓库路径>
 *   node scripts/build-board-symbols.mjs --src <路径> --preview   # 只出调参用的对照图（.tmp-board/）
 *
 * 素材来源：fmkj-board-system 仓库（Procreate Interior Toolkit 原图）。按仓库里的授权结论，
 * 加工后的图标仍受原授权约束：内部使用；对外发布 / 交付前需买扩展授权或换成自绘（换包只需重跑本脚本）。
 *
 * 「原图优化」，不重画任何图形：
 * 1. 去尺寸文字：带 4" / 16" 标注的灯具只保留最左侧的主体连通域（及其内部细节）；
 * 2. 线条浓度归一 + 压灰雾（同仓库 _opt.py）；
 * 3. 按显示档位加粗线条：缩到 24–40px 也有 ~1px 的线，放大后不发糊；
 * 4. 双色上色：线条 = 类别色加深，填充 = 类别色浅调（颜色只从 src/lib/device-types.ts 读取）；
 * 5. 沿外形加一圈白色光晕：压在彩平或线稿户型图上都能分开；
 * 6. 输出 lg（长边 256）与 sm（长边 64）两档 PNG，以及尺寸清单 symbols.generated.ts。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { DEVICE_CATEGORIES, DEVICE_TYPES } from '../src/lib/device-types.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const SRC = path.resolve(
  argOf('--src', process.env.BOARD_ASSETS ?? path.join(root, '../fmkj-board-system')),
)
const PREVIEW = args.includes('--preview')
/** 只重做人工挑选的图标（不需要素材仓库，其余符号保持不变） */
const PICKS_ONLY = args.includes('--picks-only')
const PICKS_DIR = path.join(root, 'scripts/board-symbol-picks')
const OUT_DIR = path.join(root, 'public/board/symbols/smart-home')
const MANIFEST = path.join(root, 'src/board/packs/smart-home/symbols.generated.ts')
/** 资源版本：改了生成参数就加一，浏览器会重新加载 */
const ASSET_VERSION = 2

/* ------------------------------ 参数 ------------------------------ */

/** 主体四周留白（相对主体长边），给光晕留位置 */
const PAD = 0.1
/** 两档：T = 输出长边，S = 处理时的放大倍数，line = 线条膨胀半径（工作像素），halo = 光晕半径（工作像素） */
const TIERS = {
  sm: { T: 64, S: 4, line: 3, gain: 3.2, halo: 7, blurLine: 1.2, blurHalo: 2.4 },
  lg: { T: 256, S: 2, line: 2, gain: 2.4, halo: 7, blurLine: 0.9, blurHalo: 2.4 },
}
/** 高于此墨量（归一化后）算「线条」，低于算「灰色填充」 */
const LINE_LEVEL = 150
const mix = (hex, to, t) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return c.map((v) => Math.round(v + (to - v) * t))
}
/** 线条 = 类别色加深 18%；填充 = 类别色混白 74% */
const inkOf = (hex) => mix(hex, 0, 0.18)
const tintOf = (hex) => mix(hex, 255, 0.74)

/* ------------------------------ 素材清单 ------------------------------ */

/** 点位符号：键 = device-types.ts 里的 SymbolKey，值 = 仓库 assets/point-symbols 下的原图；带尺寸文字的要去标注 */
const POINT_SOURCES = {
  switch: 'switch',
  socket: 'socket',
  'socket-double': 'socket-double',
  'socket-usb': 'socket-usb',
  downlight: 'downlight',
  spotlight: 'spotlight',
  'track-light': 'track-light',
  'ceiling-light': 'ceiling-light',
  'pendant-light': 'pendant-light',
  'wall-light': 'wall-light',
  'panel-light': 'panel-light',
  'light-strip': 'light-strip',
  'other-light': 'other-light',
  'touch-panel': 'touch-panel',
  'motion-sensor': 'motion-sensor',
  'smoke-sensor': 'smoke-sensor',
  'water-sensor': 'water-sensor',
  'temp-sensor': 'temp-sensor',
  lock: 'lock',
  doorbell: 'doorbell',
  camera: 'camera',
  curtain: 'curtain',
  hub: 'hub',
  speaker: 'speaker',
  router: 'router',
  mesh: 'mesh',
  data: 'data',
}
const POINT_LABELED = new Set([
  'downlight',
  'spotlight',
  'ceiling-light',
  'pendant-light',
  'other-light',
])
/**
 * 人工挑选的图标（scripts/board-symbol-picks/<键>.png，来自工具箱 original-409，清单见 _选中清单.csv）：
 * 覆盖同名点位符号；开关按键数各一张（switch-1…4），不再共用一张加角标。
 */
const PICKS = [
  'motion-sensor',
  'smoke-sensor',
  'water-sensor',
  'temp-sensor',
  'router',
  'mesh',
  'doorbell',
  'lock',
  'camera',
  'hub',
  'speaker',
  'touch-panel',
  'data',
  'switch-1',
  'switch-2',
  'switch-3',
  'switch-4',
]
/** 工具箱里没有的三个：用站点现有标记的同一图形（lucide），走同一套线稿处理，风格保持一致 */
const LUCIDE_SOURCES = { 'contact-sensor': 'door-open', 'ac-wall': 'air-vent', other: 'box' }

/**
 * 灯光设计图库：仓库 assets/library 里的灯具，按「款式」分组，每款若干尺寸。
 * deviceType 决定计入报价的设备类型（设备字典固定，不为灯具款式新增类型）。
 * linear = 线形灯具（轨道、磁吸、线性吊灯、灯管），按长度档落图、可旋转。
 * share = 各尺寸档已人工核对是同一图形（只是线宽按像素固定、小尺寸显得粗），一律用母版图。
 */
const LIGHTING = [
  {
    id: 'downlight-recessed',
    name: '嵌入式筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    labeled: true,
    pick: /^recessed-mount-ceiling-downlight-\d+cm-\d+$/,
  },
  {
    id: 'downlight-recessed-square',
    name: '嵌入式方筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    labeled: true,
    pick: /^recessed-mount-ceiling-downlight-\d+cm-\d+-2$/,
  },
  {
    id: 'downlight-surface',
    name: '明装筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    labeled: true,
    pick: /^surface-mount-ceiling-downlight-\d+cm-\d+$/,
  },
  {
    id: 'downlight-surface-square',
    name: '明装方筒灯',
    group: '筒灯',
    deviceType: 'downlight',
    labeled: true,
    pick: /^surface-mount-ceiling-downlight-\d+cm-\d+-2$/,
  },
  {
    id: 'spot-recessed',
    name: '嵌入式射灯',
    group: '射灯',
    deviceType: 'spotlight',
    labeled: true,
    pick: /^recessed-mount-directional-light-\d+cm-\d+$/,
  },
  {
    id: 'spot-recessed-square',
    name: '嵌入式方射灯',
    group: '射灯',
    deviceType: 'spotlight',
    labeled: true,
    pick: /^recessed-mount-directional-light-\d+cm-\d+-2$/,
  },
  {
    id: 'spot-surface',
    name: '明装射灯',
    group: '射灯',
    deviceType: 'spotlight',
    labeled: true,
    pick: /^surface-mount-directional-light-\d+cm-\d+$/,
  },
  {
    id: 'spot-surface-square',
    name: '明装方射灯',
    group: '射灯',
    deviceType: 'spotlight',
    labeled: true,
    pick: /^surface-mount-directional-light-\d+cm-\d+-2$/,
  },
  {
    id: 'track',
    name: '轨道灯',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    linear: true,
    pick: /^track-light-\d+cm-\d+$/,
  },
  {
    id: 'track-head',
    name: '轨道射灯头',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    pick: /^track-light$/,
  },
  {
    id: 'magnetic-track',
    name: '嵌入式磁吸轨道',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    linear: true,
    pick: /^recessed-magnetic-track-light-/,
  },
  {
    id: 'magnetic-light',
    name: '磁吸灯',
    group: '轨道 · 磁吸',
    deviceType: 'track-light',
    linear: true,
    pick: /^magnetic-spot-light-/,
  },
  {
    id: 'linear-pendant',
    name: '线性吊灯',
    group: '线性 · 灯带',
    deviceType: 'pendant-light',
    linear: true,
    pick: /^linear-pendant-light-/,
  },
  {
    id: 't5',
    name: 'T5 灯管',
    group: '线性 · 灯带',
    deviceType: 'other-light',
    linear: true,
    labeled: true,
    pick: /^t5-light-/,
  },
  // 灯带图形带「LED」字样，不按长度拉伸，作为固定显示尺寸的符号
  {
    id: 'led-strip',
    name: 'LED 灯带',
    group: '线性 · 灯带',
    deviceType: 'light-strip',
    pick: /^led-light$/,
  },
  {
    id: 'pendant',
    name: '吊灯',
    group: '吊灯',
    deviceType: 'pendant-light',
    labeled: true,
    share: true,
    pick: /^pendant-light-/,
  },
  {
    id: 'chandelier',
    name: '枝形吊灯',
    group: '吊灯',
    deviceType: 'pendant-light',
    labeled: true,
    pick: /^chandelier-/,
  },
  {
    id: 'multi-pendant-linear',
    name: '多头吊灯（排）',
    group: '吊灯',
    deviceType: 'pendant-light',
    pick: /^multi-pendant-light-\d+x\d+cm/,
  },
  {
    id: 'multi-pendant-round',
    name: '多头吊灯（圆）',
    group: '吊灯',
    deviceType: 'pendant-light',
    pick: /^multi-pendant-light-\d+cm-/,
  },
  {
    id: 'ceiling-round',
    name: '圆形吸顶灯',
    group: '吸顶 · 面板',
    deviceType: 'ceiling-light',
    labeled: true,
    share: true,
    pick: /^surface-mount-ceiling-light-(23|25|28|30|33|36|38|41|43|46|48|51)cm-\d+$/,
  },
  {
    id: 'ceiling-square',
    name: '方形吸顶灯',
    group: '吸顶 · 面板',
    deviceType: 'ceiling-light',
    labeled: true,
    share: true,
    pick: /^surface-mount-ceiling-light-(\d+cm-\d+-2|61cm-24|71cm-28|81cm-32)$/,
  },
  {
    id: 'ceiling-panel',
    name: '矩形面板灯',
    group: '吸顶 · 面板',
    deviceType: 'panel-light',
    pick: /^surface-mount-ceiling-light-\d+x\d+cm/,
  },
  {
    id: 'wall-half',
    name: '半圆壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    pick: /^wall-light-\d+x\d+cm-\d+x\d+$/,
    filter: (s) => s[0] > s[1],
  },
  {
    id: 'wall-round',
    name: '圆罩壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    pick: /^wall-light-\d+cm-\d+$/,
  },
  {
    id: 'wall-slim',
    name: '细杆壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    pick: /^wall-light-\d+x\d+cm-\d+x\d+$/,
    filter: (s) => s[0] < s[1],
  },
  { id: 'vanity', name: '镜前灯', group: '壁灯', deviceType: 'wall-light', pick: /^vanity-light-/ },
  { id: 'picture', name: '画灯', group: '壁灯', deviceType: 'wall-light', pick: /^picture-light-/ },
  {
    id: 'swing-arm',
    name: '摇臂壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    pick: /^swing-arm-wall-light-/,
  },
  {
    id: 'recessed-wall',
    name: '嵌入式壁灯',
    group: '壁灯',
    deviceType: 'wall-light',
    pick: /^recessed-wall-light-/,
  },
  {
    id: 'floor-lamp',
    name: '落地灯',
    group: '落地灯',
    deviceType: 'other-light',
    pick: /^floor-lamp-/,
  },
  {
    id: 'floor-arc-lamp',
    name: '弧形落地灯',
    group: '落地灯',
    deviceType: 'other-light',
    pick: /^floor-arc-lamp-/,
  },
]

/* ------------------------------ 像素处理 ------------------------------ */

/** 读出「墨量」：黑线 + 透明度的原图，墨量 = alpha ×（1 − 亮度） */
async function loadInk(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: ch } = info
  const a = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) {
    const lum = data[i * ch] * 0.299 + data[i * ch + 1] * 0.587 + data[i * ch + 2] * 0.114
    a[i] = Math.round(data[i * ch + 3] * (1 - lum / 255))
  }
  return { a, w, h }
}

/** 8 邻接连通域 */
function components(a, w, h, thr = 40) {
  const seen = new Uint8Array(w * h)
  const out = []
  const stack = new Int32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (a[i] < thr || seen[i]) continue
    let sp = 0
    stack[sp++] = i
    seen[i] = 1
    const pixels = []
    let x0 = w,
      y0 = h,
      x1 = 0,
      y1 = 0
    while (sp) {
      const p = stack[--sp]
      pixels.push(p)
      const x = p % w,
        y = (p / w) | 0
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (!seen[q] && a[q] >= thr) {
            seen[q] = 1
            stack[sp++] = q
          }
        }
    }
    out.push({ pixels, x0, y0, x1: x1 + 1, y1: y1 + 1 })
  }
  return out
}

/** 两个外框之间的间隙（相交为 0） */
const boxGap = (p, q) => Math.max(0, p.x0 - q.x1, q.x0 - p.x1, p.y0 - q.y1, q.y0 - p.y1)

/**
 * 去尺寸文字：主体 = 最左侧的连通域；完全落在主体外框内的细节保留，其余（数字、英寸符号）抹掉。
 * 标注常常有一两笔（如英寸符号）伸进主体外框的角上：紧挨着已抹掉部分的小块也一并抹掉。
 */
function stripLabel(img) {
  const { a, w, h } = img
  const comps = components(a, w, h)
  if (comps.length < 2) return img
  const main = comps.slice().sort((p, q) => p.x0 - q.x0 || q.pixels.length - p.pixels.length)[0]
  const inBox = (c) =>
    c.x0 >= main.x0 - 1 && c.y0 >= main.y0 - 1 && c.x1 <= main.x1 + 1 && c.y1 <= main.y1 + 1
  const removed = comps.filter((c) => c !== main && !inBox(c))
  let kept = comps.filter((c) => c !== main && inBox(c))
  const gap = Math.max(4, Math.round(Math.max(main.x1 - main.x0, main.y1 - main.y0) * 0.04))
  for (let changed = true; changed;) {
    changed = false
    kept = kept.filter((c) => {
      if (!removed.some((r) => boxGap(c, r) <= gap)) return true
      removed.push(c)
      changed = true
      return false
    })
  }
  const keep = new Uint8Array(w * h)
  for (const c of [main, ...kept]) for (const p of c.pixels) keep[p] = 1
  // 连通域阈值以下的淡边：只保留紧挨主体的
  const out = new Uint8ClampedArray(w * h)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (keep[i]) out[i] = a[i]
      else if (
        a[i] &&
        x >= main.x0 - 2 &&
        x <= main.x1 + 1 &&
        y >= main.y0 - 2 &&
        y <= main.y1 + 1
      ) {
        let near = false
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1 && !near; dx++) near = keep[(y + dy) * w + (x + dx)] === 1
        if (near) out[i] = a[i]
      }
    }
  return { a: out, w, h }
}

/** 线条浓度归一 + 轻 S 曲线压灰雾 */
function normalize(img) {
  const vals = []
  for (const v of img.a) if (v > 12) vals.push(v)
  if (!vals.length) return img
  vals.sort((p, q) => p - q)
  const peak = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.995))]
  const out = new Uint8ClampedArray(img.a.length)
  for (let i = 0; i < img.a.length; i++) {
    const v = Math.min(1, img.a[i] / peak)
    out[i] = Math.round(Math.pow(Math.max(0, (v - 0.06) / 0.94), 0.92) * 255)
  }
  return { ...img, a: out }
}

function bboxOf(img, thr = 8) {
  const { a, w, h } = img
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[y * w + x] > thr) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return { x: 0, y: 0, w, h }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

const gray = (buf, w, h) =>
  sharp(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), {
    raw: { width: w, height: h, channels: 1 },
  })

async function grayOps(buf, w, h, ops) {
  let s = gray(buf, w, h)
  s = ops(s)
  const { data, info } = await s.toColourspace('b-w').raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1) throw new Error(`expected 1 channel, got ${info.channels}`)
  return new Uint8ClampedArray(data.buffer, data.byteOffset, info.width * info.height)
}

/** 每行取 [x − r, x + r] 窗口最大值（van Herk / Gil-Werman，每像素 O(1)） */
function rowMax(src, w, h, r) {
  if (r <= 0) return src
  const k = 2 * r + 1
  const n = w + 2 * r
  const pad = new Uint8Array(n)
  const pre = new Uint8Array(n)
  const suf = new Uint8Array(n)
  const out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    pad.fill(0)
    for (let x = 0; x < w; x++) pad[x + r] = src[y * w + x]
    for (let i = 0; i < n; i++) pre[i] = i % k === 0 ? pad[i] : Math.max(pre[i - 1], pad[i])
    for (let i = n - 1; i >= 0; i--)
      suf[i] = i === n - 1 || i % k === k - 1 ? pad[i] : Math.max(suf[i + 1], pad[i])
    for (let x = 0; x < w; x++) out[y * w + x] = Math.max(suf[x], pre[x + k - 1])
  }
  return out
}

/**
 * 灰度膨胀（圆形结构元，半径 r）：取邻域最大值，抗锯齿边缘保留。
 * 不用 sharp 的 dilate：它以黑色为前景，对「黑底白线」的遮罩实际是在腐蚀。
 */
function dilate(src, w, h, r) {
  if (r <= 0) return src
  const rows = []
  for (let dy = -r; dy <= r; dy++) rows.push([dy, Math.floor(Math.sqrt(r * r - dy * dy) + 1e-6)])
  const byWidth = new Map()
  for (const [, hw] of rows) if (!byWidth.has(hw)) byWidth.set(hw, rowMax(src, w, h, hw))
  const out = new Uint8ClampedArray(w * h)
  for (const [dy, hw] of rows) {
    const m = byWidth.get(hw)
    for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++) {
      const o = y * w
      const so = (y + dy) * w
      for (let x = 0; x < w; x++) if (m[so + x] > out[o + x]) out[o + x] = m[so + x]
    }
  }
  return out
}

const blurGray = (buf, w, h, sigma) => grayOps(buf, w, h, (s) => s.blur(sigma))

/** 出一档：返回 PNG Buffer 与主体在图中的归一化尺寸 */
async function renderTier(img, box, tier, color) {
  const { T, S, line, gain, halo, blurLine, blurHalo } = TIERS[tier]
  const long = Math.max(box.w, box.h)
  const gw = box.w / long
  const gh = box.h / long
  const Lw = (T / (1 + 2 * PAD)) * S // 工作分辨率下主体长边
  const W = Math.max(8, Math.round((gw + 2 * PAD) * Lw))
  const H = Math.max(8, Math.round((gh + 2 * PAD) * Lw))
  const iw = Math.max(1, Math.round(gw * Lw))
  const ih = Math.max(1, Math.round(gh * Lw))
  // 裁出主体；线条（高墨量）在原分辨率先分出来，缩放时按面积取平均，细线不会因为缩小而消失
  const crop = new Uint8ClampedArray(box.w * box.h)
  const lineSrc = new Uint8ClampedArray(box.w * box.h)
  for (let y = 0; y < box.h; y++)
    for (let x = 0; x < box.w; x++) {
      const v = img.a[(box.y + y) * img.w + box.x + x]
      crop[y * box.w + x] = v
      lineSrc[y * box.w + x] = v >= LINE_LEVEL ? 255 : 0
    }
  const place = (s) =>
    s.resize(iw, ih, { kernel: iw < box.w ? 'cubic' : 'lanczos3', fit: 'fill' }).extend({
      top: Math.floor((H - ih) / 2),
      bottom: Math.ceil((H - ih) / 2),
      left: Math.floor((W - iw) / 2),
      right: Math.ceil((W - iw) / 2),
      background: '#000000',
    })
  const placed = await grayOps(crop, box.w, box.h, place)
  // 缩小：先二值再按面积平均，保住细线；放大：先插值再软阈值，避免二值边缘被放大成锯齿
  const lineCov =
    iw < box.w
      ? await grayOps(lineSrc, box.w, box.h, place)
      : placed.map((v) => Math.max(0, Math.min(255, ((v - (LINE_LEVEL - 40)) / 80) * 255)))
  // 线条：覆盖率提增益（细线变实）→ 膨胀加粗 → 轻微模糊抗锯齿
  const boosted = lineCov.map((v) => Math.min(255, v * gain))
  const lineA = await blurGray(dilate(boosted, W, H, line), W, H, blurLine)
  const haloA = await blurGray(
    dilate(
      placed.map((v) => (v > 14 ? 255 : 0)),
      W,
      H,
      line + halo,
    ),
    W,
    H,
    blurHalo,
  )
  const ink = inkOf(color)
  const tint = tintOf(color)
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    // 自下而上：白色光晕 → 浅色填充 → 深色线条（标准 over 混合）
    let r = 0,
      g = 0,
      b = 0,
      al = 0
    const layers = [
      [255, 255, 255, (haloA[i] / 255) * 0.94],
      [tint[0], tint[1], tint[2], Math.min(1, (placed[i] / 255) * 1.2) * 0.95],
      [ink[0], ink[1], ink[2], lineA[i] / 255],
    ]
    for (const [lr, lg, lb, la] of layers) {
      if (la <= 0) continue
      const na = la + al * (1 - la)
      r = (lr * la + r * al * (1 - la)) / na
      g = (lg * la + g * al * (1 - la)) / na
      b = (lb * la + b * al * (1 - la)) / na
      al = na
    }
    rgba[i * 4] = Math.round(r)
    rgba[i * 4 + 1] = Math.round(g)
    rgba[i * 4 + 2] = Math.round(b)
    rgba[i * 4 + 3] = Math.round(al * 255)
  }
  const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .resize(Math.max(2, Math.round(W / S)), Math.max(2, Math.round(H / S)), {
      kernel: 'lanczos3',
      fit: 'fill',
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
  return { png, gw, gh }
}

/** 读图 → 去标注 → 归一，得到主体外框 */
async function prepare(input, labeled) {
  let img = await loadInk(input)
  if (labeled) img = stripLabel(img)
  img = normalize(img)
  return { img, box: bboxOf(img) }
}

async function renderIcon({ img, box }, color) {
  const sm = await renderTier(img, box, 'sm', color)
  const lg = await renderTier(img, box, 'lg', color)
  return { sm: sm.png, lg: lg.png, gw: +lg.gw.toFixed(4), gh: +lg.gh.toFixed(4) }
}

async function processIcon(input, { labeled, color }) {
  return renderIcon(await prepare(input, labeled), color)
}

/** 形状签名：主体缩到 24×24 的二值图，用来判断同款不同尺寸是不是同一张图形 */
async function signature({ img, box }) {
  const crop = new Uint8ClampedArray(box.w * box.h)
  for (let y = 0; y < box.h; y++)
    for (let x = 0; x < box.w; x++) crop[y * box.w + x] = img.a[(box.y + y) * img.w + box.x + x]
  const s = await grayOps(crop, box.w, box.h, (p) =>
    p.resize(24, 24, { fit: 'fill', kernel: 'cubic' }),
  )
  return Uint8Array.from(s, (v) => (v >= 60 ? 1 : 0))
}
const iou = (p, q) => {
  let i = 0,
    u = 0
  for (let k = 0; k < p.length; k++) {
    i += p[k] & q[k]
    u += p[k] | q[k]
  }
  return u ? i / u : 0
}
/** 同款共用图形的门槛：形状重合度、长宽比差异（对数） */
const SHARE_IOU = 0.6
const SHARE_ASPECT = 0.15

/**
 * 同款各尺寸档共用一张图形：图库里小尺寸的原图只有十几个像素（大半画布被尺寸文字占了），
 * 直接放大是一团糊。取主体像素最大的那档做母版，形状一致（重合度、长宽比）的尺寸档都用母版的图，
 * 形状不同的（如 3 头 / 5 头 / 8 头吊灯）保留各自的图。
 */
async function familyArt(fam) {
  const preps = []
  for (const it of fam.items) preps.push({ it, prep: await prepare(it.file, !!fam.labeled) })
  const longOf = (p) => Math.max(p.prep.box.w, p.prep.box.h)
  const master = preps.reduce((p, q) => (longOf(q) > longOf(p) ? q : p))
  const mSig = await signature(master.prep)
  const aspect = (p) => p.prep.box.w / p.prep.box.h
  for (const p of preps) {
    if (p === master) {
      p.art = p.it.id
      continue
    }
    const dAspect = Math.abs(Math.log(aspect(p) / aspect(master)))
    const score = iou(await signature(p.prep), mSig)
    p.art = fam.share || (dAspect < SHARE_ASPECT && score >= SHARE_IOU) ? master.it.id : p.it.id
    if (process.env.DEBUG_SYMBOLS)
      console.log(
        fam.id.padEnd(26),
        p.it.id.padEnd(52),
        `aspect Δ${dAspect.toFixed(2)} iou ${score.toFixed(2)} → ${p.art === p.it.id ? 'own' : 'master'}`,
      )
  }
  return preps
}

/** lucide 图标 → 黑色线稿 PNG（和工具箱原图同一种输入） */
function lucideSvg(name) {
  const src = fs.readFileSync(
    path.join(root, 'node_modules/lucide-react/dist/esm/icons', `${name}.mjs`),
    'utf8',
  )
  const block = src.slice(src.indexOf('node: ['), src.indexOf('};'))
  const nodes = [...block.matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]/g)].map(([, tag, attrs]) => {
    const parts = [...attrs.matchAll(/(\w+):\s*"([^"]*)"/g)]
      .filter(([, k]) => k !== 'key')
      .map(([, k, v]) => `${k}="${v}"`)
    return `<${tag} ${parts.join(' ')}/>`
  })
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${nodes.join('')}</svg>`,
  )
}

/* ------------------------------ 主流程 ------------------------------ */

const catColor = new Map(DEVICE_CATEGORIES.map((c) => [c.slug, c.color]))
const symbolColor = new Map(DEVICE_TYPES.map((t) => [t.symbol, catColor.get(t.category)]))
const typeColor = new Map(DEVICE_TYPES.map((t) => [t.value, catColor.get(t.category)]))

/**
 * 图库尺寸 → [宽, 深]（cm，对应图形的横 / 竖）。图库个别条目的厘米数录错了（如摇臂壁灯 20×500cm），
 * 和编号里的英寸标注（…-8x20）对一下，差得多就用英寸换算。
 */
function sizeOf(item) {
  const [w, h, d] = item.sizeCm ?? []
  let size = d ? [d, d] : w && h ? [w, h] : w ? [w, null] : null
  const inch = /-(\d+)(?:x(\d+))?(?:-2)?$/.exec(item.id)
  if (size && inch && /cm-/.test(item.id)) {
    const fromInch = [+inch[1], inch[2] ? +inch[2] : null].map((v) =>
      v == null ? null : Math.round(v * 2.54),
    )
    const off = (a, b) => a != null && b != null && Math.abs(a - b) / Math.max(a, b) > 0.25
    if (off(size[0], fromInch[0]) || off(size[1], fromInch[1])) size = fromInch
  }
  return size
}

function lightingVariants(lib) {
  return LIGHTING.map((fam) => {
    const items = lib
      .filter((i) => fam.pick.test(i.id))
      .filter((i) => !fam.filter || fam.filter(i.sizeCm ?? []))
      .map((i) => ({ id: `lt-${i.id}`, file: path.join(SRC, 'assets', i.file), sizeCm: sizeOf(i) }))
      .sort(
        (p, q) =>
          (p.sizeCm?.[0] ?? 0) - (q.sizeCm?.[0] ?? 0) ||
          (p.sizeCm?.[1] ?? 0) - (q.sizeCm?.[1] ?? 0),
      )
    if (!items.length) throw new Error(`灯具款式 ${fam.id} 没有匹配到素材`)
    return { ...fam, items }
  })
}

const colorOfKey = (key) => symbolColor.get(key) ?? typeColor.get(key)

async function renderPicks(save) {
  for (const key of PICKS)
    save(
      key,
      await processIcon(path.join(PICKS_DIR, `${key}.png`), {
        labeled: false,
        color: colorOfKey(key),
      }),
    )
}

function writeManifest(assets, lighting) {
  const body = `/**
 * 由 scripts/build-board-symbols.mjs 生成，请勿手动修改。
 * 素材：fmkj-board-system 仓库（原图优化，内部使用；对外交付前确认授权）。
 */

/** 资源版本（拼进图片地址，改了生成参数后浏览器会重新加载） */
export const SYMBOL_ASSET_VERSION = ${ASSET_VERSION}

/** 每张符号图四周的留白（相对主体长边） */
export const SYMBOL_ASSET_PAD = ${PAD}

/** 主体尺寸（长边 = 1）：渲染时按主体长边换算，留白 / 光晕在外 */
export const SYMBOL_ASSETS: Record<string, { gw: number; gh: number }> = ${JSON.stringify(assets, null, 2)}

export type LightingFamilyDef = {
  id: string
  name: string
  group: string
  /** 计入报价的设备类型 */
  deviceType: string
  /** 线形灯具：可旋转、可改长度 */
  linear: boolean
  /**
   * 尺寸档：id = 存进点位的 symbolId；art = 图形（同款同形的尺寸档共用一张）；
   * sizeCm = [宽, 深]（cm，对应图形的横 / 竖），深为 null 时按图形比例（宽 = 图形长边）
   */
  variants: { id: string; art: string; sizeCm: [number, number | null] | null }[]
}

export const LIGHTING_FAMILIES: LightingFamilyDef[] = ${JSON.stringify(lighting, null, 2)}
`
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true })
  fs.writeFileSync(MANIFEST, body)
}

async function main() {
  const assets = {}
  const save = (id, r) => {
    fs.writeFileSync(path.join(OUT_DIR, `${id}.png`), r.lg)
    fs.writeFileSync(path.join(OUT_DIR, `${id}.sm.png`), r.sm)
    assets[id] = { gw: r.gw, gh: r.gh }
  }
  if (PICKS_ONLY) {
    const src = fs.readFileSync(MANIFEST, 'utf8')
    const json = (name) =>
      JSON.parse(
        src
          .slice(src.indexOf('= ', src.indexOf(`export const ${name}`)) + 2)
          .split(/\n\n/)[0]
          .trim(),
      )
    Object.assign(assets, json('SYMBOL_ASSETS'))
    const lighting = json('LIGHTING_FAMILIES')
    await renderPicks(save)
    writeManifest(assets, lighting)
    return console.log(`re-rendered ${PICKS.length} picked symbols`)
  }
  if (!fs.existsSync(path.join(SRC, 'assets/point-symbols'))) {
    throw new Error(
      `找不到素材仓库：${SRC}（用 --src 指定 fmkj-board-system 的本地路径；只改挑选图标用 --picks-only）`,
    )
  }
  const lib = JSON.parse(fs.readFileSync(path.join(SRC, 'assets/library.json'), 'utf8'))
  const families = lightingVariants(lib)
  if (PREVIEW) return preview(families)

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const [key, file] of Object.entries(POINT_SOURCES)) {
    save(
      key,
      await processIcon(path.join(SRC, 'assets/point-symbols', `${file}.png`), {
        labeled: POINT_LABELED.has(key),
        color: symbolColor.get(key),
      }),
    )
  }
  for (const [key, icon] of Object.entries(LUCIDE_SOURCES)) {
    save(
      key,
      await processIcon(await sharp(lucideSvg(icon)).png().toBuffer(), {
        labeled: false,
        color: symbolColor.get(key),
      }),
    )
  }
  await renderPicks(save)
  for (const fam of families) {
    for (const p of await familyArt(fam)) {
      p.it.art = p.art
      if (p.art === p.it.id) save(p.it.id, await renderIcon(p.prep, typeColor.get(fam.deviceType)))
    }
  }
  writeManifest(
    assets,
    families.map(({ id, name, group, deviceType, linear, items }) => ({
      id,
      name,
      group,
      deviceType,
      linear: !!linear,
      variants: items.map((it) => ({ id: it.id, art: it.art, sizeCm: it.sizeCm })),
    })),
  )
  const count = Object.keys(assets).length
  console.log(
    `generated ${count} symbols (${count * 2} PNG) → public/board/symbols/smart-home, ${path.relative(root, MANIFEST)}`,
  )
}

/** 调参对照：彩平 / 线稿两种底图上，按 24 / 32 / 48 / 96px 显示 */
async function preview(families) {
  const dir = path.join(root, '.tmp-board')
  fs.mkdirSync(dir, { recursive: true })
  const keys = [
    'switch',
    'socket',
    'downlight',
    'spotlight',
    'ceiling-light',
    'pendant-light',
    'motion-sensor',
    'camera',
    'curtain',
    'hub',
    'mesh',
    'data',
    'lock',
    'light-strip',
    'temp-sensor',
    'touch-panel',
  ]
  const list = keys.map((k) => ({
    id: k,
    input: path.join(SRC, 'assets/point-symbols', `${POINT_SOURCES[k]}.png`),
    labeled: POINT_LABELED.has(k),
    color: symbolColor.get(k),
  }))
  list.push({
    id: 'contact-sensor',
    input: await sharp(lucideSvg('door-open')).png().toBuffer(),
    labeled: false,
    color: symbolColor.get('contact-sensor'),
  })
  for (const fam of families.filter((f) =>
    [
      'downlight-recessed',
      'spot-recessed',
      'track',
      'chandelier',
      'wall-half',
      'linear-pendant',
    ].includes(f.id),
  )) {
    const it = fam.items[Math.floor(fam.items.length / 2)]
    list.push({
      id: it.id,
      input: it.file,
      labeled: !!fam.labeled,
      color: typeColor.get(fam.deviceType),
    })
  }
  const rendered = []
  for (const it of list) rendered.push({ ...it, ...(await processIcon(it.input, it)) })
  const sizes = [24, 32, 48, 96]
  const cellW = 110
  const rowH = 110
  const bgs = [
    path.join(root, 'public/demo-flow/web/flow-2-render.webp'),
    path.join(root, 'public/demo-flow/web/flow-1-base.webp'),
  ]
  for (const [bi, bgPath] of bgs.entries()) {
    const W = cellW * rendered.length
    const H = rowH * sizes.length
    const bg = await sharp(bgPath)
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 1 })
      .png()
      .toBuffer()
    const layers = []
    for (const [ci, it] of rendered.entries()) {
      for (const [ri, px] of sizes.entries()) {
        const src = px <= 40 ? it.sm : it.lg
        const long = Math.round(px * (1 + 2 * PAD))
        const meta = await sharp(src).metadata()
        const scale = long / Math.max(meta.width, meta.height)
        const buf = await sharp(src)
          .resize(
            Math.max(1, Math.round(meta.width * scale)),
            Math.max(1, Math.round(meta.height * scale)),
            { kernel: 'lanczos3' },
          )
          .toBuffer()
        const m2 = await sharp(buf).metadata()
        layers.push({
          input: buf,
          left: ci * cellW + Math.round((cellW - m2.width) / 2),
          top: ri * rowH + Math.round((rowH - m2.height) / 2),
        })
      }
    }
    await sharp(bg)
      .composite(layers)
      .jpeg({ quality: 88 })
      .toFile(path.join(dir, `symbols-preview-${bi}.jpg`))
  }
  console.log('preview → .tmp-board/symbols-preview-0.jpg / -1.jpg')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
