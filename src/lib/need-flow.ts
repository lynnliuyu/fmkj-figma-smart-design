/**
 * 需求小助手：问题定义、三入口、选项与对照演示素材（issue #194）。
 *
 * 设计约束（用户口径）：
 * - 六步问卷，可分步跳过；三条入口（场景/预算/问卷）写同一份 answers。
 * - 每个选项都要有「一句话解释 + 对照素材」，业主看得懂才选得出。
 * - 面积/房型/数量是**可改的估算默认**，不是施工标准。
 * - 网关必需；卧室默认 3 个开关；客厅默认 2–3 个可改；安防传感器按用户选择。
 *
 * 素材：`asset` 指向 `public/need-assets/` 下的文件（P2 落地）；
 * 缺失时 UI 只显示 `explain`，不阻塞流程。
 */

import lightingAssets from '../../public/need-assets/manifest.json'

function lightingAsset(file: keyof typeof lightingAssets) {
  return { asset: `/need-assets/${file}`, ...lightingAssets[file] }
}

export type NeedHouseType = 'flat' | 'duplex' | 'villa'
export type NeedStage = 'rough' | 'mep' | 'moved'
export type NeedLightingDesign = 'main' | 'none' | 'partial'
export type NeedLightingColor = 'warm' | 'tunable' | 'rgb'
export type NeedTier = 'light' | 'full'
export type NeedHabit = 'button' | 'voice' | 'mixed'
export type NeedCamera = 'none' | 'door' | 'indoor' | 'both'

export type NeedOption<T extends string = string> = {
  value: T
  label: string
  /** 一句话解释（业主语言，不用术语） */
  explain: string
  /** 对照演示素材（public/need-assets/…），P2 补齐前可为空 */
  asset?: string
  alt?: string
  caption?: string
  /** 该项是否影响默认值计算 */
  affectsDefaults?: boolean
}

/** 六步问卷（第 0 步是房子基础） */
export const NEED_STEPS = [
  { key: 'house', title: '房子基本情况', hint: '决定默认配置，填得越准方案越贴合' },
  { key: 'lighting', title: '灯光设计', hint: '有没有主灯、想要什么光色' },
  { key: 'level', title: '智能程度与习惯', hint: '轻智能还是全屋智能，平时怎么用' },
  { key: 'security', title: '安防与传感', hint: '要不要监控、哪些地方要报警' },
  { key: 'panels', title: '面板与交互', hint: '开关要不要带屏、要不要中控屏' },
  { key: 'scenes', title: '场景模式', hint: '回家、离家、睡眠…想一键做什么' },
  { key: 'ecosystem', title: '生态与品牌', hint: '用哪个平台，能不能混着用' },
] as const

export const HOUSE_TYPES: NeedOption<NeedHouseType>[] = [
  { value: 'flat', label: '平层', explain: '一层，最常见', affectsDefaults: true },
  { value: 'duplex', label: '复式', explain: '两层带楼梯', affectsDefaults: true },
  { value: 'villa', label: '别墅', explain: '独栋/联排，面积大、楼层多', affectsDefaults: true },
]

export const STAGES: NeedOption<NeedStage>[] = [
  { value: 'rough', label: '毛坯', explain: '还没动工，可预埋有线方案', affectsDefaults: true },
  { value: 'mep', label: '水电中', explain: '正在走水电，还能补线', affectsDefaults: true },
  { value: 'moved', label: '已入住', explain: '已住人，优先无线方案' },
]

export const LIGHTING_DESIGNS: NeedOption<NeedLightingDesign>[] = [
  {
    value: 'main',
    label: '传统主灯',
    explain: '一盏大灯照亮整间，便宜、施工简单',
    ...lightingAsset('lighting-main-vs-none.png'),
  },
  {
    value: 'none',
    label: '全屋无主灯',
    explain: '用筒灯/灯带/射灯分层照明，氛围好、造价高',
    ...lightingAsset('lighting-main-vs-none.png'),
  },
  {
    value: 'partial',
    label: '客厅无主灯，其余主灯',
    explain: '客厅做氛围，卧室书房省预算',
    ...lightingAsset('lighting-main-vs-none.png'),
  },
]

export const LIGHTING_COLORS: NeedOption<NeedLightingColor>[] = [
  {
    value: 'warm',
    label: '单色暖光',
    explain: '固定 3000K 左右，最便宜',
    ...lightingAsset('color-temp-3up.png'),
  },
  {
    value: 'tunable',
    label: '冷暖可调',
    explain: '2700K–6500K 可调，日常够用',
    ...lightingAsset('color-temp-3up.png'),
  },
  {
    value: 'rgb',
    label: '多彩可调',
    explain: '能变颜色，适合氛围与观影',
    ...lightingAsset('color-rgb.gif'),
  },
]

export const TIERS: NeedOption<NeedTier>[] = [
  {
    value: 'light',
    label: '轻智能',
    explain: '灯、窗帘、门锁能手机/语音控制，预算友好',
    asset: '/need-assets/tier-matrix.png',
  },
  {
    value: 'full',
    label: '全屋智能',
    explain: '全屋联动、场景自动化、传感器齐全',
    asset: '/need-assets/tier-matrix.png',
  },
]

export const HABITS: NeedOption<NeedHabit>[] = [
  {
    value: 'button',
    label: '手按为主',
    explain: '习惯按开关，智能只做补充',
    asset: '/need-assets/interaction.gif',
  },
  {
    value: 'voice',
    label: '语音为主',
    explain: '一句话搞定，适合老人小孩',
    asset: '/need-assets/interaction.gif',
  },
  { value: 'mixed', label: '混合', explain: '手按 + 语音 + 自动，最常见' },
]

export const CAMERA_CHOICES: NeedOption<NeedCamera>[] = [
  { value: 'none', label: '不需要', explain: '不装监控' },
  { value: 'door', label: '仅门口', explain: '看门口，兼顾门铃', affectsDefaults: true },
  { value: 'indoor', label: '仅室内', explain: '看客厅/儿童房', affectsDefaults: true },
  { value: 'both', label: '门口 + 室内', explain: '最全，费用最高', affectsDefaults: true },
]

/** 传感器：按用户选择（用户明确要求「按用户选择」，不做强制勾选） */
export const SENSORS: NeedOption[] = [
  {
    value: 'water',
    label: '水浸',
    explain: '漏水报警，厨房/卫生间/阳台建议装',
    affectsDefaults: true,
  },
  { value: 'smoke', label: '烟雾', explain: '火灾早期报警', affectsDefaults: true },
  { value: 'gas', label: '燃气', explain: '燃气泄漏报警，厨房建议装', affectsDefaults: true },
  { value: 'contact', label: '门窗磁', explain: '门窗被打开时提醒' },
  { value: 'presence', label: '人体存在', explain: '人来自动亮灯，比红外更准' },
]

export const PANEL_OPTIONS = {
  screenSwitch: { label: '开关带屏', explain: '能看温湿度/场景，单价比普通开关贵' },
  centralScreen: [
    { value: 'none', label: '不需要', explain: '用手机和语音就够' },
    { value: 'wall', label: '客厅墙挂', explain: '全家共用的中控屏' },
    { value: 'desk', label: '桌面摆放', explain: '可移动，放床头/书桌' },
  ],
  lock: { label: '智能门锁', explain: '指纹/密码开门，开锁可触发回家模式' },
  dryer: { label: '智能晾衣', explain: '升降、烘干、杀菌' },
} as const

export const SCENES: NeedOption[] = [
  {
    value: 'home',
    label: '回家',
    explain: '开门后玄关灯亮、客厅灯渐亮、窗帘打开',
    asset: '/need-assets/scene-home.png',
  },
  {
    value: 'away',
    label: '离家',
    explain: '一键全关灯、窗帘合、非必要插座断电',
    asset: '/need-assets/scene-away.png',
  },
  {
    value: 'sleep',
    label: '睡眠',
    explain: '主灯灭、灯带 5%、空调睡眠模式',
    asset: '/need-assets/scene-sleep.png',
  },
  {
    value: 'movie',
    label: '观影',
    explain: '灯光调暗、窗帘关闭、影音启动',
    asset: '/need-assets/scene-movie.png',
  },
  { value: 'wake', label: '起床', explain: '灯光渐亮、窗帘缓开、播报天气' },
  { value: 'dining', label: '用餐', explain: '餐厅暖光、氛围灯点亮' },
  { value: 'eco', label: '节能', explain: '无人房间自动关灯关空调' },
  { value: 'guest', label: '访客', explain: '门口提醒、临时密码、玄关引导灯' },
]

/**
 * 生态对比（P3 知识库同一份数据；这里先给结构化字段供 UI 与 AI 共用）。
 * 不逼业主二选一：支持「主体 + 面板层」混合。
 */
export const ECOSYSTEMS = [
  {
    value: 'apple',
    explain: '苹果生态，稳定省心',
    label: 'Apple Home',
    positioning: '苹果生态，稳定省心',
    pros: '隐私好、稳定、界面统一',
    cons: '设备选择少且贵、需 Apple 中枢',
    who: '全家用 iPhone、预算充足',
  },
  {
    value: 'mijia',
    explain: '设备最多最便宜',
    label: '米家',
    positioning: '设备最多最便宜',
    pros: '品类全、价格低、上手快',
    cons: '跨品牌体验参差、依赖云端',
    who: '预算敏感、愿意折腾',
  },
  {
    value: 'harmony',
    explain: '稳定优先',
    label: '华为鸿蒙智家',
    positioning: '稳定优先',
    pros: '连接稳定、售后强',
    cons: '生态在成长、溢价明显',
    who: '重稳定、要品牌背书',
  },
  {
    value: 'orvibo',
    explain: '面板颜值派',
    label: '欧瑞博',
    positioning: '面板颜值派',
    pros: '面板好看、整体方案完整',
    cons: '相对封闭、价格偏高',
    who: '重颜值和整体感',
  },
  {
    value: 'knx',
    explain: '有线楼控标准',
    label: 'KNX',
    positioning: '有线楼控标准',
    pros: '最稳定、寿命长、可扩展',
    cons: '造价最高、必须预埋、需专业施工',
    who: '别墅/大宅、正在水电阶段',
  },
  {
    value: 'ha',
    explain: '极客本地化',
    label: 'Home Assistant',
    positioning: '极客本地化',
    pros: '完全本地、可玩性高',
    cons: '需自己维护、不适合普通业主',
    who: '技术型业主',
  },
] as const

export const ECOSYSTEM_NOTES = {
  matter:
    'Matter 是跨生态的「通用插头」：选 Matter 设备，将来换平台也能继续用，不会被某个品牌锁死。',
  protocols: [
    { key: 'zigbee', text: 'Zigbee：省电、要网关，设备多时稳定' },
    { key: 'ble-mesh', text: '蓝牙 Mesh：便宜、响应稍慢，适合灯和开关' },
    { key: 'thread', text: 'Thread：低功耗 mesh，需要边界路由（如 HomePod/部分网关）' },
    { key: 'wifi', text: 'WiFi：不用网关，但费电、占路由器连接数' },
    { key: 'knx', text: 'KNX：有线，必须装修时预埋，最稳定也最贵' },
  ],
  hybrid: '多数家庭是「Aqara/米家 做设备主体 + Apple Home 做面板层」：不必二选一，可以混着用。',
} as const

/** 三条入口 */
export const NEED_ENTRIES = [
  {
    key: 'scene',
    title: '按场景选',
    desc: '点几个场景卡片，自动带出设备与数量',
    icon: 'sparkles',
  },
  {
    key: 'budget',
    title: '按预算选',
    desc: '给一个预算，看能做到哪些场景',
    icon: 'wallet',
  },
  {
    key: 'wizard',
    title: '六步问卷',
    desc: '一步步问清楚，最完整',
    icon: 'list',
  },
] as const

export type NeedEntryKey = (typeof NEED_ENTRIES)[number]['key']

/** 场景卡片 → 关注的能力（用于三入口互通与默认值推导） */
export const SCENE_CARDS = [
  { value: 'lighting', label: '照明', explain: '灯能调光、能定时、能一键全关' },
  { value: 'security', label: '安防', explain: '门窗、漏水、烟雾、燃气能报警' },
  { value: 'curtain', label: '窗帘', explain: '窗帘自动开合，可与场景联动' },
  { value: 'hvac', label: '暖通', explain: '空调/地暖远程控制与定时' },
  { value: 'av', label: '影音', explain: '观影模式一键联动灯光窗帘' },
  { value: 'lock', label: '门锁', explain: '指纹开门，开锁触发回家模式' },
] as const

export type SceneCardKey = (typeof SCENE_CARDS)[number]['value']

/** 预算档位（估算用，不是报价） */
export const BUDGET_BANDS = [
  { value: 'b1', label: '1–2 万', min: 10000, max: 20000 },
  { value: 'b2', label: '2–4 万', min: 20000, max: 40000 },
  { value: 'b3', label: '4–8 万', min: 40000, max: 80000 },
  { value: 'b4', label: '8 万以上', min: 80000, max: null },
] as const
