import { writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"
import { Client } from "pg"
import { isProtectedProduct, legacyProductUpdatePredicate } from "../import-product-safety.mjs"

const workspace = "C:/Users/lynnl/Documents/fmkj_v3"
const connectionString = requireDatabaseUrl()
const backupPath = join(workspace, `products-tags-backup-${stamp()}.json`)
const logPath = join(workspace, "products-tags-normalize-results.json")
const maxTags = 6
const maxTagLength = 12

const client = new Client({ connectionString })
await client.connect()

const before = await client.query("select * from products order by created_at")
writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: before.rows }, null, 2))

const results = []
for (const product of before.rows) {
  if (isProtectedProduct(product)) {
    results.push({ sku: product.sku, name: product.name, changed: false, reason: "protected-product-skipped" })
    continue
  }
  const normalized = normalizeTags(product)
  const current = Array.isArray(product.tags) ? product.tags : []
  const changed = JSON.stringify(current) !== JSON.stringify(normalized)

  if (changed) {
    const written = await client.query(`update products set tags = $1::jsonb, updated_at = now() where id = $2 and ${legacyProductUpdatePredicate()}`, [
      JSON.stringify(normalized),
      product.id,
    ])
    if (!written.rowCount) {
      results.push({ sku: product.sku, name: product.name, changed: false, reason: "protected-product-skipped" })
      continue
    }
  }

  results.push({
    sku: product.sku,
    name: product.name,
    changed,
    before: current,
    after: normalized,
  })
}

const verify = await client.query(`
  select
    count(*)::int as products,
    count(*) filter (
      where exists (
        select 1 from jsonb_array_elements_text(tags) t(tag)
        where length(tag) > $1
      )
    )::int as products_with_long_tags,
    coalesce(max(length(tag)), 0)::int as max_tag_length
  from products
  left join lateral jsonb_array_elements_text(tags) t(tag) on true
  where deleted_at is null and coalesce(status, 'active') = 'active'
`, [maxTagLength])

const topTags = await client.query(`
  select tag, count(*)::int as count
  from products, jsonb_array_elements_text(tags) t(tag)
  where deleted_at is null and coalesce(status, 'active') = 'active'
  group by tag
  order by count desc, tag
  limit 50
`)

await client.end()

const summary = {
  createdAt: new Date().toISOString(),
  backupPath,
  scanned: results.length,
  changed: results.filter((item) => item.changed).length,
  unchanged: results.filter((item) => !item.changed).length,
  verify: verify.rows[0],
  topTags: topTags.rows,
  sampleChanged: results.filter((item) => item.changed).slice(0, 30),
}

writeFileSync(logPath, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))

function normalizeTags(product) {
  const existing = Array.isArray(product.tags) ? product.tags : []
  const channels = Array.isArray(product.channels) ? product.channels : []
  const candidates = [
    normalizeBrand(product.brand, product.name),
    normalizeCategory(product.category, product.name),
    normalizePlatform(product.platform, product.name),
    ...existing.map(normalizeKnownTag),
    ...channels.map(normalizeChannel),
    product.image ? "带图" : "",
  ]

  return unique(candidates)
    .map(cleanTag)
    .filter(Boolean)
    .filter(isUsefulShortTag)
    .slice(0, maxTags)
}

function normalizeKnownTag(tag) {
  const text = cleanTag(tag)
  if (!text) return ""
  if (/渠道/.test(text)) return ""
  if (/excel|导入/i.test(text)) return "导入"
  if (/带图/.test(text)) return "带图"
  if (/待核价/.test(text)) return "待核价"
  if (/智能照明|筒灯|射灯|灯带|吸顶灯|照明/.test(text)) return "照明"
  if (/开关插座|智能开关|开关|插座|面板/.test(text)) return "开关面板"
  if (/窗帘遮阳|窗帘/.test(text)) return "窗帘"
  if (/网关|中控|路由|AP|PoE|全屋网络/.test(text)) return "网络设备"
  if (/门锁|摄像机|监控|安防|NVR/.test(text)) return "安防"
  if (/HomeKit|Apple/i.test(text)) return "Apple"
  if (/Zigbee/i.test(text)) return "Zigbee"
  if (/Wi-?Fi\s*7|wifi7/i.test(text)) return "WiFi7"
  if (/Wi-?Fi\s*6|wifi6/i.test(text)) return "WiFi6"
  if (/Mesh/i.test(text)) return "Mesh"
  if (/蓝牙/.test(text)) return "蓝牙"
  if (/米家|小米|mijia/i.test(text)) return "米家"
  if (/锐捷|ruijie/i.test(text)) return "锐捷"
  if (/领普|linptech/i.test(text)) return "领普"
  if (/易来|yeelight/i.test(text)) return "易来"
  if (/Aqara|绿米/i.test(text)) return "Aqara"
  if (/智能家居|通用/.test(text)) return "通用"
  return text
}

function normalizeBrand(brand, name) {
  const text = `${brand ?? ""} ${name ?? ""}`
  if (/锐捷|ruijie/i.test(text)) return "锐捷"
  if (/领普|linptech/i.test(text)) return "领普"
  if (/易来|yeelight/i.test(text)) return "易来"
  if (/Aqara|绿米/i.test(text)) return "Aqara"
  if (/米家|小米|mijia/i.test(text)) return "米家"
  return cleanTag(brand)
}

function normalizeCategory(category, name) {
  const text = `${category ?? ""} ${name ?? ""}`
  if (/照明|灯/.test(text)) return "照明"
  if (/窗帘|遮阳/.test(text)) return "窗帘"
  if (/开关|插座|面板/.test(text)) return "开关面板"
  if (/传感器|人体|门窗|水浸/.test(text)) return "传感器"
  if (/网关|中控|路由|AP|WiFi|wifi/.test(text)) return "网络设备"
  if (/门锁|安防|锁/.test(text)) return "安防"
  return cleanTag(category)
}

function normalizePlatform(platform, name) {
  const text = `${platform ?? ""} ${name ?? ""}`
  if (/米家|小米|mijia/i.test(text)) return "米家"
  if (/HomeKit|Apple/i.test(text)) return "Apple"
  if (/Zigbee/i.test(text)) return "Zigbee"
  if (/Mesh|蓝牙/i.test(text)) return "Mesh"
  if (/通用/.test(text)) return "通用"
  return cleanTag(platform)
}

function normalizeChannel(channel) {
  const text = cleanTag(channel)
  if (/1688|阿里/.test(text)) return "1688"
  if (/天猫|淘宝|tmall|taobao/i.test(text)) return "天猫"
  if (/京东|jd/i.test(text)) return "京东"
  if (/Excel|导入|xlsx/i.test(text)) return "导入"
  if (/渠道|来源/.test(text)) return ""
  return text
}

function isUsefulShortTag(tag) {
  if (!tag || tag.length > maxTagLength) return false
  if (/[/|].{4,}/.test(tag)) return false
  if (/[：:]/.test(tag)) return false
  if (/联系客服|颜色可选|规格|原始|来源|价格|标价|undefined/i.test(tag)) return false
  return true
}

function cleanTag(value) {
  if (value === null || value === undefined) return ""
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[【】（）()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function unique(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const tag = cleanTag(value)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
  }
  return result
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is required to run this maintenance script.")
  }

  return url
}
