'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ValidationError } from 'payload'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { QUOTE_STATUSES } from '@/lib/quotes'
import { getCatalog, getCompanyInfo } from '@/lib/cached-data'
import { isPointData, parseDefaults, summarizePoints, type PointCustomData } from '@/lib/point-map-items'
import { setProjectDefault } from '@/lib/project-defaults'
import type { Media, User } from '@/payload-types'

const EDIT_ROLES = ['admin', 'manager', 'designer', 'sales']

async function requireEditor(): Promise<{ user: User; error?: undefined } | { error: string; user?: undefined }> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { error: '登录已过期，请重新登录' }
  if (!EDIT_ROLES.includes(user.role ?? '')) return { error: '只读账号不能修改报价' }
  return { user }
}

/**
 * 从项目点位图生成草稿报价：点位指定产品 > 项目默认型号；都没有的点位记为待选型，不计入报价。
 * 单价取产品库当前售价，同时快照设备类型和产品图片。
 */
export async function createQuoteFromProject(form: FormData) {
  const auth = await requireEditor()
  if (!auth.user) redirect('/login')
  const { user } = auth
  const projectId = String(form.get('projectId') ?? '')
  const payload = await getPayloadClient()
  const project = await payload.findByID({ collection: 'projects', id: projectId, depth: 0, user, overrideAccess: false })

  const elements = ((project.pointMap as { elements?: unknown[] } | null)?.elements ?? []) as { isDeleted?: boolean; customData?: PointCustomData }[]
  const points = elements.filter((el) => !el?.isDeleted && isPointData(el?.customData)).map((el) => el.customData!)

  const catalog = await getCatalog()
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const summary = summarizePoints(points, byId, parseDefaults(project.defaultProducts))
  const items = [...summary.products.entries()]
    .map(([id, row]) => ({ p: byId.get(id)!, row }))
    .map(({ p, row }) => ({
      product: p.id,
      deviceType: (p.deviceType ?? row.deviceType) as never,
      image: p.image?.id ?? null,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      price: p.price,
      quantity: row.count,
    }))

  const company = await getCompanyInfo()
  const existing = await payload.count({ collection: 'quotes', where: { project: { equals: project.id } }, user, overrideAccess: false })
  const quote = await payload.create({
    collection: 'quotes',
    data: { title: `${project.name} 报价${existing.totalDocs ? ` ${existing.totalDocs + 1}` : ''}`, project: project.id, status: 'draft', items, fees: [], discount: 0, notes: company.quoteNotes ?? null },
    user,
    overrideAccess: false,
    depth: 0,
  })
  revalidatePath(`/projects/${project.id}`)
  redirect(summary.pendingTotal ? `/quotes/${quote.id}?pending=${summary.pendingTotal}` : `/quotes/${quote.id}`)
}

/** 在报价里换型号时，可同时把新型号设为项目默认型号。 */
export async function setQuoteProjectDefault(projectId: string, deviceType: string, productId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireEditor()
  if (!auth.user) return { ok: false, error: auth.error }
  const result = await setProjectDefault(auth.user, projectId, deviceType, productId)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export type QuoteInput = {
  title: string
  status: string
  discount: number
  notes: string
  items: { id?: string | null; product?: string | null; name: string; sku?: string | null; unit?: string | null; price: number; quantity: number }[]
  fees: { name: string; amount: number }[]
}
export type SaveQuoteResult = { ok: true; total: number } | { ok: false; error: string }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** 保存报价：逐项校验白名单字段，合计由集合 hook 在服务端重新计算。 */
export async function saveQuote(id: string, input: QuoteInput): Promise<SaveQuoteResult> {
  const auth = await requireEditor()
  if (!auth.user) return { ok: false, error: auth.error }
  const { user } = auth

  const title = text(input?.title, 120)
  if (!title) return { ok: false, error: '请填写报价名称' }
  const status = QUOTE_STATUSES.some((s) => s.value === input?.status) ? (input.status as 'draft') : null
  if (!status) return { ok: false, error: '报价状态无效' }
  const discount = num(input?.discount ?? 0)
  if (!(discount >= 0)) return { ok: false, error: '优惠金额需为非负数字' }
  if (!Array.isArray(input?.items) || !Array.isArray(input?.fees)) return { ok: false, error: '报价数据格式无效' }
  if (input.items.length > 300 || input.fees.length > 50) return { ok: false, error: '明细条数过多' }

  const payload = await getPayloadClient()
  const stored = await payload.findByID({ collection: 'quotes', id, depth: 0, user, overrideAccess: false, select: { items: true } }).catch(() => null)
  if (!stored) return { ok: false, error: '报价不存在或已被删除' }
  const storedRows = new Map((stored.items ?? []).filter((r) => r.id).map((r) => [r.id!, r]))
  const catalog = new Map((await getCatalog()).map((p) => [p.id, p]))
  const mediaId = (v: unknown) => (v && typeof v === 'object' ? String((v as Media).id) : typeof v === 'string' ? v : null)

  const items = []
  for (const [i, raw] of input.items.entries()) {
    const name = text(raw?.name, 200)
    const price = num(raw?.price)
    const quantity = num(raw?.quantity)
    if (!name) return { ok: false, error: `第 ${i + 1} 行产品缺少名称` }
    if (!(price >= 0) || !(quantity >= 0)) return { ok: false, error: `第 ${i + 1} 行「${name}」的单价或数量无效` }
    const rowId = typeof raw.id === 'string' && storedRows.has(raw.id) ? raw.id : null
    const before = rowId ? storedRows.get(rowId)! : null
    const beforeProduct = before ? mediaId(before.product) : null
    const productId = typeof raw.product === 'string' && raw.product ? raw.product : null
    const product = productId ? catalog.get(productId) : undefined
    if (productId && !product) return { ok: false, error: `第 ${i + 1} 行「${name}」关联的产品不存在` }

    let deviceType = before?.deviceType ?? null
    let image = before ? mediaId(before.image) : null
    if (product && productId !== beforeProduct) {
      // 新增行或更换了型号：只允许在售产品；换型号时必须与原设备类型一致
      if (product.status !== 'active') return { ok: false, error: `「${product.name}」已下架，不能加入报价` }
      if (before?.deviceType && product.deviceType !== before.deviceType) return { ok: false, error: `第 ${i + 1} 行只能更换为同一设备类型的产品` }
      deviceType = (product.deviceType ?? null) as typeof deviceType
      image = product.image?.id ?? null
    } else if (product && !deviceType) {
      deviceType = (product.deviceType ?? null) as typeof deviceType
    }
    // 旧明细没有图片快照时，补上当前产品图片
    if (product && !image) image = product.image?.id ?? null
    items.push({
      ...(rowId ? { id: rowId } : {}),
      product: productId,
      deviceType,
      image,
      name,
      sku: text(raw.sku, 100) || null,
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
    })
    revalidatePath('/quotes')
    revalidatePath(`/quotes/${id}`)
    return { ok: true, total: doc.total ?? 0 }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: '有字段未通过校验，请检查后重试' }
    const code = (error as { status?: number })?.status
    if (code === 403) return { ok: false, error: '没有权限修改该报价' }
    if (code === 404) return { ok: false, error: '报价不存在或已被删除' }
    console.error('[quotes] save failed', error)
    return { ok: false, error: '保存失败，请稍后重试' }
  }
}
