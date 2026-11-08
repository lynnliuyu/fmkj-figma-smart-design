/**
 * 户型图自动裁切：去掉图框、标题栏和图名，只保留平面图本身，再放进标准图纸。
 *
 * 纯函数、零依赖：浏览器（canvas ImageData）和 Node 脚本（sharp raw）共用同一套算法，
 * 保证在系统里上传裁切的结果和批量处理的结果一致。
 */

export type Pixels = { data: ArrayLike<number>; width: number; height: number; channels?: number }
export type Rect = { x: number; y: number; width: number; height: number }

/** 低于这个亮度算「有墨迹」 */
const INK = 190
/** 分析时的最长边（降采样后再找边界，3000px 的图纸几十毫秒内完成） */
const ANALYSIS_SIZE = 1000

type Mask = { w: number; h: number; m: Uint8Array; scale: number }

/** 降采样成墨迹掩码；用「块内任一像素有墨迹」保留 1px 的细线。 */
function toMask(img: Pixels): Mask {
  const ch = img.channels ?? 4
  const scale = Math.max(1, Math.max(img.width, img.height) / ANALYSIS_SIZE)
  const w = Math.max(1, Math.floor(img.width / scale))
  const h = Math.max(1, Math.floor(img.height / scale))
  const m = new Uint8Array(w * h)
  const d = img.data
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * scale)
    const sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.floor((y + 1) * scale)))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * scale)
      const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.floor((x + 1) * scale)))
      let ink = 0
      for (let sy = sy0; sy < sy1 && !ink; sy++) {
        let i = (sy * img.width + sx0) * ch
        for (let sx = sx0; sx < sx1; sx++, i += ch) {
          const a = ch === 4 ? d[i + 3] : 255
          if (a < 32) continue
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          if (lum < INK) {
            ink = 1
            break
          }
        }
      }
      m[y * w + x] = ink
    }
  }
  return { w, h, m, scale }
}

/** 一行（或一列）里最长的连续墨迹，允许 2px 以内的断点（虚线、抗锯齿）。 */
function longestRun(get: (i: number) => number, from: number, to: number) {
  let best = 0
  let start = -1
  let gap = 0
  for (let i = from; i < to; i++) {
    if (get(i)) {
      if (start < 0) start = i
      gap = 0
      best = Math.max(best, i - start + 1)
    } else if (start >= 0 && ++gap > 2) {
      start = -1
      gap = 0
    }
  }
  return best
}

type Region = { x0: number; y0: number; x1: number; y1: number }

/** 图框：贴近四边、贯穿 60% 以上的长线。找到就退到线的内侧。 */
function insideFrame({ w, h, m }: Mask): Region {
  const r: Region = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }
  const rowRun = (y: number) => longestRun((x) => m[y * w + x], 0, w)
  const colRun = (x: number) => longestRun((y) => m[y * w + x], 0, h)
  const edgeY = Math.floor(h * 0.15)
  const edgeX = Math.floor(w * 0.15)
  for (let y = edgeY; y >= 0; y--)
    if (rowRun(y) >= w * 0.6) {
      r.y0 = y + 3
      break
    }
  for (let y = h - 1 - edgeY; y < h; y++)
    if (rowRun(y) >= w * 0.6) {
      r.y1 = y - 3
      break
    }
  for (let x = edgeX; x >= 0; x--)
    if (colRun(x) >= h * 0.6) {
      r.x0 = x + 3
      break
    }
  for (let x = w - 1 - edgeX; x < w; x++)
    if (colRun(x) >= h * 0.6) {
      r.x1 = x - 3
      break
    }
  return r
}

/** 标题栏：底部 45% 内贯穿 75% 宽度的横线（表格上沿），或右侧 30% 内贯穿 75% 高度的竖线。 */
function withoutTitleBlock({ w, m }: Mask, r: Region): Region {
  const out = { ...r }
  const rw = r.x1 - r.x0 + 1
  const rh = r.y1 - r.y0 + 1
  for (let y = Math.floor(r.y0 + rh * 0.55); y <= r.y1; y++) {
    if (longestRun((x) => m[y * w + x], r.x0, r.x1 + 1) >= rw * 0.75) {
      out.y1 = y - 2
      break
    }
  }
  const h2 = out.y1 - out.y0 + 1
  for (let x = Math.floor(r.x0 + rw * 0.7); x <= r.x1; x++) {
    if (longestRun((y) => m[y * w + x], out.y0, out.y1 + 1) >= h2 * 0.75) {
      out.x1 = x - 2
      break
    }
  }
  return out
}

/**
 * 按空白带把投影切成块；保留墨迹最多的块，以及体量不小于它 12%、跨度不小于它 15% 的块。
 * 图名、比例尺这类扁平的文字块会被丢掉，分开画的附属平面（车库、露台）会保留。
 */
function mainSpan(profile: number[], minGap: number): [number, number] | null {
  const blocks: { a: number; b: number; mass: number }[] = []
  let cur: { a: number; b: number; mass: number } | null = null
  let blank = 0
  profile.forEach((v, i) => {
    if (v > 1) {
      if (!cur || blank >= minGap) {
        cur = { a: i, b: i, mass: 0 }
        blocks.push(cur)
      }
      cur.b = i
      cur.mass += v
      blank = 0
    } else {
      blank++
    }
  })
  if (!blocks.length) return null
  const main = blocks.reduce((a, b) => (b.mass > a.mass ? b : a))
  const span = (b: { a: number; b: number }) => b.b - b.a + 1
  const keep = blocks.filter(
    (b) => b === main || (b.mass >= main.mass * 0.12 && span(b) >= span(main) * 0.15),
  )
  return [Math.min(...keep.map((b) => b.a)), Math.max(...keep.map((b) => b.b))]
}

/**
 * 找出平面图本体的范围（原图像素坐标）。
 * 墨迹过多（照片、深色底图）时无法判断，返回整张图，由用户手动调整。
 */
export function detectPlanBounds(img: Pixels): Rect {
  const full: Rect = { x: 0, y: 0, width: img.width, height: img.height }
  const mask = toMask(img)
  const { w, h, m, scale } = mask
  let ink = 0
  for (let i = 0; i < m.length; i++) ink += m[i]
  if (ink === 0 || ink / m.length > 0.35) return full

  const region = withoutTitleBlock(mask, insideFrame(mask))
  const rows: number[] = []
  for (let y = region.y0; y <= region.y1; y++) {
    let n = 0
    for (let x = region.x0; x <= region.x1; x++) n += m[y * w + x]
    rows.push(n)
  }
  const ys = mainSpan(rows, Math.max(6, Math.round((region.y1 - region.y0) * 0.025)))
  if (!ys) return full
  const y0 = region.y0 + ys[0]
  const y1 = region.y0 + ys[1]
  const cols: number[] = []
  for (let x = region.x0; x <= region.x1; x++) {
    let n = 0
    for (let y = y0; y <= y1; y++) n += m[y * w + x]
    cols.push(n)
  }
  const xs = mainSpan(cols, Math.max(6, Math.round((region.x1 - region.x0) * 0.025)))
  if (!xs) return full
  const x0 = region.x0 + xs[0]
  const x1 = region.x0 + xs[1]

  // 四周留一点白，避免贴边的墙线和标注被切掉
  const pad = Math.round(Math.max(w, h) * 0.012)
  const rx0 = Math.max(0, x0 - pad)
  const ry0 = Math.max(0, y0 - pad)
  const rx1 = Math.min(w - 1, x1 + pad)
  const ry1 = Math.min(h - 1, y1 + pad)
  return clampRect(
    {
      x: Math.floor(rx0 * scale),
      y: Math.floor(ry0 * scale),
      width: Math.ceil((rx1 - rx0 + 1) * scale),
      height: Math.ceil((ry1 - ry0 + 1) * scale),
    },
    img.width,
    img.height,
  )
}

export function clampRect(r: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width - 1, Math.round(r.x)))
  const y = Math.max(0, Math.min(height - 1, Math.round(r.y)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(r.width))),
    height: Math.max(1, Math.min(height - y, Math.round(r.height))),
  }
}

/**
 * 把裁切区域等比放进标准图纸（白底、居中、四周留白），返回源区域和目标区域。
 * `padding` 是图纸短边的比例。
 */
export function fitIntoSheet(crop: Rect, sheetWidth: number, sheetHeight: number, padding = 0.035) {
  const pad = Math.round(Math.min(sheetWidth, sheetHeight) * padding)
  const scale = Math.min((sheetWidth - pad * 2) / crop.width, (sheetHeight - pad * 2) / crop.height)
  const dw = Math.round(crop.width * scale)
  const dh = Math.round(crop.height * scale)
  return {
    source: crop,
    target: {
      x: Math.round((sheetWidth - dw) / 2),
      y: Math.round((sheetHeight - dh) / 2),
      width: dw,
      height: dh,
    },
    scale,
  }
}
