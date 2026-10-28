import { Client } from "pg"
import { legacyProductUpdatePredicate, prepareLegacyProductImport } from "../import-product-safety.mjs"

const sourceUrl = process.env.OLD_DATABASE_URL || process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL

if (!sourceUrl) {
  console.error("OLD_DATABASE_URL or SOURCE_DATABASE_URL is required.")
  process.exit(1)
}

if (!targetUrl) {
  console.error("DATABASE_URL or TARGET_DATABASE_URL is required.")
  process.exit(1)
}

if (sourceUrl === targetUrl) {
  console.error("Source and target database URLs are identical. Refusing to import.")
  process.exit(1)
}

const source = new Client({
  connectionString: sourceUrl,
  ssl: shouldUseSsl("SOURCE_DATABASE_SSL", true),
})
const target = new Client({
  connectionString: targetUrl,
  ssl: shouldUseSsl("DATABASE_SSL", false),
})

await source.connect()
await target.connect()

try {
  const sourceColumns = await listColumns(source, "products")
  if (!sourceColumns.has("sku") || !sourceColumns.has("name")) {
    throw new Error("Source products table must have at least sku and name columns.")
  }

  const rows = await readSourceProducts(source, sourceColumns)
  const actorId = await getActorId(target)

  await target.query("begin")
  await prepareLegacyProductImport(target)

  let imported = 0
  let skipped = 0
  const skippedRows = []

  for (const row of rows) {
    const product = normalizeProduct(row)
    if (!product) {
      skipped += 1
      skippedRows.push({ id: row.id ?? null, sku: row.sku ?? null, reason: "missing name or sku" })
      continue
    }

    const written = await target.query(
      `
      insert into products (
        created_by, updated_by, submitted_by, name, brand, platform, category, sku, unit,
        price, cost, stock, image, description, tags, channels, status, deleted_at, updated_at
      )
      values (
        $1::uuid, $1::uuid, $1::uuid, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, null, now()
      )
      on conflict (sku) do update set
        updated_by = excluded.updated_by,
        name = excluded.name,
        brand = excluded.brand,
        platform = excluded.platform,
        category = excluded.category,
        unit = excluded.unit,
        price = excluded.price,
        cost = excluded.cost,
        stock = excluded.stock,
        image = excluded.image,
        description = excluded.description,
        tags = excluded.tags,
        channels = excluded.channels,
        status = excluded.status,
        deleted_at = null,
        updated_at = now()
      where ${legacyProductUpdatePredicate()}
      `,
      [
        actorId,
        product.name,
        product.brand,
        product.platform,
        product.category,
        product.sku,
        product.unit,
        product.price,
        product.cost,
        product.stock,
        product.image,
        product.description,
        JSON.stringify(product.tags),
        JSON.stringify(product.channels),
        product.status,
      ]
    )
    if (written.rowCount) imported += 1
    else {
      skipped += 1
      skippedRows.push({ id: row.id ?? null, sku: row.sku ?? null, reason: "protected-product-skipped" })
    }
  }

  await target.query("commit")

  const count = await target.query("select count(*)::int as count from products where deleted_at is null")
  console.log(
    JSON.stringify(
      {
        imported,
        skipped,
        activeProductRows: count.rows[0]?.count ?? 0,
        skippedRows: skippedRows.slice(0, 20),
      },
      null,
      2
    )
  )
} catch (error) {
  await target.query("rollback").catch(() => {})
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await source.end().catch(() => {})
  await target.end().catch(() => {})
}

async function listColumns(client, tableName) {
  const result = await client.query(
    `
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = $1
    `,
    [tableName]
  )
  return new Set(result.rows.map((row) => row.column_name))
}

async function readSourceProducts(client, columns) {
  const select = [
    "id",
    "name",
    "brand",
    "platform",
    "category",
    "sku",
    "unit",
    "price",
    "cost",
    "stock",
    "image",
    "description",
    "tags",
    "channels",
    "status",
    "deleted_at",
  ]
    .filter((column) => columns.has(column))
    .map((column) => quoteIdentifier(column))
    .join(", ")

  const where = columns.has("deleted_at") ? "where deleted_at is null" : ""
  const result = await client.query(`select ${select} from products ${where} order by created_at nulls last, name`)
  return result.rows
}

function normalizeProduct(row) {
  const name = cleanText(row.name)
  const sku = cleanText(row.sku) || (row.id ? `LEGACY-${row.id}` : "")
  if (!name || !sku) return null

  const text = [row.category, row.name, row.brand, row.platform, row.description, row.sku].map(cleanText).join(" ")

  return {
    name,
    sku,
    brand: normalizeBrand(row.brand),
    platform: normalizePlatform(row.platform),
    category: normalizeCategory(text),
    unit: cleanText(row.unit) || "\u4e2a",
    price: nonNegativeNumber(row.price),
    cost: nonNegativeNumber(row.cost),
    stock: Math.max(0, Math.round(Number(row.stock ?? 0) || 0)),
    image: cleanText(row.image) || null,
    description: cleanText(row.description) || null,
    tags: normalizeArray(row.tags),
    channels: unique([...normalizeArray(row.channels), "legacy-neon-import"]),
    status: normalizeStatus(row.status),
  }
}

function normalizeCategory(text) {
  if (/(\u76d1\u63a7|\u6444\u50cf|camera|ipc|nvr)/i.test(text)) return "\u76d1\u63a7"
  if (/(\u95e8\u9501|\u667a\u80fd\u9501|\u6307\u7eb9\u9501|door lock|lock|\u95e8\u7981)/i.test(text)) return "\u95e8\u9501"
  if (/(\u4f20\u611f|\u4eba\u4f53|\u5b58\u5728|\u6e29\u6e7f\u5ea6|\u6e29\u5ea6|\u6e7f\u5ea6|\u70df\u96fe|\u70df\u611f|\u6c34\u6d78|\u6f0f\u6c34|\u95e8\u78c1|pir|sensor)/i.test(text)) return "\u4f20\u611f\u5668"
  if (/(\u7a97\u5e18|\u5377\u5e18|\u7535\u673a|curtain)/i.test(text)) return "\u7a97\u5e18"
  if (/(\u63d2\u5ea7|\u5730\u63d2|usb\u63d2|socket|outlet)/i.test(text)) return "\u63d2\u5ea7"
  if (/(\u6696\u901a|\u7a7a\u8c03|\u6e29\u63a7|\u65b0\u98ce|\u5730\u6696|vrf|\u98ce\u673a\u76d8\u7ba1|\u591a\u8054\u673a|hvac)/i.test(text)) return "\u6696\u901a\u63a7\u5236"
  if (/(wifi|wi-fi|\u65e0\u7ebf|ap|mesh|\u8def\u7531|\u4ea4\u6362\u673a|\u7f51\u7edc\u8986\u76d6|poe|\u7f51\u53e3)/i.test(text)) return "\u5168\u5c4bwifi"
  if (/(\u7f51\u5173|\u4e2d\u63a7|\u5999\u63a7|\u667a\u80fd\u9762\u677f|\u63a7\u5236\u5c4f|hub|gateway|panel)/i.test(text)) return "\u7f51\u5173\u4e2d\u63a7"
  if (/(\u5f00\u5173|\u573a\u666f|\u8c03\u5149|\u56de\u8def|switch|dimmer)/i.test(text)) return "\u5f00\u5173"
  if (/(\u667a\u80fd\u706f|\u706f\u5e26|\u7b52\u706f|\u5c04\u706f|\u8f68\u9053\u706f|\u78c1\u5438\u706f|\u667a\u80fd\u7167\u660e|downlight|spotlight|light)/i.test(text)) return "\u667a\u80fd\u706f\u5177"
  if (/(\u666e\u901a\u706f|\u540a\u706f|\u58c1\u706f|\u5438\u9876\u706f|\u666e\u901a\u7167\u660e)/i.test(text)) return "\u666e\u901a\u706f\u5177"
  return "\u5176\u4ed6"
}

function normalizeBrand(value) {
  const brand = cleanText(value)
  const lower = brand.toLowerCase()
  if (["\u6613\u6765", "yeelight", "\u6613\u6765/yeelight"].includes(lower)) return "\u6613\u6765/yeelight"
  if (["\u9510\u6377", "ruijie", "\u9510\u6377/ruijie"].includes(lower)) return "\u9510\u6377/Ruijie"
  if (["\u9886\u666e", "linptech", "\u9886\u666e/linptech"].includes(lower)) return "\u9886\u666e/Linptech"
  if (["\u5c0f\u7c73", "xiaomi", "\u5c0f\u7c73/xiaomi"].includes(lower)) return "\u5c0f\u7c73/xiaomi"
  if (["\u5e73\u5934\u718a", "ptx", "\u5e73\u5934\u718a/ptx"].includes(lower)) return "\u5e73\u5934\u718a/PTX"
  if (["Aqara", "\u9e7f\u5ba2", "\u4e2d\u5f18", "\u91d1\u95ea"].includes(brand)) return brand
  return brand || "\u5176\u4ed6"
}

function normalizePlatform(value) {
  const platform = cleanText(value)
  const lower = platform.toLowerCase()
  if (platform === "\u7c73\u5bb6") return "\u7c73\u5bb6"
  if (platform === "\u7eff\u7c73") return "\u7eff\u7c73"
  if (platform === "\u534e\u4e3a" || platform === "\u534e\u4e3a\u5168\u5c4b\u667a\u80fd") return "\u534e\u4e3a"
  if (["apple home", "homekit", "aqara / apple home"].includes(lower)) return "Apple Home"
  if (["google home"].includes(lower)) return "Google Home"
  if (lower === "knx") return "knx"
  if (["tuya", "\u6d82\u9e26"].includes(lower)) return "tuya"
  return "\u5176\u4ed6"
}

function normalizeStatus(value) {
  const status = cleanText(value)
  return ["pending_review", "approved", "rejected", "inactive", "active"].includes(status) ? status : "active"
}

function normalizeArray(value) {
  if (Array.isArray(value)) return unique(value.map(cleanText).filter(Boolean))
  if (value && typeof value === "object") return []
  const text = cleanText(value)
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? unique(parsed.map(cleanText).filter(Boolean)) : []
  } catch {
    return unique(text.split(/[;,，、]/).map(cleanText).filter(Boolean))
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function nonNegativeNumber(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function cleanText(value) {
  if (value === null || value === undefined) return ""
  return String(value).trim().replace(/^['\"]|['\"]$/g, "")
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`
}

function shouldUseSsl(envKey, defaultValue) {
  const raw = process.env[envKey]
  const enabled = raw === undefined ? defaultValue : raw === "true"
  return enabled ? { rejectUnauthorized: false } : false
}
