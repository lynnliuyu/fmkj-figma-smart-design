import { boxCorners, normAngle, polyArea, polyBox } from './geometry'
import type { AreaObj, BoardDoc, BoardObj, Box, RawEl, Vec } from './types'

/** 通用对象操作（与业务无关）。都返回新文档；没有变化时返回原文档。 */

export function mapObjects(
  doc: BoardDoc,
  ids: ReadonlySet<string> | string[],
  fn: (o: BoardObj) => BoardObj,
): BoardDoc {
  const set = ids instanceof Set ? ids : new Set(ids)
  if (!set.size) return doc
  let changed = false
  const objects = doc.objects.map((o) => {
    if (!set.has(o.id)) return o
    const n = fn(o)
    if (n !== o) changed = true
    return n
  })
  return changed ? { objects } : doc
}

const moveRaw = (el: RawEl, dx: number, dy: number): RawEl => ({
  ...el,
  x: el.x + dx,
  y: el.y + dy,
})

/** 平移对象（图纸不参与） */
export function moveObjects(
  doc: BoardDoc,
  ids: ReadonlySet<string> | string[],
  dx: number,
  dy: number,
): BoardDoc {
  if (!dx && !dy) return doc
  return mapObjects(doc, ids, (o) => {
    switch (o.kind) {
      case 'symbol':
        return { ...o, x: o.x + dx, y: o.y + dy }
      case 'area':
        return {
          ...o,
          x: o.x + dx,
          y: o.y + dy,
          ...(o.poly ? { poly: o.poly.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : {}),
        }
      case 'raw':
        return o.el.locked ? o : { ...o, el: moveRaw(o.el, dx, dy) }
      default:
        return o
    }
  })
}

export function removeObjects(doc: BoardDoc, ids: ReadonlySet<string> | string[]): BoardDoc {
  const set = ids instanceof Set ? ids : new Set(ids)
  if (!set.size) return doc
  const objects = doc.objects.filter((o) => !set.has(o.id))
  return objects.length === doc.objects.length ? doc : { objects }
}

/** 旋转符号：delta 为增量；absolute 为绝对角度 */
export function rotateSymbols(
  doc: BoardDoc,
  ids: ReadonlySet<string> | string[],
  angle: { delta?: number; absolute?: number },
): BoardDoc {
  return mapObjects(doc, ids, (o) => {
    if (o.kind !== 'symbol') return o
    const next = normAngle(angle.absolute ?? o.angle + (angle.delta ?? 0))
    return Math.abs(next - o.angle) < 1e-9 ? o : { ...o, angle: next }
  })
}

export function updateObject<T extends BoardObj>(
  doc: BoardDoc,
  id: string,
  patch: (o: T) => T | null,
): BoardDoc {
  return mapObjects(doc, [id], (o) => patch(o as T) ?? o)
}

export const MIN_AREA = 16

/** 调整区域范围（最小 16 × 16） */
export function resizeArea(doc: BoardDoc, id: string, box: Box): BoardDoc {
  return updateObject<AreaObj>(doc, id, (o) => ({
    ...o,
    x: box.x,
    y: box.y,
    w: Math.max(MIN_AREA, box.w),
    h: Math.max(MIN_AREA, box.h),
  }))
}

/** 区域轮廓：多边形区域取顶点，旧的矩形区域取四个角 */
export const areaPoly = (a: Pick<AreaObj, 'x' | 'y' | 'w' | 'h' | 'poly'>): Vec[] =>
  a.poly && a.poly.length >= 3 ? a.poly : boxCorners(a)

/** 设置区域轮廓：外接框跟着更新；顶点少于 3 个或面积太小时不改 */
export function withPoly<T extends AreaObj>(a: T, poly: Vec[]): T | null {
  if (poly.length < 3 || polyArea(poly) < MIN_AREA * MIN_AREA * 0.5) return null
  const b = polyBox(poly)
  return {
    ...a,
    poly: poly.map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 })),
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
  }
}

export function setAreaPoly(doc: BoardDoc, id: string, poly: Vec[]): BoardDoc {
  return updateObject<AreaObj>(doc, id, (o) => withPoly(o, poly))
}

/** 原始元素的外接框（考虑旋转） */
export function rawBox(el: RawEl): Box {
  const w = Math.abs(el.width || 0)
  const h = Math.abs(el.height || 0)
  const a = typeof el.angle === 'number' ? el.angle : 0
  if (!a) return { x: el.x, y: el.y, w, h }
  const s = Math.abs(Math.sin(a))
  const k = Math.abs(Math.cos(a))
  const W = w * k + h * s
  const H = w * s + h * k
  return { x: el.x + w / 2 - W / 2, y: el.y + h / 2 - H / 2, w: W, h: H }
}

export const sheetsOf = (doc: BoardDoc) =>
  doc.objects.filter((o): o is Extract<BoardObj, { kind: 'sheet' }> => o.kind === 'sheet')
export const symbolsOf = (doc: BoardDoc) =>
  doc.objects.filter((o): o is Extract<BoardObj, { kind: 'symbol' }> => o.kind === 'symbol')
export const areasOf = (doc: BoardDoc) => doc.objects.filter((o): o is AreaObj => o.kind === 'area')

/** 中心点所在的图纸（取最上面一张） */
export function sheetAt(doc: BoardDoc, x: number, y: number) {
  const sheets = sheetsOf(doc)
  for (let i = sheets.length - 1; i >= 0; i--) {
    const s = sheets[i]
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s
  }
  return null
}
