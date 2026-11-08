/**
 * 智能选型：按项目主平台和档次，为每个设备类型挑一个默认型号。
 *
 * 1. 候选：在售、设备类型一致；优先有售价、有产品图的产品。
 * 2. 平台：按项目主平台逐级放宽（例如 Aqara Home：Aqara 品牌 → Apple Home / Matter → 通用 → 全部）。
 * 3. 档次：在候选里按售价取分位（经济 20%、标准 50%、高端 85%）。
 * 4. 品牌统一：同一类别里尽量用同一个品牌（价格相差不超过 40% 时换成主品牌）。
 */
import { categoryOfType } from '@/lib/device-types'

export const SELECTION_TIERS = [
  { value: 'economy', label: '经济', percentile: 0.2 },
  { value: 'standard', label: '标准', percentile: 0.5 },
  { value: 'premium', label: '高端', percentile: 0.85 },
] as const
export type SelectionTier = (typeof SELECTION_TIERS)[number]['value']
export const isSelectionTier = (v: unknown): v is SelectionTier =>
  SELECTION_TIERS.some((t) => t.value === v)

export type SelectableProduct = {
  id: string
  name: string
  price: number
  status?: string
  deviceType: string | null
  platforms: string[]
  brand: { name: string } | null
  image: unknown
}

type Pref = { brands?: RegExp; platforms?: string[] }
/** 项目主平台 → 逐级放宽的候选条件 */
export const PLATFORM_PREFS: Record<string, Pref[]> = {
  米家: [{ platforms: ['米家'] }, { platforms: ['通用', 'Matter'] }],
  'Aqara Home': [
    { brands: /aqara/i },
    { platforms: ['Apple Home', 'Matter'] },
    { platforms: ['通用'] },
  ],
  'Apple Home': [{ platforms: ['Apple Home', 'Matter'] }, { platforms: ['通用'] }],
  华为鸿蒙智家: [{ platforms: ['华为'] }, { platforms: ['通用'] }],
  KNX: [{ platforms: ['KNX'] }, { platforms: ['通用'] }],
  Control4: [{ platforms: ['通用'] }],
  '网络/弱电': [{ platforms: ['通用'] }],
}

const matches = (p: SelectableProduct, pref: Pref) =>
  (!pref.brands || pref.brands.test(p.brand?.name ?? '')) &&
  (!pref.platforms || p.platforms.some((x) => pref.platforms!.includes(x)))

function candidates(
  all: SelectableProduct[],
  deviceType: string,
  platform: string | null | undefined,
) {
  let pool = all.filter((p) => (p.status ?? 'active') === 'active' && p.deviceType === deviceType)
  if (!pool.length) return { pool, level: -1 }
  const priced = pool.filter((p) => p.price > 0)
  if (priced.length) pool = priced
  const withImage = pool.filter((p) => !!p.image)
  if (withImage.length) pool = withImage
  const prefs = (platform && PLATFORM_PREFS[platform]) || []
  for (const [level, pref] of prefs.entries()) {
    const hit = pool.filter((p) => matches(p, pref))
    if (hit.length) return { pool: hit, level }
  }
  return { pool, level: prefs.length }
}

const pickAt = (pool: SelectableProduct[], percentile: number) => {
  const sorted = pool.slice().sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
  return sorted[Math.round(percentile * (sorted.length - 1))]
}

export type SelectionResult = {
  deviceType: string
  product: SelectableProduct
  platformMatched: boolean
}

export function autoSelectProducts(
  all: SelectableProduct[],
  deviceTypes: string[],
  opts: { platform?: string | null; tier: SelectionTier },
) {
  const percentile = SELECTION_TIERS.find((t) => t.value === opts.tier)?.percentile ?? 0.5
  const prefs = (opts.platform && PLATFORM_PREFS[opts.platform]) || []
  const chosen = new Map<string, SelectionResult>()
  const pools = new Map<string, SelectableProduct[]>()
  const missing: string[] = []
  for (const t of deviceTypes) {
    const { pool, level } = candidates(all, t, opts.platform)
    if (!pool.length) {
      missing.push(t)
      continue
    }
    pools.set(t, pool)
    chosen.set(t, {
      deviceType: t,
      product: pickAt(pool, percentile),
      platformMatched: prefs.length === 0 || level < prefs.length,
    })
  }
  // 品牌统一：每个类别找出用得最多的品牌，价格相近时把其他类型也换成这个品牌
  const byCategory = new Map<string, SelectionResult[]>()
  for (const r of chosen.values()) {
    const c = categoryOfType(r.deviceType)?.slug ?? 'other'
    byCategory.set(c, [...(byCategory.get(c) ?? []), r])
  }
  for (const rows of byCategory.values()) {
    if (rows.length < 2) continue
    const counts = new Map<string, number>()
    for (const r of rows)
      counts.set(r.product.brand?.name ?? '', (counts.get(r.product.brand?.name ?? '') ?? 0) + 1)
    const [main] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!main) continue
    for (const r of rows) {
      if (r.product.brand?.name === main) continue
      const alt = (pools.get(r.deviceType) ?? []).filter((p) => p.brand?.name === main)
      if (!alt.length) continue
      const best = alt.reduce((a, b) =>
        Math.abs(b.price - r.product.price) < Math.abs(a.price - r.product.price) ? b : a,
      )
      if (Math.abs(best.price - r.product.price) <= Math.max(30, r.product.price * 0.4))
        chosen.set(r.deviceType, { ...r, product: best })
    }
  }
  return { chosen: [...chosen.values()], missing }
}
