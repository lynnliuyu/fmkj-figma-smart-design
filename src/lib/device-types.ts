/**
 * 设备类型字典：产品库、点位图、报价共用的唯一分类来源。
 *
 * 类别（11 个）→ 设备类型 → 产品。产品必须属于一个设备类型，类别由设备类型自动带出；
 * 点位图放置的是设备类型，报价时再落到具体产品（点位指定 > 项目默认型号）。
 * 类别 slug 与「产品分类」集合中的文档一一对应，不要随意修改。
 */

export type SymbolKey =
  | 'switch'
  | 'socket'
  | 'socket-double'
  | 'socket-usb'
  | 'downlight'
  | 'spotlight'
  | 'track-light'
  | 'ceiling-light'
  | 'pendant-light'
  | 'wall-light'
  | 'panel-light'
  | 'light-strip'
  | 'other-light'
  | 'touch-panel'
  | 'contact-sensor'
  | 'motion-sensor'
  | 'smoke-sensor'
  | 'water-sensor'
  | 'temp-sensor'
  | 'lock'
  | 'doorbell'
  | 'camera'
  | 'curtain'
  | 'hub'
  | 'speaker'
  | 'router'
  | 'mesh'
  | 'data'
  | 'ac-wall'
  | 'other'

export type DeviceCategory = {
  slug: string
  name: string
  /** 点位代号前缀，例如开关 K1、K2 */
  code: string
  color: string
  sortOrder: number
}

export const DEVICE_CATEGORIES = [
  { slug: 'switch', name: '开关', code: 'K', color: '#2563eb', sortOrder: 10 },
  { slug: 'socket', name: '插座', code: 'Z', color: '#0d9488', sortOrder: 20 },
  { slug: 'lighting', name: '灯具', code: 'L', color: '#d97706', sortOrder: 30 },
  { slug: 'sensor', name: '传感器', code: 'S', color: '#059669', sortOrder: 40 },
  { slug: 'lock', name: '门锁', code: 'D', color: '#475569', sortOrder: 50 },
  { slug: 'security', name: '监控', code: 'V', color: '#dc2626', sortOrder: 60 },
  { slug: 'curtain', name: '窗帘', code: 'C', color: '#db2777', sortOrder: 70 },
  { slug: 'gateway', name: '网关中控', code: 'G', color: '#7c3aed', sortOrder: 80 },
  { slug: 'network', name: '全屋 WiFi', code: 'N', color: '#0891b2', sortOrder: 90 },
  { slug: 'vrf', name: 'VRF 控制器', code: 'AC', color: '#ea580c', sortOrder: 100 },
  { slug: 'other', name: '其他', code: 'Q', color: '#525252', sortOrder: 110 },
] as const satisfies readonly DeviceCategory[]

export type CategorySlug = (typeof DEVICE_CATEGORIES)[number]['slug']

export type DeviceType = {
  value: string
  name: string
  category: CategorySlug
  symbol: SymbolKey
  /** 开关键数；只有开关类有 */
  keys?: number
  /** 产品名称推断设备类型时使用的关键词（按字典顺序匹配，越具体越靠前） */
  keywords: RegExp
}

export const DEVICE_TYPES = [
  {
    value: 'switch-4',
    name: '四开',
    category: 'switch',
    symbol: 'switch',
    keys: 4,
    keywords: /四开|四键|4键|4开/,
  },
  {
    value: 'switch-3',
    name: '三开',
    category: 'switch',
    symbol: 'switch',
    keys: 3,
    keywords: /三开|三键|3键|3开/,
  },
  {
    value: 'switch-2',
    name: '双开',
    category: 'switch',
    symbol: 'switch',
    keys: 2,
    keywords: /双开|双键|二开|2键|2开/,
  },
  {
    value: 'switch-1',
    name: '单开',
    category: 'switch',
    symbol: 'switch',
    keys: 1,
    keywords: /单开|单键|一开|1键|1开|开关/,
  },
  {
    value: 'socket-usb',
    name: 'USB 插座',
    category: 'socket',
    symbol: 'socket-usb',
    keywords: /usb.*插座|插座.*usb/i,
  },
  {
    value: 'socket-double',
    name: '双插',
    category: 'socket',
    symbol: 'socket-double',
    keywords: /双插|双联插座/,
  },
  { value: 'socket', name: '五孔', category: 'socket', symbol: 'socket', keywords: /五孔|插座/ },
  {
    value: 'spotlight',
    name: '射灯',
    category: 'lighting',
    symbol: 'spotlight',
    keywords: /射灯|格栅/,
  },
  {
    value: 'track-light',
    name: '轨道灯',
    category: 'lighting',
    symbol: 'track-light',
    keywords: /轨道灯|磁吸/,
  },
  { value: 'downlight', name: '筒灯', category: 'lighting', symbol: 'downlight', keywords: /筒灯/ },
  {
    value: 'ceiling-light',
    name: '吸顶灯',
    category: 'lighting',
    symbol: 'ceiling-light',
    keywords: /吸顶灯/,
  },
  {
    value: 'pendant-light',
    name: '吊灯',
    category: 'lighting',
    symbol: 'pendant-light',
    keywords: /吊灯/,
  },
  {
    value: 'wall-light',
    name: '壁灯',
    category: 'lighting',
    symbol: 'wall-light',
    keywords: /壁灯/,
  },
  {
    value: 'panel-light',
    name: '面板灯',
    category: 'lighting',
    symbol: 'panel-light',
    keywords: /面板灯|平板灯/,
  },
  {
    value: 'light-strip',
    name: '灯带',
    category: 'lighting',
    symbol: 'light-strip',
    keywords: /灯带|灯条|线性灯/,
  },
  {
    value: 'other-light',
    name: '其他灯具',
    category: 'lighting',
    symbol: 'other-light',
    keywords: /青空灯|灯泡|灯管|tube/i,
  },
  {
    value: 'motion-sensor',
    name: '人体',
    category: 'sensor',
    symbol: 'motion-sensor',
    keywords: /人体|人在|存在|移动/,
  },
  {
    value: 'smoke-sensor',
    name: '烟雾',
    category: 'sensor',
    symbol: 'smoke-sensor',
    keywords: /烟雾|烟感/,
  },
  {
    value: 'water-sensor',
    name: '水浸',
    category: 'sensor',
    symbol: 'water-sensor',
    keywords: /水浸|漏水/,
  },
  {
    value: 'temp-sensor',
    name: '温湿度',
    category: 'sensor',
    symbol: 'temp-sensor',
    keywords: /温湿度|温度/,
  },
  {
    value: 'contact-sensor',
    name: '门磁',
    category: 'sensor',
    symbol: 'contact-sensor',
    keywords: /门窗传感|门磁|窗磁/,
  },
  {
    value: 'smart-lock',
    name: '智能门锁',
    category: 'lock',
    symbol: 'lock',
    keywords: /门锁|指纹锁|智能锁/,
  },
  { value: 'doorbell', name: '门铃', category: 'lock', symbol: 'doorbell', keywords: /门铃|猫眼/ },
  {
    value: 'camera',
    name: '摄像头',
    category: 'security',
    symbol: 'camera',
    keywords: /摄像|监控|云台/,
  },
  {
    value: 'curtain-track',
    name: '窗帘电轨',
    category: 'curtain',
    symbol: 'curtain',
    keywords: /窗帘|电轨|开合帘/,
  },
  {
    value: 'speaker',
    name: '智能音箱',
    category: 'gateway',
    symbol: 'speaker',
    keywords: /音箱|音响/,
  },
  {
    value: 'touch-panel',
    name: '中控屏',
    category: 'gateway',
    symbol: 'touch-panel',
    keywords: /中控屏|妙控屏|智能面板|缤纷面板|触控屏|智能屏/,
  },
  { value: 'gateway', name: '智能网关', category: 'gateway', symbol: 'hub', keywords: /网关|中控/ },
  {
    value: 'ac-router',
    name: 'AC 路由',
    category: 'network',
    symbol: 'router',
    keywords: /路由|AC控制器|ac 路由/i,
  },
  {
    value: 'ceiling-ap',
    name: '吸顶AP',
    category: 'network',
    symbol: 'mesh',
    keywords: /吸顶 ?AP|吸顶式 ?AP|天花 ?AP/i,
  },
  {
    value: 'ap-node',
    name: 'AP 节点',
    category: 'network',
    symbol: 'mesh',
    keywords: /\bAP\b|mesh|面板 ?AP/i,
  },
  {
    value: 'network-panel',
    name: '网络面板',
    category: 'network',
    symbol: 'data',
    keywords: /网络面板|网口|信息面板/,
  },
  {
    value: 'vrf-controller',
    name: 'VRF 控制器',
    category: 'vrf',
    symbol: 'ac-wall',
    keywords: /vrf|空调网关|多联机|中央空调/i,
  },
  { value: 'other', name: '其他设备', category: 'other', symbol: 'other', keywords: /$^/ },
] as const satisfies readonly DeviceType[]

export type DeviceTypeValue = (typeof DEVICE_TYPES)[number]['value']

const typeByValue = new Map<string, DeviceType>(DEVICE_TYPES.map((t) => [t.value, t]))
const categoryBySlug = new Map<string, DeviceCategory>(DEVICE_CATEGORIES.map((c) => [c.slug, c]))

export const isDeviceType = (v: unknown): v is DeviceTypeValue =>
  typeof v === 'string' && typeByValue.has(v)
export const deviceTypeOf = (v: string | null | undefined): DeviceType | undefined =>
  v ? typeByValue.get(v) : undefined
export const categoryOf = (slug: string | null | undefined): DeviceCategory | undefined =>
  slug ? categoryBySlug.get(slug) : undefined
export const categoryOfType = (v: string | null | undefined): DeviceCategory | undefined =>
  categoryOf(deviceTypeOf(v)?.category)

/** 显示名，例如「开关 · 双开」 */
export const deviceTypeLabel = (v: string | null | undefined) => {
  const t = deviceTypeOf(v)
  if (!t) return '未分类'
  return `${categoryOf(t.category)?.name ?? ''} · ${t.name}`
}

/** 字典顺序（展示面板、下拉、统计时统一使用） */
export const DEVICE_TYPE_ORDER: string[] = DEVICE_CATEGORIES.flatMap((c) =>
  DEVICE_TYPES.filter((t) => t.category === c.slug)
    .slice()
    .sort((a, b) => ('keys' in a && 'keys' in b ? (a.keys ?? 0) - (b.keys ?? 0) : 0))
    .map((t) => t.value),
)

/** 按类别分组的设备类型（开关按键数从少到多） */
export const DEVICE_GROUPS = DEVICE_CATEGORIES.map((c) => ({
  category: c as DeviceCategory,
  types: DEVICE_TYPE_ORDER.map((v) => typeByValue.get(v)!).filter((t) => t.category === c.slug),
}))

/** Payload select 选项：标签带类别前缀，后台下拉按字典顺序排列 */
export const DEVICE_TYPE_OPTIONS = DEVICE_TYPE_ORDER.map((value) => ({
  value,
  label: deviceTypeLabel(value),
}))

/** 根据产品名称推断设备类型（只用于存量数据整理和兜底，不代替人工选择） */
export function inferDeviceType(name: string, legacyCategorySlug?: string | null): DeviceTypeValue {
  // 按名称最具体的规则优先；开关类只在原分类为开关或名称里有「开关」时才匹配，避免「双键」误伤其他品类
  for (const t of DEVICE_TYPES) {
    if (t.category === 'switch' && legacyCategorySlug !== 'switch' && !/开关/.test(name)) continue
    if (t.keywords.test(name)) return t.value
  }
  return 'other'
}

export const symbolUrl = (key: SymbolKey) => `/point-symbols/${key}.svg`
export const symbolOfType = (v: string | null | undefined): SymbolKey =>
  deviceTypeOf(v)?.symbol ?? 'other'
