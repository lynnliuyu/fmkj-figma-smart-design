/**
 * 更新既有音箱记录：补型号、价格、成本、图片、协议、能力、描述。
 * 规范要求：先 GET 完整记录 → 复制基础字段白名单 + 携带最新 mappingRevision → PATCH。
 */
import { readFileSync, writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1] }
const cookie = opt("--cookie") || process.env.FMKJ_SESSION_COOKIE
const base = opt("--base") || "http://localhost:3000"
const dry = args.includes("--dry")
if (!cookie) throw new Error("--cookie required")

const headers = { "Content-Type": "application/json", Cookie: cookie }
const api = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, ok: res.ok, json }
}

const list = await api("GET", "/api/admin/products")
if (!list.ok) throw new Error(`读取产品列表失败 HTTP ${list.status}`)
const bySku = new Map(list.json.products.map((p) => [p.sku, p]))

const updates = JSON.parse(readFileSync(".local/product-catalog-collection/20261015-xiaomi-speaker/updates.json", "utf8")).updates

const results = []
for (const u of updates) {
  const cur = bySku.get(u.sku)
  if (!cur) { results.push({ sku: u.sku, ok: false, reason: "未找到" }); console.log(`  ✗ ${u.sku} 未找到`); continue }

  // 列表接口已返回完整字段，直接使用（该路由不支持单条 GET）
  const p = cur

  const body = {
    name: p.name, sku: p.sku, brand: p.brand, platform: p.platform, category: p.category,
    unit: p.unit, price: p.price, cost: p.cost, stock: p.stock,
    image: p.image, description: p.description, tags: p.tags, channels: p.channels, status: p.status,
    catalogKind: p.catalogKind, deviceTypeId: p.deviceTypeId, manufacturerModel: p.manufacturerModel,
    parentProductId: p.parentProductId, specs: p.specs, protocols: p.protocols,
    capabilities: p.capabilities, selectionStatus: p.selectionStatus,
    selectionEvidence: p.selectionEvidence, pricingStatus: p.pricingStatus,
    pricingEvidence: p.pricingEvidence,
    mappingRevision: p.mappingRevision,
    // —— 本次变更 ——
    manufacturerModel: u.model,
    price: u.price,
    cost: u.cost,
    image: `/assets/products/xiaomi/${u.image}`,
    description: u.desc,
    protocols: u.proto,
    capabilities: u.caps,
    tags: [...new Set([...(p.tags || []), "音箱", "小米音箱"])],
  }
  if (!u.image) delete body.image

  if (dry) { console.log(`  · ${u.sku} 将更新 ${Object.keys(u).filter(k=>k!=="sku").join(",")}`); continue }

  const r = await api("PATCH", `/api/admin/products/${cur.id}`, body)
  results.push({ sku: u.sku, ok: r.ok, status: r.status, id: cur.id, rev: r.json?.product?.mappingRevision, error: r.json?.error })
  console.log(`  ${r.ok ? "✓" : "✗"} ${u.sku} ${r.ok ? `rev ${r.json?.product?.mappingRevision}` : `HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0,120)}`}`)
}

writeFileSync(".local/product-catalog-collection/20261015-xiaomi-speaker/update-result.json", JSON.stringify({ results }, null, 2))
console.log(`\n成功 ${results.filter(r=>r.ok).length} | 失败 ${results.filter(r=>!r.ok).length}`)
