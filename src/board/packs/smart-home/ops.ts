/** 点位图的业务操作（代号、设备类型、灯光款式、图纸、区域）。都是纯函数，返回新文档。 */
import { removeObjects, sheetsOf, updateObject, withPoly } from '@/board/core/ops'
import type {
  AreaObj,
  BoardDoc,
  BoardObj,
  Box,
  SheetObj,
  SymbolObj,
  SymbolTemplate,
  Vec,
} from '@/board/core/types'
import { areaTypeLabel, inferAreaType, isAreaType } from '@/lib/area-types'
import { categoryOfType } from '@/lib/device-types'
import { nextPointCode, randomId } from '@/lib/point-scene'
import { SHEET } from '@/lib/sheet-spec'

import { lightingVariant, type LightingVariant } from './look'

export const codesOf = (doc: BoardDoc) =>
  doc.objects.flatMap((o) => (o.kind === 'symbol' ? [o.code] : []))

export function createPoint(
  doc: BoardDoc,
  tpl: SymbolTemplate,
  at: Vec,
): { doc: BoardDoc; obj: SymbolObj } {
  const deviceType = String(tpl.data.deviceType ?? 'other')
  const obj: SymbolObj = {
    kind: 'symbol',
    id: randomId(),
    symbolId: tpl.symbolId,
    x: at.x,
    y: at.y,
    angle: tpl.angle ?? 0,
    code: nextPointCode(deviceType, codesOf(doc)),
    sizeCm: tpl.sizeCm,
    real: tpl.real,
    data: { ...tpl.data },
    meta: { group: randomId('pt-'), labelId: randomId() },
  }
  return { doc: { objects: [...doc.objects, obj] }, obj }
}

/** 换设备类型：同大类保留代号，跨大类重新编号；灯光款式只在同类型下保留 */
export function changePointType(doc: BoardDoc, id: string, newType: string) {
  return updateObject<SymbolObj>(doc, id, (o) => {
    const oldType = String(o.data.deviceType ?? 'other')
    if (oldType === newType) return null
    const code =
      categoryOfType(oldType)?.code === categoryOfType(newType)?.code && o.code
        ? o.code
        : nextPointCode(newType, codesOf(doc))
    const { productId: _p, ...rest } = o.data
    const keep = lightingVariant(o.symbolId)?.family.deviceType === newType
    return {
      ...o,
      code,
      data: { ...rest, deviceType: newType },
      symbolId: keep ? o.symbolId : newType,
      sizeCm: keep ? o.sizeCm : null,
      real: keep ? o.real : false,
    }
  })
}

/** 换灯光款式 / 尺寸档（设备类型跟随款式） */
export function setPointVariant(doc: BoardDoc, id: string, v: LightingVariant, real: boolean) {
  const o = doc.objects.find((x) => x.id === id)
  if (!o || o.kind !== 'symbol') return doc
  const typed = changePointType(doc, id, v.family.deviceType)
  return updateObject<SymbolObj>(typed, id, (p) => ({
    ...p,
    symbolId: v.id,
    sizeCm: v.sizeCm,
    real,
  }))
}

export function setPointReal(doc: BoardDoc, ids: string[], real: boolean) {
  let d = doc
  for (const id of ids)
    d = updateObject<SymbolObj>(d, id, (o) =>
      o.kind === 'symbol' && o.real !== real ? { ...o, real } : null,
    )
  return d
}

/** 复制 / 粘贴：新 ID，点位重新编号 */
export function cloneObjects(
  doc: BoardDoc,
  src: BoardObj[],
  offset: Vec,
): { doc: BoardDoc; ids: string[] } {
  const objects = [...doc.objects]
  const ids: string[] = []
  for (const o of src) {
    const id = randomId()
    let n: BoardObj | null = null
    if (o.kind === 'symbol') {
      const codes = objects.flatMap((x) => (x.kind === 'symbol' ? [x.code] : []))
      n = {
        ...o,
        id,
        x: o.x + offset.x,
        y: o.y + offset.y,
        code: nextPointCode(String(o.data.deviceType ?? 'other'), codes),
        meta: { group: randomId('pt-'), labelId: randomId() },
      }
    } else if (o.kind === 'area')
      n = {
        ...o,
        id,
        x: o.x + offset.x,
        y: o.y + offset.y,
        ...(o.poly ? { poly: o.poly.map((q) => ({ x: q.x + offset.x, y: q.y + offset.y })) } : {}),
        meta: { group: randomId('ar-'), labelId: randomId() },
      }
    else if (o.kind === 'raw')
      n = {
        kind: 'raw',
        id,
        el: { ...o.el, id, x: o.el.x + offset.x, y: o.el.y + offset.y, groupIds: [] },
      }
    if (n) {
      objects.push(n)
      ids.push(id)
    }
  }
  return { doc: { objects }, ids }
}

/** 新建区域：传 poly 时是多边形（外接框按顶点算），否则是 box 这个矩形 */
export function createArea(
  doc: BoardDoc,
  box: Box,
  areaType = 'living',
  name?: string,
  poly?: Vec[],
): { doc: BoardDoc; obj: AreaObj } {
  const t = isAreaType(areaType) ? areaType : 'living'
  const base: AreaObj = {
    kind: 'area',
    id: randomId(),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    name: name ?? areaTypeLabel(t),
    areaType: t,
    meta: { group: randomId('ar-'), labelId: randomId() },
  }
  const obj = (poly ? withPoly(base, poly) : null) ?? base
  // 区域放在其他区域之上、点位之下（绘制按图层，数组里放最后即可）
  return { doc: { objects: [...doc.objects, obj] }, obj }
}

export function updateArea(doc: BoardDoc, id: string, patch: { name?: string; areaType?: string }) {
  return updateObject<AreaObj>(doc, id, (a) => {
    const name = patch.name?.trim() || a.name
    const areaType =
      patch.areaType && isAreaType(patch.areaType)
        ? patch.areaType
        : patch.name
          ? inferAreaType(name) || a.areaType
          : a.areaType
    return name === a.name && areaType === a.areaType ? null : { ...a, name, areaType }
  })
}

/** 新图纸放在最右侧图纸的右边 */
export function createSheet(
  doc: BoardDoc,
  opts: { name: string; fileId: string; mediaId?: string | null },
): { doc: BoardDoc; obj: SheetObj } {
  const sheets = sheetsOf(doc)
  const x = sheets.length ? Math.max(...sheets.map((s) => s.x + s.w)) + SHEET.gap : 0
  const obj: SheetObj = {
    kind: 'sheet',
    id: randomId(),
    sheetId: randomId('sh-'),
    name: opts.name,
    x,
    y: 0,
    w: SHEET.width,
    h: SHEET.height,
    fileId: opts.fileId,
    mediaId: opts.mediaId ?? null,
    mmPerUnit: null,
  }
  return { doc: { objects: [obj, ...doc.objects] }, obj }
}

export const updateSheet = (
  doc: BoardDoc,
  sheetId: string,
  patch: Partial<Pick<SheetObj, 'name' | 'mmPerUnit'>>,
) => {
  const s = sheetsOf(doc).find((x) => x.sheetId === sheetId)
  return s ? updateObject<SheetObj>(doc, s.id, (o) => ({ ...o, ...patch })) : doc
}

const centerOf = (o: BoardObj): Vec | null => {
  if (o.kind === 'symbol') return { x: o.x, y: o.y }
  if (o.kind === 'area') return { x: o.x + o.w / 2, y: o.y + o.h / 2 }
  if (o.kind === 'raw')
    return { x: o.el.x + (o.el.width || 0) / 2, y: o.el.y + (o.el.height || 0) / 2 }
  return null
}

/** 删除图纸及图纸范围内的所有内容 */
export function removeSheet(doc: BoardDoc, sheet: SheetObj) {
  const ids = new Set<string>([sheet.id])
  for (const o of doc.objects) {
    const c = centerOf(o)
    if (
      c &&
      c.x >= sheet.x &&
      c.x <= sheet.x + sheet.w &&
      c.y >= sheet.y &&
      c.y <= sheet.y + sheet.h
    )
      ids.add(o.id)
  }
  return removeObjects(doc, ids)
}

function pointInPoly(poly: Vec[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function polyCentroid(area: AreaObj): Vec {
  if (!area.poly || area.poly.length < 3) {
    return { x: area.x + area.w / 2, y: area.y + area.h / 2 }
  }
  let sx = 0
  let sy = 0
  for (const p of area.poly) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / area.poly.length, y: sy / area.poly.length }
}

function roomDevicesForType(
  areaType: string,
  includeLighting: boolean,
  floorState: { hasGateway: boolean; hasVrf: boolean; cameraCount: number },
): string[] {
  const list: string[] = []
  switch (areaType) {
    case 'entrance':
      list.push('smart-lock', 'switch-2', 'motion-sensor')
      if (floorState.cameraCount < 2) {
        list.push('camera')
        floorState.cameraCount++
      }
      if (includeLighting) list.push('downlight')
      break
    case 'living':
      if (!floorState.hasGateway) {
        list.push('gateway')
        floorState.hasGateway = true
      }
      list.push('touch-panel', 'curtain-track')
      if (!floorState.hasVrf) {
        list.push('vrf-controller')
        floorState.hasVrf = true
      }
      if (floorState.cameraCount < 2) {
        list.push('camera')
        floorState.cameraCount++
      }
      list.push('ap-node', 'network-panel', 'switch-3')
      if (includeLighting)
        list.push(
          'ceiling-light',
          'downlight',
          'downlight',
          'downlight',
          'downlight',
          'light-strip',
        )
      break
    case 'dining':
      list.push('switch-2', 'speaker')
      if (includeLighting) list.push('ceiling-light', 'downlight', 'downlight')
      break
    case 'kitchen':
      list.push('switch-1', 'smoke-sensor', 'water-sensor')
      if (includeLighting) list.push('downlight', 'downlight')
      break
    case 'bedroom':
      list.push('switch-2', 'switch-2', 'curtain-track', 'motion-sensor', 'ap-node', 'temp-sensor')
      if (includeLighting) list.push('ceiling-light', 'downlight', 'downlight')
      break
    case 'kids':
      list.push('switch-2', 'curtain-track', 'temp-sensor')
      if (includeLighting) list.push('ceiling-light', 'downlight', 'downlight')
      break
    case 'study':
      list.push('switch-2', 'curtain-track', 'speaker', 'network-panel')
      if (includeLighting) list.push('ceiling-light', 'downlight', 'downlight')
      break
    case 'bathroom':
      list.push('switch-1', 'motion-sensor', 'water-sensor')
      if (includeLighting) list.push('downlight', 'downlight')
      break
    case 'balcony':
      list.push('switch-1', 'curtain-track')
      if (includeLighting) list.push('ceiling-light')
      break
    case 'corridor':
    case 'stairs':
      list.push('switch-2', 'motion-sensor')
      if (includeLighting) list.push('downlight', 'downlight')
      break
    case 'closet':
      list.push('switch-1', 'motion-sensor')
      if (includeLighting) list.push('light-strip', 'downlight')
      break
    case 'theater':
      list.push('touch-panel', 'curtain-track')
      if (includeLighting)
        list.push('light-strip', 'spotlight', 'spotlight', 'spotlight', 'spotlight')
      break
    case 'garage':
      list.push('motion-sensor', 'camera')
      if (includeLighting) list.push('ceiling-light')
      break
    case 'utility':
      list.push('water-sensor', 'smoke-sensor')
      if (includeLighting) list.push('downlight')
      break
    default:
      list.push('switch-2', 'motion-sensor')
      if (includeLighting) list.push('downlight', 'downlight')
      break
  }
  return list
}

/**
 * 智能生成点位（覆盖目标图纸上的已有点位，保留或自动补齐房间区域，通过 commit 推入历史栈，支持一键撤销）。
 */
export function autoGenerateSheetPoints(
  doc: BoardDoc,
  opts: { sheetId?: string | null; includeLighting?: boolean } = {},
): { doc: BoardDoc; addedPoints: number; removedPoints: number; addedAreas: number } {
  const sheets = sheetsOf(doc)
  const targetSheets = opts.sheetId ? sheets.filter((s) => s.sheetId === opts.sheetId) : sheets
  if (!targetSheets.length) return { doc, addedPoints: 0, removedPoints: 0, addedAreas: 0 }

  const includeLighting = opts.includeLighting !== false
  const inTargetSheet = (x: number, y: number) =>
    targetSheets.some((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h)

  let removedPoints = 0
  const keptObjects: BoardObj[] = []
  for (const o of doc.objects) {
    if (o.kind === 'symbol' && inTargetSheet(o.x, o.y)) {
      removedPoints++
      continue
    }
    keptObjects.push(o)
  }

  let workingDoc: BoardDoc = { objects: keptObjects }
  let addedAreas = 0
  let addedPoints = 0

  for (const sheet of targetSheets) {
    let sheetAreas = workingDoc.objects.filter(
      (o): o is AreaObj =>
        o.kind === 'area' &&
        o.x + o.w / 2 >= sheet.x &&
        o.x + o.w / 2 <= sheet.x + sheet.w &&
        o.y + o.h / 2 >= sheet.y &&
        o.y + o.h / 2 <= sheet.y + sheet.h,
    )

    // 若该图纸尚未划分房间区域，自动创建一套标准户型房间区域
    if (sheetAreas.length === 0) {
      const defaultRooms: {
        name: string
        type: string
        rx: number
        ry: number
        rw: number
        rh: number
      }[] = [
        { name: '玄关', type: 'entrance', rx: 0.06, ry: 0.56, rw: 0.18, rh: 0.34 },
        { name: '客厅', type: 'living', rx: 0.26, ry: 0.44, rw: 0.38, rh: 0.46 },
        { name: '餐厅', type: 'dining', rx: 0.26, ry: 0.08, rw: 0.24, rh: 0.32 },
        { name: '厨房', type: 'kitchen', rx: 0.06, ry: 0.08, rw: 0.18, rh: 0.44 },
        { name: '主卧', type: 'bedroom', rx: 0.66, ry: 0.46, rw: 0.28, rh: 0.44 },
        { name: '次卧', type: 'bedroom', rx: 0.66, ry: 0.08, rw: 0.28, rh: 0.34 },
        { name: '主卫', type: 'bathroom', rx: 0.52, ry: 0.08, rw: 0.12, rh: 0.32 },
      ]
      const created: AreaObj[] = []
      for (const r of defaultRooms) {
        const res = createArea(
          workingDoc,
          {
            x: Math.round(sheet.x + r.rx * sheet.w),
            y: Math.round(sheet.y + r.ry * sheet.h),
            w: Math.round(r.rw * sheet.w),
            h: Math.round(r.rh * sheet.h),
          },
          r.type,
          r.name,
        )
        workingDoc = res.doc
        created.push(res.obj)
        addedAreas++
      }
      sheetAreas = created
    }

    const floorState = { hasGateway: false, hasVrf: false, cameraCount: 0 }
    // 优先处理客厅，确保每层网关与 VRF 优先落在客厅
    const sortedAreas = [...sheetAreas].sort((a, b) =>
      a.areaType === 'living' ? -1 : b.areaType === 'living' ? 1 : 0,
    )

    for (const area of sortedAreas) {
      const devTypes = roomDevicesForType(area.areaType, includeLighting, floorState)
      if (!devTypes.length) continue

      const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(devTypes.length))))
      const rows = Math.ceil(devTypes.length / cols)
      const centroid = polyCentroid(area)
      const padX = Math.min(28, Math.max(14, area.w * 0.14))
      const padY = Math.min(32, Math.max(18, area.h * 0.18))
      const innerW = Math.max(24, area.w - padX * 2)
      const innerH = Math.max(24, area.h - padY * 2)

      for (const [idx, dt] of devTypes.entries()) {
        const c = idx % cols
        const r = Math.floor(idx / cols)
        let px = area.x + padX + (cols === 1 ? innerW / 2 : (c / (cols - 1)) * innerW)
        let py = area.y + padY + (rows === 1 ? innerH / 2 : (r / (rows - 1)) * innerH)

        // 如果是异形多边形区域且网格点落在凹角外侧，向多边形重心收敛确保点位落在房间内
        if (area.poly && area.poly.length >= 3 && !pointInPoly(area.poly, px, py)) {
          for (const t of [0.35, 0.6, 0.8, 1]) {
            const tx = px + (centroid.x - px) * t
            const ty = py + (centroid.y - py) * t
            if (pointInPoly(area.poly, tx, ty) || t === 1) {
              px = tx + ((idx % 3) - 1) * 14
              py = ty + (Math.floor(idx / 3) - 1) * 14
              break
            }
          }
        }

        const createdPt = createPoint(
          workingDoc,
          { symbolId: dt, sizeCm: null, real: false, data: { deviceType: dt } },
          { x: Math.round(px), y: Math.round(py) },
        )
        workingDoc = createdPt.doc
        addedPoints++
      }
    }
  }

  return { doc: workingDoc, addedPoints, removedPoints, addedAreas }
}
