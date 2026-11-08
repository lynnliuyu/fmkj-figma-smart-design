import { APIError, ValidationError } from 'payload'

import { relId } from '@/lib/access'
import { getCompanyInfo } from '@/lib/cached-data'
import {
  DEFAULT_CONTRACT_TERMS,
  DEFAULT_DURATION_DAYS,
  DEFAULT_PAYMENTS,
  DEFAULT_WARRANTY_MONTHS,
  isContractStatus,
  paymentPercentTotal,
} from '@/lib/contracts'
import { getPayloadClient } from '@/lib/payload'
import type { User } from '@/payload-types'

/** 合同业务规则（网页 Server Action 和小程序接口共用）。 */
export type ContractResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export function contractFailure(error: unknown, fallback: string) {
  if (error instanceof ValidationError) return '有字段未通过校验，请检查后重试'
  if (error instanceof APIError && error.status < 500) return error.message
  const code = (error as { status?: number })?.status
  if (code === 403) return '没有权限修改这份合同'
  if (code === 404) return '合同不存在或已被删除'
  console.error('[contracts]', fallback, error)
  return fallback
}

/** 用项目里的一份报价生成合同：金额、甲方信息、地址、付款方式、工期、质保和条款都带上默认值。 */
export async function createContractFromQuote(
  user: User,
  projectId: string,
  quoteId: string,
): Promise<ContractResult<{ id: string }>> {
  const payload = await getPayloadClient()
  const [project, quote, company] = await Promise.all([
    payload
      .findByID({
        collection: 'projects',
        id: projectId,
        depth: 0,
        user,
        overrideAccess: false,
        select: {
          owner: true,
          customerName: true,
          customerPhone: true,
          community: true,
          address: true,
        },
      })
      .catch(() => null),
    payload
      .findByID({
        collection: 'quotes',
        id: quoteId,
        depth: 0,
        user,
        overrideAccess: false,
        select: { project: true, total: true },
      })
      .catch(() => null),
    getCompanyInfo(user.id),
  ])
  if (!project) return { ok: false, error: '项目不存在或已被删除' }
  if (!quote || relId(quote.project) !== String(project.id))
    return { ok: false, error: '请选择这个项目里的报价' }
  const ownerCompany =
    relId(project.owner) && relId(project.owner) !== String(user.id)
      ? await getCompanyInfo(relId(project.owner))
      : company
  try {
    const doc = await payload.create({
      collection: 'contracts',
      data: {
        project: project.id,
        quote: quote.id,
        status: 'draft',
        amount: quote.total ?? 0,
        customerName: project.customerName ?? null,
        customerPhone: project.customerPhone ?? null,
        address: [project.community, project.address].filter(Boolean).join(' ') || null,
        durationDays: DEFAULT_DURATION_DAYS,
        warrantyMonths: DEFAULT_WARRANTY_MONTHS,
        payments: DEFAULT_PAYMENTS.map((p) => ({
          name: p.name,
          percent: p.percent,
          received: false,
        })),
        terms: ownerCompany.contractTerms?.trim() || DEFAULT_CONTRACT_TERMS,
      } as never,
      user,
      overrideAccess: false,
      depth: 0,
      select: { number: true },
    })
    return { ok: true, id: String(doc.id) }
  } catch (error) {
    return { ok: false, error: contractFailure(error, '生成合同失败，请稍后重试') }
  }
}

export type ContractInput = {
  number: string
  quoteId: string
  amount: number
  customerName: string
  customerPhone: string
  address: string
  durationDays: number | null
  warrantyMonths: number | null
  terms: string
  payments: { name: string; percent: number; received: boolean }[]
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const intOrNull = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null

/** 保存合同：逐项校验白名单字段。已签订的合同只接受收款登记（其他内容由集合 hook 锁定）。 */
export async function saveContractInput(
  user: User,
  id: string,
  input: ContractInput,
): Promise<ContractResult> {
  const payload = await getPayloadClient()
  const stored = await payload
    .findByID({ collection: 'contracts', id, depth: 0, user, overrideAccess: false })
    .catch(() => null)
  if (!stored) return { ok: false, error: '合同不存在或已被删除' }
  if (!Array.isArray(input?.payments) || input.payments.length > 6)
    return { ok: false, error: '付款方式最多 6 期' }

  let data: Record<string, unknown>
  if (stored.status === 'signed') {
    const received = input.payments.map((p) => Boolean(p?.received))
    data = {
      payments: (stored.payments ?? []).map((p, i) => ({
        id: p.id,
        name: p.name,
        percent: p.percent,
        received: received[i] ?? Boolean(p.received),
      })),
    }
  } else {
    const number = text(input.number, 40)
    if (!number) return { ok: false, error: '请填写合同编号' }
    const amount =
      typeof input.amount === 'number' && Number.isFinite(input.amount) && input.amount >= 0
        ? Math.round(input.amount * 100) / 100
        : NaN
    if (Number.isNaN(amount)) return { ok: false, error: '合同金额需为非负数字' }
    const payments = []
    for (const [i, p] of input.payments.entries()) {
      const name = text(p?.name, 40)
      const percent =
        typeof p?.percent === 'number' && Number.isFinite(p.percent)
          ? Math.round(p.percent * 100) / 100
          : NaN
      if (!name) return { ok: false, error: `第 ${i + 1} 期款项缺少名称` }
      if (!(percent >= 0 && percent <= 100))
        return { ok: false, error: `「${name}」的比例需在 0–100 之间` }
      payments.push({ name, percent, received: Boolean(p?.received) })
    }
    if (payments.length && Math.abs(paymentPercentTotal(payments) - 100) > 0.001) {
      return { ok: false, error: `付款比例合计需为 100%（当前 ${paymentPercentTotal(payments)}%）` }
    }
    data = {
      number,
      quote: text(input.quoteId, 64) || relId(stored.quote),
      amount,
      customerName: text(input.customerName, 60) || null,
      customerPhone: text(input.customerPhone, 30) || null,
      address: text(input.address, 200) || null,
      durationDays: intOrNull(input.durationDays, 1, 365),
      warrantyMonths: intOrNull(input.warrantyMonths, 0, 120),
      terms: text(input.terms, 5000) || null,
      payments,
    }
  }
  try {
    await payload.update({
      collection: 'contracts',
      id,
      data: data as never,
      user,
      overrideAccess: false,
      depth: 0,
      select: { number: true },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: contractFailure(error, '保存失败，请稍后重试') }
  }
}

/** 标记签订 / 撤销签订。签订日期默认当天，也可以传入实际签订日期（YYYY-MM-DD）。 */
export async function setContractStatusFor(
  user: User,
  id: string,
  status: unknown,
  signedAt?: unknown,
): Promise<ContractResult> {
  if (!isContractStatus(status)) return { ok: false, error: '状态无效' }
  const date =
    status === 'signed' && typeof signedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(signedAt)
      ? new Date(`${signedAt}T12:00:00+08:00`).toISOString()
      : undefined
  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'contracts',
      id,
      data: { status, ...(date ? { signedAt: date } : {}) },
      user,
      overrideAccess: false,
      depth: 0,
      select: { number: true },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: contractFailure(error, '操作失败，请稍后重试') }
  }
}

export async function deleteContractById(user: User, id: string): Promise<ContractResult> {
  try {
    const payload = await getPayloadClient()
    await payload.delete({
      collection: 'contracts',
      id,
      user,
      overrideAccess: false,
      depth: 0,
      select: { number: true },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: contractFailure(error, '删除失败，请稍后重试') }
  }
}
