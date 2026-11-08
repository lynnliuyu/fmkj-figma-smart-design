/**
 * 画板引擎（Board）核心类型。
 *
 * 一个引擎、多个系统包：
 * - 引擎负责纸张、比例、网格、标尺、标定、对象、图层、撤销、本地草稿、导入导出和渲染；
 * - 系统包（智能家居点位 + 灯光，以后的平面家居 / 暖通 / 照明 / 给排水）负责符号库、调色板、
 *   默认图层、图例、检查规则、导出模板和业务映射。
 *
 * 引擎只认识通用对象，不认识「开关」「筒灯」这些业务：
 * - symbol：系统包里的符号。固定显示尺寸（NTS），或有真实尺寸且图纸已标定时按比例落图；
 * - area：区域（任意多边形，旧数据是矩形；点位按中心点归属到区域）；
 * - sheet：图纸底图（锁定在最底层，可标定比例）；
 * - raw：引擎不认识的元素（旧版本画布里的线、箭头、文字、图片……），原样保留，可移动、删除。
 * 业务含义放在 symbol.data，由系统包解释；持久化格式由系统包的编解码器决定。
 */

export type Vec = { x: number; y: number }
export type Box = { x: number; y: number; w: number; h: number }

/** 图层（自下而上绘制） */
export type LayerId = 'sheet' | 'area' | 'shape' | 'symbol'
export const LAYER_ORDER: LayerId[] = ['sheet', 'area', 'shape', 'symbol']

/** 真实尺寸（cm）：[宽, 深]；深为 null 时按图形比例（宽 = 图形长边） */
export type SizeCm = [number, number | null]

export type SymbolObj = {
  kind: 'symbol'
  id: string
  /** 系统包里的符号 ID */
  symbolId: string
  /** 中心点（场景坐标） */
  x: number
  y: number
  /** 旋转角（弧度，顺时针） */
  angle: number
  /** 代号（如 L12），显示在符号下方 */
  code: string
  sizeCm: SizeCm | null
  /** 按真实尺寸落图（图纸未标定时退回固定显示尺寸） */
  real: boolean
  /** 业务数据，由系统包解释（智能家居：deviceType / productId） */
  data: Record<string, unknown>
  /** 编解码器私有数据：往返保存时保留原始字段 */
  meta?: Record<string, unknown>
}

export type AreaObj = {
  kind: 'area'
  id: string
  /** 外接框：始终与轮廓一致（矩形区域就是它本身） */
  x: number
  y: number
  w: number
  h: number
  /** 多边形轮廓（场景坐标，至少 3 个顶点）；没有时就是外接框这个矩形 */
  poly?: Vec[]
  name: string
  areaType: string
  meta?: Record<string, unknown>
}

export type SheetObj = {
  kind: 'sheet'
  id: string
  sheetId: string
  name: string
  x: number
  y: number
  w: number
  h: number
  fileId: string | null
  /** 图纸图片在媒体库里的 ID */
  mediaId?: string | null
  /** 标定结果：每个场景单位代表的真实毫米数；null = 未标定 */
  mmPerUnit: number | null
  meta?: Record<string, unknown>
}

/** 引擎不认识的元素：沿用场景 JSON 的元素结构（x / y / width / height / angle / points / text / fileId …） */
export type RawEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle?: number
  [key: string]: unknown
}
export type RawObj = { kind: 'raw'; id: string; el: RawEl }

export type BoardObj = SymbolObj | AreaObj | SheetObj | RawObj

/** 画板文档：对象按图层绘制，同一图层内按数组顺序（后面的在上面） */
export type BoardDoc = { objects: BoardObj[] }

export type BoardFile = { id: string; dataURL: string; mimeType: string; created?: number }

export const layerOf = (o: BoardObj): LayerId => (o.kind === 'raw' ? 'shape' : o.kind)

/** 视口：屏幕坐标 = (场景坐标 + scroll) × zoom */
export type Viewport = { zoom: number; scrollX: number; scrollY: number }

export type BoardTool = 'select' | 'pan' | 'area' | 'calibrate'

export type SymbolStyle = 'plan' | 'marker'

/** 户型底图彩平风格：cad = 原始图纸；warm = 暖木彩平；modern = 现代极简彩平；blueprint = 工程蓝图 */
export type SheetStyle = 'cad' | 'warm' | 'modern' | 'blueprint'

/** 视图设置：只影响显示，不写进图纸数据 */
export type ViewSettings = {
  grid: boolean
  rulers: boolean
  labels: boolean
  /** plan = 平面符号（工具箱风格）；marker = 实心标记 */
  symbolStyle: SymbolStyle
  /** 固定显示尺寸的符号大小（场景单位，图形长边） */
  symbolSize: number
  /** 底图不透明度 0–1 */
  sheetOpacity: number
  /** 户型底图与房间分区的彩平风格化模式 */
  sheetStyle?: SheetStyle
  layers: Record<LayerId, boolean>
  /** 系统包辅助图层的开关（按图层 ID，例如信号覆盖圈、开关控灯关联） */
  overlays: Record<string, boolean>
}

/** 放置中的符号（点击 / 拖入画布时生成对象用的模板） */
export type SymbolTemplate = Pick<SymbolObj, 'symbolId' | 'sizeCm' | 'real' | 'data'> & {
  angle?: number
}
