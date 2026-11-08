/** 业主意向反馈（分享页提交）共用的字典与解析，服务端与客户端组件都可以导入。 */

export const CLIENT_FEEDBACK_DECISIONS = [
  { value: 'confirm', label: '确认意向方案' },
  { value: 'revise', label: '希望调整方案' },
] as const
export type ClientFeedbackDecision = (typeof CLIENT_FEEDBACK_DECISIONS)[number]['value']
export const isClientFeedbackDecision = (v: unknown): v is ClientFeedbackDecision =>
  CLIENT_FEEDBACK_DECISIONS.some((d) => d.value === v)
export const feedbackDecisionLabel = (v?: string | null) =>
  CLIENT_FEEDBACK_DECISIONS.find((d) => d.value === v)?.label ?? '业主反馈'

export const CLIENT_FEEDBACK_STATUSES = [
  { value: 'new', label: '待处理' },
  { value: 'handled', label: '已处理' },
] as const
export type ClientFeedbackStatus = (typeof CLIENT_FEEDBACK_STATUSES)[number]['value']

/** 签名 PNG（data URL）最大长度：约 150KB */
export const MAX_SIGNATURE_CHARS = 200_000
export const MAX_FEEDBACK_MESSAGE = 1000

export type DeferredItem = {
  itemId: string
  name: string
  sku: string | null
  quantity: number
  amount: number
}

/** 分享页默认展示的主方案：手动定稿 → 已确认 → 最近更新（quotes 需按更新时间倒序） */
export function mainQuoteId(
  quotes: { id: string | number; status?: string | null }[],
  finalQuoteId: string | null,
): string | null {
  const byId = finalQuoteId ? quotes.find((q) => String(q.id) === finalQuoteId) : undefined
  const q = byId ?? quotes.find((x) => x.status === 'accepted') ?? quotes[0]
  return q ? String(q.id) : null
}

/** 最多同时对比的方案数 */
export const MAX_COMPARE_QUOTES = 4

/**
 * 业主分享页能看到（并可确认意向）的方案：主方案 + 状态为「已发送 / 已确认」的报价。
 * 草稿报价视为内部稿，不对业主展示。
 */
export function clientVisibleQuoteIds(
  quotes: { id: string | number; status?: string | null }[],
  mainId: string | null,
): string[] {
  const ids = quotes
    .filter((q) => q.status === 'sent' || q.status === 'accepted')
    .map((q) => String(q.id))
  if (mainId && !ids.includes(mainId)) ids.unshift(mainId)
  return ids.slice(0, MAX_COMPARE_QUOTES)
}

export function parseDeferredItems(raw: unknown): DeferredItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .slice(0, 300)
    .map((r) => ({
      itemId: String(r.itemId ?? ''),
      name: String(r.name ?? ''),
      sku: typeof r.sku === 'string' && r.sku ? r.sku : null,
      quantity: Number(r.quantity) || 0,
      amount: Number(r.amount) || 0,
    }))
}
