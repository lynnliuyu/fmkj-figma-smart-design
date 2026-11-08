/**
 * 智能家居包的编解码器：原有点位图场景 JSON（StoredScene）⇄ 画板文档（BoardDoc）。
 * 持久化格式不变（报价、点位清单、AI 导入、方案打印都照旧读取），新增字段都是可忽略的：
 * - 点位 customData：symbolId（灯光款式）、sizeCm（真实尺寸）、real（按比例落图）；元素 angle（旋转）；
 * - 图纸 customData：mmPerUnit（标定）；
 * - 区域 customData：polygon（多边形顶点，相对元素 x / y；元素本身保存外接框，旧代码按矩形读也不出错）。
 * 引擎不认识的元素原样保留；点位代号、区域名、图纸名这些附属文字由对象派生，始终与对象一致。
 */
import { sheetAt } from '@/board/core/ops'
import { DEFAULT_SYMBOL_SIZE, symbolGeom, textWidth } from '@/board/core/symbols'
import type {
  AreaObj,
  BoardDoc,
  BoardFile,
  BoardObj,
  RawEl,
  SheetObj,
  SizeCm,
  SymbolObj,
} from '@/board/core/types'
import { inferAreaType, isAreaType } from '@/lib/area-types'
import { categoryOfType, isDeviceType } from '@/lib/device-types'
import { markerFileId } from '@/lib/point-markers'
import {
  AREA_STYLE,
  areaLabelAnchor,
  areaPolygon,
  isPointElement,
  sceneAreas,
  scenePoints,
  sceneSheets,
  type SceneEl,
  type SceneFile,
} from '@/lib/point-scene'
import { MARKER, SHEET } from '@/lib/sheet-spec'

import { lookOf } from './look'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const kindOf = (el: SceneEl) =>
  typeof el.customData?.kind === 'string' ? (el.customData.kind as string) : null
const POINT_KEYS = new Set(['pointCode', 'symbolId', 'sizeCm', 'real'])

export function parseSize(v: unknown): SizeCm | null {
  if (!Array.isArray(v) || typeof v[0] !== 'number' || !(v[0] > 0)) return null
  return [v[0], typeof v[1] === 'number' && v[1] > 0 ? v[1] : null]
}

type Meta = { el?: SceneEl; label?: SceneEl; title?: SceneEl; group?: string; labelId?: string }
const metaOf = (o: { meta?: Record<string, unknown> }) => (o.meta ?? {}) as Meta

export function decodeScene(scene: { elements?: readonly SceneEl[] } | null | undefined): BoardDoc {
  const objects: BoardObj[] = []
  const texts: SceneEl[] = []
  const pointByGroup = new Map<string, SymbolObj>()
  const areaByGroup = new Map<string, AreaObj>()
  const sheetById = new Map<string, SheetObj>()
  let sheetNo = 0
  for (const el of scene?.elements ?? []) {
    if (!el || typeof el !== 'object' || el.isDeleted || typeof el.id !== 'string') continue
    const k = kindOf(el)
    if (k === 'label' || k === 'area-label' || k === 'sheet-title') {
      texts.push(el)
      continue
    }
    const cd = (el.customData ?? {}) as Record<string, unknown>
    if (isPointElement(el)) {
      const data: Record<string, unknown> = {}
      for (const [key, v] of Object.entries(cd)) if (!POINT_KEYS.has(key)) data[key] = v
      const dt = isDeviceType(cd.deviceType) ? (cd.deviceType as string) : 'other'
      const o: SymbolObj = {
        kind: 'symbol',
        id: el.id,
        symbolId: str(cd.symbolId) || dt,
        x: el.x + el.width / 2,
        y: el.y + el.height / 2,
        angle: typeof el.angle === 'number' ? el.angle : 0,
        code: str(cd.pointCode),
        sizeCm: parseSize(cd.sizeCm),
        real: cd.real === true,
        data,
        meta: { el, group: el.groupIds?.[0] },
      }
      objects.push(o)
      for (const g of el.groupIds ?? []) pointByGroup.set(g, o)
    } else if (el.type === 'image' && (k === 'sheet' || (!k && el.width >= 400))) {
      sheetNo++
      const s: SheetObj = {
        kind: 'sheet',
        id: el.id,
        sheetId: str(cd.sheetId) || el.id,
        name: str(cd.name) || `图纸 ${sheetNo}`,
        x: el.x,
        y: el.y,
        w: el.width,
        h: el.height,
        fileId: typeof el.fileId === 'string' ? el.fileId : null,
        mediaId: str(cd.mediaId) || null,
        mmPerUnit: typeof cd.mmPerUnit === 'number' && cd.mmPerUnit > 0 ? cd.mmPerUnit : null,
        meta: { el },
      }
      objects.push(s)
      sheetById.set(s.sheetId, s)
    } else if (k === 'area') {
      const name = str(cd.name) || '未命名区域'
      const poly = areaPolygon(el)
      const a: AreaObj = {
        kind: 'area',
        id: el.id,
        x: el.x,
        y: el.y,
        w: el.width,
        h: el.height,
        ...(poly ? { poly: poly.map(([x, y]) => ({ x, y })) } : {}),
        name,
        areaType: isAreaType(cd.areaType) ? cd.areaType : inferAreaType(name),
        meta: { el, group: el.groupIds?.[0] },
      }
      objects.push(a)
      for (const g of el.groupIds ?? []) areaByGroup.set(g, a)
    } else objects.push({ kind: 'raw', id: el.id, el: el as RawEl })
  }
  // 附属文字挂到所属对象上；找不到主人的原样保留
  for (const t of texts) {
    const k = kindOf(t)
    const groups = t.groupIds ?? []
    let owner: { meta?: Record<string, unknown> } | undefined
    let slot: 'label' | 'title' = 'label'
    if (k === 'label') owner = groups.map((g) => pointByGroup.get(g)).find(Boolean)
    else if (k === 'area-label') owner = groups.map((g) => areaByGroup.get(g)).find(Boolean)
    else {
      owner = sheetById.get(str(t.customData?.sheetId))
      slot = 'title'
    }
    if (owner && !metaOf(owner)[slot]) owner.meta = { ...owner.meta, [slot]: t }
    else objects.push({ kind: 'raw', id: t.id, el: t as RawEl })
  }
  return { objects }
}

function encodePoint(o: SymbolObj, doc: BoardDoc): SceneEl[] {
  const m = metaOf(o)
  const dt = isDeviceType(o.data.deviceType) ? (o.data.deviceType as string) : null
  const fileType = dt ?? 'other'
  let w: number = MARKER.size
  let h: number = MARKER.size
  if (o.real && o.sizeCm) {
    const sheet = sheetAt(doc, o.x, o.y)
    if (sheet?.mmPerUnit) {
      const g = symbolGeom(
        o,
        lookOf(o),
        { symbolStyle: 'plan', symbolSize: DEFAULT_SYMBOL_SIZE },
        sheet.mmPerUnit,
      )
      w = g.w
      h = g.h
    }
  }
  const group = m.group || m.el?.groupIds?.[0] || `pt-${o.id}`
  const cd: Record<string, unknown> = { ...o.data, pointCode: o.code }
  if (o.symbolId !== fileType) cd.symbolId = o.symbolId
  if (o.sizeCm) cd.sizeCm = o.sizeCm
  if (o.real) cd.real = true
  const image: SceneEl = {
    ...(m.el ?? {}),
    id: o.id,
    type: 'image',
    x: o.x - w / 2,
    y: o.y - h / 2,
    width: w,
    height: h,
    groupIds: [group],
    fileId: markerFileId(fileType),
    status: 'saved',
    customData: cd,
  }
  if (o.angle) image.angle = o.angle
  else delete image.angle
  const lw = Math.max(MARKER.size, textWidth(o.code, MARKER.labelSize) + 2)
  const label: SceneEl = {
    ...(m.label ?? {}),
    id: m.labelId || m.label?.id || `${o.id}-lb`,
    type: 'text',
    x: o.x - lw / 2,
    y: o.y + h / 2 + MARKER.labelGap,
    width: lw,
    height: MARKER.labelSize * 1.25,
    groupIds: [group],
    strokeColor: categoryOfType(fileType)?.color ?? '#525252',
    text: o.code,
    originalText: o.code,
    fontSize: MARKER.labelSize,
    fontFamily: 2,
    textAlign: 'center',
    lineHeight: 1.25,
    customData: { kind: 'label', pointCode: o.code },
  }
  return [image, label]
}

function encodeArea(o: AreaObj): SceneEl[] {
  const m = metaOf(o)
  const group = m.group || m.el?.groupIds?.[0] || `ar-${o.id}`
  const poly = o.poly && o.poly.length >= 3 ? o.poly : null
  const { polygon: _old, ...cd } = (m.el?.customData ?? {}) as Record<string, unknown>
  void _old
  const rect: SceneEl = {
    ...(m.el ?? { strokeColor: AREA_STYLE.stroke, strokeWidth: 1, roughness: 0, opacity: 70 }),
    id: o.id,
    type: 'rectangle',
    x: o.x,
    y: o.y,
    width: o.w,
    height: o.h,
    strokeStyle: 'solid',
    groupIds: [group],
    customData: {
      ...cd,
      kind: 'area',
      name: o.name,
      areaType: o.areaType,
      ...(poly
        ? {
            polygon: poly.map((q) => [
              Math.round((q.x - o.x) * 10) / 10,
              Math.round((q.y - o.y) * 10) / 10,
            ]),
          }
        : {}),
    },
  }
  const [lx, ly] = areaLabelAnchor({
    x: o.x,
    y: o.y,
    width: o.w,
    height: o.h,
    poly: poly ? poly.map((q) => [q.x, q.y] as [number, number]) : null,
  })
  const label: SceneEl = {
    ...(m.label ?? { strokeColor: AREA_STYLE.label, fontFamily: 2, lineHeight: 1.25 }),
    id: m.labelId || m.label?.id || `${o.id}-lb`,
    type: 'text',
    x: lx + 4,
    y: ly + 3,
    width: textWidth(o.name, AREA_STYLE.labelSize),
    height: AREA_STYLE.labelSize * 1.25,
    groupIds: [group],
    text: o.name,
    originalText: o.name,
    fontSize: AREA_STYLE.labelSize,
    customData: { kind: 'area-label' },
  }
  return [rect, label]
}

function encodeSheet(o: SheetObj): SceneEl[] {
  const m = metaOf(o)
  const cd: Record<string, unknown> = {
    ...(m.el?.customData ?? {}),
    kind: 'sheet',
    sheetId: o.sheetId,
    name: o.name,
  }
  if (o.mediaId) cd.mediaId = o.mediaId
  if (o.mmPerUnit) cd.mmPerUnit = Math.round(o.mmPerUnit * 10000) / 10000
  else delete cd.mmPerUnit
  const image: SceneEl = {
    ...(m.el ?? { opacity: SHEET.opacity }),
    id: o.id,
    type: 'image',
    x: o.x,
    y: o.y,
    width: o.w,
    height: o.h,
    locked: true,
    fileId: o.fileId,
    status: 'saved',
    customData: cd,
  }
  const title: SceneEl = {
    ...(m.title ?? { fontFamily: 2, lineHeight: 1.25, strokeColor: '#404040' }),
    id: m.title?.id || `${o.id}-tt`,
    type: 'text',
    x: o.x,
    y: o.y - SHEET.titleOffset,
    width: textWidth(o.name, SHEET.titleSize),
    height: SHEET.titleSize * 1.25,
    locked: true,
    text: o.name,
    originalText: o.name,
    fontSize: SHEET.titleSize,
    customData: { kind: 'sheet-title', sheetId: o.sheetId },
  }
  return [image, title]
}

/** 画板文档 → 场景元素（图纸、区域、其他元素、点位，自下而上） */
export function encodeDoc(doc: BoardDoc): SceneEl[] {
  const sheets: SceneEl[] = []
  const areas: SceneEl[] = []
  const raws: SceneEl[] = []
  const points: SceneEl[] = []
  for (const o of doc.objects) {
    if (o.kind === 'sheet') sheets.push(...encodeSheet(o))
    else if (o.kind === 'area') areas.push(...encodeArea(o))
    else if (o.kind === 'raw') raws.push(o.el as SceneEl)
    else points.push(...encodePoint(o, doc))
  }
  return [...sheets, ...areas, ...raws, ...points]
}

/** 用与报价、方案完全相同的规则算出图纸、区域、点位 */
export function analyzeDoc(doc: BoardDoc, files: Record<string, SceneFile | BoardFile> = {}) {
  const elements = encodeDoc(doc)
  const sheets = sceneSheets(elements, files as Record<string, SceneFile>)
  const areas = sceneAreas(elements, sheets)
  const points = scenePoints(elements, sheets, areas)
  return { elements, sheets, areas, points }
}

/* ------------------------------ 画板 JSON 导入导出 ------------------------------ */

export const BOARD_FORMAT = 'fmkj-board'

export function exportBoardJson(doc: BoardDoc, files: Record<string, BoardFile>, name: string) {
  return JSON.stringify(
    {
      format: BOARD_FORMAT,
      version: 1,
      pack: 'smart-home',
      name,
      exportedAt: new Date().toISOString(),
      scene: { elements: encodeDoc(doc), files },
    },
    null,
    1,
  )
}

/** 读取画板 JSON、旧版点位图场景或 .excalidraw 文件 */
export function parseBoardJson(text: string): { doc: BoardDoc; files: Record<string, BoardFile> } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  const d = data as {
    format?: string
    scene?: { elements?: unknown; files?: unknown }
    elements?: unknown
    files?: unknown
  }
  const scene = d?.format === BOARD_FORMAT ? d.scene : d
  if (!scene || !Array.isArray(scene.elements))
    throw new Error('没有找到图纸内容（需要画板 JSON 或点位图场景）')
  const files: Record<string, BoardFile> = {}
  if (scene.files && typeof scene.files === 'object') {
    for (const [id, f] of Object.entries(
      scene.files as Record<string, Partial<BoardFile> | null>,
    )) {
      if (f && typeof f.dataURL === 'string')
        files[id] = {
          id,
          dataURL: f.dataURL,
          mimeType: typeof f.mimeType === 'string' ? f.mimeType : 'image/png',
        }
    }
  }
  return { doc: decodeScene({ elements: scene.elements as SceneEl[] }), files }
}
