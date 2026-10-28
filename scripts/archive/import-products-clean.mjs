import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"
import { Client } from "pg"
import { legacyProductUpdatePredicate, prepareLegacyProductImport } from "../import-product-safety.mjs"

const workspace = "C:/Users/lynnl/Documents/fmkj_v3"
const sourceXlsx =
  "C:/Users/lynnl/.qoderwork/workspace/mqtqzn1zdrmv1wke/outputs/products_clean.xlsx"
const python = "C:/Users/lynnl/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
const connectionString = requireDatabaseUrl()
const actorId = "10000000-0000-0000-0000-000000000002"
const publicDir = join(workspace, "public")
const imageDir = join(publicDir, "assets/products/imported")
const backupPath = join(workspace, `products-import-backup-${stamp()}.json`)
const logPath = join(workspace, "products-clean-import-results.json")

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
    results.push({ sourceId: product.sourceId, sku: product.sku, ok: false, reason: "image-download-failed" })
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

  results.push({ sourceId: product.sourceId, sku: product.sku, name: product.name, ok: written.rowCount > 0, ...(written.rowCount ? { image } : { reason: "protected-product-skipped" }) })
}

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
  byBrand: countBy(results.filter((item) => item.ok), (item) => item.name.split(" ")[0]),
  results,
}

writeFileSync(logPath, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))

function readWorkbookRows() {
  const code = `
import pandas as pd, json
path = r'''${sourceXlsx}'''
df = pd.read_excel(path, sheet_name='Products')
df = df.astype(object).where(pd.notnull(df), None)
print(json.dumps(df.to_dict(orient='records'), ensure_ascii=False, default=str))
`
  const result = spawnSync(python, ["-c", code], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    maxBuffer: 50 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to read workbook")
  }
  return JSON.parse(result.stdout)
}

function normalizeRow(row) {
  const sourceId = Number(row.ID)
  const productName = cleanText(row["产品名称"])
  const spec = cleanText(row["SKU规格"])
  const imageUrl = cleanText(row["主图URL"])
  const sourceUrl = cleanText(row["产品来源链接"])
  const brand = normalizeBrand(row["品牌"], productName)
  const model = cleanText(row["型号"])
  const price = positiveNumber(row["促销价"]) || positiveNumber(row["价格"]) || price
  const stock = Math.max(0, Math.round(Number(row["库存"] ?? 0) || 0))

  if (!sourceId || !productName || !spec || !imageUrl || !brand || !price) return null
  if (isServiceLike(productName, spec)) return null

  const category = inferCategory(`${productName} ${spec} ${model}`)
  const displayModel = model && model !== "nan" ? model : extractModel(spec) || extractModel(productName)
  const name = compactName(brand, displayModel, spec, productName)
  const sku = `XLSX-CLEAN-${String(sourceId).padStart(4, "0")}`
  const platform = inferPlatform(`${productName} ${spec}`)
  const description = buildDescription(row, spec)
  const tags = unique([
    "Excel导入",
    brand,
    category,
    platform,
    displayModel,
    cleanText(row["功率"]),
    cleanText(row["电压"]),
    cleanText(row["色温"]),
    cleanText(row["显色指数"]),
    cleanText(row["安装方式"]),
    cleanText(row["控制方式"]),
  ]).slice(0, 12)

  return {
    sourceId,
    sku,
    name,
    unit: inferUnit(category, spec),
    price,
    cost: Math.round(price * 0.72),
    stock,
    brand,
    platform,
    category,
    imageUrl,
    description,
    tags,
    channels: unique([inferChannel(sourceUrl), "products_clean.xlsx"]).filter(Boolean),
  }
}

async function ensureImage(product) {
  const ext = imageExtension(product.imageUrl)
  const fileName = `${product.sku.toLowerCase()}-${hashShort(product.imageUrl)}.${ext}`
  const filePath = join(imageDir, fileName)
  const publicPath = `/assets/products/imported/${fileName}`

  if (existsSync(filePath) && imageDimensions(readFileSync(filePath))) {
    return { path: publicPath, source: product.imageUrl, reused: true }
  }

  let response
  try {
    response = await fetch(product.imageUrl, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(25000),
    })
  } catch {
    return null
  }

  if (!response.ok) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  const dimensions = imageDimensions(bytes)
  if (!dimensions || dimensions.width < 180 || dimensions.height < 180 || bytes.length < 4000) {
    return null
  }

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, bytes)
  return {
    path: publicPath,
    source: product.imageUrl,
    bytes: bytes.length,
    dimensions,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}

function isServiceLike(name, spec) {
  const text = `${name} ${spec}`
  return [
    "仅包基础",
    "详询客服",
    "咨询客服",
    "此条勿拍",
    "勿拍",
    "测量服务费",
    "服务费",
    "差价",
    "补拍",
    "定金",
    "预约",
    "专拍",
    "联系客服备注",
  ].some((term) => text.includes(term))
}

function compactName(brand, model, spec, productName) {
  const cleanSpec = spec
    .replace(/[【】]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\| 无规格/g, "")
    .trim()
  const modelPart = model ? `${model} ` : ""
  const base = `${brand} ${modelPart}${cleanSpec}`.replace(/\s+/g, " ").trim()
  return truncate(base.length >= 10 ? base : `${brand} ${productName} ${cleanSpec}`, 96)
}

function buildDescription(row, spec) {
  const pieces = [
    `规格：${spec}`,
    kv("功率", row["功率"]),
    kv("电压", row["电压"]),
    kv("色温", row["色温"]),
    kv("显色指数", row["显色指数"]),
    kv("防护等级", row["防护等级"]),
    kv("安装方式", row["安装方式"]),
    kv("控制方式", row["控制方式"]),
    kv("材质", row["材质"]),
    kv("适用面积", row["适用面积"]),
    kv("质保", row["质保年限"]),
  ]
  return pieces.filter(Boolean).join("；")
}

function inferCategory(text) {
  if (/筒灯|射灯|灯带|青空灯|吸顶灯|面板灯|轨道灯|灯条|吊灯|照明|屏幕挂灯/.test(text)) return "智能照明"
  if (/窗帘|电机|轨道/.test(text)) return "窗帘遮阳"
  if (/开关|插座|旋钮/.test(text)) return "开关插座"
  if (/传感器|人体|门窗|水浸|温湿度|烟雾/.test(text)) return "传感器"
  if (/网关|中控|mesh|蓝牙/.test(text)) return "网关中控"
  if (/门锁|锁/.test(text)) return "安防门锁"
  return "智能家居"
}

function inferUnit(category, spec) {
  if (/轨|米|m直轨/i.test(spec)) return "套"
  if (category === "智能照明") return "盏"
  if (category === "窗帘遮阳") return "套"
  return "个"
}

function inferPlatform(text) {
  if (/米家|小米|mijia/i.test(text)) return "米家"
  if (/HomeKit|Apple/i.test(text)) return "Apple Home"
  if (/蓝牙|mesh/i.test(text)) return "蓝牙 Mesh"
  return "通用"
}

function inferChannel(url) {
  if (/tmall\.com/i.test(url)) return "天猫"
  if (/alicdn|1688|cbu01/i.test(url)) return "阿里渠道"
  if (/jd\.com/i.test(url)) return "京东"
  return url ? "来源链接" : ""
}

function normalizeBrand(value, productName) {
  const raw = cleanText(value).toLowerCase()
  const text = `${raw} ${productName}`.toLowerCase()
  if (/yeelight|易来/.test(text)) return "\u6613\u6765/Yeelight"
  if (/linptech|领普/.test(text)) return "领普"
  if (raw && raw !== "?" && raw !== "其他" && raw !== "nan") return cleanText(value)
  return ""
}

function extractModel(text) {
  const match = String(text ?? "").match(/[A-Z]{1,4}\d+[A-Z0-9-]*|[A-Z]\d+\s?(?:Pro|Mini|MAX)?|G\d+\s?(?:Pro|MINI)?/i)
  return match ? match[0].trim() : ""
}

function cleanText(value) {
  if (value === null || value === undefined) return ""
  const text = String(value).trim()
  return text === "nan" || text === "NaN" ? "" : text
}

function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function kv(label, value) {
  const text = cleanText(value)
  return text ? `${label}：${text}` : ""
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function unique(values) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)))
}

function hashShort(text) {
  return createHash("sha1").update(text).digest("hex").slice(0, 10)
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
