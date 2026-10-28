/**
 * 把三份来源数据整理成可直接入库的标准化数据集。
 * 规则来源：docs/product-catalog-agent-guide.md、lib/product-categories.ts
 */
import { registerHooks } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"

registerHooks({ resolve(s, c, n) { try { return n(s, c) } catch (e) { if (s.startsWith(".") && !/\.[a-z]+$/i.test(s)) return n(s + ".ts", c); throw e } } })
const { normalizeProductCategory, isStandardProductCategory } = await import("../lib/product-categories.ts")

const DIR = ".local/product-catalog-collection/20261015-old-data/"
const load = (f) => JSON.parse(readFileSync(DIR + f, "utf8"))

const table = load("产品库表格.json")   // 578
const exp = load("产品库导出.json")     // 137

// 品牌规范化：对齐现有库命名（中文/English）
const BRAND = {
  "易来": "易来/yeelight", "Yeelight": "易来/yeelight",
  "领普": "领普/Linptech", "linptech": "领普/Linptech", "领普/linptech": "领普/Linptech",
  "平头熊": "平头熊/PTX",
  "小米": "小米/xiaomi",
  "锐捷": "锐捷/Ruijie",
  "鹿客": "鹿客/Loock",
  "松下": "松下/Panasonic",
  "TP-LINK": "TP-LINK/Tplink",
  "华为": "华为/Huawei",
  "海康威视": "海康威视/Hikvision",
  "大华": "大华/Dahua",
  "萤石": "萤石/Ezviz",
  "欧瑞博": "欧瑞博/ORVIBO",
  "施耐德": "施耐德/Schneider",
  "罗格朗": "罗格朗/Legrand",
  "涂鸦": "涂鸦/Tuya",
  "中弘": "中弘", "今闪": "今闪", "格力": "格力", "杜亚": "杜亚", "Somfy": "Somfy",
  "HDL": "HDL", "H3C": "H3C", "Aqara": "Aqara",
  "通用": "通用（辅材）",
  "未知": null, "其他": null,
}

// 平台映射 → 约束白名单 ['米家','绿米','华为','Apple Home','Google Home','knx','tuya','其他']
const PLATFORM = {
  "米家": "米家",
  "通用": "其他",
  "蓝牙 Mesh": "其他",       // 协议，非平台
  "Aqara / Apple Home": "Apple Home",
  "华为全屋智能": "华为",
  "Tuya": "tuya",
  "KNX": "knx",
  "欧瑞博": "其他",
}

// 分类映射：以旧「分类」列直译为标准大类，比按名称关键词猜测可靠得多。
// 说明：项目自带的 normalizeProductCategory 按名称关键词匹配，会把名称带「蓝牙Mesh」的
// 灯具误判成「全屋wifi」（实测误判 76 条），因此这里改用旧分类直译。
const CATEGORY = {
  "智能照明": "智能灯具",
  "窗帘遮阳": "窗帘",
  "暖通控制": "暖通控制",
  "传感器": "传感器",
  "网关中控": "网关中控",
  "网络覆盖": "全屋wifi",
  "智能面板": "网关中控",
  "安防监控": "监控",
  "安防门锁": "门锁",
  "型材辅材": "其他",
}

const norm = (v) => (v == null ? null : String(v).trim())
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function mapCategory(catRaw, name) {
  const c = norm(catRaw)
  if (isStandardProductCategory(c)) return c
  if (c === "开关插座") return name.includes("插座") ? "插座" : "开关"
  if (CATEGORY[c]) return CATEGORY[c]
  return normalizeProductCategory(c, name)
}

function buildRow(r, source) {
  const brandRaw = norm(r["品牌"])
  const brand = BRAND[brandRaw] ?? brandRaw
  const name = norm(r["产品名称"]) ?? ""
  const catRaw = norm(r["分类"])
  const category = mapCategory(catRaw, name)

  return {
    sku: norm(r["SKU"]),
    name,
    brand,
    platform: PLATFORM[norm(r["平台"])] ?? (norm(r["平台"]) ? "其他" : null),
    category,
    unit: norm(r["单位"]) ?? "个",
    price: num(r["价格"]),
    cost: num(r["成本"]),
    stock: Math.trunc(num(r["库存"])),
    image: norm(r["图片路径"]) ?? norm(r["图片"]) ?? null,
    description: norm(r["描述"]) ?? null,
    _source: source,
    _sourceRow: r._sourceRow,
    _brandRaw: brandRaw,
    _catRaw: catRaw,
  }
}

const rows = [
  ...table.map((r) => buildRow(r, "产品库表格")),
  ...exp.map((r) => buildRow(r, "产品库导出")),
]

// 去重：先按 SKU
const bySku = new Map()
const dupSku = []
for (const r of rows) {
  if (!r.sku) { dupSku.push({ ...r, _reason: "无SKU" }); continue }
  if (bySku.has(r.sku)) {
    const prev = bySku.get(r.sku)
    // 保留字段更全的（优先有描述的）
    if (!prev.description && r.description) bySku.set(r.sku, { ...r, _mergedFrom: prev._source })
    dupSku.push({ sku: r.sku, kept: bySku.get(r.sku)._source, dropped: r._source })
  } else bySku.set(r.sku, r)
}
const deduped = [...bySku.values()]

// 分类映射统计
const catMap = {}
for (const r of deduped) {
  const k = `${r._catRaw} → ${r.category}`
  catMap[k] = (catMap[k] ?? 0) + 1
}

const report = {
  at: new Date().toISOString(),
  source: { 产品库表格: table.length, 产品库导出: exp.length },
  buildTotal: rows.length,
  skippedNoSku: dupSku.filter((d) => d._reason).length,
  crossFileDup: dupSku.filter((d) => !d._reason).length,
  finalCount: deduped.length,
  byBrand: {},
  byCategory: {},
  byPlatform: {},
  categoryMapping: catMap,
  brandMapping: {},
}
for (const r of deduped) {
  report.byBrand[r.brand] = (report.byBrand[r.brand] ?? 0) + 1
  report.byCategory[r.category] = (report.byCategory[r.category] ?? 0) + 1
  report.byPlatform[r.platform ?? "(空)"] = (report.byPlatform[r.platform ?? "(空)"] ?? 0) + 1
  if (r._brandRaw !== r.brand) report.brandMapping[`${r._brandRaw} → ${r.brand}`] = (report.brandMapping[`${r._brandRaw} → ${r.brand}`] ?? 0) + 1
}

writeFileSync(DIR + "normalized.json", JSON.stringify(deduped, null, 1))
writeFileSync(DIR + "normalize-report.json", JSON.stringify(report, null, 2))

console.log("=== 整理结果 ===")
console.log(`  来源行数: 产品库表格 ${table.length} + 产品库导出 ${exp.length} = ${rows.length}`)
console.log(`  跨文件重复(同SKU): ${report.crossFileDup}`)
console.log(`  无SKU跳过: ${report.skippedNoSku}`)
console.log(`  ★ 最终待入库: ${deduped.length}`)
console.log()
console.log("  品牌分布:")
for (const [k, v] of Object.entries(report.byBrand).sort((a, b) => b[1] - a[1])) console.log(`    ${String(k).padEnd(20)} ${v}`)
console.log()
console.log("  分类映射:")
for (const [k, v] of Object.entries(catMap).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(30)} ${v}`)
console.log()
console.log("  平台映射:")
for (const [k, v] of Object.entries(report.byPlatform).sort((a, b) => b[1] - a[1])) console.log(`    ${String(k).padEnd(16)} ${v}`)
