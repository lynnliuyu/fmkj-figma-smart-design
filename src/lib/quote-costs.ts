/**
 * 报价内部成本与毛利核算（仅设计师在报价台可见，不打印、不出现在分享页）。
 *
 * 单个产品的成本按以下顺序取值：
 * 1. 设计师在「设置 → 报价成本与毛利」里给该品牌设置的拿货折扣（产品库零售价 × 折扣）；
 * 2. 产品库里维护的成本价；
 * 3. 默认拿货折扣（零售价 × 默认折扣）；
 * 都没有时记为「未设置成本」，不计入成本合计并提示。
 * 附加费用（安装调试、布线等）按「附加费用成本占比」计入人工成本。
 */

export type BrandCostRate = { brand: string; rate: number }
export type CostSettings = {
  /** 按品牌（品牌标识 slug）的拿货折扣，0.05–1（0.65 = 6.5 折） */
  brandRates: BrandCostRate[]
  /** 其余品牌的默认拿货折扣；null = 不估算 */
  defaultRate: number | null
  /** 附加费用中的人工 / 辅材成本占比（%） */
  feeCostPercent: number
  /** 毛利率底线（%）：低于它时报价台显示预警，并据此计算底线价 */
  minMarginPercent: number
}

export const DEFAULT_COST_SETTINGS: CostSettings = {
  brandRates: [],
  defaultRate: null,
  feeCostPercent: 0,
  minMarginPercent: 25,
}
export const RATE_MIN = 0.05
export const RATE_MAX = 1

const round2 = (n: number) => Math.round(n * 100) / 100
const clampNum = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
}

/** 解析存储的设置（缺失或损坏的部分回退默认值；同一品牌只保留最后一条） */
export function parseCostSettings(raw: unknown): CostSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_COST_SETTINGS }
  const r = raw as Record<string, unknown>
  const byBrand = new Map<string, number>()
  if (Array.isArray(r.brandRates)) {
    for (const item of r.brandRates.slice(0, 200)) {
      const b = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
      const brand = typeof b?.brand === 'string' ? b.brand.trim().slice(0, 80) : ''
      const rate = clampNum(b?.rate, RATE_MIN, RATE_MAX)
      if (brand && rate !== null) byBrand.set(brand, round2(rate * 1000) / 1000)
    }
  }
  const defaultRate =
    r.defaultRate === null || r.defaultRate === undefined || r.defaultRate === ''
      ? null
      : clampNum(r.defaultRate, RATE_MIN, RATE_MAX)
  return {
    brandRates: [...byBrand].map(([brand, rate]) => ({ brand, rate })),
    defaultRate: defaultRate === null ? null : round2(defaultRate * 1000) / 1000,
    feeCostPercent: clampNum(r.feeCostPercent, 0, 100) ?? DEFAULT_COST_SETTINGS.feeCostPercent,
    minMarginPercent: clampNum(r.minMarginPercent, 0, 90) ?? DEFAULT_COST_SETTINGS.minMarginPercent,
  }
}

/** 折扣显示：0.65 → 「6.5 折」 */
export const rateLabel = (rate: number) => `${round2(rate * 10).toString()} 折`

export type CostSource = 'brand' | 'catalog' | 'default'
export type UnitCost = { cost: number; source: CostSource; rate?: number }
export type CostProduct = {
  id: string
  price: number
  cost?: number | null
  brandSlug?: string | null
}

/** 一个产品的单位成本（找不到依据时返回 null） */
export function unitCostOf(
  product: CostProduct | undefined,
  settings: CostSettings,
): UnitCost | null {
  if (!product) return null
  const brandRate = product.brandSlug
    ? settings.brandRates.find((b) => b.brand === product.brandSlug)?.rate
    : undefined
  if (brandRate !== undefined && product.price > 0)
    return { cost: round2(product.price * brandRate), source: 'brand', rate: brandRate }
  if (typeof product.cost === 'number' && Number.isFinite(product.cost) && product.cost >= 0)
    return { cost: product.cost, source: 'catalog' }
  if (settings.defaultRate !== null && product.price > 0)
    return {
      cost: round2(product.price * settings.defaultRate),
      source: 'default',
      rate: settings.defaultRate,
    }
  return null
}

export type MarginLine = { product: string | null; quantity: number }
export type MarginSummary = {
  productCost: number
  feeCost: number
  cost: number
  revenue: number
  profit: number
  /** 毛利率 0–1（营收为 0 时为 0） */
  rate: number
  /** 未能确定成本的明细行数 */
  missing: number
  /** 保持毛利率底线时的最低成交价 */
  floorPrice: number
  /** 当前报价还能让利多少仍不低于底线（负数 = 已低于底线） */
  headroom: number
  belowFloor: boolean
  sources: Record<CostSource, number>
}

/** 整单毛利：营收取报价总额（含附加费用、扣除优惠），成本 = 产品成本 + 附加费用 × 成本占比 */
export function marginSummary(
  lines: MarginLine[],
  products: Map<string, CostProduct>,
  feeTotal: number,
  revenue: number,
  settings: CostSettings,
): MarginSummary {
  let productCost = 0
  let missing = 0
  const sources: Record<CostSource, number> = { brand: 0, catalog: 0, default: 0 }
  for (const l of lines) {
    const u = unitCostOf(l.product ? products.get(l.product) : undefined, settings)
    if (!u) {
      missing++
      continue
    }
    productCost += u.cost * (l.quantity || 0)
    sources[u.source]++
  }
  const feeCost = (Math.max(0, feeTotal) * settings.feeCostPercent) / 100
  const cost = round2(productCost + feeCost)
  const profit = round2(revenue - cost)
  const rate = revenue > 0 ? profit / revenue : 0
  const min = settings.minMarginPercent / 100
  const floorPrice = round2(min < 1 ? cost / (1 - min) : cost)
  const headroom = round2(revenue - floorPrice)
  return {
    productCost: round2(productCost),
    feeCost: round2(feeCost),
    cost,
    revenue,
    profit,
    rate,
    missing,
    floorPrice,
    headroom,
    belowFloor: revenue > 0 && headroom < -0.005,
    sources,
  }
}
