'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ValidationError } from 'payload'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { QUOTE_STATUSES } from '@/lib/quotes'
import type { Product, User } from '@/payload-types'

const EDIT_ROLES = ['admin', 'manager', 'designer', 'sales']

async function requireEditor(): Promise<{ user: User; error?: undefined } | { error: string; user?: undefined }> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { error: '登录已过期，请重新登录' }
  if (!EDIT_ROLES.includes(user.role ?? '')) return { error: '只读账号不能修改报价' }
  return { user }
}

/** 从项目点位图统计设备数量，生成一份草稿报价（单价取产品库当前售价）。 */
export async function createQuoteFromProject(form: FormData) {
  const auth = await requireEditor()
  if (!auth.user) redirect('/login')
  const { user } = auth
  const projectId = String(form.get('projectId') ?? '')
  const payload = await getPayloadClient()
  const project = await payload.findByID({ collection: 'projects', id: projectId, depth: 0, user, overrideAccess: false })

  const counts = new Map<string, number>()
  const elements = ((project.pointMap as { elements?: unknown[] } | null)?.elements ?? []) as {
    isDeleted?: boolean
    customData?: { productId?: unknown }
  }[]
  for (const el of elements) {
    const id = el?.customData?.productId
    if (!el?.isDeleted && typeof id === 'string') counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  let items: { product: string; name: string; sku: string; unit: string; price: number; quantity: number }[] = []
  if (counts.size) {
    const products = await payload.find({
      collection: 'products',
      where: { id: { in: [...counts.keys()] } },
      limit: counts.size,
      depth: 0,
      user,
      overrideAccess: false,
      select: { name: true, sku: true, unit: true, price: true },
    })
    items = (products.docs as Product[]).map((p) => ({
      product: String(p.id),
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      price: p.price,
      quantity: counts.get(String(p.id)) ?? 0,
    }))
  }

  const existing = await payload.count({ collection: 'quotes', where: { project: { equals: project.id } }, user, overrideAccess: false })
  const quote = await payload.create({
    collection: 'quotes',
    data: { title: `${project.name} 报价${existing.totalDocs ? ` ${existing.totalDocs + 1}` : ''}`, project: project.id, status: 'draft', items, fees: [], discount: 0 },
    user,
    overrideAccess: false,
    depth: 0,
  })
  revalidatePath(`/projects/${project.id}`)
  redirect(`/quotes/${quote.id}`)
}

export type QuoteInput = {
  title: string
  status: string
  discount: number
  notes: string
  items: { product?: string | null; name: string; sku?: string | null; unit?: string | null; price: number; quantity: number }[]
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

  const items = []
  for (const [i, raw] of input.items.entries()) {
    const name = text(raw?.name, 200)
    const price = num(raw?.price)
    const quantity = num(raw?.quantity)
    if (!name) return { ok: false, error: `第 ${i + 1} 行产品缺少名称` }
    if (!(price >= 0) || !(quantity >= 0)) return { ok: false, error: `第 ${i + 1} 行「${name}」的单价或数量无效` }
    items.push({
      product: typeof raw.product === 'string' && raw.product ? raw.product : null,
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

  const payload = await getPayloadClient()
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
