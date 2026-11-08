/**
 * 点位图场景模型（编辑器、导入、报价、方案共用）。
 *
 * 场景是 Excalidraw 的 elements + files，元素按 customData 区分：
 * - 图纸   image  { kind: 'sheet', sheetId, name, mediaId }（锁定，最底层，标准尺寸见 sheet-spec）
 * - 图纸名 text   { kind: 'sheet-title', sheetId }
 * - 区域   rectangle { kind: 'area', name, areaType, polygon? }（实线框；polygon 是相对元素 x / y 的顶点
 *          [[dx, dy], …]，有它时区域是这个多边形，元素的 x / y / width / height 是外接框；点位按中心点落在哪个区域归类）
 * - 区域名 text   { kind: 'area-label' }
 * - 点位   image  { deviceType, productId?, pointCode }（只有它参与统计和报价）
 * - 代号   text   { kind: 'label', pointCode }
 *
 * 只依赖同目录的纯模块，Node 脚本也能直接使用。
 */
import { areaTypeLabel, inferAreaType, isAreaType, type AreaType } from './area-types'
import { BUILTIN_DEMO_SHEETS } from './builtin-demo-sheets'
import { categoryOfType, deviceTypeOf, isDeviceType } from './device-types'
import {
  BLANK_SHEET_FILE_ID,
  BLANK_SHEET_URL,
  isMarkerFileId,
  markerFileId,
  markerUrl,
} from './point-markers'
import { MARKER, SHEET, sheetOrigin } from './sheet-spec'

export type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  locked?: boolean
  groupIds?: readonly string[]
  fileId?: string | null
  text?: string
  customData?: Record<string, unknown>
  [key: string]: unknown
}
export type SceneFile = { id: string; dataURL: string; mimeType: string; created?: number }
export type StoredScene = {
  elements: SceneEl[]
  appState?: Record<string, unknown>
  files: Record<string, SceneFile>
}

export type SheetInfo = {
  id: string
  elementId: string
  index: number
  name: string
  x: number
  y: number
  width: number
  height: number
  fileId: string | null
  url: string | null
  missing: boolean
}
export type AreaInfo = {
  id: string
  name: string
  areaType: AreaType
  sheetId: string | null
  /** 外接框 */
  x: number
  y: number
  width: number
  height: number
  /** 多边形轮廓（场景坐标）；null 时区域就是外接框这个矩形 */
  poly: [number, number][] | null
}
export type PointInfo = {
  id: string
  deviceType: string
  productId: string | null
  code: string
  /** 场景坐标（点位中心） */
  cx: number
  cy: number
  sheetId: string | null
  /** 相对所在图纸的比例坐标（0–1） */
  rx: number | null
  ry: number | null
  /** 已有图标旋转，供展示扇形与灯带在各出图入口保持同向。 */
  angle?: number
  areaId: string | null
}

const live = (els: readonly SceneEl[]) => els.filter((e) => e && !e.isDeleted)
const kindOf = (el: SceneEl) =>
  typeof el.customData?.kind === 'string' ? (el.customData.kind as string) : null
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export const isPointElement = (el: SceneEl) =>
  el.type === 'image' &&
  (isDeviceType(el.customData?.deviceType) ||
    (typeof el.customData?.productId === 'string' && !!el.customData.productId))

export const randomId = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)

/** 图纸：带 kind=sheet 的图片；旧版本上传的户型图（锁定的大图、没有 customData）也算。 */
export function sceneSheets(
  elements: readonly SceneEl[],
  files: Record<string, SceneFile> = {},
): SheetInfo[] {
  const sheets = live(elements).filter(
    (e) =>
      e.type === 'image' &&
      (kindOf(e) === 'sheet' || (!isPointElement(e) && !kindOf(e) && e.width >= 400)),
  )
  return sheets
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((e, index) => {
      const fileId = typeof e.fileId === 'string' ? e.fileId : null
      const file = fileId ? files[fileId] : undefined
      return {
        id: str(e.customData?.sheetId) || e.id,
        elementId: e.id,
        index,
        name: str(e.customData?.name) || `图纸 ${index + 1}`,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        fileId,
        url: file?.dataURL ?? null,
        missing: !file,
      }
    })
}

const contains = (
  r: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
const rectDistSq = (
  r: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
) => {
  const dx = x < r.x ? r.x - x : x > r.x + r.width ? x - (r.x + r.width) : 0
  const dy = y < r.y ? r.y - y : y > r.y + r.height ? y - (r.y + r.height) : 0
  return dx * dx + dy * dy
}

/* ---------------- 区域轮廓（多边形） ---------------- */

/** 读取区域元素里的多边形顶点（customData.polygon，相对元素 x / y），换成场景坐标；没有或无效时返回 null */
export function areaPolygon(el: {
  x: number
  y: number
  customData?: Record<string, unknown>
}): [number, number][] | null {
  const raw = el.customData?.polygon
  if (!Array.isArray(raw) || raw.length < 3) return null
  const pts: [number, number][] = []
  for (const q of raw) {
    if (
      !Array.isArray(q) ||
      typeof q[0] !== 'number' ||
      typeof q[1] !== 'number' ||
      !Number.isFinite(q[0]) ||
      !Number.isFinite(q[1])
    )
      return null
    pts.push([el.x + q[0], el.y + q[1]])
  }
  return pts
}

/** 区域轮廓顶点：多边形取顶点，矩形取四个角 */
export const areaOutline = (
  a: Pick<AreaInfo, 'x' | 'y' | 'width' | 'height' | 'poly'>,
): [number, number][] =>
  a.poly ?? [
    [a.x, a.y],
    [a.x + a.width, a.y],
    [a.x + a.width, a.y + a.height],
    [a.x, a.y + a.height],
  ]

function inPolygon(poly: [number, number][], x: number, y: number) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function segDistSq(x: number, y: number, [ax, ay]: [number, number], [bx, by]: [number, number]) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len)) : 0
  const px = ax + t * dx - x
  const py = ay + t * dy - y
  return px * px + py * py
}

/** 点是否在区域内（多边形区域按轮廓判断） */
export const areaContains = (a: AreaInfo, x: number, y: number) =>
  contains(a, x, y) && (!a.poly || inPolygon(a.poly, x, y))

/** 点在区域外时到区域边界的距离平方（在区域内为 0） */
function areaDistSq(a: AreaInfo, x: number, y: number) {
  if (!a.poly) return rectDistSq(a, x, y)
  if (inPolygon(a.poly, x, y)) return 0
  let d = Infinity
  for (let i = 0; i < a.poly.length; i++)
    d = Math.min(d, segDistSq(x, y, a.poly[i], a.poly[(i + 1) % a.poly.length]))
  return d
}

/** 区域面积（多边形按鞋带公式） */
export function areaSize(a: Pick<AreaInfo, 'width' | 'height' | 'poly'>) {
  if (!a.poly) return a.width * a.height
  let s = 0
  for (let i = 0; i < a.poly.length; i++) {
    const [ax, ay] = a.poly[i]
    const [bx, by] = a.poly[(i + 1) % a.poly.length]
    s += ax * by - bx * ay
  }
  return Math.abs(s) / 2
}

/** 区域名的位置：轮廓最上方（同高取最左）的顶点，矩形就是左上角 */
export function areaLabelAnchor(
  a: Pick<AreaInfo, 'x' | 'y' | 'width' | 'height' | 'poly'>,
): [number, number] {
  return areaOutline(a).reduce((best, q) =>
    q[1] < best[1] - 0.5 || (Math.abs(q[1] - best[1]) <= 0.5 && q[0] < best[0]) ? q : best,
  )
}

/** 打印图、方案图用的区域：相对所在图纸的比例坐标（0–1），多边形区域带轮廓 */
export type PlanAreaShape = {
  id: string
  name: string
  x0: number
  y0: number
  x1: number
  y1: number
  poly?: [number, number][]
}
export function planAreaOf(
  a: AreaInfo,
  sheet: { x: number; y: number; width: number; height: number },
): PlanAreaShape {
  const fx = (x: number) => (x - sheet.x) / sheet.width
  const fy = (y: number) => (y - sheet.y) / sheet.height
  return {
    id: a.id,
    name: a.name,
    x0: fx(a.x),
    y0: fy(a.y),
    x1: fx(a.x + a.width),
    y1: fy(a.y + a.height),
    ...(a.poly ? { poly: a.poly.map(([x, y]) => [fx(x), fy(y)] as [number, number]) } : {}),
  }
}

export function sceneAreas(elements: readonly SceneEl[], sheets: SheetInfo[]): AreaInfo[] {
  return live(elements)
    .filter((e) => kindOf(e) === 'area')
    .map((e) => {
      const name = str(e.customData?.name) || '未命名区域'
      const t = e.customData?.areaType
      const cx = e.x + e.width / 2
      const cy = e.y + e.height / 2
      return {
        id: e.id,
        name,
        areaType: isAreaType(t) ? t : inferAreaType(name),
        sheetId: sheets.find((s) => contains(s, cx, cy))?.id ?? null,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        poly: areaPolygon(e),
      }
    })
}

export function scenePoints(
  elements: readonly SceneEl[],
  sheets: SheetInfo[],
  areas: AreaInfo[],
): PointInfo[] {
  return live(elements)
    .filter(isPointElement)
    .map((e) => {
      const cx = e.x + e.width / 2
      const cy = e.y + e.height / 2
      const sheet = sheets.find((s) => contains(s, cx, cy)) ?? null
      // 落在多个区域里时取面积最小的（例如套间里的卫生间）
      let area =
        areas.filter((a) => areaContains(a, cx, cy)).sort((a, b) => areaSize(a) - areaSize(b))[0] ??
        null
      // 贴墙放置的点位（如开关、插座、路由）中心点可能偏移区域边框几个像素，自动归入同图纸内距离 16px 以内的最近区域
      if (!area) {
        const candidates = areas
          .filter((a) => (!sheet || a.sheetId === sheet.id) && areaDistSq(a, cx, cy) <= 16 * 16)
          .sort(
            (a, b) => areaDistSq(a, cx, cy) - areaDistSq(b, cx, cy) || areaSize(a) - areaSize(b),
          )
        area = candidates[0] ?? null
      }
      const productId =
        typeof e.customData?.productId === 'string' && e.customData.productId
          ? (e.customData.productId as string)
          : null
      return {
        id: e.id,
        deviceType: isDeviceType(e.customData?.deviceType)
          ? (e.customData!.deviceType as string)
          : 'other',
        productId,
        code: str(e.customData?.pointCode),
        angle: typeof e.angle === 'number' && Number.isFinite(e.angle) ? e.angle : 0,
        cx,
        cy,
        sheetId: sheet?.id ?? null,
        rx: sheet ? (cx - sheet.x) / sheet.width : null,
        ry: sheet ? (cy - sheet.y) / sheet.height : null,
        areaId: area?.id ?? null,
      }
    })
}

/** 一次算出图纸、区域、点位 */
export function analyzeScene(scene: Partial<StoredScene> | null | undefined) {
  const elements = ((scene?.elements ?? []) as SceneEl[]).filter((e) => e && typeof e === 'object')
  const files = Object.fromEntries(
    Object.entries((scene?.files ?? {}) as Record<string, SceneFile | null>).filter(
      (e): e is [string, SceneFile] => !!e[1],
    ),
  )
  const sheets = sceneSheets(elements, files)
  const areas = sceneAreas(elements, sheets)
  const points = scenePoints(elements, sheets, areas)
  return { sheets, areas, points }
}

/** 下一个点位代号：同类别现有最大编号 + 1（删掉中间的点位也不会重号）。 */
export function nextPointCode(deviceType: string, usedCodes: Iterable<string>) {
  const prefix = categoryOfType(deviceType)?.code ?? 'Q'
  let max = 0
  for (const c of usedCodes) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(c)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

const textWidth = (text: string, size: number) =>
  [...text].reduce((w, ch) => w + (/[\u0000-\u00ff]/.test(ch) ? size * 0.62 : size), 0)

/** 一个点位 = 标记图片 + 代号文字（同一组，一起拖动）。cx/cy 是标记中心。 */
export function buildPointElements(opts: {
  deviceType: string
  cx: number
  cy: number
  code: string
  productId?: string | null
  size?: number
}): SceneEl[] {
  const size = opts.size ?? MARKER.size
  const type = isDeviceType(opts.deviceType) ? opts.deviceType : 'other'
  const color = categoryOfType(type)?.color ?? '#525252'
  const group = randomId('pt-')
  const w = Math.max(size, textWidth(opts.code, MARKER.labelSize) + 2)
  return [
    {
      id: randomId(),
      type: 'image',
      x: opts.cx - size / 2,
      y: opts.cy - size / 2,
      width: size,
      height: size,
      groupIds: [group],
      fileId: markerFileId(type),
      status: 'saved',
      customData: {
        deviceType: type,
        pointCode: opts.code,
        ...(opts.productId ? { productId: opts.productId } : {}),
      },
    },
    {
      id: randomId(),
      type: 'text',
      x: opts.cx - w / 2,
      y: opts.cy + size / 2 + MARKER.labelGap,
      width: w,
      height: MARKER.labelSize * 1.25,
      groupIds: [group],
      strokeColor: color,
      text: opts.code,
      fontSize: MARKER.labelSize,
      fontFamily: 2,
      textAlign: 'center',
      lineHeight: 1.25,
      customData: { kind: 'label', pointCode: opts.code },
    },
  ]
}

/** 标准图纸：图片（锁定、半透明）+ 上方的图纸名。 */
export function buildSheetElements(opts: {
  index: number
  name: string
  fileId: string
  mediaId?: string | null
  sheetId?: string
}): SceneEl[] {
  const { x, y } = sheetOrigin(opts.index)
  const sheetId = opts.sheetId ?? randomId('sh-')
  return [
    {
      id: randomId(),
      type: 'image',
      x,
      y,
      width: SHEET.width,
      height: SHEET.height,
      locked: true,
      opacity: SHEET.opacity,
      fileId: opts.fileId,
      status: 'saved',
      customData: {
        kind: 'sheet',
        sheetId,
        name: opts.name,
        ...(opts.mediaId ? { mediaId: opts.mediaId } : {}),
      },
    },
    {
      id: randomId(),
      type: 'text',
      x,
      y: y - SHEET.titleOffset,
      width: textWidth(opts.name, SHEET.titleSize),
      height: SHEET.titleSize * 1.25,
      locked: true,
      text: opts.name,
      fontSize: SHEET.titleSize,
      fontFamily: 2,
      lineHeight: 1.25,
      strokeColor: '#404040',
      customData: { kind: 'sheet-title', sheetId },
    },
  ]
}

export const AREA_STYLE = { stroke: '#64748b', label: '#475569', labelSize: 11 } as const

/** 区域：实线框 + 左上角的区域名（矩形；多边形区域由点位图编辑器生成）。 */
export function buildAreaElements(opts: {
  name: string
  areaType?: string
  x: number
  y: number
  width: number
  height: number
  polygon?: [number, number][]
}): SceneEl[] {
  const areaType = isAreaType(opts.areaType) ? opts.areaType : inferAreaType(opts.name)
  const group = randomId('ar-')
  return [
    {
      id: randomId(),
      type: 'rectangle',
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      groupIds: [group],
      strokeColor: AREA_STYLE.stroke,
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 70,
      customData: {
        kind: 'area',
        name: opts.name,
        areaType,
        ...(opts.polygon && opts.polygon.length >= 3 ? { polygon: opts.polygon } : {}),
      },
    },
    {
      id: randomId(),
      type: 'text',
      x: opts.x + 4,
      y: opts.y + 3,
      width: textWidth(opts.name, AREA_STYLE.labelSize),
      height: AREA_STYLE.labelSize * 1.25,
      groupIds: [group],
      strokeColor: AREA_STYLE.label,
      text: opts.name,
      fontSize: AREA_STYLE.labelSize,
      fontFamily: 2,
      lineHeight: 1.25,
      customData: { kind: 'area-label' },
    },
  ]
}

export const markerFile = (type: string): SceneFile => ({
  id: markerFileId(type),
  dataURL: markerUrl(type),
  mimeType: 'image/svg+xml',
})

const DEMO_MEDIA_URL_MAP: Record<string, string> = {
  '/api/media/file/gy-1f-light-original.png': '/demo-plans/gy-1f-light.png',
  '/api/media/file/gy-2f-light-original.png': '/demo-plans/gy-2f-light.png',
  '/api/media/file/gy-3f-light-original.png': '/demo-plans/gy-3f-light.png',
}

function buildUpgradedDemoScene(): { elements: SceneEl[]; files: Record<string, SceneFile> } {
  const elements: SceneEl[] = []
  const files: Record<string, SceneFile> = {}
  BUILTIN_DEMO_SHEETS.forEach((sheet, idx) => {
    const fileId = `sheet-file-${sheet.id}`
    files[fileId] = { id: fileId, dataURL: sheet.url, mimeType: 'image/png' }
    elements.push(
      ...buildSheetElements({ index: idx, name: sheet.name, fileId, sheetId: sheet.id }),
    )
    const origin = sheetOrigin(idx)
    for (const a of sheet.areas) {
      const ax = origin.x + Math.round(a.x0 * SHEET.width)
      const ay = origin.y + Math.round(a.y0 * SHEET.height)
      const aw = Math.max(20, Math.round((a.x1 - a.x0) * SHEET.width))
      const ah = Math.max(20, Math.round((a.y1 - a.y0) * SHEET.height))
      const polygon = a.poly
        ? a.poly.map(
            ([px, py]) =>
              [Math.round((px - a.x0) * SHEET.width), Math.round((py - a.y0) * SHEET.height)] as [
                number,
                number,
              ],
          )
        : undefined
      elements.push(
        ...buildAreaElements({ name: a.name, x: ax, y: ay, width: aw, height: ah, polygon }),
      )
    }
    for (const p of sheet.points) {
      const mId = markerFileId(p.type)
      files[mId] = markerFile(p.type)
      elements.push(
        ...buildPointElements({
          deviceType: p.type,
          cx: origin.x + Math.round(p.rx * SHEET.width),
          cy: origin.y + Math.round(p.ry * SHEET.height),
          code: p.code,
          productId: null,
        }),
      )
    }
  })
  return { elements, files }
}

/**
 * 打开点位图时整理场景：
 * - 点位统一换成当前版本的标记图标（修复旧版本保存时丢失的符号图片）；
 * - 旧版本上传的户型图补上图纸信息；
 * - 自部署旧版内置示例场景（sh-demo-1f + blank-sheet.svg）自动升级为真实三层别墅户型图与 137 个点位；
 * - 返回无法自动修复的问题（例如户型图图片丢失）。
 */
export function normalizeScene(
  scene: Partial<StoredScene> | null | undefined,
): StoredScene & { warnings: string[]; repaired: number } {
  // 忽略被清除（null）或格式不对的文件
  let files: Record<string, SceneFile> = Object.fromEntries(
    Object.entries((scene?.files ?? {}) as Record<string, SceneFile | null>).filter(
      (e): e is [string, SceneFile] => !!e[1] && typeof e[1].dataURL === 'string',
    ),
  )
  let elements = ((scene?.elements ?? []) as SceneEl[]).filter(
    (e) => e && typeof e === 'object' && !e.isDeleted,
  )
  const warnings: string[] = []
  let sheetNo = 0
  let repaired = 0

  // 检测自部署旧版空白示例母版（sh-demo-1f），自动替换为真实三层户型图与 137 个点位
  if (
    files['sheet-file-sh-demo-1f'] ||
    elements.some((e) => e.customData?.sheetId === 'sh-demo-1f')
  ) {
    const upgraded = buildUpgradedDemoScene()
    files = upgraded.files
    elements = upgraded.elements
    repaired++
  }

  // 将示例项目里的云端媒体路径映射为内置静态户型图路径，确保自部署环境无须额外媒体文件即可显示
  for (const [k, f] of Object.entries(files)) {
    const mapped = DEMO_MEDIA_URL_MAP[f.dataURL]
    if (mapped) {
      files[k] = { ...f, dataURL: mapped }
    }
  }

  const out = elements.map((el) => {
    if (isPointElement(el)) {
      const type = isDeviceType(el.customData?.deviceType)
        ? (el.customData!.deviceType as string)
        : 'other'
      const fileId = markerFileId(type)
      if (!files[fileId]) files[fileId] = markerFile(type)
      if (el.fileId === fileId) return el
      repaired++
      return { ...el, fileId, status: 'saved' }
    }
    if (el.type === 'image' && !kindOf(el) && el.width >= 400) {
      sheetNo++
      repaired++
      return {
        ...el,
        locked: true,
        customData: { ...el.customData, kind: 'sheet', sheetId: el.id, name: `图纸 ${sheetNo}` },
      }
    }
    return el
  })
  const missingSheets = sceneSheets(out, files).filter((s) => s.missing).length
  if (missingSheets) warnings.push(`有 ${missingSheets} 张户型图的图片已丢失，请删除后重新添加图纸`)
  // 只保留仍在使用的文件；旧的符号文件不再需要
  const used = new Set(out.map((e) => e.fileId).filter((v): v is string => typeof v === 'string'))
  for (const id of Object.keys(files)) if (!used.has(id)) delete files[id]
  return { elements: out, files, appState: scene?.appState, warnings, repaired }
}

const RESTORE_DEFAULTS: Record<string, unknown> = {
  angle: 0,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  isDeleted: false,
  locked: false,
  frameId: null,
  roundness: null,
  link: null,
  containerId: null,
  textAlign: 'left',
  verticalAlign: 'top',
  autoResize: true,
  crop: null,
}
/** 保存时去掉的字段：Excalidraw 读取时会自动补上（版本号、随机数、排序索引等）。 */
const DROP = new Set(['version', 'versionNonce', 'updated', 'index', 'seed', 'lastCommittedPoint'])

const round = (n: unknown) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n)

/**
 * 压缩场景用于保存：去掉已删除元素和默认值字段、坐标保留一位小数、只保留用到的文件。
 * 点位标记文件统一指向静态图标地址。结果仍是 Excalidraw 可直接读取的场景。
 */
export function compactScene(
  elements: readonly SceneEl[],
  files: Record<string, SceneFile>,
  appState?: Record<string, unknown>,
): StoredScene {
  const out: SceneEl[] = []
  for (const el of live(elements)) {
    const c: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(el)) {
      if (DROP.has(k) || v === undefined) continue
      if (k in RESTORE_DEFAULTS && JSON.stringify(RESTORE_DEFAULTS[k]) === JSON.stringify(v))
        continue
      if ((k === 'groupIds' || k === 'boundElements') && (!Array.isArray(v) || v.length === 0))
        continue
      if (k === 'boundElements' && v === null) continue
      if (k === 'scale' && Array.isArray(v) && v[0] === 1 && v[1] === 1) continue
      if (k === 'originalText' && v === el.text) continue
      if (k === 'customData' && v && typeof v === 'object') {
        // 点位的 productId 为空、类别 slug 可由设备类型推出，都不存
        const { categorySlug: _slug, ...rest } = v as Record<string, unknown>
        if (rest.productId == null) delete rest.productId
        c.customData = rest
        continue
      }
      c[k] = k === 'x' || k === 'y' || k === 'width' || k === 'height' ? round(v) : v
    }
    out.push(c as SceneEl)
  }
  const kept: Record<string, SceneFile> = {}
  for (const el of out) {
    const id = typeof el.fileId === 'string' ? el.fileId : null
    if (!id || kept[id]) continue
    const type =
      isPointElement(el) && isDeviceType(el.customData?.deviceType)
        ? (el.customData!.deviceType as string)
        : null
    if (isMarkerFileId(id) && type) kept[id] = markerFile(type)
    // 画布里是内嵌数据，存回静态地址（否则保存时会被当成插入的图片上传到媒体库）
    else if (id === BLANK_SHEET_FILE_ID && files[id])
      kept[id] = { id, dataURL: BLANK_SHEET_URL, mimeType: 'image/svg+xml' }
    else if (files[id]) kept[id] = { id, dataURL: files[id].dataURL, mimeType: files[id].mimeType }
  }
  return {
    elements: out,
    appState: { viewBackgroundColor: appState?.viewBackgroundColor ?? '#ffffff' },
    files: kept,
  }
}

/** 还内嵌着图片数据（data:）的文件：保存前需要先上传到媒体库，换成地址。 */
export const inlineFileIds = (scene: StoredScene) =>
  Object.values(scene.files)
    .filter((f) => f.dataURL.startsWith('data:'))
    .map((f) => f.id)

/** 点位代号用的显示名，例如「L12 筒灯」 */
export const pointTitle = (p: Pick<PointInfo, 'code' | 'deviceType'>) =>
  `${p.code} ${deviceTypeOf(p.deviceType)?.name ?? '设备'}`.trim()

export const areaTitle = (a: Pick<AreaInfo, 'name' | 'areaType'>) =>
  a.name === areaTypeLabel(a.areaType) ? a.name : `${a.name}（${areaTypeLabel(a.areaType)}）`
