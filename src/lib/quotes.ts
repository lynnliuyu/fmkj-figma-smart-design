/** 报价共用的取值与金额计算（服务端保存和前端编辑使用同一套算法）。 */

export const QUOTE_STATUSES = [
  { value: 'draft', label: '草稿' },
  { value: 'sent', label: '已发送' },
  { value: 'accepted', label: '已确认' },
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]['value']

export const quoteStatusLabel = (v?: string | null) => QUOTE_STATUSES.find((s) => s.value === v)?.label ?? '草稿'

export type QuoteLine = { price?: number | null; quantity?: number | null }
export type QuoteFee = { amount?: number | null }

const round2 = (n: number) => Math.round(n * 100) / 100

export function quoteTotals(items: QuoteLine[] = [], fees: QuoteFee[] = [], discount = 0) {
  const productTotal = round2(items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 0), 0))
  const feeTotal = round2(fees.reduce((s, f) => s + (f.amount ?? 0), 0))
  const total = round2(Math.max(0, productTotal + feeTotal - (discount || 0)))
  return { productTotal, feeTotal, total }
}

export const yuan = (n: number | null | undefined) =>
  `¥${(n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
