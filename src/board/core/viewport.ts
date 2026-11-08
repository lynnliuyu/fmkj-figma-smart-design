import { clamp } from './geometry'
import type { Box, Vec, Viewport } from './types'

export const ZOOM_MIN = 0.05
export const ZOOM_MAX = 16

export type Size = { w: number; h: number }
export type Insets = { top: number; right: number; bottom: number; left: number }

export const toScene = (v: Viewport, sx: number, sy: number): Vec => ({
  x: sx / v.zoom - v.scrollX,
  y: sy / v.zoom - v.scrollY,
})
export const toScreen = (v: Viewport, x: number, y: number): Vec => ({
  x: (x + v.scrollX) * v.zoom,
  y: (y + v.scrollY) * v.zoom,
})

/** 以屏幕点 (sx, sy) 为中心缩放：该点下的场景位置不变 */
export function zoomAt(v: Viewport, sx: number, sy: number, zoom: number): Viewport {
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX)
  const p = toScene(v, sx, sy)
  return { zoom: z, scrollX: sx / z - p.x, scrollY: sy / z - p.y }
}

export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({
  ...v,
  scrollX: v.scrollX + dx / v.zoom,
  scrollY: v.scrollY + dy / v.zoom,
})

/** 让 box 铺满视口（留出 insets，factor < 1 时四周再留一点边） */
export function fitBox(
  box: Box,
  size: Size,
  factor = 0.96,
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 },
): Viewport {
  const W = Math.max(1, size.w - insets.left - insets.right)
  const H = Math.max(1, size.h - insets.top - insets.bottom)
  const zoom = clamp(
    Math.min(W / Math.max(1, box.w), H / Math.max(1, box.h)) * factor,
    ZOOM_MIN,
    ZOOM_MAX,
  )
  const cx = insets.left + W / 2
  const cy = insets.top + H / 2
  return {
    zoom,
    scrollX: cx / zoom - (box.x + box.w / 2),
    scrollY: cy / zoom - (box.y + box.h / 2),
  }
}

/** 视口里可见的场景范围 */
export const visibleBox = (v: Viewport, size: Size): Box => ({
  x: -v.scrollX,
  y: -v.scrollY,
  w: size.w / v.zoom,
  h: size.h / v.zoom,
})

/** 两个视口之间插值（缩放按对数插值，动画更均匀） */
export function lerpViewport(a: Viewport, b: Viewport, t: number, size: Size): Viewport {
  const z = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t)
  // 插值视口中心（场景坐标），避免缩放时画面先跑偏
  const ca = toScene(a, size.w / 2, size.h / 2)
  const cb = toScene(b, size.w / 2, size.h / 2)
  const cx = ca.x + (cb.x - ca.x) * t
  const cy = ca.y + (cb.y - ca.y) * t
  return { zoom: z, scrollX: size.w / 2 / z - cx, scrollY: size.h / 2 / z - cy }
}

export const sameViewport = (a: Viewport, b: Viewport) =>
  Math.abs(a.zoom - b.zoom) < 1e-6 &&
  Math.abs(a.scrollX - b.scrollX) < 0.01 &&
  Math.abs(a.scrollY - b.scrollY) < 0.01
