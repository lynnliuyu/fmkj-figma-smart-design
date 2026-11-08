/**
 * 内置示例项目的户型与点位（demo-project.ts 用来生成示例项目的点位图）。
 * 只是生成用的原始数据，不读写数据库。
 */
import { categoryOfType } from '@/lib/device-types'

/** 户型图画布尺寸（SVG viewBox） */
export const PLAN_W = 800
export const PLAN_H = 500

/** 房间矩形与标注位置（lx / ly 为房间名所在位置） */
export type PlanRoom = {
  name: string
  area?: string
  x: number
  y: number
  w: number
  h: number
  lx: number
  ly: number
  accent?: boolean
}

export const PLAN_ROOMS: PlanRoom[] = [
  { name: '主卧', area: '16.8㎡', x: 20, y: 20, w: 250, h: 200, lx: 130, ly: 192 },
  { name: '主卫', x: 270, y: 20, w: 100, h: 110, lx: 305, ly: 104 },
  { name: '衣帽间', x: 270, y: 130, w: 100, h: 90, lx: 320, ly: 196 },
  { name: '次卧', area: '12.6㎡', x: 370, y: 20, w: 190, h: 200, lx: 470, ly: 192 },
  { name: '书房', area: '13.2㎡', x: 560, y: 20, w: 220, h: 200, lx: 670, ly: 192 },
  { name: '厨房', x: 20, y: 220, w: 180, h: 150, lx: 150, ly: 356 },
  { name: '卫生间', x: 20, y: 370, w: 180, h: 110, lx: 64, ly: 404 },
  { name: '餐厅', x: 200, y: 220, w: 200, h: 160, lx: 300, ly: 366 },
  { name: '玄关', x: 200, y: 380, w: 200, h: 100, lx: 300, ly: 432 },
  { name: '客厅', area: '32.5㎡', x: 400, y: 220, w: 380, h: 190, lx: 448, ly: 332, accent: true },
  { name: '阳台', x: 400, y: 410, w: 380, h: 70, lx: 610, ly: 452 },
]

/** [设备类型, x, y]，坐标与户型图画布一致 */
const RAW_POINTS: [string, number, number][] = [
  // 主卧
  ['ceiling-light', 130, 120],
  ['downlight', 56, 56],
  ['downlight', 214, 56],
  ['curtain-track', 130, 34],
  ['switch-2', 256, 196],
  ['socket-double', 34, 150],
  ['temp-sensor', 252, 120],
  // 主卫、衣帽间
  ['downlight', 345, 48],
  ['water-sensor', 350, 112],
  ['light-strip', 320, 150],
  // 次卧
  ['ceiling-light', 470, 125],
  ['curtain-track', 470, 34],
  ['switch-1', 436, 204],
  ['socket', 546, 150],
  // 书房
  ['curtain-track', 670, 32],
  ['spotlight', 610, 120],
  ['spotlight', 730, 120],
  ['ap-node', 764, 64],
  ['switch-2', 626, 204],
  ['light-strip', 670, 160],
  // 厨房、卫生间
  ['smoke-sensor', 120, 272],
  ['downlight', 110, 318],
  ['socket-usb', 184, 262],
  ['water-sensor', 64, 352],
  ['motion-sensor', 120, 400],
  ['water-sensor', 176, 462],
  // 餐厅、玄关
  ['pendant-light', 300, 300],
  ['spotlight', 230, 245],
  ['spotlight', 370, 245],
  ['switch-3', 386, 300],
  ['camera', 214, 394],
  ['switch-4', 236, 450],
  ['smart-lock', 322, 466],
  // 客厅、阳台
  ['gateway', 585, 307],
  ['touch-panel', 414, 300],
  ['downlight', 450, 250],
  ['downlight', 735, 250],
  ['downlight', 450, 392],
  ['downlight', 735, 392],
  ['light-strip', 590, 236],
  ['speaker', 500, 300],
  ['speaker', 680, 300],
  ['vrf-controller', 764, 236],
  ['ap-node', 764, 330],
  ['curtain-track', 590, 404],
  ['wall-light', 520, 445],
  ['camera', 700, 445],
]

export type PlanPoint = {
  id: string
  type: string
  x: number
  y: number
  code: string
  category: string
}

/** 点位：代号按「类别代码 + 序号」自动编号，与点位图画布的规则一致 */
export const PLAN_POINTS: PlanPoint[] = (() => {
  const seq = new Map<string, number>()
  return RAW_POINTS.map(([type, x, y], i) => {
    const category = categoryOfType(type)
    const prefix = category?.code ?? 'Q'
    const n = (seq.get(prefix) ?? 0) + 1
    seq.set(prefix, n)
    return {
      id: `pt-${i}`,
      type,
      x,
      y,
      code: `${prefix}${String(n).padStart(2, '0')}`,
      category: category?.slug ?? 'other',
    }
  })
})()
