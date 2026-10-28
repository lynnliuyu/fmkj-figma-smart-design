import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"
import { Client } from "pg"

// 把渠道价写入 products.cost，并同步更新 description / tags / channels
// 数据来源：scripts/data/sumi-channel-prices.json
//   万嘉智能 wanjiaiot.com（区域经销商，工程报价）
//   京家供应链 jingjiasc.com（工程批发，阶梯价+实时库存）
// 采集时间：2026-10-13

const workspace = process.cwd()
const actorId = "10000000-0000-0000-0000-000000000002"
const connectionString = requireDatabaseUrl()

const raw = JSON.parse(readFileSync(join(workspace, "scripts/data/sumi-channel-prices.json"), "utf8"))
const backupPath = join(workspace, `sumi-cost-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
const logPath = join(workspace, "sumi-cost-update-results.json")

const client = new Client({ connectionString })
await client.connect()

const before = await client.query("select id, sku, name, price, cost, tags, description, channels from products where deleted_at is null and brand = $1 order by sku", ["苏米/SUMI"])
writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: before.rows }, null, 2))

const results = { updated: [], skipped: [], conflicts: [] }

for (const row of before.rows) {
  // 用产品名匹配渠道价数据（渠道价 key 为官网原始名）
  const entry = findEntry(raw, row.name)
  if (!entry || !entry.suggestedCost) {
    results.skipped.push({ sku: row.sku, name: row.name, reason: entry ? "无建议成本" : "渠道价数据无匹配" })
    continue
  }

  const cost = Math.round(Number(entry.suggestedCost))
  if (!Number.isFinite(cost) || cost <= 0) {
    results.skipped.push({ sku: row.sku, name: row.name, reason: "成本值非法" })
    continue
  }

  // 渠道价高于官网零售价 → 不是成本，是零售加价，不写入
  if (cost > Number(row.price)) {
    results.conflicts.push({ sku: row.sku, name: row.name, cost, price: Number(row.price), reason: "渠道价高于官网价，判定为零售加价而非成本" })
    continue
  }

  // 构造成本说明文本
  const prices = (entry.channelPrices || []).slice(0, 6).map((c) => {
    const src = c.source ? `${c.source}` : "渠道"
    return `${src}￥${c.price}${c.spec ? `(${c.spec})` : ""}`
  })
  const sources = [...new Set((entry.channelPrices || []).map((c) => c.source).filter(Boolean))]

  const costNote = [
    `参考成本：￥${cost}`,
    prices.length ? `渠道价：${prices.join(" / ")}` : "",
    entry.note ? `备注：${entry.note}` : "",
  ].filter(Boolean).join("；")

  // 合并进 description（追加到末尾，去重）
  const desc = row.description || ""
  const newDesc = desc.includes("参考成本") ? desc : desc ? `${desc}；${costNote}` : costNote

  // tags 追加渠道标记
  const tags = Array.isArray(row.tags) ? [...row.tags] : []
  for (const t of ["已核渠道价", ...sources.map((s) => `渠道:${s}`)]) {
    if (t && !tags.includes(t) && tags.length < 12) tags.push(t)
  }

  // channels 追加渠道来源
  const channels = Array.isArray(row.channels) ? [...row.channels] : []
  for (const c of sources) {
    const v = `渠道价-${c}`
    if (!channels.includes(v)) channels.push(v)
  }

  await client.query(
    `update products
       set cost = $1, description = $2, tags = $3::jsonb, channels = $4::jsonb, updated_by = $5, updated_at = now()
     where id = $6`,
    [cost, newDesc, JSON.stringify(tags), JSON.stringify(channels), actorId, row.id]
  )

  results.updated.push({
    sku: row.sku,
    name: row.name,
    cost,
    retailPrice: Number(row.price),
    grossMargin: Number(row.price) - cost,
    marginRate: Number(row.price) ? `${(((Number(row.price) - cost) / Number(row.price)) * 100).toFixed(1)}%` : "n/a",
    sources,
  })
}

const after = await client.query(
  `select count(*)::int as total,
      count(*) filter (where cost > 0)::int as with_cost,
      round(avg(cost) filter (where cost > 0))::int as avg_cost,
      count(*) filter (where cost > 0 and price > cost)::int as profitable
   from products where deleted_at is null and brand = $1`,
  ["苏米/SUMI"]
)

const margin = await client.query(
  `select sku, name, price, cost, round((price - cost) / nullif(price,0) * 100)::int as margin_pct
   from products where deleted_at is null and brand = $1 and cost > 0
   order by margin_pct asc nulls last limit 12`,
  ["苏米/SUMI"]
)

await client.end()

const summary = {
  createdAt: new Date().toISOString(),
  backupPath,
  logPath,
  updated: results.updated.length,
  skipped: results.skipped.length,
  conflicts: results.conflicts.length,
  sumiAfter: after.rows[0],
  lowestMargin: margin.rows,
  ...results,
}

writeFileSync(logPath, JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ updated: summary.updated, skipped: summary.skipped, conflicts: summary.conflicts, sumiAfter: summary.sumiAfter, lowestMargin: summary.lowestMargin }, null, 2))

function findEntry(data, productName) {
  // 精确匹配
  if (data[productName]) return data[productName]
  // 去掉型号前缀后匹配（name 形如 "苏米 SLC-H2UP 智能开关H2 Ultra"）
  const cleaned = productName.replace(/^苏米\s*(SLC-[A-Z0-9]+\s*)?/, "").trim()
  for (const [k, v] of Object.entries(data)) {
    const kc = k.replace(/^苏米\S*/, "").replace(/智能开关/, "智能开关").trim()
    if (kc && (cleaned.includes(kc) || kc.includes(cleaned))) return v
    // 直接关键词包含
    const key = k.replace(/（.*?）|\(.*?\)/g, "")
    if (key.length > 4 && productName.includes(key.replace(/^苏米/, ""))) return v
  }
  return null
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is required to run this maintenance script.")
  return url
}
