import { clamp, rotatedAabb } from './geometry'
import type { Box, SymbolObj, ViewSettings } from './types'

/** 符号图形：图片（大 / 小两档）、主体宽高（长边 = 1）、图片四周留白（相对主体长边） */
export type SymbolArt = { src: string; srcSm: string; gw: number; gh: number; pad: number }

/** 系统包对一个符号的解释：名称、颜色、平面符号图形、实心标记 */
export type SymbolLook = {
  /** 图例 / 统计用的分组键（同一个键算同一种设备） */
  key: string
  name: string
  color: string
  art: SymbolArt | null
  marker: string | null
  /** 角标（如开关的键数） */
  badge?: string
  /** 线形灯具：未标定时按长度示意 */
  linear?: boolean
}

/** 固定显示尺寸的默认大小（场景单位，图形长边；标准图纸宽 1200） */
export const DEFAULT_SYMBOL_SIZE = 28
export const SYMBOL_SIZES = [
  { value: 22, label: '小' },
  { value: 28, label: '中' },
  { value: 36, label: '大' },
] as const
/** 实心标记在默认大小时的直径（与旧版点位图一致） */
export const MARKER_BASE = 24
export const LABEL_SIZE = 9
export const LABEL_GAP = 1.5

export type SymbolGeom = {
  /** 主体显示宽高（未旋转） */
  w: number
  h: number
  /** 是否按真实尺寸 */
  real: boolean
  /** 图片（含留白）宽高 */
  imgW: number
  imgH: number
  /** 旋转后的外接框 */
  aabb: Box
  /** 代号文字基线 */
  labelY: number
  marker: boolean
}

/**
 * 符号的显示尺寸：
 * - 「标记」样式：固定直径的圆形标记；
 * - 按真实尺寸且图纸已标定：sizeCm 换算成场景单位（宽 × 深，深为 null 时宽 = 图形长边）；
 * - 其余固定显示尺寸（NTS）；线形灯具按长度示意（60cm 起，最长 5 倍）。
 */
export function symbolGeom(
  o: Pick<SymbolObj, 'x' | 'y' | 'angle' | 'sizeCm' | 'real'>,
  look: SymbolLook,
  view: Pick<ViewSettings, 'symbolStyle' | 'symbolSize'>,
  mmPerUnit: number | null,
): SymbolGeom {
  const marker = view.symbolStyle === 'marker' || !look.art
  let w: number
  let h: number
  let real = false
  let pad = 0
  if (marker) {
    w = h = MARKER_BASE * (view.symbolSize / DEFAULT_SYMBOL_SIZE)
  } else {
    const { gw, gh } = look.art!
    pad = look.art!.pad
    if (o.real && o.sizeCm && mmPerUnit) {
      real = true
      const [wc, hc] = o.sizeCm
      const W = (wc * 10) / mmPerUnit
      if (hc == null) {
        w = W * gw
        h = W * gh
      } else {
        const k = Math.min(W / gw, (hc * 10) / mmPerUnit / gh)
        w = gw * k
        h = gh * k
      }
    } else {
      let L = view.symbolSize
      if (look.linear && o.sizeCm) L *= clamp(o.sizeCm[0] / 60, 1, 5)
      w = L * gw
      h = L * gh
    }
  }
  const L = Math.max(w, h)
  const imgW = w + 2 * pad * L
  const imgH = h + 2 * pad * L
  // 标记样式不旋转（实心圆标记转了没有意义）
  const aabb = rotatedAabb({ x: o.x, y: o.y }, w, h, marker ? 0 : o.angle)
  return {
    w,
    h,
    real,
    imgW,
    imgH,
    aabb,
    labelY: aabb.y + aabb.h + LABEL_GAP + LABEL_SIZE * 0.82,
    marker,
  }
}

/** 代号文字宽度（估算：中日韩字符 1 em，其余 0.62 em） */
export const textWidth = (text: string, size: number) =>
  [...text].reduce((w, ch) => w + (/[\u0000-\u00ff]/.test(ch) ? size * 0.62 : size), 0)

export const labelBox = (o: Pick<SymbolObj, 'x' | 'code'>, g: SymbolGeom): Box => {
  const w = textWidth(o.code, LABEL_SIZE) + 2
  return { x: o.x - w / 2, y: g.labelY - LABEL_SIZE * 0.85, w, h: LABEL_SIZE * 1.1 }
}
