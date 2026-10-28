/** 目录审核：把本批 pending_review 产品批准加入产品库（bulk-review，1–500 项/次） */
import { readFileSync, writeFileSync } from "node:fs"

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

const wr = JSON.parse(readFileSync(".local/product-catalog-collection/20261016-apple-home/write-result.json", "utf8"))
const created = wr.results.filter((r) => r.action === "created")
console.log(`本批新建 ${created.length} 条，开始目录审核…`)

// 分批（bulk-review 单次上限 500）
for (let i = 0; i < created.length; i += 500) {
  const chunk = created.slice(i, i + 500)
  const payload = {
    products: chunk.map((r) => ({ id: r.id, mappingRevision: r.mappingRevision })),
    note: "Apple Home 生态采集批次 20261016：官网/官方商店页已核对型号与 Apple 家庭支持；参数与价格多数仍待核，批准仅表示目录准入。",
  }
  const r = await api("POST", "/api/admin/products/bulk-review", payload)
  if (!r.ok) {
    console.error(`  ✗ 审核失败 HTTP ${r.status}: ${JSON.stringify(r.json)?.slice(0, 300)}`)
    process.exit(1)
  }
  console.log(`  ✓ 批准 ${r.json.approved} / 跳过 ${r.json.skipped}（跳过 ${(r.json.skippedProducts || []).map((p) => p.sku || p.name).join(", ") || "无"}）`)
}

writeFileSync(".local/product-catalog-collection/20261016-apple-home/review-result.json",
  JSON.stringify({ reviewedAt: new Date().toISOString(), count: created.length }, null, 2))
console.log("目录审核完成")