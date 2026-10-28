import { describe, expect, it, vi } from "vitest"

import { applyCatalogSync, previewCatalogSync } from "../lib/catalog-sync-service"
import { stripCostColumn, stripLocalOwnedColumns } from "../lib/catalog-sync"
import { mapProduct, type ProductRow } from "../lib/product-admin-service"
import { parseImportTable } from "../lib/product-import"
import { previewProductImport } from "../lib/product-import-service"

vi.mock("../lib/product-dictionaries", () => ({ syncDictionariesFromProducts: vi.fn(async () => ({ brands: 0, series: 0, models: 0 })) }))

const env = { UPSTREAM_ENABLED: "true", UPSTREAM_BASE_URL: "https://catalog.example.invalid", LICENSE_KEY: "fictional" }
const product = mapProduct({
  id: "20000000-0000-0000-0000-000000000001", sku: "TEST-SW", name: "旧官方名称", category: "开关", brand: "测试品牌",
  platform: "米家", unit: "个", price: 999, cost: 88, stock: 7, description: "客户备注", tags: ["客户标签"], channels: ["客户渠道"],
  series: "旧系列", image: null, status: "approved", catalog_kind: "legacy", device_type_id: null, parent_product_id: null,
  manufacturer_model: null, specs: {}, protocols: [], capabilities: [], selection_status: "pending", selection_evidence: "",
  pricing_status: "pending", pricing_evidence: "客户核价", mapping_revision: 1,
  created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z", submitted_by: null, reviewed_by: null,
  reviewed_at: null, review_note: null,
} as ProductRow)

describe("官方资料预演与实际同步遵守同一规则", () => {
  it("默认预演显示已有产品的官方更新，保留客户价格且不虚报覆盖", async () => {
    const csv = "系统货号,产品名称,系列,售价,成本,库存,标签,渠道,描述\nTEST-SW,新官方名称,新系列,199,120,99,热销,官方,官方描述\n"
    const result = await previewCatalogSync({
      env,
      fetch: async () => new Response(csv, { headers: { "x-catalog-revision": "r1" } }),
      preview: (text) => previewProductImport(text, { list: async () => [product] }),
    })

    expect(result.preview?.summary).toMatchObject({ update: 1, unchanged: 0 })
    expect(result.preview?.rows[0].changes.map((change) => change.label)).toEqual(["产品名称", "系列"])
    expect(result.message).toMatch(/保留.*价格/)
  })

  it("只有客户字段不同的资料不应让确认按钮出现虚假更新数量", async () => {
    const csv = "系统货号,产品名称,售价,库存,标签,描述\nTEST-SW,旧官方名称,199,99,官方,官方描述\n"
    const result = await previewCatalogSync({
      env,
      fetch: async () => new Response(csv),
      preview: (text) => previewProductImport(text, { list: async () => [product] }),
    })

    expect(result.preview?.summary).toMatchObject({ update: 0, unchanged: 1 })
  })

  it("英文表头和中文别名同样不能改变客户价格、库存、核价依据或引入成本", () => {
    const csv = "sku,name,销售价,PRICE,库存数量,TAGS,CHANNELS,DESCRIPTION,pricingStatus,pricingEvidence,成本,Cost\nTEST-SW,名称,10,20,30,官方,官方,官方,verified,官方依据,40,50\n"
    const parsed = parseImportTable(stripLocalOwnedColumns(stripCostColumn(csv)))
    expect(parsed.records[0].errors).toEqual([])
    for (const field of ["price", "stock", "tags", "channels", "description", "pricingStatus", "pricingEvidence", "cost"] as const) {
      expect(parsed.records[0].values[field], field).toBeUndefined()
    }
  })

  it("预演后服务器资料变化时停止应用，要求重新检查", async () => {
    const apply = vi.fn(async () => ({ created: 0, updated: 1, skipped: 0, failed: 0, fileError: null, rows: [] }))
    await expect(applyCatalogSync("fictional-user", {
      env,
      fetch: async () => new Response("sku,name\nTEST-SW,新版本\n", { headers: { "x-catalog-revision": "r2" } }),
      db: { query: vi.fn(async () => ({ rows: [] })) },
      apply,
    }, { expectedRevision: "r1" })).rejects.toThrow(/资料.*变化|重新检查/)
    expect(apply).not.toHaveBeenCalled()
  })
})
