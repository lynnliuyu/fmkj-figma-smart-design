import { APIError, ValidationError } from 'payload'

import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import {
  clientVisibleQuoteIds,
  isClientFeedbackDecision,
  mainQuoteId,
  MAX_FEEDBACK_MESSAGE,
  MAX_SIGNATURE_CHARS,
  parseDeferredItems,
  type ClientFeedbackDecision,
  type DeferredItem,
} from '@/lib/client-feedback'
import { shanghaiDate } from '@/lib/contracts'
import { getPayloadClient } from '@/lib/payload'
import { findProjectIdByShareToken } from '@/lib/share-link'
import type { User } from '@/payload-types'

/**
 * 业主意向反馈：业主在免登录分享页提交（凭分享链接），设计师在项目「报价」里查看、处理，
 * 并可一键按业主意向生成调整版报价（原报价保持不变）。
 */

export type ClientFeedbackInput = {
  quoteId: string
  deferredItemIds: string[]
  decision: string
  customerName: string
  customerPhone?: string
  message?: string
  signature?: string | null
  agree: boolean
}
export type ClientFeedbackResult =
  | { ok: true; id: string; intentTotal: number; deferredCount: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const round2 = (n: number) => Math.round(n * 100) / 100
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const SIGNATURE_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/

type QuoteItemRow = {
  id?: string | null
  name: string
  sku?: string | null
  price: number
  quantity: number
}

/** 业主提交意向（只接受白名单字段；金额与暂缓明细由服务端按报价重新计算，不信任客户端） */
export async function submitClientFeedback(
  token: string,
  input: ClientFeedbackInput,
): Promise<ClientFeedbackResult> {
  const fieldErrors: Record<string, string> = {}
  const customerName = text(input?.customerName, 40)
  if (!customerName) fieldErrors.customerName = '请填写您的称呼'
  const customerPhone = text(input?.customerPhone, 30)
  if (customerPhone && !/^[0-9+\-\s()]{5,30}$/.test(customerPhone))
    fieldErrors.customerPhone = '电话格式不正确'
  const decision: ClientFeedbackDecision | null = isClientFeedbackDecision(input?.decision)
    ? input.decision
    : null
  if (!decision) fieldErrors.decision = '请选择您的意向'
  const message = text(input?.message, MAX_FEEDBACK_MESSAGE)
  if (decision === 'revise' && !message) fieldErrors.message = '请写下希望调整的地方'
  const signature = typeof input?.signature === 'string' && input.signature ? input.signature : null
  if (signature && (!SIGNATURE_RE.test(signature) || signature.length > MAX_SIGNATURE_CHARS))
    fieldErrors.signature = '签名无效，请重新签写'
  if (decision === 'confirm' && !signature) fieldErrors.signature = '确认意向需要手写签名'
  if (input?.agree !== true) fieldErrors.agree = '请勾选确认说明'
  if (Object.keys(fieldErrors).length)
    return { ok: false, error: Object.values(fieldErrors)[0]!, fieldErrors }

  const projectId = await findProjectIdByShareToken(token)
  if (!projectId) return { ok: false, error: '分享链接已失效，请联系设计师获取新链接' }
  const payload = await getPayloadClient()
  // 业主未登录：服务端以系统身份读取本项目的报价，用于核对方案与重新计算金额
  const [project, quotesRes] = await Promise.all([
    payload
      .findByID({
        collection: 'projects',
        id: projectId,
        depth: 0,
        overrideAccess: true,
        select: { finalQuote: true },
      })
      .catch(() => null),
    payload.find({
      collection: 'quotes',
      where: { project: { equals: projectId } },
      sort: '-updatedAt',
      limit: 20,
      depth: 0,
      overrideAccess: true,
      select: { title: true, status: true, total: true, items: true },
    }),
  ])
  if (!project) return { ok: false, error: '项目不存在或已被删除' }
  const quotes = quotesRes.docs
  const visible = clientVisibleQuoteIds(quotes, mainQuoteId(quotes, relId(project.finalQuote)))
  const quote = quotes.find((q) => String(q.id) === String(input?.quoteId))
  if (!quote || !visible.includes(String(quote.id)))
    return {
      ok: false,
      error: '请选择要确认的方案',
      fieldErrors: { quoteId: '请选择要确认的方案' },
    }

  const wanted = new Set(
    (Array.isArray(input?.deferredItemIds) ? input.deferredItemIds : [])
      .filter((v): v is string => typeof v === 'string')
      .slice(0, 300),
  )
  const items = (quote.items ?? []) as QuoteItemRow[]
  const deferred: DeferredItem[] = items
    .filter((i) => i.id && wanted.has(i.id))
    .map((i) => ({
      itemId: i.id!,
      name: i.name,
      sku: i.sku ?? null,
      quantity: i.quantity ?? 0,
      amount: round2((i.price ?? 0) * (i.quantity ?? 0)),
    }))
  const quoteTotal = round2(quote.total ?? 0)
  const intentTotal = Math.max(0, round2(quoteTotal - deferred.reduce((s, d) => s + d.amount, 0)))

  try {
    const user = await appAuth.getCurrentUser().catch(() => null)
    const doc = await payload.create({
      collection: 'client-feedback',
      data: {
        project: projectId,
        quote: quote.id,
        quoteTitle: quote.title.slice(0, 120),
        decision: decision!,
        customerName,
        customerPhone: customerPhone || null,
        message: message || null,
        deferredItems: deferred as never,
        quoteTotal,
        intentTotal,
        signature,
        // 处理状态由集合字段权限与钩子强制为「待处理」
        status: 'new',
      },
      overrideAccess: false,
      ...(user ? { user } : {}),
      // 集合的创建权限与钩子会核对这个凭证确实属于该项目
      context: { clientShareToken: token.trim() },
      depth: 0,
      select: { customerName: true },
    })
    return { ok: true, id: String(doc.id), intentTotal, deferredCount: deferred.length }
  } catch (error) {
    if (error instanceof APIError && error.status < 500) return { ok: false, error: error.message }
    if (error instanceof ValidationError)
      return { ok: false, error: '提交的内容未通过校验，请检查后重试' }
    console.error('[client-feedback] submit failed', error)
    return { ok: false, error: '提交失败，请稍后重试' }
  }
}

export type FeedbackView = {
  id: string
  quoteId: string | null
  quoteTitle: string
  decision: ClientFeedbackDecision
  customerName: string
  customerPhone: string
  message: string
  deferred: DeferredItem[]
  quoteTotal: number
  intentTotal: number
  signature: string | null
  status: 'new' | 'handled'
  createdAt: string
  handledAt: string | null
}

/** 设计师查看本项目收到的业主反馈（新的在前） */
export async function loadProjectFeedback(user: User, projectId: string): Promise<FeedbackView[]> {
  const payload = await getPayloadClient()
  const res = await payload
    .find({
      collection: 'client-feedback',
      where: { project: { equals: projectId } },
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      user,
      overrideAccess: false,
      showHiddenFields: true,
    })
    .catch(() => null)
  return (res?.docs ?? []).map((f) => ({
    id: String(f.id),
    quoteId: relId(f.quote),
    quoteTitle: f.quoteTitle ?? '',
    decision: f.decision === 'revise' ? 'revise' : 'confirm',
    customerName: f.customerName,
    customerPhone: f.customerPhone ?? '',
    message: f.message ?? '',
    deferred: parseDeferredItems(f.deferredItems),
    quoteTotal: f.quoteTotal ?? 0,
    intentTotal: f.intentTotal ?? 0,
    signature:
      typeof f.signature === 'string' && SIGNATURE_RE.test(f.signature) ? f.signature : null,
    status: f.status === 'handled' ? 'handled' : 'new',
    createdAt: f.createdAt,
    handledAt: f.handledAt ?? null,
  }))
}

export type FeedbackActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

function failure(error: unknown, fallback: string) {
  if (error instanceof APIError && error.status < 500) return error.message
  const code = (error as { status?: number })?.status
  if (code === 403) return '你对该项目仅有查看权限'
  if (code === 404) return '反馈不存在或已被删除'
  console.error('[client-feedback]', fallback, error)
  return fallback
}

export async function setFeedbackStatus(
  user: User,
  id: string,
  status: string,
): Promise<FeedbackActionResult> {
  if (status !== 'new' && status !== 'handled') return { ok: false, error: '状态无效' }
  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'client-feedback',
      id,
      data: { status },
      user,
      overrideAccess: false,
      depth: 0,
      select: { status: true },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failure(error, '更新失败，请稍后重试') }
  }
}

/** 按业主意向生成调整版报价：复制原报价、去掉业主暂缓的明细，原报价不变；生成后把反馈标记为已处理 */
export async function createQuoteFromFeedback(
  user: User,
  feedbackId: string,
): Promise<FeedbackActionResult<{ quoteId: string; projectId: string }>> {
  const payload = await getPayloadClient()
  const fb = await payload
    .findByID({
      collection: 'client-feedback',
      id: feedbackId,
      depth: 0,
      user,
      overrideAccess: false,
    })
    .catch(() => null)
  if (!fb) return { ok: false, error: '反馈不存在或已被删除' }
  const quoteId = relId(fb.quote)
  const projectId = relId(fb.project)
  const quote = quoteId
    ? await payload
        .findByID({ collection: 'quotes', id: quoteId, depth: 0, user, overrideAccess: false })
        .catch(() => null)
    : null
  if (!quote || !projectId) return { ok: false, error: '原方案已被删除，无法生成调整版' }
  const deferred = new Set(parseDeferredItems(fb.deferredItems).map((d) => d.itemId))
  const items = (quote.items ?? [])
    .filter((i) => !(i.id && deferred.has(i.id)))
    .map((i) => ({
      product: relId(i.product),
      deviceType: i.deviceType ?? null,
      image: relId(i.image),
      name: i.name,
      sku: i.sku ?? null,
      unit: i.unit ?? null,
      price: i.price,
      quantity: i.quantity,
    }))
  const day = shanghaiDate(new Date(fb.createdAt))
  const note = `根据业主${fb.customerName}于 ${day} 在分享页提交的意向调整${deferred.size ? `：暂缓 ${deferred.size} 项设备` : ''}${fb.message ? `；业主留言：${fb.message}` : ''}`
  try {
    const created = await payload.create({
      collection: 'quotes',
      data: {
        title: `${quote.title}（业主意向版）`.slice(0, 120),
        project: projectId,
        status: 'draft',
        items: items as never,
        fees: (quote.fees ?? []).map((f) => ({ name: f.name, amount: f.amount })),
        discount: quote.discount ?? 0,
        notes: [quote.notes, note].filter(Boolean).join('\n').slice(0, 2000),
      },
      user,
      overrideAccess: false,
      depth: 0,
      select: { title: true },
    })
    await payload
      .update({
        collection: 'client-feedback',
        id: feedbackId,
        data: { status: 'handled' },
        user,
        overrideAccess: false,
        depth: 0,
        select: { status: true },
      })
      .catch(() => null)
    return { ok: true, quoteId: String(created.id), projectId }
  } catch (error) {
    return { ok: false, error: failure(error, '生成调整版报价失败，请稍后重试') }
  }
}
