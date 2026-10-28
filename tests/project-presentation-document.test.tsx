import * as React from "react"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProjectPresentationDocument } from "../components/projects/project-presentation-document"
import type { DocumentBrand } from "../lib/document-brand"
import { emptyPointMapPlan } from "../lib/point-map-plan"
import type { ProjectDeliverySnapshot } from "../lib/project-delivery"
import { money } from "../lib/quote-authoring"

const brand: DocumentBrand = { companyName: "合成测试门店", logoSrc: "/test-logo.png", contact: "测试联系电话", address: "测试门店地址", qrSrc: "/test-qr.png" }
const floors = [1, 2, 3].map((index) => ({ id: `floor-${index}`, name: `${index} 层`, src: `blob:fixed-floor-${index}` }))

function snapshot(): ProjectDeliverySnapshot {
  return {
    id: "fixed-delivery", version: 1, createdAt: "2026-10-27T00:00:00Z", pointMapRevision: 3,
    project: { id: "test-project", name: "合成验收项目", code: "TEST-PROJECT", customer: "测试客户", address: "测试项目地址" },
    plan: {
      ...emptyPointMapPlan("test-project"),
      points: [
        { id: "point-one", code: "K01", name: "客厅开关", room: "一层 / 客厅", floorId: "floor-1", iconId: "switch-2", status: "planned", x: 20, y: 40, productId: "product-1", note: "", placed: true },
        { id: "point-two", code: "K02", name: "卧室开关", room: "一层 / 卧室", floorId: "floor-1", iconId: "switch-2", status: "pending", x: 0, y: 0, productId: "", note: "现场复核安装位置", placed: false },
      ],
      scenes: [
        { id: "home", name: "回家场景", trigger: "入口面板", description: "打开玄关灯与客厅灯", pointIds: ["point-one"], status: "confirmed" },
        { id: "night", name: "夜间场景", trigger: "卧室面板", description: "关闭灯光\n保留起夜照明", pointIds: ["point-two"], status: "proposed" },
      ],
    },
    quote: {
      id: "quote-fixed", quoteNo: "QT-FIXED-TEST", title: "固定报价", status: "draft", subtotal: 777.72, discount: 600.15, installationFee: 2.39, total: 128.03, rooms: ["一层 / 客厅"],
      items: Array.from({ length: 40 }, (_, index) => ({
        id: `product-${index}`, lineId: `line-${index}`, name: `真实保留产品 ${index}`, brand: "测试品牌", sku: `FIXED-SKU-${index}`, spec: "双键", category: "面板", unit: "台", quantity: 3, room: "一层 / 客厅", image: "", cost: 982634.17,
        price: 99, discount: 80, finalUnitPrice: 7.77, subtotalAmount: 297, finalAmount: 23.31,
        productSnapshot: { quotationVerification: { status: "unverified", source: "default", reasons: ["价格尚未核验", "配套未计入本次报价：轨道与电源"] }, internalCostNotes: "INTERNAL_COST_SECRET" },
      })),
    },
    products: [],
    changes: { comparedToVersion: null, floorIds: [], pointsAdded: 0, pointsRemoved: 0, pointsChanged: 0, productsChanged: [], photosChanged: [], scenesChanged: false, quoteChanged: false, productOverrides: 0, messages: [] },
    fingerprint: "fixed-fingerprint",
  }
}

function render(data = snapshot(), overrides: Partial<React.ComponentProps<typeof ProjectPresentationDocument>> = {}) {
  return renderToStaticMarkup(<ProjectPresentationDocument snapshot={data} floors={floors} brand={brand} {...overrides} />)
}

describe("compact customer presentation document", () => {
  it("uses the actual brand, project and selected delivery in its concise information header", () => {
    const html = render()
    for (const text of [brand.companyName, brand.logoSrc, brand.contact, brand.address, brand.qrSrc, "合成验收项目", "测试客户", "测试项目地址", "交付版本 V1", "智能家居方案", "3 张点位图 · 2 个点位 · 2 个场景", "QT-FIXED-TEST"]) expect(html).toContain(text)
    expect(html).toContain('class="presentation-project-facts"')
    expect(html).toContain('class="presentation-amounts" data-customer-pdf-avoid-break="true"')
  })

  it("retains all 40 price rows and their verification scope instead of dropping data to shorten the package", () => {
    const html = render()
    for (let index = 0; index < 40; index++) {
      expect(html).toContain(`真实保留产品 ${index}<`)
      expect(html).toContain(`FIXED-SKU-${index}`)
    }
    expect(html.split("未核验 · 默认型号").length - 1).toBe(40)
    expect(html.split("配套未计入本次报价：轨道与电源").length - 1).toBe(40)
    for (const amount of [7.77, 23.31, 777.72, 600.15, 2.39, 128.03]) expect(html).toContain(money(amount))
    expect(html).not.toContain(money(99 * .8))
    expect(html).not.toContain("INTERNAL_COST_SECRET")
    expect(html).not.toContain("982634")
  })

  it("preserves every scene, association, confirmation status and unplaced-device note", () => {
    const html = render()
    for (const text of ["回家场景", "入口面板", "打开玄关灯与客厅灯", "夜间场景", "卧室面板", "保留起夜照明", "K01", "K02", "已确认", "待确认", "待定位设备", "现场复核安装位置"]) expect(html).toContain(text)
    expect(html).toContain("1 个已定位 · 1 个待定位")
    expect(html.match(/class="presentation-scene" data-customer-pdf-avoid-break="true"/g)).toHaveLength(2)
  })

  it("keeps all floor images as complete, protected blocks with no forced new page", () => {
    const html = render()
    for (const floor of floors) expect(html).toContain(`src="${floor.src}"`)
    expect(html.match(/class="project-presentation-floor presentation-floor" data-customer-pdf-avoid-break="true"/g)).toHaveLength(3)
    expect(html).toContain('data-floor-count="3"')
    expect(html).not.toContain("data-customer-pdf-break-before")
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
    expect(css).toMatch(/\.presentation-document \.presentation-floor\s*\{[^}]*break-before:\s*auto !important/)
    expect(css).toMatch(/\.presentation-document \.presentation-floor-image\s*\{[^}]*object-fit:\s*contain/)
    expect(css).toContain('[data-customer-pdf-density="compact"] .presentation-floor-image')
    expect(css).toContain('[data-customer-pdf-density="dense"] .presentation-floor-image')
  })

  it("leaves optional missing data honest and uses interactive slots only in the screen toolbar", () => {
    const data = snapshot()
    data.quote = null
    data.plan.scenes = []
    const html = render(data, { renderFloorAction: () => <button>下载真实楼层图</button>, renderFloorEditor: () => <div>点位排版编辑区</div> })
    expect(html).toContain("当前项目尚未完成商品选型或保存报价")
    expect(html).toContain("尚未保存场景")
    expect(html).not.toContain('class="presentation-quote-table"')
    expect(html).toContain('class="project-presentation-toolbar"><button>下载真实楼层图</button>')
    expect(html).toContain('class="project-presentation-toolbar"><div>点位排版编辑区</div>')
  })
})
