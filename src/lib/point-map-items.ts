import { isDeviceType } from '@/lib/device-types'

/**
 * 点位 → 产品的统一解析规则（点位图统计、生成报价共用）：
 *   1. 点位指定了在售产品 → 用指定产品；
 *   2. 否则用项目默认型号（必须在售且设备类型一致）；
 *   3. 都没有 → 记为「待选型」，不计入金额。
 * 旧点位只有 productId、没有 deviceType 时，设备类型取自产品。
 */

export type PointCustomData = { deviceType?: unknown; productId?: unknown; pointCode?: unknown; categorySlug?: unknown }
export type ResolvableProduct = { id: string; deviceType: string | null; status?: string }
export type ProjectDefaults = Record<string, string>

export function parseDefaults(value: unknown): ProjectDefaults {
  const out: ProjectDefaults = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value)) if (isDeviceType(k) && typeof v === 'string' && v) out[k] = v
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

export type ResolvedPoint = { deviceType: string; productId: string | null; source: 'point' | 'default' | 'pending' }

export function resolvePoint(cd: PointCustomData, byId: Map<string, ResolvableProduct>, defaults: ProjectDefaults): ResolvedPoint {
  const deviceType = pointDeviceType(cd, byId)
  const own = typeof cd.productId === 'string' ? byId.get(cd.productId) : undefined
  if (own && (own.status ?? 'active') === 'active') return { deviceType, productId: own.id, source: 'point' }
  const def = defaults[deviceType] ? byId.get(defaults[deviceType]) : undefined
  if (def && (def.status ?? 'active') === 'active' && def.deviceType === deviceType) return { deviceType, productId: def.id, source: 'default' }
  return { deviceType, productId: null, source: 'pending' }
}

/** 汇总：每个产品的数量（及其中来自默认型号的数量），以及各设备类型的待选型数量 */
export function summarizePoints(points: PointCustomData[], byId: Map<string, ResolvableProduct>, defaults: ProjectDefaults) {
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
  return { products, pending, byType, pendingTotal: [...pending.values()].reduce((s, n) => s + n, 0) }
}
