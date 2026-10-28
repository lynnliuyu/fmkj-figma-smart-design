/**
 * 修正小米摄像头图片：原先两条记录共用同一张图（且与「室外三摄变焦版」不符）。
 * 走管理员 API PATCH，先从列表取完整记录再叠加变更（PATCH 非安全局部更新）。
 */
const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1] }
const cookie = opt("--cookie") || process.env.FMKJ_SESSION_COOKIE
const base = opt("--base") || "http://localhost:3000"
if (!cookie) throw new Error("--cookie required")

const headers = { "Content-Type": "application/json", Cookie: cookie }
const api = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, ok: res.ok, json }
}

const changes = [
  { sku: "XIAOMI-CAMERA-4PRO-3LENS-ZOOM", image: "/assets/products/xiaomi/camera-outdoor-4pro-3lens.png" },
  { sku: "XIAOMI-CAMERA-4PRO", image: "/assets/products/xiaomi/camera-4pro-indoor.png" },
]

const list = await api("GET", "/api/admin/products")
if (!list.ok) throw new Error(`读取产品列表失败 HTTP ${list.status}`)
const bySku = new Map(list.json.products.map((p) => [p.sku, p]))

for (const c of changes) {
  const p = bySku.get(c.sku)
  if (!p) { console.log(`  ✗ ${c.sku} 未找到`); continue }
  const body = {
    name: p.name, sku: p.sku, brand: p.brand, platform: p.platform, category: p.category,
    unit: p.unit, price: p.price, cost: p.cost, stock: p.stock,
    image: c.image, description: p.description, tags: p.tags, channels: p.channels, status: p.status,
    catalogKind: p.catalogKind, deviceTypeId: p.deviceTypeId, manufacturerModel: p.manufacturerModel,
    parentProductId: p.parentProductId, specs: p.specs, protocols: p.protocols,
    capabilities: p.capabilities, selectionStatus: p.selectionStatus,
    selectionEvidence: p.selectionEvidence, pricingStatus: p.pricingStatus,
    pricingEvidence: p.pricingEvidence, mappingRevision: p.mappingRevision,
  }
  const r = await api("PATCH", `/api/admin/products/${p.id}`, body)
  console.log(`  ${r.ok ? "✓" : "✗"} ${c.sku}  ${p.name}  ${r.ok ? `rev ${r.json?.product?.mappingRevision}` : `HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 140)}`}`)
  console.log(`      图: ${p.image}  ->  ${c.image}`)
}