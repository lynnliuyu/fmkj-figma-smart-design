import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"
import { Client } from "pg"
import { legacyProductUpdatePredicate, prepareLegacyProductImport } from "../import-product-safety.mjs"

const workspace = "C:/Users/lynnl/Documents/fmkj_v3"
const sourceXlsx = process.argv[2] ?? "C:/Users/lynnl/Desktop/scraped_product_20260626045145032.xlsx"
const python = "C:/Users/lynnl/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
const connectionString = requireDatabaseUrl()
const actorId = "10000000-0000-0000-0000-000000000002"
const imageDir = join(workspace, "public/assets/products/scraped")
const backupPath = join(workspace, `products-scraped-import-backup-${stamp()}.json`)
const logPath = join(workspace, "products-scraped-import-results.json")

const rows = readWorkbookRows()
const cleaned = rows.map(normalizeRow).filter(Boolean)

const client = new Client({ connectionString })
await client.connect()

const before = await client.query("select * from products order by created_at")
writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: before.rows }, null, 2))
await prepareLegacyProductImport(client)

const results = []
for (const product of cleaned) {
  const image = await ensureImage(product)
  if (!image) {
    results.push({ sku: product.sku, name: product.name, ok: false, reason: "image-download-failed" })
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
      product.name,
      product.sku,
      product.unit,
      product.price,
      product.brand,
      product.platform,
      product.category,
      product.cost,
      product.stock,
      image.path,
      product.description,
      JSON.stringify(product.tags),
      JSON.stringify(product.channels),
    ]
  )

  results.push({ sku: product.sku, name: product.name, ok: written.rowCount > 0, ...(written.rowCount ? { image } : { reason: "protected-product-skipped" }) })
}

const after = await client.query(`
  select count(*)::int as total,
    count(*) filter (where image is not null and image <> '')::int as with_image
  from products
  where deleted_at is null and coalesce(status, 'active') = 'active'
`)
await client.end()

const summary = {
  createdAt: new Date().toISOString(),
  sourceXlsx,
  backupPath,
  scanned: rows.length,
  cleaned: cleaned.length,
  imported: results.filter((item) => item.ok).length,
  skipped: rows.length - cleaned.length + results.filter((item) => !item.ok).length,
  skippedByCleanRule: rows.length - cleaned.length,
  imageFailed: results.filter((item) => !item.ok).length,
  activeProductsAfter: after.rows[0],
  byBrand: countBy(results.filter((item) => item.ok), (item) => item.name.split(" ")[0]),
  results,
}

writeFileSync(logPath, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))

function readWorkbookRows() {
  const code = `
import pandas as pd, json
path = r'''${sourceXlsx}'''
df = pd.read_excel(path, sheet_name='sheet')
df = df.astype(object).where(pd.notnull(df), None)
print(json.dumps(df.to_dict(orient='records'), ensure_ascii=False, default=str))
`
  const result = spawnSync(python, ["-c", code], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    maxBuffer: 80 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Failed to read workbook")
  return JSON.parse(result.stdout)
}

function normalizeRow(row) {
  const rawName = cleanText(row["产品名称"])
  const variant = [row["变种选项 1"], row["变种选项 2"], row["变种选项 3"]]
    .map(cleanText)
    .filter(Boolean)
    .join(" / ")
  const shortDescription = cleanText(row["短描述"])
  const sourceUrl = cleanText(row["产品来源链接"])
  const price = positiveNumber(row["促销价"]) || positiveNumber(row["价格"])
  const stock = Math.max(0, Math.round(Number(row["库存"] ?? 0) || 0))
  const images = collectImages(row)
  const brand = normalizeBrand(shortDescription, rawName)

  if (!rawName || !variant || !price || images.length === 0) return null
  if (isServiceLike(`${rawName} ${variant} ${shortDescription}`)) return null

  const model = extractField(shortDescription, "型号") || extractField(shortDescription, "货号") || extractModel(rawName)
  const category = inferCategory(`${rawName} ${variant} ${shortDescription}`)
  const platform = inferPlatform(`${rawName} ${variant} ${shortDescription}`)
  const displayBrand = brand || "其他"
  const name = compactName(displayBrand, model, variant, rawName)
  const skuBase = cleanText(row["SKU"]) || `${sourceUrl}|${variant}|${rawName}`

  return {
    sku: `SCRAPED-${hashShort(skuBase).toUpperCase()}`,
    name,
    unit: inferUnit(category, variant),
    price,
    cost: Math.round(price * 0.72),
    stock,
    brand: displayBrand,
    platform,
    category,
    imageUrls: images,
    description: buildDescription(rawName, variant, shortDescription),
    tags: unique(["Excel导入", "带图", displayBrand, category, platform, model, variant]).slice(0, 12),
    channels: unique([inferChannel(sourceUrl), "scraped_product_20260626045145032.xlsx"]).filter(Boolean),
  }
}

async function ensureImage(product) {
  for (const imageUrl of product.imageUrls) {
    const ext = imageExtension(imageUrl)
    const fileName = `${product.sku.toLowerCase()}-${hashShort(imageUrl)}.${ext}`
    const filePath = join(imageDir, fileName)
    const publicPath = `/assets/products/scraped/${fileName}`

    if (existsSync(filePath) && imageDimensions(readFileSync(filePath))) {
      return { path: publicPath, source: imageUrl, reused: true }
    }

    let response
    try {
      response = await fetch(imageUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          referer: "https://detail.1688.com/",
        },
        signal: AbortSignal.timeout(25000),
      })
    } catch {
      continue
    }

    if (!response.ok) continue
    const bytes = Buffer.from(await response.arrayBuffer())
    const dimensions = imageDimensions(bytes)
    if (!dimensions || dimensions.width < 180 || dimensions.height < 180 || bytes.length < 4000) continue

    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, bytes)
    return {
      path: publicPath,
      source: imageUrl,
      bytes: bytes.length,
      dimensions,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }
  }

  return null
}

function collectImages(row) {
  const urls = []
  for (let i = 1; i <= 9; i += 1) urls.push(cleanText(row[`变种图 ${i}`]))
  for (let i = 1; i <= 9; i += 1) urls.push(cleanText(row[`产品图 ${i}`]))
  const longDescription = cleanText(row["长描述"])
  for (const match of longDescription.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) urls.push(match[1])
  return unique(urls).filter((url) => /^https?:\/\//i.test(url))
}

function buildDescription(rawName, variant, shortDescription) {
  const details = parseShortDescription(shortDescription)
  const useful = [
    ["规格", variant],
    ["原产品名", rawName],
    ["型号", details["型号"]],
    ["货号", details["货号"]],
    ["类型", details["类型"] || details["电子电工产品类型"]],
    ["智能生态", details["智能家居生态系统"]],
    ["安装方式", details["安装方式"]],
    ["控制方式", details["控制方式"]],
  ]
  return useful
    .filter(([, value]) => cleanText(value))
    .map(([key, value]) => `${key}: ${cleanText(value)}`)
    .join("；")
}

function parseShortDescription(text) {
  const result = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^:：]+)[:：]\s*(.+)$/)
    if (match) result[match[1].trim()] = match[2].trim()
  }
  return result
}

function normalizeBrand(description, productName) {
  const text = `${description} ${productName}`.toLowerCase()
  const brandField = extractField(description, "品牌")
  if (/linptech|领普/.test(text)) return "领普/Linptech"
  if (/yeelight|易来/.test(text)) return "易来/Yeelight"
  if (/aqara|绿米/.test(text)) return "Aqara/绿米"
  if (/xiaomi|小米|米家/.test(text)) return "米家"
  if (brandField) return brandField.replace(/（.*?）|\(.*?\)/g, "").trim()
  return ""
}

function inferCategory(text) {
  if (/传感器|人体存在|门窗|水浸|温湿度|烟雾/.test(text)) return "传感器"
  if (/开关|插座|旋钮|面板/.test(text)) return "开关插座"
  if (/网关|中控|mesh|蓝牙/.test(text)) return "网关中控"
  if (/窗帘|电机|轨道/.test(text)) return "窗帘遮阳"
  if (/灯|照明|射灯|筒灯|灯带|吸顶灯/.test(text)) return "智能照明"
  if (/门锁|锁/.test(text)) return "安防门锁"
  return "智能家居"
}

function inferUnit(category, variant) {
  if (/套|组合|套餐/.test(variant)) return "套"
  if (category === "智能照明") return "盏"
  return "个"
}

function inferPlatform(text) {
  if (/米家|小米|mijia/i.test(text)) return "米家"
  if (/homekit|apple/i.test(text)) return "Apple Home"
  if (/mesh/i.test(text)) return "蓝牙 Mesh"
  return "通用"
}

function inferChannel(url) {
  if (/tmall\.com|taobao\.com/i.test(url)) return "天猫/淘宝"
  if (/1688\.com|alicdn|cbu01/i.test(url)) return "1688"
  if (/jd\.com/i.test(url)) return "京东"
  return url ? "来源链接" : ""
}

function compactName(brand, model, variant, rawName) {
  const baseParts = [brand, model, variant].map(cleanText).filter(Boolean)
  const base = unique(baseParts).join(" ")
  return truncate(base.length >= 8 ? base : `${brand} ${rawName} ${variant}`, 96)
}

function isServiceLike(text) {
  return /定金|补拍|差价|服务费|安装费|联系客服|咨询客服|勿拍|预约|专拍|运费/.test(text)
}

function extractField(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = String(text ?? "").match(new RegExp(`${escaped}\\s*[:：]\\s*([^\\n\\r]+)`))
  return match ? cleanText(match[1]) : ""
}

function extractModel(text) {
  const match = String(text ?? "").match(/[A-Z]{1,5}\d+[A-Z0-9()/-]*|[A-Z]\d+\s?(?:Pro|Mini|MAX)?|G\d+\s?(?:Pro|MINI)?/i)
  return match ? match[0].trim() : ""
}

function cleanText(value) {
  if (value === null || value === undefined) return ""
  const text = String(value).replace(/\u00a0/g, " ").trim()
  return text === "nan" || text === "NaN" ? "" : text
}

function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function unique(values) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)))
}

function hashShort(text) {
  return createHash("sha1").update(text).digest("hex").slice(0, 12)
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || "unknown"
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function imageExtension(url) {
  const clean = url.split("?")[0].toLowerCase()
  if (clean.endsWith(".png")) return "png"
  if (clean.endsWith(".webp")) return "webp"
  return "jpg"
}

function imageDimensions(bytes) {
  if (bytes.length < 24) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset < bytes.length - 9) {
      if (bytes[offset] !== 0xff) return null
      const marker = bytes[offset + 1]
      const length = bytes.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
      }
      offset += 2 + length
    }
  }
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { width: 512, height: 512 }
  }
  return null
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
