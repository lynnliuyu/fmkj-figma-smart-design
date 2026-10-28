/**
 * 把整理好的旧产品数据通过管理员 API 批量写入。
 * 规范：docs/product-catalog-agent-guide.md —— 走业务入口、查重、逐条记录结果。
 * 用法: node scripts/import-old-products.mjs --cookie "<session>" [--limit N] [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1] }
const cookie = opt("--cookie")
const base = opt("--base") || "http://localhost:3000"
const dry = args.includes("--dry")
const limit = opt("--limit") ? Number(opt("--limit")) : Infinity
if (!cookie) throw new Error("--cookie required")

const DIR = ".local/product-catalog-collection/20261015-old-data/"
const headers = { "Content-Type": "application/json", Cookie: cookie }

const rows = JSON.parse(readFileSync(DIR + "normalized.json", "utf8"))

// 读取现有产品做查重
const listRes = await fetch(base + "/api/admin/products", { headers })
if (!listRes.ok) throw new Error(`读取产品列表失败 HTTP ${listRes.status}`)
const existing = (await listRes.json()).products
const bySku = new Map(existing.map((p) => [p.sku, p]))
const byName = new Map(existing.map((p) => [p.name, p]))
console.log(`现有产品 ${existing.length} 条；待处理 ${rows.length} 条`)

const EV_SEL = "由旧产品库表格恢复（来源：产品库表格.xlsx / 产品库导出.xlsx）。厂家型号、结构化规格与设备类型均未核实，保持待核；未按名称或分类猜测继电器路数、屏幕尺寸等参数。"
const EV_PRI = "价格与成本为旧产品库 Excel 的历史快照值（采集早于 2026-10-15），未按当前渠道重新核价。价格为 0 表示缺失，不代表免费或零成本。"

const results = []
let n = 0
for (const r of rows) {
  if (n >= limit) break
  n++

  if (bySku.has(r.sku)) {
    results.push({ sku: r.sku, action: "skip-sku-conflict", existingId: bySku.get(r.sku).id })
    continue
  }
  if (byName.has(r.name)) {
    results.push({ sku: r.sku, name: r.name, action: "skip-name-conflict", existingId: byName.get(r.name).id })
    continue
  }

  const body = {
    name: r.name,
    sku: r.sku,
    brand: r.brand ?? null,
    platform: r.platform ?? null,
    category: r.category,
    unit: r.unit || "个",
    price: r.price,
    cost: r.cost,
    stock: r.stock,
    image: r.image ?? null,
    description: r.description ?? null,
    tags: [r.brand, r.category, "旧库恢复"].filter(Boolean).slice(0, 12),
    channels: [`来源:${r._source}`],
    status: "active",
    catalogKind: "legacy",
    deviceTypeId: null,
    parentProductId: null,
    manufacturerModel: null,
    specs: {},
    protocols: [],
    capabilities: [],
    selectionStatus: "pending",
    selectionEvidence: EV_SEL,
    pricingStatus: "pending",
    pricingEvidence: EV_PRI,
  }

  if (dry) {
    results.push({ sku: r.sku, name: r.name, action: "would-create" })
    continue
  }

  let attempts = 0
  while (attempts < 3) {
    attempts++
    try {
      const res = await fetch(base + "/api/admin/products", { method: "POST", headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => null)
      if (res.ok || res.status === 201) {
        results.push({ sku: r.sku, name: r.name, action: "created", id: json.product.id, rev: json.product.mappingRevision })
        bySku.set(r.sku, json.product); byName.set(r.name, json.product)
        if (results.filter((x) => x.action === "created").length % 50 === 0)
          console.log(`  已创建 ${results.filter((x) => x.action === "created").length} 条…`)
      } else {
        results.push({ sku: r.sku, name: r.name, action: "failed", status: res.status, error: JSON.stringify(json).slice(0, 300) })
      }
      break
    } catch (e) {
      if (attempts >= 3) results.push({ sku: r.sku, name: r.name, action: "error", error: String(e).slice(0, 200) })
    }
  }
}

const summary = {
  at: new Date().toISOString(),
  total: n,
  created: results.filter((r) => r.action === "created").length,
  skippedSku: results.filter((r) => r.action === "skip-sku-conflict").length,
  skippedName: results.filter((r) => r.action === "skip-name-conflict").length,
  failed: results.filter((r) => r.action === "failed" || r.action === "error").length,
  wouldCreate: results.filter((r) => r.action === "would-create").length,
}
writeFileSync(DIR + (dry ? "import-dry-run.json" : "import-result.json"), JSON.stringify({ summary, results }, null, 2))

console.log("\n=== 结果 ===")
console.log(`  新建 ${summary.created} | SKU冲突跳过 ${summary.skippedSku} | 名称冲突跳过 ${summary.skippedName} | 失败 ${summary.failed}${dry ? ` | 将新建 ${summary.wouldCreate}` : ""}`)
if (summary.failed) {
  console.log("\n失败项:")
  for (const f of results.filter((r) => r.action === "failed" || r.action === "error").slice(0, 8))
    console.log(`  ${f.sku} ${f.status ?? ""} ${String(f.error).slice(0, 160)}`)
}
