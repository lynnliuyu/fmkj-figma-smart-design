/** 全屋网络、检测与摄像头的独立方案页，只依据设备类型和所在区域匹配。 */
import type { AreaInfo, SheetInfo } from '@/lib/point-scene'

import type { DeckItem, DeckModel, DeckPoint } from './model'

const NETWORK_TYPES = new Set(['ac-router', 'ap-node', 'ceiling-ap', 'network-panel'])
const AP_TYPES = new Set(['ap-node', 'ceiling-ap'])
const SENSOR_TYPES = new Set([
  'motion-sensor',
  'smoke-sensor',
  'water-sensor',
  'contact-sensor',
  'temp-sensor',
])

export type NetworkCameraRoom = {
  key: string
  sheetId: string | null
  areaId: string | null
  name: string
  floorName: string
  points: DeckPoint[]
  networkPoints: DeckPoint[]
  cameraPoints: DeckPoint[]
  sensorPoints: DeckPoint[]
}

export type NetworkCameraSheet = {
  sheet: SheetInfo
  floorName: string
  points: DeckPoint[]
  areas: AreaInfo[]
}

export type NetworkCameraModel = {
  networkPoints: DeckPoint[]
  cameraPoints: DeckPoint[]
  sensorPoints: DeckPoint[]
  apPoints: DeckPoint[]
  corePoints: DeckPoint[]
  rooms: NetworkCameraRoom[]
  sheets: NetworkCameraSheet[]
  items: DeckItem[]
  unmappedPoints: DeckPoint[]
}

export function buildNetworkCamera(m: DeckModel): NetworkCameraModel | null {
  const points = m.d.points
    .filter(
      (p) =>
        NETWORK_TYPES.has(p.deviceType) ||
        SENSOR_TYPES.has(p.deviceType) ||
        p.deviceType === 'camera',
    )
    .map(m.deckPoint)
  const networkPoints = points.filter((p) => NETWORK_TYPES.has(p.deviceType))
  const cameraPoints = points.filter((p) => p.deviceType === 'camera')
  const sensorPoints = points.filter((p) => SENSOR_TYPES.has(p.deviceType))
  if (!points.length) return null

  const sheetById = new Map(m.sheets.map((s) => [s.sheet.id, s]))
  const sheetOrder = new Map(m.sheets.map((s, i) => [s.sheet.id, i]))
  const areaById = new Map(m.d.areas.map((a) => [a.id, a]))
  const groups = new Map<string, NetworkCameraRoom>()
  for (const p of points) {
    // 以图纸与区域编号分组，同名房间跨楼层时仍是两个独立区域。
    const key = JSON.stringify([p.sheetId, p.areaId])
    let group = groups.get(key)
    if (!group) {
      const sheet = p.sheetId ? sheetById.get(p.sheetId) : undefined
      const candidateArea = p.areaId ? areaById.get(p.areaId) : undefined
      const area = candidateArea?.sheetId === p.sheetId ? candidateArea : undefined
      group = {
        key,
        sheetId: p.sheetId,
        areaId: p.areaId,
        name: area?.name || '未分区',
        floorName: sheet?.floorName || '未上图',
        points: [],
        networkPoints: [],
        cameraPoints: [],
        sensorPoints: [],
      }
      groups.set(key, group)
    }
    group.points.push(p)
    if (NETWORK_TYPES.has(p.deviceType)) group.networkPoints.push(p)
    else if (SENSOR_TYPES.has(p.deviceType)) group.sensorPoints.push(p)
    else group.cameraPoints.push(p)
  }

  const rooms = [...groups.values()].sort((a, b) => {
    const orderA = a.sheetId
      ? (sheetOrder.get(a.sheetId) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER
    const orderB = b.sheetId
      ? (sheetOrder.get(b.sheetId) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER
    return orderA - orderB
  })
  const refs = new Set(points.map((p) => p.ref).filter((ref): ref is string => Boolean(ref)))
  return {
    networkPoints,
    cameraPoints,
    sensorPoints,
    apPoints: networkPoints.filter((p) => AP_TYPES.has(p.deviceType)),
    corePoints: networkPoints.filter((p) => !AP_TYPES.has(p.deviceType)),
    rooms,
    sheets: m.sheets.flatMap((s) => {
      const related = points.filter((p) => p.sheetId === s.sheet.id)
      return related.length
        ? [{ sheet: s.sheet, floorName: s.floorName, points: related, areas: s.areas ?? [] }]
        : []
    }),
    // 型号只取能够确认关联到本页点位的报价条目，不把整份报价的网络/检测/摄像头都当成本页选型。
    items: m.items.filter(
      (item) =>
        refs.has(item.ref) &&
        (NETWORK_TYPES.has(item.deviceType) ||
          SENSOR_TYPES.has(item.deviceType) ||
          item.deviceType === 'camera'),
    ),
    unmappedPoints: points.filter((p) => !p.sheetId || !sheetById.has(p.sheetId)),
  }
}
