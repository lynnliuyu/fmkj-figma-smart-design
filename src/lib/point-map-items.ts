import { DEVICE_TYPE_ORDER, isDeviceType } from '@/lib/device-types'
import {
  autoSelectProducts,
  type SelectableProduct,
  type SelectionTier,
} from '@/plugins/smart-select/auto-select'

/**
 * 点位 → 产品的统一解析规则（点位图统计、生成报价共用）：
 *   1. 点位指定了同设备类型的在售产品 → 用指定产品；
 *   2. 否则用项目默认型号（必须在售且设备类型一致）；
 *   3. 否则自动从产品库挑选该设备类型的在售默认产品（到报价台再按需更换型号）；
 *   4. 产品库中该设备类型没有任何在售产品时 → 记为「待选型」。
 * 旧点位只有 productId、没有 deviceType 时，设备类型取自产品。
 */

/** 点位 customData；symbolId / sizeCm / real 是画板新增的可选字段（灯光款式、真实尺寸、按比例落图），报价不使用 */
export type PointCustomData = {
  deviceType?: unknown
  productId?: unknown
  pointCode?: unknown
  categorySlug?: unknown
  symbolId?: unknown
  sizeCm?: unknown
  real?: unknown
}
export type ResolvableProduct = {
  id: string
  deviceType: string | null
  status?: string
  price?: number
  image?: unknown
}
export type ProjectDefaults = Record<string, string>

export function parseDefaults(value: unknown): ProjectDefaults {
  const out: ProjectDefaults = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value))
    if (isDeviceType(k) && typeof v === 'string' && v) out[k] = v
  return out
}

/**
 * 为尚未配置默认型号的设备类型自动补全产品库默认型号（优先按项目主平台和标准档位匹配），
 * 使点位图无需配置产品型号，进入报价台即可直接看到完整明细并更换型号。
 */
export function fillDefaultProducts(
  defaults: ProjectDefaults,
  catalog: SelectableProduct[],
  platform?: string | null,
  tier: SelectionTier = 'standard',
): ProjectDefaults {
  const out: ProjectDefaults = { ...defaults }
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const missing = DEVICE_TYPE_ORDER.filter((t) => {
    const id = out[t]
    const p = id ? byId.get(id) : undefined
    return !p || (p.status ?? 'active') !== 'active' || p.deviceType !== t
  })
  if (!missing.length) return out
  const { chosen } = autoSelectProducts(catalog, missing, { platform, tier })
  for (const c of chosen) out[c.deviceType] = c.product.id
  return out
}

/** 是否是点位元素（新点位带 deviceType，旧点位带 productId） */
export const isPointData = (cd: PointCustomData | undefined | null) =>
  Boolean(cd && (isDeviceType(cd.deviceType) || (typeof cd.productId === 'string' && cd.productId)))

export function pointDeviceType(cd: PointCustomData, byId: Map<string, ResolvableProduct>): string {
  if (isDeviceType(cd.deviceType)) return cd.deviceType
  const p = typeof cd.productId === 'string' ? byId.get(cd.productId) : undefined
  return p?.deviceType && isDeviceType(p.deviceType) ? p.deviceType : 'other'
}

export type ResolvedPoint = {
  deviceType: string
  productId: string | null
  source: 'point' | 'default' | 'pending'
}

export function resolvePoint(
  cd: PointCustomData,
  byId: Map<string, ResolvableProduct>,
  defaults: ProjectDefaults,
): ResolvedPoint {
  const deviceType = pointDeviceType(cd, byId)
  const own = typeof cd.productId === 'string' ? byId.get(cd.productId) : undefined
  if (own && (own.status ?? 'active') === 'active' && own.deviceType === deviceType)
    return { deviceType, productId: own.id, source: 'point' }
  const def = defaults[deviceType] ? byId.get(defaults[deviceType]) : undefined
  if (def && (def.status ?? 'active') === 'active' && def.deviceType === deviceType)
    return { deviceType, productId: def.id, source: 'default' }
  // 未配置项目默认型号时，自动兜底同设备类型的在售产品（优先有价格、有图片）
  let fallback: ResolvableProduct | undefined
  for (const p of byId.values()) {
    if ((p.status ?? 'active') !== 'active' || p.deviceType !== deviceType) continue
    if (!fallback) {
      fallback = p
      continue
    }
    const fbHasPrice = (fallback.price ?? 0) > 0
    const curHasPrice = (p.price ?? 0) > 0
    if (!fbHasPrice && curHasPrice) {
      fallback = p
      continue
    }
    if (fbHasPrice === curHasPrice && !fallback.image && p.image) {
      fallback = p
    }
  }
  if (fallback) return { deviceType, productId: fallback.id, source: 'default' }
  return { deviceType, productId: null, source: 'pending' }
}

/** 汇总：每个产品的数量（及其中来自默认型号的数量），以及各设备类型的待选型数量 */
export function summarizePoints(
  points: PointCustomData[],
  byId: Map<string, ResolvableProduct>,
  defaults: ProjectDefaults,
) {
  const products = new Map<string, { count: number; fromDefault: number; deviceType: string }>()
  const pending = new Map<string, number>()
  const byType = new Map<string, number>()
  for (const cd of points) {
    const r = resolvePoint(cd, byId, defaults)
    byType.set(r.deviceType, (byType.get(r.deviceType) ?? 0) + 1)
    if (!r.productId) {
      pending.set(r.deviceType, (pending.get(r.deviceType) ?? 0) + 1)
      continue
    }
    const row = products.get(r.productId) ?? { count: 0, fromDefault: 0, deviceType: r.deviceType }
    row.count++
    if (r.source === 'default') row.fromDefault++
    products.set(r.productId, row)
  }
  return {
    products,
    pending,
    byType,
    pendingTotal: [...pending.values()].reduce((s, n) => s + n, 0),
  }
}
