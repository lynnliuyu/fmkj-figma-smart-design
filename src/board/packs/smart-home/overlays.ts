/**
 * 智能家居点位的辅助图层（只影响显示，不写进图纸）：
 * - 展示效果：按设备类型绘制无线波纹、人体扇形、传感器提示与灯光光晕，不表示实际覆盖或照度。
 * - 信号覆盖圈：吸顶 AP / 面板 AP / 路由 / 网关按理想无遮挡半径画圈，一眼看出大平层、别墅的信号盲区；
 * - 开关控灯关联：按房间自动推断，同一房间里的每盏灯连到最近的开关；有灯却没有开关（也没有人体传感器）的灯具标红提示。
 * 半径按图纸标定换算成真实米数；图纸未标定时按标准图纸（户型宽约 14 m）估算，并用虚线和「估算」标注。
 */
import type {
  OverlayCircle,
  OverlayLink,
  OverlayMark,
  OverlayShapes,
  PackOverlay,
} from '@/board/core/pack'
import { pointInPolygon, polyArea } from '@/board/core/geometry'
import { areaPoly, areasOf, sheetAt, symbolsOf } from '@/board/core/ops'
import type { AreaObj, BoardDoc, SymbolObj } from '@/board/core/types'
import { categoryOfType } from '@/lib/device-types'
import { buildPointDisplayEffects } from '@/lib/point-display-effects'
import { SHEET } from '@/lib/sheet-spec'

/** 各类无线主控设备的理想覆盖半径（米，无遮挡；每穿一堵承重墙信号明显衰减，需按现场复核） */
export const COVERAGE_SPECS: Record<string, { meters: number; color: string; label: string }> = {
  'ceiling-ap': { meters: 8, color: '#0891b2', label: '吸顶 AP' },
  'ap-node': { meters: 6, color: '#0891b2', label: '面板 AP' },
  'ac-router': { meters: 6, color: '#0e7490', label: '路由' },
  gateway: { meters: 10, color: '#7c3aed', label: '网关' },
}

/** 未标定图纸的估算比例：标准图纸 1200 单位宽、四周留白 3.5%，按户型宽约 14 m 计 */
export const ESTIMATED_MM_PER_UNIT = 14_000 / (SHEET.width * (1 - 2 * SHEET.padding))

const deviceTypeOf = (o: SymbolObj) =>
  typeof o.data.deviceType === 'string' ? o.data.deviceType : ''
const categoryOf = (o: SymbolObj) => categoryOfType(deviceTypeOf(o))?.slug ?? null
const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2

function displayEffects(doc: BoardDoc): OverlayShapes {
  return {
    effects: buildPointDisplayEffects(
      symbolsOf(doc).map((o) => ({
        id: o.id,
        deviceType: deviceTypeOf(o),
        x: o.x,
        y: o.y,
        angle: o.angle,
      })),
      24,
    ),
  }
}

function coverage(doc: BoardDoc): OverlayShapes {
  const circles: OverlayCircle[] = []
  for (const o of symbolsOf(doc)) {
    const spec = COVERAGE_SPECS[deviceTypeOf(o)]
    if (!spec) continue
    const mm = sheetAt(doc, o.x, o.y)?.mmPerUnit ?? null
    const r = (spec.meters * 1000) / (mm ?? ESTIMATED_MM_PER_UNIT)
    circles.push({
      id: o.id,
      x: o.x,
      y: o.y,
      r,
      color: spec.color,
      label: `${o.code ? `${o.code} ` : ''}${spec.label} ≈${spec.meters}m${mm ? '' : '（估算）'}`,
      estimated: !mm,
    })
  }
  return { circles }
}

/** 每个符号所在的区域：多个区域重叠时取面积最小的那个（更具体的房间） */
function areaIndex(doc: BoardDoc) {
  const areas = areasOf(doc)
    .map((a) => ({ a, poly: areaPoly(a), size: Math.abs(polyArea(areaPoly(a))) }))
    .sort((x, y) => x.size - y.size)
  return (o: SymbolObj): AreaObj | null =>
    areas.find((x) => pointInPolygon({ x: o.x, y: o.y }, x.poly))?.a ?? null
}

/** 能自动控制灯光的设备：房间里有它们时，没有墙壁开关也不算漏配 */
const LIGHT_CONTROLLERS = new Set(['motion-sensor', 'touch-panel'])
/** 房间里找不到开关时，允许连到门外这么近的开关（卫生间、衣帽间的开关常装在门外走廊） */
const NEARBY_SWITCH_METERS = 3.5

/**
 * 推断开关控灯关系：
 * 1. 同一房间里的每盏灯连到最近的开关；
 * 2. 房间里有人体传感器或中控屏时视为已有控制；
 * 3. 否则连到同一张图纸上 3.5 m 内最近的开关（门外开关）；仍找不到的灯具记为「没有开关控制」。
 * 完全没画房间区域时按图纸分组，只连 6 m 内的开关。
 */
export function inferLightLinks(doc: BoardDoc) {
  const syms = symbolsOf(doc)
  const areaOf = areaIndex(doc)
  const hasAreas = areasOf(doc).length > 0
  const mmAt = (o: SymbolObj) => sheetAt(doc, o.x, o.y)?.mmPerUnit ?? ESTIMATED_MM_PER_UNIT
  const switches = syms.filter((o) => categoryOf(o) === 'switch')
  const groups = new Map<
    string,
    { switches: SymbolObj[]; lights: SymbolObj[]; controlled: boolean; reach2: number | null }
  >()
  for (const o of syms) {
    const cat = categoryOf(o)
    const controller = LIGHT_CONTROLLERS.has(deviceTypeOf(o))
    if (cat !== 'switch' && cat !== 'lighting' && !controller) continue
    let key: string | null = null
    let reach2: number | null = null
    if (hasAreas) key = areaOf(o)?.id ?? null
    else {
      const sheet = sheetAt(doc, o.x, o.y)
      if (sheet) {
        key = sheet.id
        reach2 = (6000 / (sheet.mmPerUnit ?? ESTIMATED_MM_PER_UNIT)) ** 2
      }
    }
    if (!key) key = `__loose:${sheetAt(doc, o.x, o.y)?.id ?? 'none'}`
    const g = groups.get(key) ?? { switches: [], lights: [], controlled: false, reach2 }
    if (cat === 'switch') g.switches.push(o)
    else if (cat === 'lighting') g.lights.push(o)
    else g.controlled = true
    groups.set(key, g)
  }
  const nearest = (light: SymbolObj, pool: SymbolObj[], max2: number | null) => {
    let best: SymbolObj | null = null
    let bestD = Infinity
    for (const s of pool) {
      const d = dist2(s, light)
      if (d < bestD && (max2 === null || d <= max2)) {
        best = s
        bestD = d
      }
    }
    return best
  }
  const links: OverlayLink[] = []
  const orphans: SymbolObj[] = []
  for (const [key, g] of groups) {
    const loose = key.startsWith('__loose:')
    for (const light of g.lights) {
      const inRoom = loose ? null : nearest(light, g.switches, g.reach2)
      if (inRoom) {
        links.push({
          id: `${inRoom.id}->${light.id}`,
          from: { x: inRoom.x, y: inRoom.y },
          to: { x: light.x, y: light.y },
          color: '#2563eb',
        })
        continue
      }
      if (g.controlled && !loose) continue
      const sheetId = sheetAt(doc, light.x, light.y)?.id
      const reach = (NEARBY_SWITCH_METERS * 1000) / mmAt(light)
      const outside = nearest(
        light,
        switches.filter((s) => sheetAt(doc, s.x, s.y)?.id === sheetId),
        reach * reach,
      )
      if (outside)
        links.push({
          id: `${outside.id}->${light.id}`,
          from: { x: outside.x, y: outside.y },
          to: { x: light.x, y: light.y },
          color: '#60a5fa',
        })
      else orphans.push(light)
    }
  }
  return { links, orphans }
}

/** 没有任何开关 / 自动控制的灯具，附所在房间（检查规则与辅助图层共用同一套推断） */
export function unswitchedLights(doc: BoardDoc) {
  const areaOf = areaIndex(doc)
  return inferLightLinks(doc).orphans.map((light) => ({ light, area: areaOf(light) }))
}

function lightLinks(doc: BoardDoc): OverlayShapes {
  const { links, orphans } = inferLightLinks(doc)
  const marks: OverlayMark[] = orphans.map((o) => ({
    id: o.id,
    x: o.x,
    y: o.y,
    color: '#dc2626',
    title: `${o.code || '灯具'} 所在房间没有开关或人体传感器`,
  }))
  return { links, marks }
}

export const SMART_HOME_OVERLAYS: PackOverlay[] = [
  {
    id: 'display-effects',
    name: '展示效果',
    hint: '无线波纹、人体扇形、传感器提示与灯光光晕',
    build: displayEffects,
  },
  {
    id: 'coverage',
    name: '信号覆盖圈',
    hint: '吸顶 AP 8m · 面板 AP / 路由 6m · 网关 10m',
    build: coverage,
  },
  {
    id: 'light-links',
    name: '开关控灯关联',
    hint: '按房间推断，无开关的灯具标红',
    build: lightLinks,
  },
]
