import type { PointMapPrintFloor } from "./point-map-print"
import type { ProjectDeliverySnapshot } from "./project-delivery"
import { groupQuoteItems, type QuoteGroupMode, type QuoteLineItem } from "./quote-authoring"

export type QuotePrintFloorImage = PointMapPrintFloor

/** Both PDF download and browser printing receive exactly the same saved content. */
export type QuotePrintSnapshot = {
  deliveryVersion: number
  quoteNo: string
  date: string
  discountTotal: number
  floorImages: QuotePrintFloorImage[]
  groups: Array<{ name: string; items: QuoteLineItem[] }>
  installationFee: number
  project: string
  status: string
  subtotal: number
  total: number
}

/** A historical delivery is sufficient: this never reads or saves the current quote. */
export function buildQuotePrintSnapshot(input: {
  deliverySnapshot: ProjectDeliverySnapshot
  floors: PointMapPrintFloor[]
  groupMode: QuoteGroupMode
}): QuotePrintSnapshot {
  const delivery = input.deliverySnapshot
  if (!delivery.id || !Number.isSafeInteger(delivery.version) || delivery.version < 1) {
    throw new Error("请先选择或生成固定交付版本，再导出报价单。")
  }
  const quote = delivery.quote
  if (!quote?.quoteNo || !Array.isArray(quote.items) ||
      ![quote.subtotal, quote.discount, quote.total, quote.installationFee].every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("交付版本没有完整的已保存报价，请核对后重试。")
  }
  const createdAt = new Date(delivery.createdAt)
  if (!Number.isFinite(createdAt.getTime())) throw new Error("交付版本的日期不完整，请重新读取后重试。")

  return {
    deliveryVersion: delivery.version,
    quoteNo: quote.quoteNo,
    status: quote.status === "draft" ? "草稿" : quote.status,
    subtotal: quote.subtotal,
    discountTotal: quote.discount,
    total: quote.total,
    installationFee: quote.installationFee,
    groups: groupQuoteItems(quote.items, input.groupMode, [...new Set(quote.items.map((item) => item.category))], quote.rooms),
    project: delivery.project.name,
    date: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(createdAt),
    floorImages: input.floors,
  }
}
