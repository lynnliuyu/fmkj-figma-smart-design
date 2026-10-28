/**
 * 通过管理员 API 逐条写入采集底稿中的产品。
 * 用法: node --env-file=.env.local scripts/import-catalog-collection.mjs --file .local/.../collection.json --cookie "<session cookie>"
 *
 * 规范要求：使用业务入口（管理员 API），先查重，逐条记录结果，不批量覆盖。
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1] }
const file = opt("--file")
const cookieArg = opt("--cookie") || process.env.FMKJ_SESSION_COOKIE
const base = opt("--base") || "http://localhost:3000"

if (!file) throw new Error("--file is required")
if (!cookieArg) throw new Error("--cookie (session) or FMKJ_SESSION_COOKIE is required")

const headers = { "Content-Type": "application/json", Cookie: cookieArg }
const collection = JSON.parse(readFileSync(file, "utf8"))

async function api(method, url, body) {
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, ok: res.ok, json }
}

// 1) 读取现有产品，建立 sku 索引
const list = await api("GET", "/api/admin/products")
if (!list.ok) throw new Error(`读取产品列表失败 HTTP ${list.status}: ${JSON.stringify(list.json).slice(0, 200)}`)
const existing = list.json.products ?? []
const bySku = new Map(existing.map((p) => [p.sku, p]))
const byName = new Map(existing.map((p) => [p.name, p]))
console.log(`现有产品 ${existing.length} 条`)

const results = []
for (const rec of collection.records) {
  const p = rec.product
  const dup = bySku.get(p.sku) || byName.get(p.name)
  if (dup) {
    results.push({ sku: p.sku, name: p.name, action: "skip-duplicate", existingId: dup.id, reason: bySku.get(p.sku) ? "sku 已存在" : "名称已存在" })
    console.log(`  跳过（重复） ${p.sku} -> ${dup.id}`)
    continue
  }

  const body = {
    name: p.name, sku: p.sku, brand: p.brand, platform: p.platform, category: p.category,
    unit: p.unit, price: p.price, cost: p.cost, stock: p.stock, image: p.image,
    description: p.description, tags: p.tags, channels: p.channels, status: p.status,
    catalogKind: p.catalogKind, deviceTypeId: p.deviceTypeId, parentProductId: p.parentProductId,
    manufacturerModel: p.manufacturerModel, specs: p.specs, protocols: p.protocols,
    capabilities: p.capabilities, selectionStatus: p.selectionStatus,
    selectionEvidence: p.selectionEvidence, pricingStatus: p.pricingStatus, pricingEvidence: p.pricingEvidence,
  }

  const res = await api("POST", "/api/admin/products", body)
  if (res.ok || res.status === 201) {
    const created = res.json.product
    results.push({ sku: p.sku, name: p.name, action: "created", id: created.id, mappingRevision: created.mappingRevision, deviceTypeId: created.deviceTypeId })
    console.log(`  ✓ 新建 ${p.sku} -> ${created.id} (rev ${created.mappingRevision})`)
  } else {
    results.push({ sku: p.sku, name: p.name, action: "failed", status: res.status, error: res.json })
    console.log(`  ✗ 失败 ${p.sku} HTTP ${res.status}: ${JSON.stringify(res.json).slice(0, 300)}`)
  }
}

const summary = {
  batchId: collection.batchId,
  executedAt: new Date().toISOString(),
  total: collection.records.length,
  created: results.filter((r) => r.action === "created").length,
  skipped: results.filter((r) => r.action === "skip-duplicate").length,
  failed: results.filter((r) => r.action === "failed").length,
  results,
}
const out = path.join(path.dirname(file), "write-result.json")
writeFileSync(out, JSON.stringify(summary, null, 2))
console.log(`\n新建 ${summary.created} | 跳过 ${summary.skipped} | 失败 ${summary.failed}`)
console.log(`结果: ${out}`)
