import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"
import { Client } from "pg"

const workspace = "C:/Users/lynnl/Documents/fmkj_v3"
const publicDir = join(workspace, "public")
const mcporter = "C:/Users/lynnl/AppData/Roaming/npm/mcporter.cmd"
const connectionString = requireDatabaseUrl()
const actorId = "10000000-0000-0000-0000-000000000002"
const backupPath = join(workspace, `ruijie-rebuild-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
const logPath = join(workspace, "ruijie-rebuild-results.json")

const candidates = [
  product("RUIJIE-ES205GC-P-E", "锐捷 5口千兆 PoE 交换机 RG-ES205GC-P-E", "网络覆盖", "5口千兆 PoE 交换机，适合小型项目 AP 和摄像机供电。"),
  product("RUIJIE-ES209GC-P-E", "锐捷 9口千兆 PoE 交换机 RG-ES209GC-P-E", "网络覆盖", "9口千兆 PoE 交换机，适合全屋 AP 集中供电。"),
  product("RUIJIE-ES210GC-LP-E", "锐捷 10口千兆 PoE 交换机 RG-ES210GC-LP-E", "网络覆盖", "10口千兆 PoE 交换机，8口 PoE + 2上行。"),
  product("RUIJIE-EG306MG-P", "锐捷 2.5G PoE 网关 RG-EG306MG-P", "网关中控", "2.5G PoE 网关，路由、AC、PoE 一体。"),
  product("RUIJIE-EG209MG-P", "锐捷 2.5G 全 PoE 网关 RG-EG209MG-P", "网关中控", "9口 2.5G 全 PoE 网关，适合大户型网络核心。"),
  product("RUIJIE-EG210G-E-V2", "锐捷 AC 网关 RG-EG210G-E V2", "网关中控", "机架式 AC 网关，适合集成项目和商业空间。"),
  product("RUIJIE-NBR6120-E", "锐捷 NBR 多 WAN 企业路由器 RG-NBR6120-E", "网关中控", "多 WAN 企业路由器，适合小微企业和办公网络出口。"),
  product("RUIJIE-NBR6135-E", "锐捷 NBR 企业路由器 RG-NBR6135-E", "网关中控", "多 WAN 企业路由器，适合中型企业和项目网络核心。"),
  product("RUIJIE-AP820A-V3", "锐捷 企业级吸顶 AP RG-AP820-A V3", "网络覆盖", "AX3000 双频 Wi-Fi 6 企业级吸顶 AP。", "ruijie-ap820-a-v3.png"),
  product("RUIJIE-EG105G-P-E-V2", "锐捷 PoE 网关 RG-EG105G-P-E V2", "网关中控", "千兆 PoE 网关，适合中小户型 AC+AP 方案。"),
  product("RUIJIE-EG210G-P-V2", "锐捷 PoE 网关 RG-EG210G-P V2", "网关中控", "PoE 网关，路由、AC、PoE 一体。"),
  product("RUIJIE-EAP102-E", "锐捷 Wi-Fi 5 面板 AP RG-EAP102(E)", "网络覆盖", "Wi-Fi 5 面板 AP，适合房间弱电点位覆盖。"),
  product("RUIJIE-EAP102-F", "锐捷 Wi-Fi 5 面板 AP RG-EAP102(F)", "网络覆盖", "Wi-Fi 5 面板 AP，适合房间无线覆盖。"),
  product("RUIJIE-EAP162-E", "锐捷 Wi-Fi 6 面板 AP RG-EAP162(E)", "网络覆盖", "Wi-Fi 6 面板 AP，适合主流全屋覆盖。"),
  product("RUIJIE-EAP162-G-V2", "锐捷 Wi-Fi 6 面板 AP RG-EAP162(G) V2", "网络覆盖", "Wi-Fi 6 千兆面板 AP。"),
  product("RUIJIE-EAP212-F-V2", "锐捷 Wi-Fi 5 吸顶 AP RG-EAP212(F) V2", "网络覆盖", "Wi-Fi 5 吸顶 AP，适合公共区域覆盖。"),
  product("RUIJIE-EAP262-G-V2", "锐捷 Wi-Fi 6 吸顶 AP RG-EAP262(G) V2", "网络覆盖", "Wi-Fi 6 吸顶 AP，适合客餐厅和公共区。"),
  product("RUIJIE-EAP272-MG", "锐捷 Wi-Fi 7 吸顶 AP RG-EAP272(MG)", "网络覆盖", "Wi-Fi 7 吸顶 AP，适合高端全屋无线覆盖。"),
  product("RUIJIE-EAP172-MG", "锐捷 Wi-Fi 7 面板 AP RG-EAP172(MG)", "网络覆盖", "Wi-Fi 7 面板 AP，适合高端房间覆盖。"),
  product("RUIJIE-EW3000GX", "锐捷 雪豹 AX3000 路由器 RG-EW3000GX", "网络覆盖", "AX3000 家用无线路由器。"),
  product("RUIJIE-EW6000GX-PRO", "锐捷 天蝎 AX6000 路由器 RG-EW6000GX PRO", "网络覆盖", "AX6000 高性能无线路由器。"),
]

const client = new Client({ connectionString })
await client.connect()

const existing = await client.query("select * from products where brand = $1 order by created_at", ["锐捷"])
writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: existing.rows }, null, 2))

await client.query("update products set deleted_at = now(), updated_at = now(), status = 'inactive' where brand = $1 and deleted_at is null", ["锐捷"])

const results = []
for (const item of candidates) {
  const image = await ensureImage(item)
  if (!image) {
    results.push({ sku: item.sku, name: item.name, ok: false, reason: "no-trusted-image" })
    continue
  }

  await client.query(
    `
      insert into products (
        created_by, updated_by, status, name, sku, unit, price, brand, platform, category,
        cost, stock, image, description, tags, channels, deleted_at, updated_at
      )
      values ($1, $1, 'active', $2, $3, '台', 0, '锐捷', '通用', $4, 0, 0, $5, $6, $7::jsonb, $8::jsonb, null, now())
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
    `,
    [
      actorId,
      item.name,
      item.sku,
      item.category,
      image.path,
      item.description,
      JSON.stringify(["待核价", "锐捷", item.category]),
      JSON.stringify(image.source ? ["Agent Reach", "Exa", "京东"] : ["本地已验证"]),
    ]
  )
  results.push({ sku: item.sku, name: item.name, ok: true, image })
}

await client.end()
writeFileSync(logPath, JSON.stringify({ createdAt: new Date().toISOString(), backupPath, results }, null, 2))
console.log(JSON.stringify({ backupPath, logPath, inserted: results.filter((item) => item.ok).length, skipped: results.filter((item) => !item.ok).length, results }, null, 2))

function product(sku, name, category, description, fileName = `${sku.toLowerCase().replace(/^ruijie-/, "ruijie-")}.jpg`) {
  return {
    sku,
    name,
    category,
    description,
    imagePath: `/assets/products/${fileName}`,
  }
}

async function ensureImage(item) {
  const localPath = join(publicDir, item.imagePath.replace(/^\//, ""))
  if (existsSync(localPath) && imageDimensions(readFileSync(localPath))) {
    return { path: item.imagePath, source: null }
  }

  const query = `site:jd.com ${item.name} ${item.sku.replace(/^RUIJIE-/, "RG-")} product image`
  const search = spawnSync(
    "cmd.exe",
    ["/c", mcporter, "call", "exa.web_search_exa", `query=${query}`, "numResults=8", "--output", "json"],
    { encoding: "utf8", cwd: workspace }
  )
  if (search.status !== 0) return null

  const urls = extractUrls(search.stdout)
  const image = await findProductImage(urls, item)
  if (!image) return null

  const response = await fetch(image.url, {
    headers: { "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  const dimensions = imageDimensions(bytes)
  if (!dimensions || dimensions.width < 240 || dimensions.height < 240 || bytes.length < 5000) return null

  mkdirSync(dirname(localPath), { recursive: true })
  writeFileSync(localPath, bytes)
  return {
    path: item.imagePath,
    source: image.url,
    sourcePage: image.page,
    dimensions,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}

async function findProductImage(urls, item) {
  for (const page of urls.slice(0, 8)) {
    try {
      const html = await fetch(page, { headers: { "user-agent": "Mozilla/5.0" } }).then((res) => (res.ok ? res.text() : ""))
      if (!pageMatchesProduct(html, item)) continue
      const candidates = rankCandidates(extractImageCandidates(html, page), item)
      for (const candidate of candidates.slice(0, 10)) {
        const response = await fetch(candidate, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) })
        if (!response.ok) continue
        const bytes = Buffer.from(await response.arrayBuffer())
        const dimensions = imageDimensions(bytes)
        if (dimensions && dimensions.width >= 240 && dimensions.height >= 240 && bytes.length >= 5000) {
          return { page, url: candidate }
        }
      }
    } catch {}
  }
  return null
}

function pageMatchesProduct(html, item) {
  const text = normalize(html)
  return modelKeys(item).some((key) => text.includes(key))
}

function modelKeys(item) {
  const sku = normalize(item.sku.replace(/^RUIJIE-/, "RG-"))
  const nameModels = [...item.name.matchAll(/RG[-\s]?[A-Z0-9()]+(?:[-\s]?[A-Z0-9]+)*/gi)].map((match) => normalize(match[0]))
  return [...new Set([sku, ...nameModels].filter((key) => key.length >= 5))]
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function extractImageCandidates(html, page) {
  const candidates = []
  const metaRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["'][^>]+content=["']([^"']+)["'][^>]*>/gi
  const imgRegex = /<img[^>]+(?:src|data-src|data-original|data-lazy)=["']([^"']+)["'][^>]*>/gi
  const rawImageRegex = /(?:https?:)?\/\/[^"'<>\\\s]+?\.(?:png|jpe?g)(?:\?[^"'<>\\\s]*)?/gi
  let match
  while ((match = metaRegex.exec(html))) candidates.push(match[1])
  while ((match = imgRegex.exec(html))) candidates.push(match[1])
  while ((match = rawImageRegex.exec(html))) candidates.push(match[0])

  return [...new Set(candidates)]
    .map((url) => cleanImageCandidate(url))
    .map((url) => normalizeUrl(url, page))
    .filter((url) => /\.(png|jpe?g)(\?|$)/i.test(url))
    .filter((url) => !/logo|icon|wechat|qrcode|qr|avatar|loading|placeholder|imagetools|sprite/i.test(url))
}

function rankCandidates(candidates, item) {
  const keys = modelKeys(item)
  return candidates
    .map((url) => ({
      url,
      score:
        keys.reduce((sum, key) => sum + (normalize(url).includes(key) ? 3 : 0), 0) +
        (/360buyimg\.com\/(n1|n7|sku|jfs)/i.test(url) ? 5 : 0) -
        (/cms|cc|sprite|logo|icon/i.test(url) ? 4 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url)
}

function extractUrls(text) {
  const urls = extractUrlsFromText(text)
  try {
    collectUrls(JSON.parse(text), urls)
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
    for (const item of Object.values(value)) collectUrls(item, urls)
  }
}

function extractUrlsFromText(text) {
  const urls = []
  const plainRegex = /https?:\/\/[^\s"'<>]+/g
  let match
  while ((match = plainRegex.exec(text))) urls.push(cleanUrl(match[0]))
  return urls
}

function cleanUrl(url) {
  return url
    .replace(/\\nPublished:.*/i, "")
    .replace(/\nPublished:.*/i, "")
    .replace(/[),.;]+$/, "")
    .trim()
}

function cleanImageCandidate(url) {
  const decoded = url.replace(/&#47;/g, "/").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\\\//g, "/")
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
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
      }
      offset += 2 + length
    }
  }
  return null
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is required to run this maintenance script.")
  }

  return url
}
