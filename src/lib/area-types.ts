/**
 * 区域（房间）类型：点位图上画出的区域会按名称自动归类，方案里的区域分析按类型给建议。
 */
export const AREA_TYPES = [
  { value: 'entrance', label: '玄关', keywords: /玄关|门厅|入户/ },
  { value: 'living', label: '客厅', keywords: /客厅|起居|会客/ },
  { value: 'dining', label: '餐厅', keywords: /餐厅|餐/ },
  { value: 'kitchen', label: '厨房', keywords: /厨房|厨|西厨|中厨/ },
  { value: 'bedroom', label: '卧室', keywords: /卧|客房|房间|老人房/ },
  { value: 'kids', label: '儿童房', keywords: /儿童|小孩|男孩|女孩/ },
  { value: 'study', label: '书房', keywords: /书房|工作室|办公/ },
  { value: 'bathroom', label: '卫生间', keywords: /卫|洗手间|浴室|厕|淋浴/ },
  { value: 'balcony', label: '阳台', keywords: /阳台|露台|花园|晾晒/ },
  { value: 'corridor', label: '过道', keywords: /过道|走廊|走道|廊/ },
  { value: 'stairs', label: '楼梯', keywords: /楼梯|梯/ },
  { value: 'closet', label: '衣帽间', keywords: /衣帽|衣柜间|更衣/ },
  { value: 'theater', label: '影音室', keywords: /影音|影院|视听/ },
  { value: 'leisure', label: '休闲区', keywords: /茶室|休闲|棋牌|健身|娱乐/ },
  { value: 'garage', label: '车库', keywords: /车库/ },
  { value: 'utility', label: '设备间', keywords: /设备|储藏|杂物|洗衣|家政/ },
  { value: 'other', label: '其他', keywords: /$^/ },
] as const

export type AreaType = (typeof AREA_TYPES)[number]['value']

const byValue = new Map<string, (typeof AREA_TYPES)[number]>(AREA_TYPES.map((t) => [t.value, t]))

export const isAreaType = (v: unknown): v is AreaType => typeof v === 'string' && byValue.has(v)
export const areaTypeLabel = (v: string | null | undefined) =>
  (v && byValue.get(v)?.label) || '其他'

/** 按区域名称推断类型，例如「主卧卫生间」→ 卫生间（越具体的词越靠前判断）。 */
export function inferAreaType(name: string): AreaType {
  const order: AreaType[] = [
    'bathroom',
    'closet',
    'kids',
    'study',
    'theater',
    'leisure',
    'kitchen',
    'dining',
    'living',
    'bedroom',
    'entrance',
    'balcony',
    'stairs',
    'corridor',
    'garage',
    'utility',
  ]
  for (const v of order) if (byValue.get(v)!.keywords.test(name)) return v
  return 'other'
}
