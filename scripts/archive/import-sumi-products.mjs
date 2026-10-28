import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"
import { Client } from "pg"
import { legacyProductUpdatePredicate, prepareLegacyProductImport } from "../import-product-safety.mjs"

// 苏米科技（SUMI）产品导入脚本
// 数据来源：https://www.sumi-technology.com/saleproducts
// 参数来源：官网产品中心价格 + 官方说明书 PDF + 已核实的渠道参数
// 图片：已下载至 public/assets/products/sumi/

const workspace = process.cwd()
const actorId = "10000000-0000-0000-0000-000000000002"
const brand = "苏米/SUMI"
const connectionString = requireDatabaseUrl()

const rows = JSON.parse(readFileSync(join(workspace, "scripts/data/sumi-products.json"), "utf8"))

const backupPath = join(workspace, `sumi-import-backup-${stamp()}.json`)
const logPath = join(workspace, "sumi-import-results.json")

const client = new Client({ connectionString })
await client.connect()

// 导入前备份同品牌存量数据
const existing = await client.query(
  "select * from products where brand = $1 or name like '%苏米%' order by created_at",
  [brand]
)
writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: existing.rows }, null, 2))
await prepareLegacyProductImport(client)

const results = []
for (const item of rows) {
  if (!item.image) {
    results.push({ sku: item.sku, name: item.name, ok: false, reason: "image-missing" })
    continue
  }

  const written = await client.query(
    `
      insert into products (
        created_by, updated_by, status, name, sku, unit, price, brand, platform, category,
        cost, stock, image, description, tags, channels, deleted_at, updated_at
      )
      values (
        $1, $1, 'active', $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13::jsonb, $14::jsonb, null, now()
      )
      on conflict (sku) do update set
        updated_by = excluded.updated_by,
        status = 'active',
        name = excluded.name,
        unit = excluded.unit,
        price = excluded.price,
        brand = excluded.brand,
        platform = excluded.platform,
        category = excluded.category,
        cost = excluded.cost,
        stock = excluded.stock,
        image = excluded.image,
        description = excluded.description,
        tags = excluded.tags,
        channels = excluded.channels,
        deleted_at = null,
        updated_at = now()
      where ${legacyProductUpdatePredicate()}
    `,
    [
      actorId,
      item.name,
      item.sku,
      item.unit,
      item.price,
      item.brand,
      item.platform,
      item.category,
      item.cost,
      item.stock,
      item.image,
      item.description,
      JSON.stringify(item.tags),
      JSON.stringify(item.channels),
    ]
  )

  results.push({ sku: item.sku, name: item.name, ok: written.rowCount > 0, ...(written.rowCount ? { category: item.category, price: item.price } : { reason: "protected-product-skipped" }) })
}

const after = await client.query(
  `select count(*)::int as total,
      count(*) filter (where category = '开关')::int as switches,
      count(*) filter (where image is not null and image <> '')::int as with_image
   from products
   where deleted_at is null and coalesce(status, 'active') = 'active' and brand = $1`,
  [brand]
)

const byCategory = await client.query(
  `select category, count(*)::int as n from products
   where deleted_at is null and brand = $1 group by category order by n desc`,
  [brand]
)

await client.end()

const summary = {
  createdAt: new Date().toISOString(),
  source: "https://www.sumi-technology.com/saleproducts",
  backupPath,
  logPath,
  total: rows.length,
  imported: results.filter((item) => item.ok).length,
  skipped: results.filter((item) => !item.ok).length,
  verifiedSpecs: rows.filter((item) => item.specVerified).length,
  sumiAfter: after.rows[0],
  byCategory: byCategory.rows,
  results,
}

writeFileSync(logPath, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is required to run this maintenance script.")
  return url
}
