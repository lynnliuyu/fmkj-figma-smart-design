/**
 * 清理导入后的待确认项。
 * 用法: node scripts/cleanup-import-issues.mjs --cookie "<session>" [--dry]
 */
import { writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1] }
const cookie = opt("--cookie")
const base = opt("--base") || "http://localhost:3000"
const dry = args.includes("--dry")
if (!cookie) throw new Error("--cookie required")
const headers = { "Content-Type": "application/json", Cookie: cookie }

const res0 = await fetch(base + "/api/admin/products", { headers })
if (!res0.ok) throw new Error("读取产品列表失败 HTTP " + res0.status)
const products = (await res0.json()).products
console.log(`读取 ${products.length} 条产品`)

const results = []

async function patch(p, changes, reason) {
  const body = {
    name: p.name, sku: p.sku, brand: p.brand, platform: p.platform, category: p.category,
    unit: p.unit, price: p.price, cost: p.cost, stock: p.stock, image: p.image,
    description: p.description, tags: p.tags, channels: p.channels, status: p.status,
    mappingRevision: p.mappingRevision,
    ...changes,
  }
  if (dry) { results.push({ sku: p.sku, action: "would-update", reason, changes }); return }
  const res = await fetch(`${base}/api/admin/products/${p.id}`, { method: "PATCH", headers, body: JSON.stringify(body) })
  const json = await res.json().catch(() => null)
  results.push({ sku: p.sku, id: p.id, action: res.ok ? "updated" : "failed", status: res.status, reason,
    before: { sku: p.sku, brand: p.brand, tags: p.tags }, after: res.ok ? { sku: json.product.sku, brand: json.product.brand, tags: json.product.tags } : json })
}

// A. 辅材占用品牌字段 → 品牌留空，并加标记
const aux = products.filter((p) => p.brand === "通用（辅材）")
console.log(`\nA. 辅材品牌清理: ${aux.length} 条`)
for (const p of aux) {
  const tags = [...new Set([...(p.tags ?? []).filter((t) => t !== "通用（辅材）"), "旧库恢复", "辅材"])].slice(0, 12)
  await patch(p, { brand: null, tags }, "线材/辅材被放进品牌字段，品牌置空并标记为辅材")
  console.log(`   ${p.sku} ${String(p.name).slice(0, 30)} → 品牌置空`)
}

// B. 占位 SKU 替换
const demo = products.find((p) => p.sku === "SKU-DEMO")
console.log(`\nB. 占位 SKU: ${demo ? "1 条" : "0 条"}`)
if (demo) {
  const exists = products.some((p) => p.sku === "AQ-MAGIC-S1-PLUS")
  if (exists) console.log("   目标 SKU 已存在，跳过")
  else {
    const tags = [...new Set([...(demo.tags ?? []), "SKU已修正"])].slice(0, 12)
    await patch(demo, { sku: "AQ-MAGIC-S1-PLUS", tags }, "原 SKU 为占位值 SKU-DEMO，替换为正式货号")
    console.log(`   ${demo.name} → AQ-MAGIC-S1-PLUS`)
  }
}

// C. 价格缺失 → 打标记便于筛选（不臆造价格）
const zero = products.filter((p) => Number(p.price) === 0 && Number(p.cost) === 0)
console.log(`\nC. 价格缺失打标: ${zero.length} 条`)
for (const p of zero) {
  const tags = [...new Set([...(p.tags ?? []), "价格待补"])].slice(0, 12)
  await patch(p, { tags }, "价格与成本均缺失（0 为占位），打标便于后续补价")
}

const summary = {
  at: new Date().toISOString(),
  aux: aux.length, demo: demo ? 1 : 0, zeroPrice: zero.length,
  updated: results.filter((r) => r.action === "updated" || r.action === "would-update").length,
  failed: results.filter((r) => r.action === "failed").length,
}
writeFileSync(".local/product-catalog-collection/20261015-old-data/cleanup-result.json", JSON.stringify({ summary, results }, null, 2))
console.log(`\n=== 结果 ===\n  处理 ${summary.updated} 条 | 失败 ${summary.failed}`)
for (const f of results.filter((r) => r.action === "failed").slice(0, 5)) console.log(`   ✗ ${f.sku} HTTP ${f.status}`)
