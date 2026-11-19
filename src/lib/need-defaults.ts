/**
 * 需求小助手：默认值规则（issue #194，纯函数，可单测）。
 *
 * 用户口径：
 * - 中枢网关**必需**（不可取消）；面积 >150㎡ 或别墅 → 提示建议 2 个。
 * - 卧室/书房开关默认 3 个；客厅默认 2–3 个（可改）；餐厅/玄关 2 个；卫生间 1–2 个。
 * - 有窗房间默认窗帘电机 1 个。
 * - 安防传感器**按用户选择**（不强制勾选）；厨房/卫生间/阳台在用户选了水浸/烟雾时给出建议。
 * - 面积/房型/数量都是**可改的估算默认**，不是施工标准（UI 必须能改）。
 */
import type { NeedCamera, NeedHouseType, NeedLightingDesign, NeedTier } from './need-flow'

export type RoomKey =
  | 'entrance'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bedroom'
  | 'kids'
  | 'study'
  | 'bathroom'
  | 'balcony'
  | 'corridor'

export type NeedHouse = {
  type: NeedHouseType
  /** 几室几厅：默认 3 室 2 厅 */
  bedrooms: number
  livingRooms: number
  /** 建筑面积（㎡）；null = 未填，按户型给估算 */
  area: number | null
  stage: 'rough' | 'mep' | 'moved'
}

export type DefaultInput = {
  house: NeedHouse
  lighting: NeedLightingDesign
  tier: NeedTier
  /** 用户勾选的传感器（按用户选择） */
  sensors: string[]
  camera: NeedCamera
  /** 用户勾选「窗帘」场景时才有默认窗帘 */
  wantsCurtain: boolean
}

export type DeviceDefault = {
  deviceType: string
  qty: number
  /** 该数量来自哪条规则（UI 展示「为什么默认这么多」） */
  reason: string
  /** 用户能否改（网关为 false） */
  editable: boolean
}

export type DefaultsResult = {
  rooms: { key: RoomKey; label: string; switchCount: number; hasWindow: boolean }[]
  devices: DeviceDefault[]
  hints: string[]
}

const ROOM_LABEL: Record<RoomKey, string> = {
  entrance: '玄关',
  living: '客厅',
  dining: '餐厅',
  kitchen: '厨房',
  bedroom: '卧室',
  kids: '儿童房',
  study: '书房',
  bathroom: '卫生间',
  balcony: '阳台',
  corridor: '走廊',
}

/** 面积缺省：按户型给一个可改估算（不是施工标准） */
export function estimateArea(house: Pick<NeedHouse, 'type' | 'bedrooms'>): number {
  const base = 35 + house.bedrooms * 22 // 3 室 ≈ 101㎡
  if (house.type === 'duplex') return Math.round(base * 1.6)
  if (house.type === 'villa') return Math.round(base * 2.4)
  return base
}

/** 每类房间默认开关数（用户口径） */
export function defaultSwitchCount(room: RoomKey, tier: NeedTier): number {
  switch (room) {
    case 'bedroom':
    case 'kids':
    case 'study':
      return 3 // 主灯 + 双控位 + 场景位
    case 'living':
      return tier === 'full' ? 3 : 2 // 2–3 可改
    case 'dining':
    case 'entrance':
      return 2
    case 'bathroom':
      return tier === 'full' ? 2 : 1
    case 'kitchen':
    case 'balcony':
    case 'corridor':
      return 1
    default:
      return 1
  }
}

/** 房间清单：按几室几厅推算（可改） */
export function buildRooms(house: NeedHouse): RoomKey[] {
  const rooms: RoomKey[] = ['entrance', 'living', 'dining', 'kitchen', 'bathroom']
  for (let i = 0; i < Math.max(1, house.bedrooms - 1); i++) rooms.push('bedroom')
  rooms.push('kids', 'study', 'balcony')
  if (house.type !== 'flat') rooms.push('corridor')
  return rooms
}

const hasWindow = (room: RoomKey) => !['corridor', 'entrance'].includes(room)

export function computeDefaults(input: DefaultInput): DefaultsResult {
  const { house, tier, sensors, camera, wantsCurtain } = input
  const roomKeys = buildRooms(house)
  const rooms = roomKeys.map((key) => ({
    key,
    label: ROOM_LABEL[key],
    switchCount: defaultSwitchCount(key, tier),
    hasWindow: hasWindow(key),
  }))

  const switchTotal = rooms.reduce((s, r) => s + r.switchCount, 0)
  const windowRooms = rooms.filter((r) => r.hasWindow).length

  const devices: DeviceDefault[] = [
    {
      deviceType: 'gateway',
      qty: house.type === 'villa' || (house.area ?? estimateArea(house)) > 150 ? 2 : 1,
      reason: '中枢网关是方案基石（不可取消）',
      editable: false,
    },
    {
      deviceType: 'switch-2',
      qty: switchTotal,
      reason: `按房间默认：卧室/书房 3、客厅 ${tier === 'full' ? 3 : 2}、餐厅玄关 2（可改）`,
      editable: true,
    },
  ]

  if (wantsCurtain) {
    devices.push({
      deviceType: 'curtain-track',
      qty: windowRooms,
      reason: `有窗房间 ${windowRooms} 间，每间默认 1 套（可改）`,
      editable: true,
    })
  }

  if (camera !== 'none') {
    const area = house.area ?? estimateArea(house)
    const qty = camera === 'both' ? 2 + Math.ceil(area / 120) : 1
    devices.push({
      deviceType: 'camera',
      qty,
      reason: '按面积与监控范围估算（可改）',
      editable: true,
    })
  }

  // 传感器：按用户选择，不强制勾选；只给数量建议
  for (const s of sensors) {
    const map: Record<string, string> = {
      water: 'water-sensor',
      smoke: 'smoke-sensor',
      gas: 'gas-sensor',
      contact: 'contact-sensor',
      presence: 'motion-sensor',
    }
    const deviceType = map[s]
    if (!deviceType) continue
    const qty =
      s === 'water'
        ? rooms.filter((r) => ['kitchen', 'bathroom', 'balcony'].includes(r.key)).length
        : s === 'smoke'
          ? rooms.filter((r) => ['kitchen', 'bedroom', 'living'].includes(r.key)).length
          : s === 'gas'
            ? 1
            : Math.max(1, Math.ceil(rooms.length / 2))
    devices.push({
      deviceType,
      qty,
      reason: `你勾选了「${s}」，按房间建议数量（可改）`,
      editable: true,
    })
  }

  const hints: string[] = []
  // 网关是必需项且数量不可编辑：提示里不能说「可改」（首轮验收 F-3）
  if (devices[0]!.qty > 1)
    hints.push('面积较大或为别墅：建议 2 个网关，信号更稳（网关必需，数量按面积估算）')
  if (house.stage === 'moved') hints.push('已入住：优先无线方案，避免大规模开槽')
  if (house.area === null) hints.push(`面积未填，按户型估算约 ${estimateArea(house)} ㎡（可改）`)

  return { rooms, devices, hints }
}
