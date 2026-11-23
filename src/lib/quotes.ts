/** 报价共用的取值与金额计算（服务端保存和前端编辑使用同一套算法）。 */

export const QUOTE_STATUSES = [
  { value: 'draft', label: '草稿' },
  { value: 'sent', label: '已发送' },
  { value: 'accepted', label: '已确认' },
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]['value']

/** 报价状态的徽章样式：草稿中性、已发送待客户回复（琥珀）、已确认（绿）。全站统一用这一份。 */
export const quoteStatusVariant = (v?: string | null): 'neutral' | 'warning' | 'success' =>
  v === 'accepted' ? 'success' : v === 'sent' ? 'warning' : 'neutral'

export const quoteStatusLabel = (v?: string | null) =>
  QUOTE_STATUSES.find((s) => s.value === v)?.label ?? '草稿'

export const MANUAL_QUOTE_PRODUCT_TAG = '仅限手工报价'

export function requiresManualQuotePrice(product?: { status?: string; tags?: string[] | null }) {
  return product?.status === 'inactive' && product.tags?.includes(MANUAL_QUOTE_PRODUCT_TAG) === true
}

export const isPositiveQuotePrice = (price: unknown) =>
  typeof price === 'number' && Number.isFinite(price) && price > 0

export type QuoteLine = { price?: number | null; quantity?: number | null }
export type QuoteFee = { amount?: number | null }

const round2 = (n: number) => Math.round(n * 100) / 100

export function quoteTotals(items: QuoteLine[] = [], fees: QuoteFee[] = [], discount = 0) {
  const productTotal = round2(items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 0), 0))
  const feeTotal = round2(fees.reduce((s, f) => s + (f.amount ?? 0), 0))
  const discountAmount = Math.max(0, discount || 0) // 负数优惠视为无优惠，不允许变相加价
  const total = round2(Math.max(0, productTotal + feeTotal - discountAmount))
  return { productTotal, feeTotal, total }
}

/** 报价明细行的存储形状（字段允许为空，兼容旧数据）。 */
export type QuoteItemRow = {
  id?: string | null
  product?: string | null
  deviceType?: string | null
  image?: string | null
  name?: string | null
  shortName?: string | null
  sku?: string | null
  unit?: string | null
  price?: number | null
  quantity?: number | null
}

/**
 * 单行局部修改：带 `id` 表示改已有行（只覆盖给出字段），不带 `id` 表示新增一行。
 * 用 `productId` 而不是 `product`，避免和存储字段混淆。
 */
export type QuoteItemEdit = {
  id?: string | null
  productId?: string | null
  name?: string | null
  shortName?: string | null
  sku?: string | null
  unit?: string | null
  price?: number | null
  quantity?: number | null
}

/**
 * 把「局部修改」合并进现有明细：未出现在 `edits` / `removeIds` 里的行原样保留。
 *
 * 这是为了避免 `saveQuoteInput` 的全量替换语义被模型误用成「只提交改过的行」而删掉其余行。
 * 金额不在这里算：合并结果交给 `saveQuoteInput` 与集合 hook 重新合计。
 */
export function applyQuoteItemEdits(
  stored: QuoteItemRow[],
  edits: QuoteItemEdit[],
  removeIds: string[] = [],
): { ok: true; items: QuoteItemRow[] } | { ok: false; error: string } {
  const remove = new Set(removeIds.filter((id) => typeof id === 'string' && id))
  const items = stored.filter((row) => !(row.id && remove.has(row.id))).map((row) => ({ ...row }))
  const index = new Map<string, number>()
  items.forEach((row, i) => {
    if (row.id) index.set(row.id, i)
  })

  for (const [n, edit] of edits.entries()) {
    const id = typeof edit?.id === 'string' && edit.id.trim() ? edit.id.trim() : null
    if (id) {
      const i = index.get(id)
      if (i === undefined)
        return { ok: false, error: `第 ${n + 1} 处修改找不到明细行 id=${id}，请先读取最新明细` }
      const row = items[i]!
      if (edit.productId !== undefined) row.product = edit.productId
      if (edit.name !== undefined) row.name = edit.name
      if (edit.shortName !== undefined) row.shortName = edit.shortName
      if (edit.sku !== undefined) row.sku = edit.sku
      if (edit.unit !== undefined) row.unit = edit.unit
      if (edit.price !== undefined) row.price = edit.price
      if (edit.quantity !== undefined) row.quantity = edit.quantity
      continue
    }
    // 新增行：其余字段交给 saveQuoteInput 校验（名称、单价、数量缺失会被拒绝）
    items.push({
      product: edit?.productId ?? null,
      name: edit?.name ?? null,
      shortName: edit?.shortName ?? null,
      sku: edit?.sku ?? null,
      unit: edit?.unit ?? null,
      price: edit?.price ?? null,
      quantity: edit?.quantity ?? null,
    })
  }

  return { ok: true, items }
}

export const yuan = (n: number | null | undefined) => {
  // NaN / Infinity 落 0，避免出现「¥NaN」这种脏输出
  const v = Number.isFinite(n) ? (n as number) : 0
  return `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
