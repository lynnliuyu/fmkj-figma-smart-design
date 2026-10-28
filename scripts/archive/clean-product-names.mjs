/**
 * 产品名称规范化。
 * 三类处理：
 *   A. 变体拼接名（如「E3-Pro白色单键零火…/E3-Pro白色双键零火…」×N）→ 收敛为系列名
 *   B. 营销词清洗（已接入米家APP / 限时拍N发N / 单拍不发货 / 买灯带必买）
 *   C. 超长套餐名 → 改为结构化简称
 * 原名一律保留进 description，不丢信息。
 * 用法: node scripts/clean-product-names.mjs --cookie "<session>" [--dry]
 */
import { writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1] }
const cookie = opt("--cookie")
const base = opt("--base") || "http://localhost:3000"
const dry = args.includes("--dry")
if (!cookie) throw new Error("--cookie required")
const headers = { "Content-Type": "application/json", Cookie: cookie }

// A. 变体拼接 → 系列名（逐条人工核定，不做机器猜测）
const CONCAT = {
  "XLSX-CLEAN-0389": "领普 E3-Pro 系列墙壁开关",
  "XLSX-CLEAN-0398": "领普 AG玻璃 Mesh2.0 系列开关",
  "XLSX-CLEAN-0441": "领普 E3-S 系列墙壁开关",
  "XLSX-CLEAN-0364": "领普 T1 系列墙壁开关",
  "XLSX-CLEAN-0367": "领普 T1 系列墙壁开关（灰色/白色）",
  "XLSX-CLEAN-0466": "领普 E2 Lite 系列墙壁开关",
  "XLSX-CLEAN-0409": "领普 E3S 系列墙壁开关",
  "XLSX-CLEAN-0368": "领普 顶装人体存在传感器（开孔75/80-90mm）",
  "XLSX-CLEAN-0369": "领普 顶装人体存在传感器 窄边框",
}

// C. 超长套餐名 → 结构化简称
const PACKAGE = {
  "XLSX-CLEAN-0084": "Yeelight T4 2.0 Plus 筒灯10W×8 + 射灯10W×2 套装",
  "XLSX-CLEAN-0085": "Yeelight T4 2.0 Plus 射灯10W×8 + 筒灯10W×2 套装",
  "XLSX-CLEAN-0086": "Yeelight T4 2.0 Plus 筒灯12W×8 + 射灯12W×2 套装",
  "XLSX-CLEAN-0087": "Yeelight T4 2.0 Plus 射灯12W×8 + 筒灯12W×2 套装",
  "XLSX-CLEAN-0112": "Yeelight Libra-2Pro 调光开关 9W（雷达感应）",
}

// B. 营销词清洗规则（顺序敏感）
const MARKETING = [
  [/\s*[（(]?已接入米家\s*APP[）)]?/gi, ""],
  [/\s*[（(]?已接入米家[）)]?/gi, ""],
  [/限时拍\d+发\d+\s*/g, ""],
  [/\s*单拍不发货/g, ""],
  [/买灯带必买电源\s*/g, ""],   // 整词优先，避免残留孤立的「电源」
  [/买灯带必买\s*/g, ""],
  [/\s*现货秒发/g, ""],
]

function cleanMarketing(name) {
  let n = name
  for (const [re, to] of MARKETING) n = n.replace(re, to)
  n = n
    .replace(/\s{2,}/g, " ")
    .replace(/[\s/|+、，,\-]+$/g, "")      // 去尾部残留分隔符
    .replace(/^[\s/|+、，,\-]+/g, "")      // 去首部分隔符
    .replace(/([\/|])\s*\1+/g, "$1")       // 折叠连续分隔符
    .replace(/\s*\|\s*$/g, "")
    .trim()
  return n
}

const res0 = await fetch(base + "/api/admin/products", { headers })
if (!res0.ok) throw new Error("读取产品列表失败 HTTP " + res0.status)
const products = (await res0.json()).products

const results = []
for (const p of products) {
  let newName = null, reason = null
  if (CONCAT[p.sku]) { newName = CONCAT[p.sku]; reason = "A. 变体拼接名收敛为系列名" }
  else if (PACKAGE[p.sku]) { newName = PACKAGE[p.sku]; reason = "C. 超长套餐名结构化" }
  else {
    const cleaned = cleanMarketing(p.name)
    if (cleaned !== p.name && cleaned.length > 0) { newName = cleaned; reason = "B. 营销词清洗" }
  }
  if (!newName || newName === p.name) continue

  const desc = p.description
    ? `${p.description}｜原名：${p.name}`
    : `原名：${p.name}`
  const tags = [...new Set([...(p.tags ?? []), "名称已规范"])].slice(0, 12)

  results.push({ sku: p.sku, id: p.id, reason, before: p.name, after: newName, lenBefore: p.name.length, lenAfter: newName.length })

  if (dry) continue
  const body = {
    name: newName, sku: p.sku, brand: p.brand, platform: p.platform, category: p.category,
    unit: p.unit, price: p.price, cost: p.cost, stock: p.stock, image: p.image,
    description: desc, tags, channels: p.channels, status: p.status,
    mappingRevision: p.mappingRevision,
  }
  const res = await fetch(`${base}/api/admin/products/${p.id}`, { method: "PATCH", headers, body: JSON.stringify(body) })
  if (!res.ok) { results[results.length - 1].error = `HTTP ${res.status}` }
}

const byReason = {}
for (const r of results) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1
console.log(`待修正 ${results.length} 条${dry ? "（预览）" : ""}`)
for (const [k, v] of Object.entries(byReason)) console.log(`  ${k}: ${v}`)
console.log()
for (const r of results.slice(0, 40)) {
  console.log(`[${r.lenBefore}→${r.lenAfter}] ${r.sku}`)
  console.log(`   前: ${r.before}`)
  console.log(`   后: ${r.after}`)
}
if (results.length > 40) console.log(`… 另 ${results.length - 40} 条`)
const failed = results.filter((r) => r.error)
if (failed.length) console.log(`\n失败 ${failed.length} 条`)

writeFileSync(".local/product-catalog-collection/20261015-old-data/name-cleanup.json", JSON.stringify({ at: new Date().toISOString(), dry, count: results.length, results }, null, 2))
