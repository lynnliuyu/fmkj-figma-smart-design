/**
 * 点位图设备符号：来自用户提供的 Procreate 平面图笔刷，已去除尺寸标注、裁切留白并矢量化，
 * 文件位于 public/point-symbols/<key>.svg，填充色为 currentColor，放入画布时按分类颜色着色。
 */
export const POINT_SYMBOLS = {
  socket: '五孔插座',
  'socket-double': '双插座',
  'socket-usb': 'USB 插座',
  usb: 'USB 面板',
  tv: '电视点位',
  data: '网络点位',
  'motion-sensor': '人体传感器',
  'smoke-sensor': '烟雾传感器',
  'water-sensor': '水浸传感器',
  'temp-sensor': '温湿度传感器',
  router: '路由器',
  mesh: 'Mesh 节点',
  doorbell: '门铃',
  lock: '智能门锁',
  camera: '摄像头',
  curtain: '智能窗帘',
  hub: '智能网关',
  speaker: '智能音箱',
  switch: '单控开关',
  'switch-2way': '双控开关',
  dimmer: '调光开关',
  'smart-switch': '智能开关',
  'smart-dimmer': '智能调光开关',
  'scene-switch': '场景面板',
  'curtain-switch': '窗帘开关',
  downlight: '筒灯',
  'downlight-square': '方形筒灯',
  spotlight: '射灯',
  'track-light': '轨道灯',
  'ceiling-light': '吸顶灯',
  'pendant-light': '吊灯',
  'wall-light': '壁灯',
  'panel-light': '面板灯',
  'ac-wall': '壁挂空调',
  'ac-cassette': '中央空调',
  'ac-outdoor': '空调外机',
  'exhaust-fan': '排气扇',
  'ceiling-fan': '吊扇',
  'fresh-air': '新风口',
  'water-heater': '热水器',
} as const

export type PointSymbolKey = keyof typeof POINT_SYMBOLS

export const symbolUrl = (key: PointSymbolKey) => `/point-symbols/${key}.svg`

/** 按产品名称关键词匹配，越具体的规则越靠前。 */
const NAME_RULES: [RegExp, PointSymbolKey][] = [
  [/人体|人在|存在|移动侦测/, 'motion-sensor'],
  [/烟|燃气|可燃/, 'smoke-sensor'],
  [/水浸|漏水/, 'water-sensor'],
  [/温湿度|温度/, 'temp-sensor'],
  [/门锁|指纹锁|智能锁/, 'lock'],
  [/门铃|猫眼/, 'doorbell'],
  [/摄像|监控|云台/, 'camera'],
  [/窗帘.*(开关|面板)/, 'curtain-switch'],
  [/窗帘|开合帘|卷帘/, 'curtain'],
  [/音箱|音响/, 'speaker'],
  [/网关|中控|主机/, 'hub'],
  [/mesh|子路由/i, 'mesh'],
  [/路由|\bAP\b|交换机/i, 'router'],
  [/场景/, 'scene-switch'],
  [/智能.*调光|调光.*智能/, 'smart-dimmer'],
  [/调光/, 'dimmer'],
  [/双控/, 'switch-2way'],
  [/智能.*开关|零火|单火/, 'smart-switch'],
  [/开关/, 'switch'],
  [/usb/i, 'socket-usb'],
  [/插座/, 'socket'],
  [/电视|tv/i, 'tv'],
  [/网口|网络面板|信息/, 'data'],
  [/射灯|格栅/, 'spotlight'],
  [/轨道|磁吸/, 'track-light'],
  [/方.*筒灯/, 'downlight-square'],
  [/筒灯/, 'downlight'],
  [/吸顶/, 'ceiling-light'],
  [/吊灯/, 'pendant-light'],
  [/壁灯/, 'wall-light'],
  [/面板灯|平板灯/, 'panel-light'],
  [/外机/, 'ac-outdoor'],
  [/中央空调|风管|天花机/, 'ac-cassette'],
  [/空调|温控/, 'ac-wall'],
  [/新风/, 'fresh-air'],
  [/排气|换气|浴霸/, 'exhaust-fan'],
  [/风扇|吊扇/, 'ceiling-fan'],
  [/热水/, 'water-heater'],
]

const CATEGORY_DEFAULT: Record<string, PointSymbolKey> = {
  gateway: 'hub',
  switch: 'smart-switch',
  lighting: 'downlight',
  sensor: 'motion-sensor',
  curtain: 'curtain',
  lock: 'lock',
  security: 'camera',
  network: 'router',
}

/** 为产品选择符号；没有匹配时返回 null，界面保留原来的圆形代号。 */
export function symbolForProduct(name: string, categorySlug: string): PointSymbolKey | null {
  for (const [re, key] of NAME_RULES) if (re.test(name)) return key
  return CATEGORY_DEFAULT[categorySlug] ?? null
}
