/**
 * 需求小助手：计价（issue #194 计价模型 v2，纯函数，可单测）。
 *
 * 用户口径（v2）：
 * - **不赚设备差价**：设备按京东日常价（`marketPrice`）原样计入，业主可自查来源。
 * - 安装单价 = v1 减半；**不含水电布线与回路改造**（已删除这两项）。
 * - 服务费 = 调试编程费，**不另收管理费百分比**。
 * - 调试费 800/套**尚未获用户确认** → 不进入「对外合计」，只作内部参考。
 * - 设备缺京东日常价：**单列「待查价」，不并入已知小计**，绝不用内部售价回填。
 */

export type PricingItem = {
  key: string
  label: string
  unit: '个' | '套' | '米' | '台' | '把' | '点'
  unitPrice: number
  calc: 'per_unit' | 'per_meter'
}

/** 安装/调试单价表 v2（默认值；后台可用 pricing-versions 覆盖） */
export const PRICING_ITEMS_V2: PricingItem[] = [
  { key: 'switch_panel', label: '智能开关面板', unit: '个', unitPrice: 20, calc: 'per_unit' },
  { key: 'scene_panel', label: '场景/带屏面板', unit: '个', unitPrice: 30, calc: 'per_unit' },
  { key: 'curtain_motor', label: '窗帘电机', unit: '套', unitPrice: 110, calc: 'per_unit' },
  { key: 'curtain_track', label: '窗帘轨道型材', unit: '米', unitPrice: 45, calc: 'per_meter' },
  { key: 'light_strip', label: '灯带', unit: '米', unitPrice: 22, calc: 'per_meter' },
  { key: 'magnetic_track', label: '磁吸轨道/铝型材', unit: '米', unitPrice: 55, calc: 'per_meter' },
  {
    key: 'downlight_install',
    label: '筒灯/射灯开孔安装',
    unit: '个',
    unitPrice: 12,
    calc: 'per_unit',
  },
  { key: 'sensor_install', label: '传感器安装', unit: '个', unitPrice: 12, calc: 'per_unit' },
  { key: 'gateway_install', label: '网关/中控屏安装', unit: '台', unitPrice: 40, calc: 'per_unit' },
  { key: 'camera_install', label: '摄像头安装', unit: '个', unitPrice: 60, calc: 'per_unit' },
  { key: 'lock_install', label: '智能门锁安装', unit: '把', unitPrice: 100, calc: 'per_unit' },
]

/** 调试费：未获确认，仅内部参考，不进入对外合计 */
export const COMMISSIONING_PER_SET = 800
export const COMMISSIONING_CONFIRMED = false

/** 报价单必须展示的不含项（用户口径，固定 5 条） */
export const PRICE_EXCLUSIONS = [
  '水电改造',
  '开槽布线',
  '强电施工',
  '吊顶/墙面修复',
  '家电本体',
] as const

/** 数量推导系数（可调，不是施工标准） */
export const QUANTITY_FACTORS = {
  /** 窗帘轨道米数 = 窗宽 × 1.2 */
  curtainTrackPerWindow: 1.2,
  /** 灯带米数 = 无主灯房间周长 × 0.6 */
  lightStripRatio: 0.6,
  /** 磁吸轨道米数 = 无主灯面积 ÷ 4 */
  magneticTrackDivisor: 4,
}

export type EquipmentLine = {
  deviceType: string
  name: string
  qty: number
  /** 京东日常价（参考）；null = 缺价 */
  unitMarketPrice: number | null
  subtotal: number | null
  priceSource: string | null
}

export type InstallLine = {
  key: string
  label: string
  unit: string
  qty: number
  unitPrice: number
  subtotal: number
}

export type PricingResult = {
  equipment: EquipmentLine[]
  install: InstallLine[]
  totals: {
    /** 已知设备小计（只含已查到京东日常价的） */
    equipment: number
    install: number
    /** 对外合计（不含未确认的调试费） */
    total: number
  }
  /** 缺京东日常价的设备：单列，不并入小计 */
  pendingPrice: { deviceType: string; name: string; qty: number }[]
  /** 调试费：未确认，单独给出，不进入 total */
  commissioning: { sets: number; perSet: number; subtotal: number; confirmed: boolean }
  exclusions: readonly string[]
  gaps: string[]
}

/** 设备类型 → 安装单价 key（不在表里的设备只收设备费，不收安装费） */
const INSTALL_KEY_BY_DEVICE: Record<string, string> = {
  'switch-1': 'switch_panel',
  'switch-2': 'switch_panel',
  'switch-3': 'switch_panel',
  'switch-4': 'switch_panel',
  'touch-panel': 'scene_panel',
  'curtain-track': 'curtain_motor',
  'light-strip': 'light_strip',
  downlight: 'downlight_install',
  spotlight: 'downlight_install',
  'water-sensor': 'sensor_install',
  'smoke-sensor': 'sensor_install',
  'gas-sensor': 'sensor_install',
  'contact-sensor': 'sensor_install',
  'motion-sensor': 'sensor_install',
  gateway: 'gateway_install',
  camera: 'camera_install',
  'smart-lock': 'lock_install',
  doorbell: 'camera_install',
}

export type PricingInput = {
  devices: { deviceType: string; qty: number }[]
  /** deviceType → 该类型当前产品的京东日常价（缺失表示未查到） */
  marketPriceByType: Record<string, { price: number | null; name: string; source: string | null }>
  /** 无主灯相关面积/周长（㎡/米），用于型材估算；缺省不计 */
  profile?: { curtainTrackMeters?: number; lightStripMeters?: number; magneticTrackMeters?: number }
  /** 面积 >200㎡ → 调试 2 套 */
  area?: number | null
  /** 覆盖单价（后台版本），key → 单价 */
  priceOverrides?: Record<string, number>
}

const unitPriceOf = (key: string, overrides?: Record<string, number>) =>
  overrides?.[key] ?? PRICING_ITEMS_V2.find((i) => i.key === key)?.unitPrice ?? 0

export function computePricing(input: PricingInput): PricingResult {
  const { devices, marketPriceByType, profile, area, priceOverrides } = input

  const equipment: EquipmentLine[] = []
  const pendingPrice: PricingResult['pendingPrice'] = []
  let equipmentTotal = 0

  for (const d of devices) {
    const info = marketPriceByType[d.deviceType]
    const unit = info?.price ?? null
    if (unit === null) {
      // 缺京东日常价：单列，不并入小计，也不用内部售价回填
      pendingPrice.push({ deviceType: d.deviceType, name: info?.name ?? d.deviceType, qty: d.qty })
      equipment.push({
        deviceType: d.deviceType,
        name: info?.name ?? d.deviceType,
        qty: d.qty,
        unitMarketPrice: null,
        subtotal: null,
        priceSource: null,
      })
      continue
    }
    const subtotal = unit * d.qty
    equipmentTotal += subtotal
    equipment.push({
      deviceType: d.deviceType,
      name: info?.name ?? d.deviceType,
      qty: d.qty,
      unitMarketPrice: unit,
      subtotal,
      priceSource: info?.source ?? null,
    })
  }

  const install: InstallLine[] = []
  for (const d of devices) {
    const key = INSTALL_KEY_BY_DEVICE[d.deviceType]
    if (!key) continue
    const item = PRICING_ITEMS_V2.find((i) => i.key === key)!
    const unitPrice = unitPriceOf(key, priceOverrides)
    install.push({
      key,
      label: item.label,
      unit: item.unit,
      qty: d.qty,
      unitPrice,
      subtotal: unitPrice * d.qty,
    })
  }

  // 型材（按米）单独列，避免与「按件」混在一起
  const meters: { key: string; qty: number }[] = [
    { key: 'curtain_track', qty: profile?.curtainTrackMeters ?? 0 },
    { key: 'light_strip', qty: profile?.lightStripMeters ?? 0 },
    { key: 'magnetic_track', qty: profile?.magneticTrackMeters ?? 0 },
  ]
  for (const m of meters) {
    if (!(m.qty > 0)) continue
    const item = PRICING_ITEMS_V2.find((i) => i.key === m.key)!
    const unitPrice = unitPriceOf(m.key, priceOverrides)
    install.push({
      key: m.key,
      label: item.label,
      unit: item.unit,
      qty: Math.round(m.qty * 10) / 10,
      unitPrice,
      subtotal: Math.round(unitPrice * m.qty),
    })
  }

  const installTotal = install.reduce((s, i) => s + i.subtotal, 0)
  const sets = (area ?? 0) > 200 ? 2 : 1
  const commissioning = {
    sets,
    perSet: COMMISSIONING_PER_SET,
    subtotal: COMMISSIONING_PER_SET * sets,
    confirmed: COMMISSIONING_CONFIRMED,
  }

  const gaps: string[] = []
  if (pendingPrice.length)
    gaps.push(`${pendingPrice.length} 类设备缺京东日常价（待查，未计入合计）`)
  if (!commissioning.confirmed) gaps.push('调试费尚未确认，未计入合计')

  return {
    equipment,
    install,
    totals: {
      equipment: Math.round(equipmentTotal),
      install: Math.round(installTotal),
      // 对外合计 = 已知设备 + 安装；调试费未确认不并入
      total: Math.round(equipmentTotal + installTotal),
    },
    pendingPrice,
    commissioning,
    exclusions: PRICE_EXCLUSIONS,
    gaps,
  }
}
