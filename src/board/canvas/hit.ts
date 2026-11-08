import {
  boxContains,
  distToPolygon,
  distToSegment,
  inRotatedRect,
  nearBoxEdge,
  pointInPolygon,
  rotatePoint,
} from '../core/geometry'
import { areaPoly, rawBox } from '../core/ops'
import { labelBox, textWidth, type SymbolGeom } from '../core/symbols'
import type { AreaObj, BoardDoc, Box, RawEl, Vec, ViewSettings } from '../core/types'

export type Handle = 'rotate'
/**
 * 命中结果：
 * - handle：选中符号的旋转手柄；
 * - vertex：选中区域的顶点（拖动改形状，双击删除）；
 * - mid：选中区域某条边的中点（拖动插入新顶点，index 是这条边起点的序号）。
 */
export type Hit =
  | { kind: 'symbol' | 'area' | 'raw' | 'sheet'; id: string }
  | { kind: 'handle'; id: string; handle: Handle }
  | { kind: 'vertex'; id: string; index: number }
  | { kind: 'mid'; id: string; index: number }

export type HitCtx = {
  doc: BoardDoc
  geoms: Map<string, SymbolGeom>
  view: ViewSettings
  zoom: number
  hidden: ReadonlySet<string>
  selection: ReadonlySet<string>
  readOnly: boolean
}

export const AREA_LABEL = 11

/** 区域名的位置：轮廓最上方（同高取最左）的顶点；矩形区域就是左上角（与编解码器写入的区域名一致） */
export function areaLabelAnchor(a: AreaObj): Vec {
  return areaPoly(a).reduce((best, q) =>
    q.y < best.y - 0.5 || (Math.abs(q.y - best.y) <= 0.5 && q.x < best.x) ? q : best,
  )
}
export const areaLabelBox = (a: AreaObj): Box => {
  const p = areaLabelAnchor(a)
  return { x: p.x + 2, y: p.y + 1, w: textWidth(a.name, AREA_LABEL) + 6, h: AREA_LABEL * 1.4 }
}

/** 每条边的中点（第 i 条边从顶点 i 到顶点 i + 1） */
export const edgeMidpoints = (poly: readonly Vec[]): Vec[] =>
  poly.map((q, i) => {
    const n = poly[(i + 1) % poly.length]
    return { x: (q.x + n.x) / 2, y: (q.y + n.y) / 2 }
  })

export const rotateHandle = (
  o: { x: number; y: number; angle: number },
  g: SymbolGeom,
  zoom: number,
): Vec => rotatePoint({ x: o.x, y: o.y - g.h / 2 - 18 / zoom }, { x: o.x, y: o.y }, o.angle)

export const HANDLE_CURSOR: Record<Handle, string> = { rotate: 'grab' }

function rawHit(el: RawEl, p: Vec, tol: number) {
  const pts = Array.isArray(el.points) ? (el.points as [number, number][]) : null
  if (pts && (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw')) {
    const sw = typeof el.strokeWidth === 'number' ? el.strokeWidth : 2
    for (let i = 1; i < pts.length; i++) {
      if (
        distToSegment(
          p,
          { x: el.x + pts[i - 1][0], y: el.y + pts[i - 1][1] },
          { x: el.x + pts[i][0], y: el.y + pts[i][1] },
        ) <=
        tol + sw
      )
        return true
    }
    return false
  }
  const b = rawBox(el)
  const filled = typeof el.backgroundColor === 'string' && el.backgroundColor !== 'transparent'
  if ((el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond') && !filled)
    return nearBoxEdge(b, p, tol)
  return boxContains(b, p, tol * 0.5)
}

export function hitTest(p: Vec, c: HitCtx): Hit | null {
  const { doc, geoms, view, zoom, hidden, selection } = c
  const tol = 6 / zoom
  const objs = doc.objects
  if (!c.readOnly && selection.size === 1) {
    const id = [...selection][0]
    const o = objs.find((x) => x.id === id)
    if (o?.kind === 'area' && view.layers.area) {
      const poly = areaPoly(o)
      for (let i = 0; i < poly.length; i++)
        if (Math.hypot(p.x - poly[i].x, p.y - poly[i].y) <= tol + 2 / zoom)
          return { kind: 'vertex', id, index: i }
      const mids = edgeMidpoints(poly)
      for (let i = 0; i < mids.length; i++)
        if (Math.hypot(p.x - mids[i].x, p.y - mids[i].y) <= tol)
          return { kind: 'mid', id, index: i }
    }
    if (o?.kind === 'symbol' && view.layers.symbol) {
      const g = geoms.get(id)
      if (g && !g.marker) {
        const q = rotateHandle(o, g, zoom)
        if (Math.hypot(p.x - q.x, p.y - q.y) <= tol + 1 / zoom)
          return { kind: 'handle', id, handle: 'rotate' }
      }
    }
  }
  if (view.layers.symbol) {
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      if (o.kind !== 'symbol' || hidden.has(o.id)) continue
      const g = geoms.get(o.id)
      if (!g) continue
      if (inRotatedRect(p, o, g.w, g.h, g.marker ? 0 : o.angle, Math.max(1.5, tol * 0.5)))
        return { kind: 'symbol', id: o.id }
      if (view.labels && o.code && boxContains(labelBox(o, g), p))
        return { kind: 'symbol', id: o.id }
    }
  }
  if (view.layers.shape) {
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      if (o.kind === 'raw' && !o.el.locked && rawHit(o.el, p, tol)) return { kind: 'raw', id: o.id }
    }
  }
  if (view.layers.area) {
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      if (o.kind !== 'area') continue
      const poly = areaPoly(o)
      if (
        boxContains(areaLabelBox(o), p) ||
        (boxContains(o, p, tol) && distToPolygon(p, poly) <= tol)
      )
        return { kind: 'area', id: o.id }
      // 已选中的区域：内部也能拖动
      if (selection.has(o.id) && pointInPolygon(p, poly)) return { kind: 'area', id: o.id }
    }
  }
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i]
    if (o.kind === 'sheet' && boxContains(o, p)) return { kind: 'sheet', id: o.id }
  }
  return null
}
