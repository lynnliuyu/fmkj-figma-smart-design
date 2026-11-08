/**
 * 纸张、比例、网格、标尺（画板规范）。
 * - 纸张 A3 / A4 横版；比例 1:50、1:100，预留 1:20 和自定义；打印 100%，不能「缩放到适合」。
 * - 网格 25cm 一格（1:50 时纸面 5mm），每 1m 一条粗线。
 * - 图纸是位图：用「标定」得到每个场景单位代表多少毫米（mmPerUnit），之后才有真实尺度。
 * 网格、标尺、比例尺都是覆盖层，不写进图纸数据；导出时单独合成。
 */

export const PAPERS = {
  A3: { w: 420, h: 297, label: 'A3 横版' },
  A4: { w: 297, h: 210, label: 'A4 横版' },
} as const
export type PaperId = keyof typeof PAPERS

export const SCALES = [20, 50, 100] as const

/** 网格：25cm 一格，1m 一条粗线 */
export const GRID_MM = 250
export const GRID_MAJOR_MM = 1000
/** 未标定时的中性网格（场景单位） */
export const NEUTRAL_GRID = 20
export const NEUTRAL_MAJOR = 100

/** 网格线在屏幕上小于这个间距就不画（太密只剩灰雾） */
const MIN_GRID_PX = 7

export type GridSpec = { minor: number | null; major: number | null; calibrated: boolean }

/** 当前缩放下要画的网格（场景单位） */
export function gridSpec(mmPerUnit: number | null, zoom: number): GridSpec {
  const minor = mmPerUnit ? GRID_MM / mmPerUnit : NEUTRAL_GRID
  const major = mmPerUnit ? GRID_MAJOR_MM / mmPerUnit : NEUTRAL_MAJOR
  return {
    minor: minor * zoom >= MIN_GRID_PX ? minor : null,
    major: major * zoom >= MIN_GRID_PX ? major : null,
    calibrated: !!mmPerUnit,
  }
}

const NICE = [1, 2, 5]

/** 不小于 min 的「整」步长：1、2、5 × 10ⁿ */
export function niceStep(min: number) {
  if (!(min > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(min)))
  for (const n of NICE) if (n * p >= min) return n * p
  return 10 * p
}

/** 毫米 → 显示文字（≥1m 用 m，否则 cm） */
export function formatMm(mm: number) {
  if (Math.abs(mm) >= 1000) {
    const m = mm / 1000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}m`
  }
  const cm = mm / 10
  return `${Number.isInteger(cm) ? cm : cm.toFixed(1)}cm`
}

/** 标尺刻度：屏幕上至少 minPx 一格，返回场景单位步长与每格代表的毫米数 */
export function rulerStep(mmPerUnit: number | null, zoom: number, minPx = 64) {
  if (mmPerUnit) {
    const mm = niceStep((minPx / zoom) * mmPerUnit)
    return { units: mm / mmPerUnit, mm }
  }
  const units = niceStep(minPx / zoom)
  return { units, mm: null }
}

/** 图纸按某比例打印在纸上的尺寸（mm） */
export const printedSize = (wUnits: number, hUnits: number, mmPerUnit: number, scale: number) => ({
  w: (wUnits * mmPerUnit) / scale,
  h: (hUnits * mmPerUnit) / scale,
})

/** 能把图纸完整放进纸张（留 margin mm 边距）的最小标准比例；放不下时返回 null */
export function fittingScale(
  wUnits: number,
  hUnits: number,
  mmPerUnit: number,
  paper: PaperId,
  margin = 12,
  reserve = { w: 0, h: 0 },
) {
  const P = PAPERS[paper]
  const availW = P.w - 2 * margin - reserve.w
  const availH = P.h - 2 * margin - reserve.h
  for (const s of [...SCALES, 200]) {
    const sz = printedSize(wUnits, hUnits, mmPerUnit, s)
    if (sz.w <= availW && sz.h <= availH) return s
  }
  return null
}
