import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"
import { Client } from "pg"

const workspace = "C:/Users/lynnl/Documents/fmkj_v3"
const publicDir = join(workspace, "public")
const outputLog = join(workspace, "product-image-collection.json")
const mcporter = "C:/Users/lynnl/AppData/Roaming/npm/mcporter.cmd"
const connectionString = requireDatabaseUrl()

const maxProducts = Number(process.env.MAX_PRODUCTS ?? 12)
const offsetProducts = Number(process.env.OFFSET_PRODUCTS ?? 0)
const blockedHashes = new Set([
  "fab7ebe8d6c1fe8192461b434d84a8f37dc40ba3f1a19d410383fa26a58d5b5e",
  "5351326f24beaf1578bf60565274a7846761e7afb492cea76e78a37f525ee5e1",
])

const client = new Client({ connectionString })
await client.connect()
const { rows } = await client.query(`
  select id::text, sku, name, brand, image
  from products
  where image is not null and btrim(image::text) <> ''
  order by brand, name
`)

const missing = rows.filter((row) => !existsSync(join(publicDir, row.image.replace(/^\//, ""))))
const targets = missing.slice(offsetProducts, offsetProducts + maxProducts)
const results = []

for (const product of targets) {
  const query = `site:jd.com ${product.brand ?? ""} ${product.name ?? ""} ${
    product.sku ?? ""
  } product image`
  const search = spawnSync(
    "cmd.exe",
    ["/c", mcporter, "call", "exa.web_search_exa", `query=${query}`, "numResults=5", "--output", "json"],
    { encoding: "utf8", cwd: workspace }
  )

  if (search.status !== 0) {
    results.push({
      ...product,
      ok: false,
      reason: search.error?.message ?? search.stderr ?? search.stdout,
    })
    continue
  }

  const urls = extractUrls(search.stdout)
  const image = await findProductImage(urls, product)

  if (!image) {
    results.push({ ...product, ok: false, reason: "no-image-found", urls })
    continue
  }

  const filePath = join(publicDir, product.image.replace(/^\//, ""))
  mkdirSync(dirname(filePath), { recursive: true })
  let response
  try {
    response = await fetch(image.url, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    })
  } catch (error) {
    results.push({
      ...product,
      ok: false,
      reason: error instanceof Error ? error.message : "download-failed",
      image,
    })
    continue
  }

  if (!response.ok) {
    results.push({ ...product, ok: false, reason: `download-${response.status}`, image })
    continue
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/") || !isImage(bytes)) {
    results.push({
      ...product,
      ok: false,
      reason: `not-image:${contentType || "unknown"}`,
      image,
      bytes: bytes.length,
    })
    continue
  }

  const dimensions = imageDimensions(bytes)
  if (!dimensions || dimensions.width < 240 || dimensions.height < 240) {
    results.push({
      ...product,
      ok: false,
      reason: "image-too-small-dimensions",
      image,
      dimensions,
      bytes: bytes.length,
    })
    continue
  }

  if (bytes.length < 5000) {
    results.push({ ...product, ok: false, reason: "image-too-small", image, bytes: bytes.length })
    continue
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (blockedHashes.has(sha256)) {
    results.push({ ...product, ok: false, reason: "blocked-known-mismatch", image, bytes: bytes.length, sha256 })
    continue
  }

  writeFileSync(filePath, bytes)
  results.push({
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    path: product.image,
    bytes: bytes.length,
    sha256,
    sourcePage: image.page,
    sourceImage: image.url,
    dimensions,
    ok: true,
  })
}

await client.end()
writeFileSync(outputLog, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
console.log(JSON.stringify({ attempted: targets.length, ok: results.filter((item) => item.ok).length, results }, null, 2))

function extractUrls(text) {
  const urls = extractUrlsFromText(text)

  try {
    const parsed = JSON.parse(text)
    collectUrls(parsed, urls)
  } catch {}

  return [...new Set(urls.filter((url) => /^https?:\/\//i.test(url)))]
}

function collectUrls(value, urls) {
  if (!value) return
  if (typeof value === "string") {
    urls.push(...extractUrlsFromText(value))
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls))
    return
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/url/i.test(key)) collectUrls(item, urls)
      else if (typeof item === "object") collectUrls(item, urls)
    }
  }
}

function extractUrlsFromText(text) {
  const urls = []
  const labelRegex = /URL:\s*(https?:\/\/[^\r\n]+)/g
  const plainRegex = /https?:\/\/[^\s"'<>]+/g
  let match

  while ((match = labelRegex.exec(text))) {
    urls.push(cleanUrl(match[1]))
  }
  while ((match = plainRegex.exec(text))) {
    urls.push(cleanUrl(match[0]))
  }

  return urls
}

function cleanUrl(url) {
  return url
    .replace(/\\nPublished:.*/i, "")
    .replace(/\nPublished:.*/i, "")
    .replace(/[),.;]+$/, "")
    .trim()
}

async function findProductImage(urls, product) {
  for (const page of urls.slice(0, 5)) {
    try {
      const html = await fetch(page, { headers: { "user-agent": "Mozilla/5.0" } }).then((res) =>
        res.ok ? res.text() : ""
      )
      if (!pageMatchesProduct(html, product)) continue
      const candidates = extractImageCandidates(html, page)
      const ranked = rankCandidates(candidates, product)
      for (const candidate of ranked.slice(0, 8)) {
        const checked = await validateCandidate(candidate)
        if (checked.ok) return { page, url: candidate, dimensions: checked.dimensions }
      }
    } catch {
      // Try next page.
    }
  }

  return null
}

function pageMatchesProduct(html, product) {
  const text = normalizeModelText(html)
  const keys = modelKeys(product)
  return keys.length === 0 || keys.some((key) => text.includes(key))
}

function modelKeys(product) {
  const sku = String(product.sku ?? "").toLowerCase()
  const name = String(product.name ?? "").toLowerCase()
  const brand = String(product.brand ?? "").toLowerCase()
  const withoutBrand = sku.replace(new RegExp(`^${escapeRegExp(brand)}[-_\\s]*`, "i"), "")
  const chunks = withoutBrand.split(/[-_\s]+/).filter(Boolean)
  const keys = []

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    if (/^(magic|mini|pro|plus|poe|wifi|wi|fi)$/.test(chunk)) continue
    if (/[a-z]*\d+[a-z0-9]*/i.test(chunk)) {
      if (chunks[index + 1] && chunks[index + 1].length === 1) {
        keys.push(normalizeModelText(`${chunk}${chunks[index + 1]}`))
      } else {
        keys.push(normalizeModelText(chunk))
      }
    }
  }

  const compactSku = normalizeModelText(withoutBrand)
  if (compactSku.length >= 5) keys.push(compactSku)
  if (/\bpoe\b/i.test(name)) keys.push("poe")

  return [...new Set(keys.filter((key) => key.length >= 3))]
}

function normalizeModelText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractImageCandidates(html, page) {
  const candidates = []
  const metaRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["'][^>]+content=["']([^"']+)["'][^>]*>/gi
  const imgRegex = /<img[^>]+(?:src|data-src|data-original|data-lazy)=["']([^"']+)["'][^>]*>/gi
  const rawImageRegex = /(?:https?:)?\/\/[^"'<>\\\s]+?\.(?:avif|webp|png|jpe?g)(?:\?[^"'<>\\\s]*)?/gi
  let match

  while ((match = metaRegex.exec(html))) candidates.push(match[1])
  while ((match = imgRegex.exec(html))) candidates.push(match[1])
  while ((match = rawImageRegex.exec(html))) candidates.push(match[0])

  return [...new Set(candidates)]
    .map(cleanImageCandidate)
    .map((url) => normalizeUrl(url, page))
    .filter((url) => /\.(png|jpe?g)(\?|$)/i.test(url))
    .filter((url) => !/logo|icon|wechat|qrcode|qr|avatar|loading|placeholder|imagetools/i.test(url))
}

function cleanImageCandidate(url) {
  const decoded = url
    .replace(/&#47;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\\\//g, "/")

  const embedded = decoded.match(/(?:https?:)?\/\/[^"'<>\s]+?\.(?:png|jpe?g)(?:\?[^"'<>\s]*)?/i)
  return embedded ? embedded[0] : decoded
}

function normalizeUrl(url, page) {
  try {
    return new URL(url, page).toString()
  } catch {
    return ""
  }
}

async function validateCandidate(url) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return { ok: false }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 5000 || !isImage(bytes)) return { ok: false }
    const dimensions = imageDimensions(bytes)
    return { ok: Boolean(dimensions && dimensions.width >= 240 && dimensions.height >= 240), dimensions }
  } catch {
    return { ok: false }
  }
}

function isImage(bytes) {
  if (bytes.length < 12) return false
  const header = bytes.subarray(0, 12)
  return (
    (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) ||
    (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47)
  )
}

function imageDimensions(bytes) {
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
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        }
      }
      offset += 2 + length
    }
  }

  return null
}

function rankCandidates(candidates, product) {
  const tokens = [product.sku, product.name, product.brand]
    .flatMap((value) => String(value ?? "").toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length > 1)

  return candidates
    .map((url) => ({
      url,
      score:
        tokens.reduce((sum, token) => sum + (url.toLowerCase().includes(token) ? 2 : 0), 0) +
        (/360buyimg\.com\/(n1|n7|sku|jfs)/i.test(url) ? 5 : 0) +
        (/(product|goods|upload|jeditor|cdn|static|image|img)/i.test(url) ? 1 : 0) -
        (/cms|cc|sprite|logo|icon/i.test(url) ? 4 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.url)
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is required to run this maintenance script.")
  }

  return url
}
