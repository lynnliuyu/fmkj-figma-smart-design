/**
 * 8 章提案的内容模型：把项目文档数据（点位、房间、产品、报价、合同）整理成每一章要呈现的内容。
 * 三种风格（栖序雅致 / 墨金臻选 / 原木自然）共用这一份内容，只换外观。
 * 所有文字都由真实项目数据推导；没有的东西不写、不承诺（与设计稿「边界清楚」的口吻一致）。
 */
import { paymentAmounts } from '@/lib/contracts'
import { relId } from '@/lib/access'
import { categoryOfType, DEVICE_TYPE_ORDER, deviceTypeOf } from '@/lib/device-types'
import {
  acceptanceChecks,
  docNumber,
  type DocPoint,
  type ProjectDocsData,
  type Room,
} from '@/lib/project-docs'
import type { AreaInfo, SheetInfo } from '@/lib/point-scene'
import { quoteTotals } from '@/lib/quotes'

export const pad = (n: number) => String(n).padStart(2, '0')
export const money = (n: number) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** ¥1,759 / ¥5,327.50：整数不带小数 */
export const yuanShort = (n: number) =>
  `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
export const chunk = <T>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n))
const byCode = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })
const typeOrder = (t: string) => DEVICE_TYPE_ORDER.indexOf(t)
const CN = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十']
/** 户型数字：1 → 一，2 → 两 */
export const cnCount = (n: number) => (n <= 10 ? CN[n] : String(n))
const typeName = (t: string) => deviceTypeOf(t)?.name ?? '设备'
const join = (list: string[], max = 2) =>
  list.length > max ? `${list.slice(0, max).join('、')}等${list.length}处` : list.join('、')

/** 代号区间：编号连续时写成 K1～K12；不连续时列出前几个再写「等 N 个」，不让区间暗含没有的点位 */
export function codeRange(codes: string[]) {
  const c = [...new Set(codes.filter(Boolean))].sort(byCode)
  if (c.length <= 2) return c.join(' / ')
  const parts = c.map((x) => /^(\D*)(\d+)$/.exec(x))
  const contiguous = parts.every(
    (m, i) =>
      m && m[1] === parts[0]![1] && (i === 0 || Number(m[2]) === Number(parts[i - 1]![2]) + 1),
  )
  if (contiguous) return `${c[0]}～${c[c.length - 1]}`
  return c.length <= 3 ? c.join(' / ') : `${c.slice(0, 3).join(' / ')} 等${c.length}个`
}

export type DeckPoint = DocPoint & {
  no: number
  room: string
  typeName: string
  ref: string | null
}
export type DeckItem = {
  ref: string
  deviceType: string
  typeName: string
  name: string
  sku: string
  brand: string | null
  unit: string
  count: number
  price: number
  subtotal: number
  pending: boolean
  codes: string[]
  rooms: string[]
}
export type DeckFee = { ref: string; name: string; amount: number }
export type DeckGroup = { key: string; name: string; points: DeckPoint[] }
export type DeckSheet = {
  sheet: SheetInfo
  floorName: string
  points: DeckPoint[]
  groups: DeckGroup[]
  areas: AreaInfo[]
  subtotal: number
  types: number
}
export type ZoneKey = 'arrive' | 'rest' | 'care' | 'focus'
export type DeckZone = {
  key: ZoneKey
  rooms: Room[]
  photo: string
  subtotal: number
  points: DeckPoint[]
}
export type TopoBox = { title: string; sub: string; badge?: string }
export type TopoAcNode = {
  title: string
  sub: string
  badge: string
  codes: string
  configured: boolean
}
export type TopoApRoom = { room: string; codes: string; sub: string; count: number }
export type PayNode = { name: string; percent: number; amount: number }
export type SceneItem = { name: string; action: string }

const PHOTO_OF: Record<string, string> = {
  entrance: 'entrance',
  living: 'living',
  dining: 'dining',
  corridor: 'stairs',
  stairs: 'stairs',
  bedroom: 'bedroom',
  kids: 'kids',
  closet: 'storage',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  balcony: 'home',
  utility: 'storage',
  garage: 'storage',
  study: 'study',
  theater: 'leisure',
  leisure: 'leisure',
  other: 'home',
}
/** 空间照片：氛围意向图（Unsplash 授权图片，存放在 public/proposal/photos），按房间类型选择 */
export const photoOf = (areaType: string) => `/proposal/photos/${PHOTO_OF[areaType] ?? 'home'}.jpg`

/** 房间类型 → 场景章节：进门（玄关客餐厅）、休息（卧室）、看护（厨卫阳台）、专注（书房影音） */
const ZONE_OF: Record<string, ZoneKey> = {
  entrance: 'arrive',
  living: 'arrive',
  dining: 'arrive',
  corridor: 'arrive',
  stairs: 'arrive',
  bedroom: 'rest',
  kids: 'rest',
  closet: 'rest',
  kitchen: 'care',
  bathroom: 'care',
  balcony: 'care',
  utility: 'care',
  garage: 'care',
  study: 'focus',
  theater: 'focus',
  leisure: 'focus',
}
const ZONE_ORDER: ZoneKey[] = ['arrive', 'rest', 'care', 'focus']
/** 每个场景章节最多展开的房间数，其余房间进入「其余空间」页 */
const ZONE_ROOMS = 2

export const ZONE_COPY: Record<ZoneKey, { title: string; subtitle: string; tag: string }> = {
  arrive: {
    title: '进门的那一刻，生活开始切换。',
    subtitle: '以明确的触发方式，连接照明、窗帘与门窗状态',
    tag: 'ARRIVE & LEAVE',
  },
  rest: {
    title: '把一天的忙碌，留在灯光之外。',
    subtitle: '为睡眠保留简单、可靠的关灯方式',
    tag: 'REST & RESET',
  },
  care: {
    title: '看不见的角落，也值得被关心。',
    subtitle: '连接发现、通知与人工处置',
    tag: 'CARE & PROTECT',
  },
  focus: {
    title: '专注与放松，各有各的光。',
    subtitle: '书房、影音与休闲空间的灯光和氛围',
    tag: 'FOCUS & LEISURE',
  },
}

const PROTOCOL: Record<string, string> = {
  米家: 'Zigbee / 蓝牙 Mesh',
  'Aqara Home': 'Zigbee 3.0',
  'Apple Home': 'Thread / Matter',
  华为鸿蒙智家: 'PLC / 星闪',
  KNX: 'KNX 总线',
  Control4: 'Zigbee Pro / IP',
  '网络/弱电': 'PoE / 以太网',
}

const CAT_UNIT: Record<string, string> = {
  switch: '只',
  socket: '个',
  lighting: '盏',
  sensor: '只',
  lock: '把',
  security: '台',
  curtain: '套',
  vrf: '台',
  other: '个',
}
const CAT_DESC: Record<string, string> = {
  switch: '灯具开 / 关',
  socket: '定时与电量',
  lighting: '照明回路',
  sensor: '状态上报',
  lock: '开锁与告警',
  security: '画面与录像',
  curtain: '开 / 合 / 停',
  vrf: '空调群控',
  other: '按需接入',
}

const SWITCHES = ['switch-1', 'switch-2', 'switch-3', 'switch-4']
const LIGHTS = DEVICE_TYPE_ORDER.filter((t) => categoryOfType(t)?.slug === 'lighting')

/** 安装复核要点：按出现的设备类型组合 */
const INSTALL_NOTES: [string[], string][] = [
  [SWITCHES, '智能开关中心高约1.3m，86底盒深≥50mm，须有零火线'],
  [['touch-panel'], '中控屏需86底盒与零火线，安装高度1.3–1.5m'],
  [['gateway'], '网关居中放置，预留220V与LAN口'],
  [['ac-router'], 'AC路由/PoE交换机入弱电箱或机柜，核验散热、220V电源与各房间六类网线汇聚'],
  [['ap-node', 'ceiling-ap'], 'AP节点（吸顶/面板）需六类网线与PoE供电，由AC控制器统一调优漫游'],
  [['curtain-track'], '电动窗帘复核轨道长度、行程与窗帘盒内供电'],
  [['smart-lock'], '门锁需核对门厚、锁体规格与开门方向'],
  [['contact-sensor'], '门磁间隙按设备要求核验'],
  [['water-sensor'], '水浸探头贴地，靠近最低积水面'],
  [['smoke-sensor'], '烟感吸顶，避开灶台正上方与空调风口'],
  [['camera', 'doorbell'], '摄像头 / 门铃预留电源与网线，注意隐私朝向'],
  [['motion-sensor'], '人体传感器避开空调出风与强光直射'],
  [['vrf-controller'], '空调网关须与内外机协议匹配'],
  [['speaker'], '音箱预留电源，远离空调出风口'],
  [LIGHTS, '灯具回路与负载以现场复核为准'],
]

export function installNote(types: string[]) {
  const notes = INSTALL_NOTES.filter(([t]) => t.some((x) => types.includes(x))).map(([, n]) => n)
  return notes.length
    ? `安装复核：${notes.slice(0, 3).join('；')}。`
    : '安装复核：设备位置与供电条件以现场复核为准。'
}

/** 房间的推荐场景（「回家模式：……」拆成名称与动作），去重 */
export function roomScenes(rooms: Room[]): SceneItem[] {
  const out = new Map<string, SceneItem>()
  for (const r of rooms)
    for (const s of r.scenes) {
      const [name, ...rest] = s.split('：')
      if (name && rest.length && !out.has(name)) out.set(name, { name, action: rest.join('：') })
    }
  return [...out.values()]
}

export function buildDeck(d: ProjectDocsData) {
  const date = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    .replaceAll('-', '.')
  const docNo = docNumber(d, 'QX')
  const areaById = new Map(d.areas.map((a) => [a.id, a]))
  const roomName = (p: DocPoint) =>
    p.areaId ? (areaById.get(p.areaId)?.name ?? '公共区域') : '公共区域'
  const has = (...types: string[]) => d.points.some((p) => types.includes(p.deviceType))
  const pointsOf = (...types: string[]) => d.points.filter((p) => types.includes(p.deviceType))

  // 已选报价按逐行快照交付，数量、型号和临时单价不随点位或产品库变化。
  // 点位只关联可确认的编号和空间，不补齐报价里没有的设备或数量。
  const items: DeckItem[] = []
  const refOfProduct = new Map<string, string>()
  const refOfPending = new Map<string, string>()
  const refOfPoint = new Map<string, string>()
  if (d.quote) {
    const roomOfPoint = new Map(
      d.rooms.flatMap((r) => r.points.map((p) => [p.id, r.displayName] as const)),
    )
    for (const [index, item] of (d.quote.items ?? []).entries()) {
      const ref = `Q${pad(items.length + 1)}`
      const pid = relId(item.product)
      const product = pid ? d.productById.get(pid) : undefined
      const deviceType = item.deviceType ?? product?.deviceType ?? 'other'
      const pointProductId = pid ?? `quote-item-${item.id ?? index}`
      // 同一产品可有多行不同单价，每个点位最多关联一行，数量不够时不虚构点位。
      const pts = d.points
        .filter(
          (p) =>
            !refOfPoint.has(p.id) && p.deviceType === deviceType && p.productId === pointProductId,
        )
        .slice(0, Math.max(0, Math.floor(item.quantity)))
      for (const p of pts) refOfPoint.set(p.id, ref)
      items.push({
        ref,
        deviceType,
        typeName: typeName(deviceType),
        name: item.name,
        sku: item.sku ?? '',
        brand: product?.deviceType === deviceType ? (product.brand?.name ?? null) : null,
        unit: item.unit ?? '个',
        count: item.quantity,
        price: item.price,
        subtotal: Math.round(item.price * item.quantity * 100) / 100,
        pending: false,
        codes: pts.map((p) => p.code),
        rooms: [...new Set(pts.map((p) => roomOfPoint.get(p.id) ?? roomName(p)))],
      })
    }
  } else {
    // 尚无报价时按当前点位估算，保留未选型设备。
    for (const r of d.products) {
      const ref = `Q${pad(items.length + 1)}`
      refOfProduct.set(r.product.id, ref)
      items.push({
        ref,
        deviceType: r.deviceType,
        typeName: typeName(r.deviceType),
        name: r.product.name,
        sku: r.product.sku,
        brand: r.product.brand?.name ?? null,
        unit: r.product.unit || '个',
        count: r.count,
        price: r.product.price,
        subtotal: r.subtotal,
        pending: false,
        codes: d.points.filter((p) => p.productId === r.product.id).map((p) => p.code),
        rooms: r.rooms,
      })
    }
    for (const t of DEVICE_TYPE_ORDER) {
      const pts = d.points.filter((p) => !p.productId && p.deviceType === t)
      if (!pts.length) continue
      const ref = `Q${pad(items.length + 1)}`
      refOfPending.set(t, ref)
      items.push({
        ref,
        deviceType: t,
        typeName: typeName(t),
        name: `${typeName(t)}（待选型）`,
        sku: '',
        brand: null,
        unit: CAT_UNIT[categoryOfType(t)?.slug ?? 'other'] ?? '个',
        count: pts.length,
        price: 0,
        subtotal: 0,
        pending: true,
        codes: pts.map((p) => p.code),
        rooms: [...new Set(pts.map(roomName))],
      })
    }
  }
  const itemOf = new Map(items.map((i) => [i.ref, i]))
  const pointRef = (p: DocPoint) =>
    d.quote
      ? (refOfPoint.get(p.id) ?? null)
      : p.productId
        ? (refOfProduct.get(p.productId) ?? null)
        : (refOfPending.get(p.deviceType) ?? null)

  // 点位编号：每张图纸按房间（自上而下、从左到右）→ 设备类型 → 代号排序，编号 01…；房间内编号连续
  const sheets: DeckSheet[] = []
  const numbered = new Map<string, DeckPoint>()
  for (const s of d.sheets) {
    const pts = d.points.filter((p) => p.sheetId === s.id)
    if (!pts.length && d.scope !== 'all') continue
    const buckets = new Map<string, DocPoint[]>()
    for (const p of pts) {
      const k = p.areaId && areaById.has(p.areaId) ? p.areaId : '_'
      buckets.set(k, [...(buckets.get(k) ?? []), p])
    }
    const keys = [...buckets.keys()].sort((a, b) => {
      if (a === '_') return 1
      if (b === '_') return -1
      const A = areaById.get(a)!
      const B = areaById.get(b)!
      return Math.round(A.y / 60) - Math.round(B.y / 60) || A.x - B.x
    })
    let no = 0
    const groups: DeckGroup[] = keys.map((k) => {
      const list = buckets
        .get(k)!
        .slice()
        .sort((a, b) => typeOrder(a.deviceType) - typeOrder(b.deviceType) || byCode(a.code, b.code))
      const name = k === '_' ? '公共区域' : areaById.get(k)!.name
      const dps = list.map((p) => {
        const dp: DeckPoint = {
          ...p,
          no: ++no,
          room: name,
          typeName: typeName(p.deviceType),
          ref: pointRef(p),
        }
        numbered.set(p.id, dp)
        return dp
      })
      return { key: k, name, points: dps }
    })
    const flat = groups.flatMap((g) => g.points)
    sheets.push({
      sheet: s,
      floorName: d.floors.find((f) => f.sheetId === s.id)?.floorName ?? s.name,
      points: flat,
      groups,
      areas: d.areas.filter((a) => a.sheetId === s.id),
      subtotal:
        Math.round(
          flat.reduce(
            (sum, p) => sum + (p.productId ? (d.productById.get(p.productId)?.price ?? 0) : 0),
            0,
          ) * 100,
        ) / 100,
      types: new Set(flat.map((p) => p.deviceType)).size,
    })
  }
  /** 带编号的点位（不在任何图纸上的点位编号为 0） */
  const deckPoint = (p: DocPoint): DeckPoint =>
    numbered.get(p.id) ?? {
      ...p,
      no: 0,
      room: roomName(p),
      typeName: typeName(p.deviceType),
      ref: pointRef(p),
    }

  // 场景章节：每类空间取点位最多的两间（进门章节玄关优先），其余房间进入「其余空间」
  const withPoints = d.rooms.filter((r) => r.total > 0)
  const zones: DeckZone[] = []
  const restRooms: Room[] = []
  for (const key of ZONE_ORDER) {
    const rooms = withPoints
      .filter((r) => ZONE_OF[r.areaType] === key)
      .sort(
        (a, b) =>
          (key === 'arrive'
            ? Number(b.areaType === 'entrance') - Number(a.areaType === 'entrance')
            : 0) || b.total - a.total,
      )
    if (!rooms.length) continue
    const shown = rooms.slice(0, ZONE_ROOMS)
    restRooms.push(...rooms.slice(ZONE_ROOMS))
    const lead =
      key === 'arrive' && shown.some((r) => r.areaType === 'entrance')
        ? 'entrance'
        : shown[0].areaType
    zones.push({
      key,
      rooms: shown,
      photo: photoOf(lead),
      subtotal: Math.round(shown.reduce((s, r) => s + r.subtotal, 0) * 100) / 100,
      points: shown.flatMap((r) => r.points.map(deckPoint)),
    })
  }
  const otherRooms = [...withPoints.filter((r) => !ZONE_OF[r.areaType]), ...restRooms]

  // 户型：按房间类型推算「三室两厅两卫」；多层时加楼层数
  const roomCount = (types: string[]) => d.rooms.filter((r) => types.includes(r.areaType)).length
  const shi = roomCount(['bedroom', 'kids', 'study'])
  const ting = roomCount(['living', 'dining'])
  const wei = roomCount(['bathroom'])
  const floorCount = new Set(d.floors.map((f) => f.floorName)).size
  const layoutCore = shi
    ? `${cnCount(shi)}室${ting ? `${cnCount(ting)}厅` : ''}${wei ? `${cnCount(wei)}卫` : ''}`
    : `${d.rooms.length}个空间`
  const layoutText = floorCount > 1 ? `${floorCount}层 · ${layoutCore}` : layoutCore

  const place = [d.project.community, d.project.address].filter(Boolean).join('') || d.project.name
  const customer = d.project.customerName || '业主'
  const platform = d.project.platform && d.project.platform !== '待定' ? d.project.platform : null
  const protocol = (platform && PROTOCOL[platform]) || '无线协议'
  const scopeText =
    d.scope === 'no-light'
      ? '智能控制方案（不含灯具）'
      : d.scope === 'switch'
        ? '智能开关面板方案'
        : d.scope === 'switch-light'
          ? '智能灯光开关方案'
          : '全屋智能设计方案'

  // 金额与正式报价使用同一份快照。合同关联报价的已保存总额优先，保留签订时的金额语义。
  const fees: DeckFee[] = (d.quote?.fees ?? []).map((f, i) => ({
    ref: `S${pad(i + 1)}`,
    name: f.name,
    amount: f.amount,
  }))
  const discount = d.quote?.discount ?? 0
  const totals = quoteTotals(d.quote?.items ?? [], d.quote?.fees ?? [], discount)
  const serviceTotal = totals.feeTotal
  const deviceTotal = d.quote ? totals.productTotal : d.total
  const finalAmount = d.quote ? (d.quote.total ?? totals.total) : d.total

  // 第 02 章：需求色带
  const waterRoom = pointsOf('water-sensor')[0]
  const bedrooms = roomCount(['bedroom', 'kids'])
  const needs = [
    {
      label: '生活需求',
      value: has('smart-lock', 'contact-sensor', 'doorbell')
        ? '回家有光，离家少牵挂'
        : has('curtain-track')
          ? '灯光窗帘，一键随心'
          : '常用灯光，触手可及',
    },
    {
      label: '休息需求',
      value: bedrooms
        ? `${bedrooms > 1 ? `${cnCount(bedrooms)}卧室` : '卧室'}一键关灯入睡`
        : '夜间起居更安心',
    },
    {
      label: '安全需求',
      value: waterRoom
        ? `${roomName(waterRoom) === '公共区域' ? '' : roomName(waterRoom)}积水及时发现`
        : has('smoke-sensor')
          ? '烟雾异常及时提醒'
          : has('camera', 'doorbell')
            ? '门口动静看得见'
            : has('smart-lock', 'contact-sensor')
              ? '门锁门窗状态可查'
              : '设备状态随时可查',
    },
    { label: '配置原则', value: '够用、可维护、边界清楚' },
  ]

  const scenes = roomScenes(d.rooms)
  const indexNote = [
    scenes.length
      ? `${scenes.length}个预设场景：${scenes
          .slice(0, 3)
          .map((s) => s.name.replace(/模式$/, ''))
          .join(' / ')}${scenes.length > 3 ? ' 等' : ''}。`
      : '',
    has('contact-sensor')
      ? '门磁仅识别开合，不判断进出或身份；回家、离家须手动触发或用户确认。'
      : '场景在交付时与业主逐条确认后启用，可随时调整。',
  ].join('')

  // 第 03 章：网络与中控拓扑
  const codesOf = (pts: DocPoint[]) => codeRange(pts.map((p) => p.code))
  const roomsOf = (pts: DocPoint[]) => join([...new Set(pts.map(roomName))], 2)
  const acRouters = pointsOf('ac-router')
  const netPanels = pointsOf('network-panel')
  const routers = [...acRouters, ...netPanels]
  const ap = pointsOf('ap-node', 'ceiling-ap')
  const acModels = [
    ...new Set(
      acRouters
        .map((p) => (p.productId ? d.productById.get(p.productId)?.name : null))
        .filter((v): v is string => !!v),
    ),
  ]
  const acNode: TopoAcNode = acRouters.length
    ? {
        title: `${codesOf(acRouters)} AC 控制器 / PoE 核心交换`,
        badge: `AC 控制 · ${acRouters.length}台`,
        sub: `统一管控 ${ap.length ? `${ap.length} 台 AP 漫游` : '全屋局域网'}与千兆 PoE 供电 · ${roomsOf(acRouters)}${acModels[0] ? ` · ${acModels[0]}` : ''}`,
        codes: codesOf(acRouters),
        configured: true,
      }
    : ap.length
      ? {
          title: 'AC 控制器 / PoE 核心交换机',
          badge: '弱电箱核心',
          sub: `统一管控全屋 ${ap.length} 台 AP 漫游与 PoE 供电 · 需核验弱电箱电源与六类网线汇聚`,
          codes: '',
          configured: false,
        }
      : {
          title: '宽带光猫 → AC 路由 / PoE 交换机',
          badge: '弱电箱核心',
          sub: '业主另配 · 千兆 LAN 与供电条件先行核验',
          codes: '',
          configured: false,
        }
  const topoTop: TopoBox = { title: acNode.title, sub: acNode.sub, badge: acNode.badge }

  // 每个拥有 AP 设备的房间拓扑（按楼层与房间顺序排列，确保无遗漏）
  const apRooms: TopoApRoom[] = []
  const seenApIds = new Set<string>()
  for (const r of d.rooms) {
    const rAps = r.points.filter((p) => p.deviceType === 'ap-node' || p.deviceType === 'ceiling-ap')
    if (!rAps.length) continue
    for (const p of rAps) seenApIds.add(p.id)
    const rNet = r.points.filter((p) => p.deviceType === 'network-panel')
    const hasCeiling = rAps.some((p) => p.deviceType === 'ceiling-ap')
    const hasPanel = rAps.some((p) => p.deviceType === 'ap-node')
    const kind = hasCeiling && hasPanel ? '吸顶+面板AP' : hasCeiling ? '吸顶AP' : '面板AP'
    apRooms.push({
      room: r.displayName,
      codes: codesOf(rAps),
      sub: `${kind}${rAps.length > 1 ? ` ×${rAps.length}` : ''}${rNet.length ? ` + 网口×${rNet.length}` : ''} · PoE 漫游`,
      count: rAps.length,
    })
  }
  const orphanAps = ap.filter((p) => !seenApIds.has(p.id))
  if (orphanAps.length) {
    apRooms.push({
      room: '公共区域',
      codes: codesOf(orphanAps),
      sub: `AP 节点 ×${orphanAps.length} · PoE 漫游`,
      count: orphanAps.length,
    })
  }

  const hubs: TopoBox[] = []
  const gw = pointsOf('gateway')
  const shortCodes = (pts: DocPoint[]) => {
    const c = [...new Set(pts.map((p) => p.code).filter(Boolean))].sort(byCode)
    return c.length <= 2 ? c.join(' / ') : `${c[0]}～${c[c.length - 1]}（${c.length}处）`
  }
  if (gw.length)
    hubs.push({
      title: `${shortCodes(gw)} 智能中枢网关`,
      badge: `网关 ×${gw.length}`,
      sub: `${roomsOf(gw)} · LAN 接入 · ${protocol}`,
    })
  const tp = pointsOf('touch-panel')
  const sp = pointsOf('speaker')
  const vrf = pointsOf('vrf-controller')
  const ctrl = [...tp, ...sp, ...vrf]
  if (ctrl.length) {
    const parts = [
      tp.length ? `中控屏×${tp.length}` : '',
      sp.length ? `音箱×${sp.length}` : '',
      vrf.length ? `空调网关×${vrf.length}` : '',
    ]
      .filter(Boolean)
      .join(' / ')
    hubs.push({
      title: `${shortCodes(ctrl)} 中控与语音交互`,
      badge: parts,
      sub: `${roomsOf(ctrl)} · 场景触控与语音控制`,
    })
  }
  if (!hubs.length)
    hubs.push({
      title: '手机 App / 语音中控',
      badge: '直连控制',
      sub: 'Wi-Fi 设备直连局域网 · 无独立网关',
    })
  const leaves: TopoBox[] = d.categories
    .filter((c) => c.slug !== 'gateway' && c.slug !== 'network')
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((c) => {
      const pts = d.points.filter((p) => categoryOfType(p.deviceType)?.slug === c.slug)
      return {
        title: codesOf(pts) || c.name,
        badge: `${c.count}${CAT_UNIT[c.slug] ?? '个'}${c.name}`,
        sub: `${CAT_DESC[c.slug] ?? '按需接入'} · ${roomsOf(pts)}`,
      }
    })
  const apLink = apRooms.length
    ? `PoE 供电 + AC 漫游 · ${apRooms.length} 房间（${ap.length} 台 AP）`
    : '六类网线预留 · 按需扩展 AP 节点'
  const topology = {
    top: topoTop,
    ac: acNode,
    apRooms,
    apTotal: ap.length,
    apLink,
    hubs,
    leaves,
    link: `${protocol} · 中控联动总线`,
  }

  const missingCore = [
    !has('smart-lock') && '智能门锁',
    !has('motion-sensor') && '人体传感器',
    !has('smoke-sensor') && '烟感',
    !has('vrf-controller') && '空调控制器',
  ].filter((v): v is string => !!v)
  const systemNotes = [
    `同为${protocol}不代表必然兼容。设备接入、场景指令、状态回传与App支持均须以清单及联调结果确认。`,
    [
      has(...SWITCHES) ? '开关仅开关灯，不默认支持调光调色' : '',
      has('curtain-track') ? '电机须复核轨道匹配、行程与窗帘盒供电' : '',
      has('ap-node', 'ceiling-ap') ? 'AP漫游与无线覆盖须到场实测调优' : '',
    ]
      .filter(Boolean)
      .join('；') + '。',
    missingCore.length
      ? `本配置不含${missingCore.join('、')}；如需增加，须书面确认并同步更新点位及报价。`
      : '全部设备以现场复核与联调验收结果为准。',
  ].filter((n) => n.length > 1)

  // 第 07 章：不含项与有效期
  const exclusions = [
    has(...LIGHTS) ? null : '灯具',
    '强弱电布线',
    '开槽修补',
    has('curtain-track') ? '窗帘布料' : '窗帘轨道及布料',
    routers.length || ap.length ? null : '路由器 / PoE交换机 / 宽带',
    '其他装修工程',
  ].filter((v): v is string => !!v)
  const exclusionText = `${exclusions.join('、')}。不含新增设备或点位增减费用；现场差异与任何变更须书面确认，并同步更新全部点位及报价。`
  const valid = new Date(Date.now() + 15 * 86400000)
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    .replaceAll('-', '.')

  // 第 08 章：付款节点（有合同按合同，否则用设计稿的 40 / 50 / 10）
  const terms = d.contract?.payments?.length
    ? d.contract.payments.map((p) => ({ name: p.name, percent: p.percent }))
    : [
        { name: '方案及合同确认后 / 备货前', percent: 40 },
        { name: '设备到场核验后 / 安装前', percent: 50 },
        { name: '联调验收、资料移交后', percent: 10 },
      ]
  const amounts = paymentAmounts(finalAmount, terms)
  const nodes: PayNode[] = terms.map((t, i) => ({ ...t, amount: amounts[i] }))

  return {
    d,
    date,
    docNo,
    version: 'V1.0',
    place,
    customer,
    platform,
    protocol,
    scopeText,
    layoutText,
    advisor: d.owner?.name ?? null,
    advisorPhone: d.owner?.phone || d.company.phone || null,
    items,
    itemOf,
    fees,
    deviceTotal,
    serviceTotal,
    discount,
    finalAmount,
    sheets,
    zones,
    otherRooms,
    deckPoint,
    needs,
    scenes,
    indexNote,
    topology,
    systemNotes,
    exclusionText,
    valid,
    nodes,
    checks: acceptanceChecks(d),
  }
}

export type DeckModel = ReturnType<typeof buildDeck>
