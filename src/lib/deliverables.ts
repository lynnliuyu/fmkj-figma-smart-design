/**
 * 交付资料：一个项目最终交给业主的只有「一份」报价和「一份」方案。
 * 历史报价、其他模板都保留，但交付资料包、归档页、方案默认只用这里选出的定稿。
 */

export type FinalQuoteSource = 'contract' | 'chosen' | 'accepted' | 'latest'

export const FINAL_QUOTE_SOURCE_LABEL: Record<FinalQuoteSource, string> = {
  contract: '合同依据',
  chosen: '已设为定稿',
  accepted: '客户已接受',
  latest: '最新版本',
}

/**
 * 定稿报价：合同依据的报价（签了合同就锁定）→ 项目里手动设为定稿的报价 → 已接受的报价 → 最新的报价。
 * quotes 需按更新时间倒序。
 */
export function resolveFinalQuote<Q extends { id: string | number; status?: string | null }>(
  quotes: Q[],
  o: { contractQuoteId?: string | null; finalQuoteId?: string | null },
): { quote: Q | null; source: FinalQuoteSource | null } {
  const byId = (id?: string | null) =>
    id ? quotes.find((q) => String(q.id) === String(id)) : undefined
  const contract = byId(o.contractQuoteId)
  if (contract) return { quote: contract, source: 'contract' }
  const chosen = byId(o.finalQuoteId)
  if (chosen) return { quote: chosen, source: 'chosen' }
  const accepted = quotes.find((q) => q.status === 'accepted')
  if (accepted) return { quote: accepted, source: 'accepted' }
  return quotes[0] ? { quote: quotes[0], source: 'latest' } : { quote: null, source: null }
}
