import { APIError, ValidationError } from 'payload'

import { relId } from '@/lib/access'
import { getCatalog, getCompanyInfo } from '@/lib/cached-data'
import { DEVICE_TYPE_ORDER } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import {
  fillDefaultProducts,
  isPointData,
  parseDefaults,
  pointDeviceType,
  summarizePoints,
  type PointCustomData,
} from '@/lib/point-map-items'
import {
  inferScopeFromTitle,
  inPointScope,
  isPointScope,
  POINT_SCOPES,
  type PointScope,
} from '@/lib/point-scopes'
import { isPositiveQuotePrice, QUOTE_STATUSES, requiresManualQuotePrice } from '@/lib/quotes'
import type { Media, User } from '@/payload-types'

/**
 * 报价业务规则（网页 Server Action 和小程序接口共用）。
 * 所有读写都按传入成员的权限执行（overrideAccess: false），归档、合同锁定等规则由集合 hook 保证。
 */

/** 把保存失败的原因转成可以直接显示给用户的文字。 */
export function quoteFailure(error: unknown, fallback: string) {
  if (error instanceof ValidationError) return '有字段未通过校验，请检查后重试'
  if (error instanceof APIError && error.status < 500) return error.message
  const code = (error as { status?: number })?.status
  if (code === 403) return '没有权限修改该报价'
  if (code === 404) return '报价不存在或已被删除'
  console.error('[quotes]', fallback, error)
  return fallback
}

const mediaId = (v: unknown) =>
  v && typeof v === 'object' ? String((v as Media).id) : typeof v === 'string' ? v : null
const scopeSuffix = (scope: PointScope) =>
  scope === 'all' ? '' : `（${POINT_SCOPES.find((s) => s.value === scope)!.label}）`

/** 新报价的默认名称：「项目名 智能家居报价」，第二份起加「第 N 版」（打印报价单的标题直接用它） */
function defaultQuoteTitle(projectName: string | null | undefined, n: number) {
  const name =
    (projectName ?? '')
      .replace(/^【[^】]*】/, '')
      .trim()
      .slice(0, 80) || '项目'
  return `${name}${/智能/.test(name) ? '' : ' 智能家居'}报价${n > 1 ? ` · 第${n}版` : ''}`
}

function scopedPoints(
  pointMap: unknown,
  scope: PointScope,
  byId: Map<string, { id: string; deviceType: string | null; status?: string }>,
) {
  const elements = ((pointMap as { elements?: unknown[] } | null)?.elements ?? []) as {
    isDeleted?: boolean
    customData?: PointCustomData
  }[]
  return elements
    .filter((el) => !el?.isDeleted && isPointData(el?.customData))
    .map((el) => el.customData!)
    .filter((cd) => inPointScope(pointDeviceType(cd, byId), scope))
}

/**
 * 从项目点位图生成草稿报价：点位指定产品 > 项目默认型号；都没有的点位记为待选型，不计入报价。
 * 单价取产品库当前售价，同时快照设备类型和产品图片。
 */
export async function createQuoteForProject(
  user: User,
  projectId: string,
  rawScope: unknown,
): Promise<
  { ok: true; quoteId: string; pending: number } | { ok: false; error: string; status: number }
> {
  const scope: PointScope = isPointScope(rawScope) ? rawScope : 'all'
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id: projectId,
      depth: 0,
      user,
      overrideAccess: false,
      select: { name: true, owner: true, platform: true, pointMap: true, defaultProducts: true },
    })
    .catch(() => null)
  if (!project) return { ok: false, error: '项目不存在或已被删除', status: 404 }

  const catalog = await getCatalog()
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const defaults = fillDefaultProducts(
    parseDefaults(project.defaultProducts),
    catalog,
    project.platform,
  )
  const summary = summarizePoints(scopedPoints(project.pointMap, scope, byId), byId, defaults)
  const items = [...summary.products.entries()]
    .map(([id, row]) => ({ p: byId.get(id)!, row }))
    .sort(
      (a, b) =>
        DEVICE_TYPE_ORDER.indexOf(a.p.deviceType ?? a.row.deviceType) -
        DEVICE_TYPE_ORDER.indexOf(b.p.deviceType ?? b.row.deviceType),
    )
    .map(({ p, row }) => ({
      product: p.id,
      deviceType: (p.deviceType ?? row.deviceType) as never,
      image: p.image?.id ?? null,
      name: p.name,
      shortName: p.shortName ?? null,
      sku: p.sku,
      unit: p.unit,
      price: p.price,
      quantity: row.count,
    }))

  const company = await getCompanyInfo(relId(project.owner) || user.id)
  const existing = await payload.count({
    collection: 'quotes',
    where: { project: { equals: project.id } },
    user,
    overrideAccess: false,
  })
  try {
    const quote = await payload.create({
      collection: 'quotes',
      data: {
        title: `${defaultQuoteTitle(project.name, existing.totalDocs + 1)}${scopeSuffix(scope)}`,
        project: project.id,
        status: 'draft',
        items,
        fees: [],
        discount: 0,
        notes: company.quoteNotes ?? null,
      },
      user,
      overrideAccess: false,
      depth: 0,
      select: { title: true },
    })
    return { ok: true, quoteId: String(quote.id), pending: summary.pendingTotal }
  } catch (error) {
    return { ok: false, error: quoteFailure(error, '生成报价失败，请稍后重试'), status: 400 }
  }
}

/**
 * 把项目点位图的最新点位同步到已有报价单：
 * 保留报价单里改过的临时单价、换过的同类型号、附加费用、优惠和备注；更新各类型数量，增删设备类型。
 */
export async function syncQuoteWithPointMap(
  user: User,
  quoteId: string,
  explicitScope?: unknown,
): Promise<
  | { ok: true; quoteId: string; pending: number; total: number; scope: PointScope }
  | { ok: false; error: string }
> {
  const payload = await getPayloadClient()
  const quote = await payload
    .findByID({ collection: 'quotes', id: quoteId, depth: 0, user, overrideAccess: false })
    .catch(() => null)
  if (!quote) return { ok: false, error: '报价不存在或已被删除' }
  const projectId =
    typeof quote.project === 'object' ? String(quote.project.id) : String(quote.project ?? '')
  if (!projectId) return { ok: false, error: '该报价未关联项目' }
  const project = await payload
    .findByID({ collection: 'projects', id: projectId, depth: 0, user, overrideAccess: false })
    .catch(() => null)
  if (!project) return { ok: false, error: '关联的项目不存在' }

  const scope: PointScope = isPointScope(explicitScope)
    ? explicitScope
    : inferScopeFromTitle(quote.title)
  const catalog = await getCatalog()
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const defaults = fillDefaultProducts(
    parseDefaults(project.defaultProducts),
    catalog,
    project.platform,
  )
  const summary = summarizePoints(scopedPoints(project.pointMap, scope, byId), byId, defaults)

  const storedItems = quote.items ?? []
  const byProductId = new Map<string, (typeof storedItems)[number]>()
  const byDeviceType = new Map<string, (typeof storedItems)[number]>()
  const manualItems: typeof storedItems = []
  for (const row of storedItems) {
    const pid = mediaId(row.product)
    if (pid && requiresManualQuotePrice(byId.get(pid))) {
      manualItems.push(row)
      continue
    }
    if (pid && !byProductId.has(pid)) byProductId.set(pid, row)
    if (row.deviceType && !byDeviceType.has(row.deviceType)) byDeviceType.set(row.deviceType, row)
  }

  const entries = [...summary.products.entries()].map(([id, row]) => ({ p: byId.get(id)!, row }))
  entries.sort(
    (a, b) =>
      DEVICE_TYPE_ORDER.indexOf(a.p.deviceType ?? a.row.deviceType) -
      DEVICE_TYPE_ORDER.indexOf(b.p.deviceType ?? b.row.deviceType),
  )
  const nextItems = entries.map(({ p, row }) => {
    const exact = byProductId.get(p.id)
    const sameType =
      !exact && row.fromDefault === row.count && row.deviceType
        ? byDeviceType.get(row.deviceType)
        : undefined
    const keep = exact ?? sameType
    if (keep) {
      return {
        ...(keep.id ? { id: keep.id } : {}),
        product: mediaId(keep.product) ?? p.id,
        deviceType: (keep.deviceType ?? p.deviceType ?? row.deviceType) as never,
        image: mediaId(keep.image) ?? p.image?.id ?? null,
        name: keep.name || p.name,
        // 已有行的短名快照优先；老报价没有快照时用产品库当前短名补上
        shortName: keep.shortName ?? p.shortName ?? null,
        sku: keep.sku ?? p.sku,
        unit: keep.unit ?? p.unit,
        price: typeof keep.price === 'number' ? keep.price : p.price,
        quantity: row.count,
      }
    }
    return {
      product: p.id,
      deviceType: (p.deviceType ?? row.deviceType) as never,
      image: p.image?.id ?? null,
      name: p.name,
      shortName: p.shortName ?? null,
      sku: p.sku,
      unit: p.unit,
      price: p.price,
      quantity: row.count,
    }
  })

  const baseTitle = (quote.title ?? '报价').replace(/（(全部|不含灯具|仅开关|开关\+灯光)）/g, '')
  try {
    const updated = await payload.update({
      collection: 'quotes',
      id: quoteId,
      data: { title: `${baseTitle}${scopeSuffix(scope)}`, items: [...nextItems, ...manualItems] },
      user,
      overrideAccess: false,
      depth: 0,
      select: { total: true },
    })
    return { ok: true, quoteId, pending: summary.pendingTotal, total: updated.total ?? 0, scope }
  } catch (error) {
    return { ok: false, error: quoteFailure(error, '同步失败，请稍后重试') }
  }
}

export type QuoteInput = {
  title: string
  status: string
  discount: number
  notes: string
  items: {
    id?: string | null
    product?: string | null
    name: string
    shortName?: string | null
    sku?: string | null
    unit?: string | null
    price: number
    quantity: number
  }[]
  fees: { name: string; amount: number }[]
}
export type SaveQuoteResult = { ok: true; total: number } | { ok: false; error: string }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** 保存报价：逐项校验白名单字段，合计由集合 hook 在服务端重新计算。 */
export async function saveQuoteInput(
  user: User,
  id: string,
  input: QuoteInput,
): Promise<SaveQuoteResult> {
  const title = text(input?.title, 120)
  if (!title) return { ok: false, error: '请填写报价名称' }
  const status = QUOTE_STATUSES.some((s) => s.value === input?.status)
    ? (input.status as 'draft')
    : null
  if (!status) return { ok: false, error: '报价状态无效' }
  const discount = num(input?.discount ?? 0)
  if (!(discount >= 0)) return { ok: false, error: '优惠金额需为非负数字' }
  if (!Array.isArray(input?.items) || !Array.isArray(input?.fees))
    return { ok: false, error: '报价数据格式无效' }
  if (input.items.length > 300 || input.fees.length > 50)
    return { ok: false, error: '明细条数过多' }

  const payload = await getPayloadClient()
  const stored = await payload
    .findByID({
      collection: 'quotes',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { items: true },
    })
    .catch(() => null)
  if (!stored) return { ok: false, error: '报价不存在或已被删除' }
  const storedRows = new Map((stored.items ?? []).filter((r) => r.id).map((r) => [r.id!, r]))
  const catalog = new Map((await getCatalog()).map((p) => [p.id, p]))

  const items = []
  for (const [i, raw] of input.items.entries()) {
    const name = text(raw?.name, 200)
    const price = num(raw?.price)
    const quantity = num(raw?.quantity)
    if (!name) return { ok: false, error: `第 ${i + 1} 行产品缺少名称` }
    if (!(price >= 0) || !(quantity >= 0))
      return { ok: false, error: `第 ${i + 1} 行「${name}」的单价或数量无效` }
    const rowId = typeof raw.id === 'string' && storedRows.has(raw.id) ? raw.id : null
    const before = rowId ? storedRows.get(rowId)! : null
    const beforeProduct = before ? mediaId(before.product) : null
    const productId = typeof raw.product === 'string' && raw.product ? raw.product : null
    const product = productId ? catalog.get(productId) : undefined
    if (productId && !product)
      return { ok: false, error: `第 ${i + 1} 行「${name}」关联的产品不存在` }

    const manualPrice = requiresManualQuotePrice(product)
    if (manualPrice && !isPositiveQuotePrice(price))
      return { ok: false, error: `第 ${i + 1} 行「${name}」请填写大于 0 的单价` }

    let deviceType = before?.deviceType ?? null
    let image = before ? mediaId(before.image) : null
    if (product && productId !== beforeProduct) {
      if (product.status !== 'active' && !manualPrice)
        return { ok: false, error: `「${product.name}」已下架，不能加入报价` }
      if (before?.deviceType && product.deviceType !== before.deviceType)
        return { ok: false, error: `第 ${i + 1} 行只能更换为同一设备类型的产品` }
      deviceType = (product.deviceType ?? null) as typeof deviceType
      image = product.image?.id ?? null
    } else if (product && !deviceType) {
      deviceType = (product.deviceType ?? null) as typeof deviceType
    }
    if (product && !image) image = product.image?.id ?? null
    // 短名是快照：换型号时必须跟着新产品走（否则 AI / 部分接口漏传时会留下旧产品短名）；
    // 未换型号时显式提交优先，未提交则保留原快照。
    const shortName =
      product && productId !== beforeProduct
        ? text(product.shortName ?? '', 24) || null
        : text(raw.shortName, 24) || before?.shortName || null
    items.push({
      ...(rowId ? { id: rowId } : {}),
      product: productId,
      deviceType,
      image,
      name,
      shortName,
      sku:
        product && manualPrice
          ? (beforeProduct === productId ? before?.sku : null) || product.sku
          : text(raw.sku, 100) || null,
      unit: text(raw.unit, 10) || null,
      price,
      quantity,
    })
  }
  const fees = []
  for (const [i, raw] of input.fees.entries()) {
    const name = text(raw?.name, 100)
    const amount = num(raw?.amount)
    if (!name) return { ok: false, error: `第 ${i + 1} 项附加费用缺少名称` }
    if (Number.isNaN(amount)) return { ok: false, error: `附加费用「${name}」的金额无效` }
    fees.push({ name, amount })
  }

  try {
    const doc = await payload.update({
      collection: 'quotes',
      id,
      data: { title, status, discount, notes: text(input.notes, 2000) || null, items, fees },
      user,
      overrideAccess: false,
      depth: 0,
      select: { total: true },
    })
    return { ok: true, total: doc.total ?? 0 }
  } catch (error) {
    return { ok: false, error: quoteFailure(error, '保存失败，请稍后重试') }
  }
}

/** 删除报价（已用于合同的报价、已归档项目的报价由集合 hook 拒绝）。 */
export async function deleteQuoteById(
  user: User,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const payload = await getPayloadClient()
    await payload.delete({
      collection: 'quotes',
      id,
      user,
      overrideAccess: false,
      depth: 0,
      select: { title: true },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: quoteFailure(error, '删除失败，请稍后重试') }
  }
}
