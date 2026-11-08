import { relId } from '@/lib/access'
import { pointIconArt } from '@/board/packs/smart-home/look'
import { areaTypeLabel } from '@/lib/area-types'
import { resolveMediaUrl, type CatalogProduct } from '@/lib/cached-data'
import { contractStatusLabel, paymentAmounts, rmbUpper } from '@/lib/contracts'
import { categoryOfType, deviceTypeOf, DEVICE_TYPE_ORDER } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import { countScenePoints } from '@/lib/point-count'
import { markerUrl } from '@/lib/point-markers'
import type { ProjectDocsData } from '@/lib/project-docs'
import { projectProgress, statusLabel } from '@/lib/projects'
import { quoteStatusLabel } from '@/lib/quotes'
import type { Contract, Media, Project, Quote, User } from '@/payload-types'
import { planAreaOf } from '@/lib/point-scene'

/** 小程序接口的数据形状：只返回界面需要的字段，图片和图标都是站内相对地址（小程序拼上域名）。 */

export const presentType = (t: string | null | undefined) => {
  const type = t || 'other'
  const cat = categoryOfType(type)
  return {
    value: type,
    name: deviceTypeOf(type)?.name ?? '其他设备',
    category: cat?.name ?? '其他',
    color: cat?.color ?? '#525252',
    marker: pointIconArt(type)?.src ?? markerUrl(type),
  }
}

export function presentProduct(p: CatalogProduct, detail = false) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price,
    cost: p.cost,
    unit: p.unit,
    status: p.status,
    type: presentType(p.deviceType),
    brand: p.brand?.name ?? null,
    brandLogo: p.brand?.logo ?? null,
    image: p.image?.url ?? null,
    platforms: p.platforms,
    ...(detail ? { description: p.description, stock: p.stock, tags: p.tags } : {}),
  }
}

type ProjectLike = Pick<Project, 'id' | 'name' | 'status'> & Partial<Project>

/** 早期项目还没有「点位数」统计值：和网页一样，临时从点位图计算（下次保存点位图时写入）。 */
export async function fillPointCounts<
  T extends { id: string | number; pointCount?: number | null },
>(docs: T[], user: User): Promise<T[]> {
  const missing = docs.filter((d) => d.pointCount == null).map((d) => d.id)
  if (!missing.length) return docs
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'projects',
    where: { id: { in: missing } },
    limit: missing.length,
    depth: 0,
    user,
    overrideAccess: false,
    select: { pointMap: true },
  })
  const counts = new Map(res.docs.map((p) => [String(p.id), countScenePoints(p.pointMap)]))
  return docs.map((d) =>
    d.pointCount == null ? { ...d, pointCount: counts.get(String(d.id)) ?? 0 } : d,
  )
}

export function presentProject(
  p: ProjectLike,
  extra: { quoteCount: number; contractStatus?: string | null; pointCount?: number | null },
) {
  const progress = projectProgress({
    status: p.status,
    pointCount: extra.pointCount ?? p.pointCount,
    quoteCount: extra.quoteCount,
    contractStatus: extra.contractStatus,
  })
  return {
    id: String(p.id),
    name: p.name,
    customerName: p.customerName ?? null,
    customerPhone: p.customerPhone ?? null,
    community: p.community ?? null,
    address: p.address ?? null,
    platform: p.platform ?? null,
    budget: p.budget ?? null,
    notes: p.notes ?? null,
    status: p.status ?? 'active',
    statusLabel: statusLabel(p.status),
    pointCount: extra.pointCount ?? p.pointCount ?? 0,
    archivedAt: p.archivedAt ?? null,
    updatedAt: p.updatedAt ?? null,
    progress,
  }
}

export const presentQuoteSummary = (q: Pick<Quote, 'id' | 'title'> & Partial<Quote>) => ({
  id: String(q.id),
  title: q.title,
  status: q.status ?? 'draft',
  statusLabel: quoteStatusLabel(q.status),
  total: q.total ?? 0,
  updatedAt: q.updatedAt ?? null,
})

const mediaUrl = (v: unknown) => (v && typeof v === 'object' ? resolveMediaUrl(v as Media) : null)

export function presentQuote(q: Quote) {
  return {
    ...presentQuoteSummary(q),
    projectId: relId(q.project),
    discount: q.discount ?? 0,
    notes: q.notes ?? '',
    productTotal: q.productTotal ?? 0,
    feeTotal: q.feeTotal ?? 0,
    items: (q.items ?? []).map((i) => ({
      id: i.id ?? null,
      product: relId(i.product),
      type: presentType(i.deviceType),
      image: mediaUrl(i.image),
      name: i.name,
      sku: i.sku ?? '',
      unit: i.unit ?? '',
      price: i.price,
      quantity: i.quantity,
    })),
    fees: (q.fees ?? []).map((f) => ({ id: f.id ?? null, name: f.name, amount: f.amount })),
  }
}

export function presentContract(c: Contract) {
  const amount = c.amount ?? 0
  const amounts = paymentAmounts(amount, c.payments ?? [])
  return {
    id: String(c.id),
    number: c.number,
    status: c.status ?? 'draft',
    statusLabel: contractStatusLabel(c.status),
    signedAt: c.signedAt ?? null,
    projectId: relId(c.project),
    quoteId: relId(c.quote),
    amount,
    amountUpper: rmbUpper(amount),
    customerName: c.customerName ?? '',
    customerPhone: c.customerPhone ?? '',
    address: c.address ?? '',
    durationDays: c.durationDays ?? null,
    warrantyMonths: c.warrantyMonths ?? null,
    terms: c.terms ?? '',
    payments: (c.payments ?? []).map((p, i) => ({
      id: p.id ?? null,
      name: p.name,
      percent: p.percent,
      received: Boolean(p.received),
      amount: amounts[i] ?? 0,
    })),
  }
}

/** 点位图：图纸、区域（比例矩形）、点位（比例坐标）、图例和房间配置。 */
export function presentPointMap(d: ProjectDocsData) {
  const sheetById = new Map(d.sheets.map((s) => [s.id, s]))
  const productOf = (id: string | null) => (id ? (d.productById.get(id) ?? null) : null)
  return {
    sheets: d.sheets.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      index: s.index,
      pointCount: d.points.filter((p) => p.sheetId === s.id).length,
    })),
    areas: d.areas
      .filter((a) => a.sheetId && sheetById.has(a.sheetId))
      .map((a) => {
        const s = sheetById.get(a.sheetId!)!
        // poly：多边形区域的轮廓（比例坐标）；旧版小程序只读外接框 x0–y1，照常显示
        return { ...planAreaOf(a, s), typeLabel: areaTypeLabel(a.areaType), sheetId: a.sheetId }
      }),
    points: d.points.map((p) => {
      const prod = productOf(p.productId)
      return {
        id: p.id,
        code: p.code,
        sheetId: p.sheetId,
        areaId: p.areaId,
        rx: p.rx,
        ry: p.ry,
        source: p.source,
        type: presentType(p.deviceType),
        product: prod
          ? {
              id: prod.id,
              name: prod.name,
              price: prod.price,
              image: prod.image?.url ?? null,
              brand: prod.brand?.name ?? null,
            }
          : null,
      }
    }),
    legend: DEVICE_TYPE_ORDER.filter((t) => d.points.some((p) => p.deviceType === t)).map((t) => {
      const pts = d.points.filter((p) => p.deviceType === t)
      const prod = productOf(pts.find((p) => p.productId)?.productId ?? null)
      return {
        ...presentType(t),
        count: pts.length,
        product: prod?.name ?? null,
        subtotal: pts.reduce((s, p) => s + (productOf(p.productId)?.price ?? 0), 0),
      }
    }),
    rooms: d.rooms.map((r) => ({
      id: r.areaId,
      name: r.displayName,
      floor: r.floorName,
      typeLabel: r.typeLabel,
      points: r.total,
      subtotal: r.subtotal,
      score: r.score,
      lines: r.lines.map((l) => ({
        type: presentType(l.deviceType),
        product: l.product?.name ?? null,
        count: l.count,
        subtotal: l.subtotal,
      })),
    })),
    summary: {
      points: d.points.length,
      rooms: d.rooms.length,
      sheets: d.sheets.length,
      total: d.total,
      pending: d.pending,
      categories: d.categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        color: c.color,
        count: c.count,
        amount: c.amount,
      })),
    },
    quote: d.quote
      ? { id: String(d.quote.id), title: d.quote.title, total: d.quote.total ?? 0 }
      : null,
  }
}
