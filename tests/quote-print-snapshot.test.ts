import { describe, expect, it } from "vitest"

import { emptyPointMapPlan } from "../lib/point-map-plan"
import { deliveryLineTotal, deliveryLineUnitPrice, type ProjectDeliverySnapshot } from "../lib/project-delivery"
import { buildQuotePrintSnapshot } from "../lib/quote-print-snapshot"
import { quoteVerification, quoteVerificationLabel } from "../lib/quote-verification"

function historicalDelivery(): ProjectDeliverySnapshot {
  return {
    id: "fixed-v1", version: 1, createdAt: "2026-10-27T18:00:00.000Z",
    project: { id: "project-1", name: "历史客户方案", code: "P-HISTORY", customer: "客户", address: "" },
    plan: emptyPointMapPlan("project-1"),
    pointMapRevision: 1, products: [], fingerprint: "fixed-fingerprint",
    changes: { comparedToVersion: null, floorIds: [], pointsAdded: 0, pointsRemoved: 0, pointsChanged: 0, productsChanged: [], photosChanged: [], scenesChanged: false, quoteChanged: false, productOverrides: 0, messages: [] },
    quote: {
      id: "quote-1", quoteNo: "QT-HISTORICAL", title: "原报价", status: "draft", subtotal: 10.25,
      discount: 0.2, installationFee: 5.33, total: 15.38, rooms: ["全屋"],
      items: [{
        id: "saved-device", lineId: "saved-line", name: "原商品名称", category: "开关", spec: "单键", unit: "个", image: "data:image/png;base64,fixed-image-bytes",
        cost: 0, price: 10.25, discount: 98.04878048780488, quantity: 1, room: "全屋",
        finalUnitPrice: 10.05, subtotalAmount: 10.25, finalAmount: 10.05,
        productSnapshot: { quotationVerification: { status: "unverified", source: "default", reasons: ["价格尚未核验", "配套未计入本次报价：线材"] } },
      }],
    },
  }
}

describe("fixed quote print snapshot", () => {
  it("uses only the selected historical delivery, retaining decimal money, image bytes and unverified notes", () => {
    const delivery = historicalDelivery()
    const original = structuredClone(delivery)
    const floors = [{ id: "floor-1", name: "全屋", src: "blob:fixed-floor" }]
    const result = buildQuotePrintSnapshot({ deliverySnapshot: delivery, floors, groupMode: "room" })

    expect(result).toMatchObject({ deliveryVersion: 1, quoteNo: "QT-HISTORICAL", project: "历史客户方案", status: "草稿", date: "2026/10/28", subtotal: 10.25, discountTotal: 0.2, installationFee: 5.33, total: 15.38 })
    expect(result.floorImages).toBe(floors)
    const item = result.groups[0].items[0]
    expect(item.image).toBe(delivery.quote!.items[0].image)
    expect(deliveryLineUnitPrice(item)).toBe(10.05)
    expect(deliveryLineTotal(item)).toBe(10.05)
    expect(quoteVerification(item).status).toBe("unverified")
    expect(quoteVerificationLabel(item)).toContain("配套未计入本次报价：线材")
    expect(delivery).toEqual(original)
  })

  it.each(["room", "type", "none"] as const)("groups the same historical lines by %s without recalculating the saved total", (groupMode) => {
    const delivery = historicalDelivery()
    delivery.quote!.total = 9200
    const result = buildQuotePrintSnapshot({ deliverySnapshot: delivery, floors: [], groupMode })
    expect(result.total).toBe(9200)
    expect(result.groups.flatMap((group) => group.items)).toEqual(delivery.quote!.items)
  })

  it("preserves a saved zero amount", () => {
    const delivery = historicalDelivery()
    Object.assign(delivery.quote!, { subtotal: 0, discount: 0, installationFee: 0, total: 0 })
    expect(buildQuotePrintSnapshot({ deliverySnapshot: delivery, floors: [], groupMode: "none" })).toMatchObject({ subtotal: 0, discountTotal: 0, installationFee: 0, total: 0 })
  })

  it.each([
    (delivery: ProjectDeliverySnapshot) => { delivery.version = 0; delivery.id = null },
    (delivery: ProjectDeliverySnapshot) => { delivery.quote = null },
    (delivery: ProjectDeliverySnapshot) => { delivery.quote!.total = Number.NaN },
    (delivery: ProjectDeliverySnapshot) => { delivery.createdAt = "invalid" },
  ])("stops on an unfixed or incomplete source instead of inventing quote data", (invalidate) => {
    const delivery = historicalDelivery()
    invalidate(delivery)
    expect(() => buildQuotePrintSnapshot({ deliverySnapshot: delivery, floors: [], groupMode: "room" })).toThrow()
  })
})
