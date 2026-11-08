import type { PointDisplayEffect } from '@/lib/point-display-effects'

import type { PaperId } from './paper'
import type { SymbolLook } from './symbols'
import type { BoardDoc, LayerId, SymbolObj, Vec } from './types'

export type CheckLevel = 'error' | 'warning' | 'info'

/** 检查结果：点击可定位到 targets（对象 ID） */
export type CheckIssue = {
  id: string
  level: CheckLevel
  title: string
  detail?: string
  targets: string[]
}

export type LegendRow = { key: string; label: string; count: number; look: SymbolLook }

/** 辅助图层的通用图形（场景坐标）：引擎只负责画，含义由系统包决定 */
export type OverlayCircle = {
  id: string
  x: number
  y: number
  r: number
  color: string
  label?: string
  estimated?: boolean
}
export type OverlayLink = { id: string; from: Vec; to: Vec; color: string }
/** 需要关注的点（例如没有开关控制的灯具）：画一个醒目的提示圈 */
export type OverlayMark = { id: string; x: number; y: number; color: string; title?: string }
export type OverlayShapes = {
  circles?: OverlayCircle[]
  links?: OverlayLink[]
  marks?: OverlayMark[]
  effects?: PointDisplayEffect[]
}

/** 系统包提供的智能辅助图层（只影响显示，不写进图纸；在「显示与隐藏」里开关） */
export type PackOverlay = {
  id: string
  name: string
  hint: string
  build: (doc: BoardDoc) => OverlayShapes
}

/**
 * 系统包：一个专业（智能家居点位、灯光、平面家居、暖通、给排水……）的全部业务知识。
 * 引擎只通过这个接口和业务打交道：符号怎么画、图例怎么出、要检查什么、导出用什么模板。
 */
export type SystemPack = {
  id: string
  name: string
  /** 默认纸张和比例 */
  paper: PaperId
  scale: number
  /** 图层名称（引擎的通用图层 → 本专业的叫法） */
  layers: { id: LayerId; name: string }[]
  /** 解释符号：名称、颜色、平面符号、实心标记 */
  look: (o: Pick<SymbolObj, 'symbolId' | 'data'>) => SymbolLook
  /** 图纸检查 */
  check: (doc: BoardDoc) => CheckIssue[]
  /** 图例（按 look.key 汇总） */
  legend: (doc: BoardDoc) => LegendRow[]
  /** 导出模板 */
  export: { title: string; note: string }
  /** 智能辅助图层（可选） */
  overlays?: PackOverlay[]
}
