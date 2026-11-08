import { deviceTypeOf } from './device-types'

/**
 * AI 点位设计规范（识别户型图、导入点位、AI 助手布点共用）。
 *
 * 1. 开关、插座、灯具（照明与强电回路）只「照图识别」：仅当图纸上已有准确的开关 / 灯光点位符号时，
 *    才按原图位置生成；没有准确点位的图纸默认不生成，AI 不得自行推测布置。
 * 2. 默认由 AI 设计的弱电与智能设备：全屋 WiFi（AP、网络面板）、窗帘电轨、智能网关、中控屏、
 *    VRF 控制器、人体传感器、智能音箱、摄像头。
 *    中控屏要对照开关点位布置（装在开关位置旁或替代开关），图纸上没有开关点位时不加入设计。
 * 3. 数量规范：
 *    - VRF 控制器每层只放 1 个，放在客厅；
 *    - 智能音箱与中控屏每个区域只放其中一种、且只放 1 个，不共存；
 *    - 智能音箱一般只考虑客厅和书房；
 *    - 摄像头一般只放 2 个：客厅 1 个、入户门口 1 个。
 */
export const DRAWING_ONLY_CATEGORIES = new Set(['switch', 'socket', 'lighting'])

export const AUTO_DESIGN_TYPES = [
  'ap-node',
  'network-panel',
  'curtain-track',
  'gateway',
  'vrf-controller',
  'motion-sensor',
  'speaker',
  'camera',
] as const

/** 中控屏对照开关点位布置：同一张图纸上没有开关点位时不加入设计 */
export const NEEDS_SWITCH_TYPES = new Set(['touch-panel'])

/** 智能音箱一般只放在这些区域类型（客厅、书房） */
export const SPEAKER_AREA_TYPES = new Set(['living', 'study'])
export const isSpeakerArea = (areaType: string | null | undefined, name = '') =>
  SPEAKER_AREA_TYPES.has(areaType ?? '') || /客厅|起居|书房/.test(name)

/** 该设备类型是否只能照图识别（不能由 AI 凭空设计） */
export const isDrawingOnlyType = (deviceType: string) =>
  DRAWING_ONLY_CATEGORIES.has(deviceTypeOf(deviceType)?.category ?? '')

export const DESIGN_RULE_TEXT =
  '开关、插座、灯具只在图纸上已有准确点位符号时照图生成（source 标为 "drawing"）；图上没有就不要生成，不得凭经验推测。' +
  '其余默认设计：全屋 WiFi（ap-node、network-panel）、窗帘电轨 curtain-track、智能网关 gateway、VRF 控制器 vrf-controller、人体传感器 motion-sensor、智能音箱 speaker、摄像头 camera（source 标为 "design"）。' +
  '数量规范：VRF 控制器每层只放 1 个且放在客厅；智能音箱与中控屏每个区域只放其中一种、只放 1 个，不能共存；智能音箱一般只放客厅和书房；中控屏 touch-panel 要对照开关点位布置，图上没有开关点位时不要加入；摄像头一般只放 2 个——客厅 1 个、入户门口 1 个。'

/** 每层 VRF 控制器上限 */
export const VRF_PER_FLOOR = 1
/** 每层摄像头上限（客厅 + 入户门口） */
export const CAMERA_PER_FLOOR = 2
/** 同一区域内互斥、只放一个的设备 */
export const ONE_PER_AREA_TYPES = new Set(['speaker', 'touch-panel'])
