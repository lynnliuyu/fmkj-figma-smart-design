/**
 * 设备类型对齐：按「分类 + 名称关键词」保守映射 deviceTypeId。
 * 原则：只在类型可从名称可靠判断时映射；拿不准的一律留空（保持待核）。
 * 用法: node scripts/align-device-types.mjs            # 预览
 *       node scripts/align-device-types.mjs --emit     # 输出变更集供 CLI 应用
 */
import { Client } from "pg"
import { writeFileSync } from "node:fs"

const emit = process.argv.includes("--emit")
const { deviceTypes } = await import("../lib/device-types.ts")
const validTypes = new Set(deviceTypes.map((t) => t.id))

// 全局有序规则：先匹配者胜。每条规则限定适用分类（null = 任意分类）。
// 顺序经过设计：更具体的规则排在更宽泛的规则之前。
const RULES = [
  // —— 安防/门锁 ——
  ["门铃", "doorbell", null],
  ["门锁|智能锁|指纹锁|人脸锁", "door-lock", null],
  ["摄像机|摄像头|枪机|球机|NVR|录像机", "camera", null],
  // —— 传感器（按检测对象细分）——
  ["烟雾|烟感", "smoke-sensor", null],
  ["水浸|漏水", "water-leak-sensor", null],
  ["门窗|门磁", "contact-sensor", null],
  ["温湿度|温度计", "temperature-humidity-sensor", null],
  ["人在|存在传感", "presence-sensor", null],
  ["人体移动|红外传感|PIR", "motion-sensor", null],
  // —— 窗帘 ——
  ["窗帘轨道|轨道（窗帘）", "curtain-track", "窗帘"],
  ["套装", "curtain-kit", "窗帘"],
  ["电机", "curtain-motor", "窗帘"],
  // —— 插座 ——
  ["轨道插座", "track-socket", null],
  ["USB", "usb-socket", "插座"],
  ["地插", "floor-socket", null],
  ["插座", "socket", "插座"],
  // —— 全屋wifi ——
  ["面板 ?AP|吸顶 ?AP|无线 ?AP|\\bAP\\b", "wireless-ap", "全屋wifi"],
  ["交换机", "network-switch", "全屋wifi"],
  ["路由器|路由", "router", null],
  ["无线控制器|AC ?控制器|AC 网关", "wlan-controller", "全屋wifi"],
  // —— 灯具（先具体后宽泛）——
  // 注意：灯带类名称常含「不含电源驱动」「+60W电源」等字样，不能据此判为电源设备。
  // 仅「必买电源」「恒压灯带电源」这类明确以电源为主体的名称才映射为灯具电源。
  ["必买电源|恒压灯带电源|恒压电源", "lighting-power-supply", null],
  ["筒灯", "downlight", "智能灯具"],
  ["射灯", "spotlight", "智能灯具"],
  ["磁吸|轨道灯", "track-light", "智能灯具"],
  ["平板灯", "panel-light", "智能灯具"],
  ["格栅灯", "grille-light", "智能灯具"],
  ["风扇灯|扇灯", "fan-light", "智能灯具"],
  ["吊灯", "pendant-light", "智能灯具"],
  ["壁灯", "wall-light", "智能灯具"],
  // —— 开关 ——
  ["调光控制器|调光模块|调光器", "dimmer-controller", null],
  ["调光", "dimmer-controller", "开关"],
  ["情景|场景", "scene-panel", "开关"],
  ["开关", "wall-switch", "开关"],
  ["单键|双键|[一二三四五六七八]键|\\d键", "wall-switch", "开关"],
  // —— 暖通 ——
  ["空调|VRF|多联机|温控|新风|地暖|风机盘管", "hvac-controller", "暖通控制"],
  // —— 网关中控（音箱类优先于屏类，与既有小米家庭屏归类保持一致）——
  ["吸顶音|吸顶扬声", "ceiling-speaker", null],
  ["音箱|音响|家庭屏|触屏音箱", "smart-speaker", null],
  ["中控屏|妙控屏|控制屏", "touch-control-panel", "网关中控"],
  ["网关|中枢", "smart-home-gateway", "网关中控"],
  // —— 其他 ——
  ["晾衣", "drying-rack", null],
  ["网线|控制线|铝槽|弱电箱|理线|配线", "accessory", null],
]

// 排除项：这些名称不能按关键词判定单一设备类型。
//  - 套餐/组合装：如「3室2厅 客厅灯*1+主卧*2+次卧*1+智能风扇灯L4」——名称里含「风扇灯」，
//    但整条记录是全屋灯具套餐，不是一件风扇灯。
//  - 推窗器：属开窗器，类型字典暂无对应项。
//  - 空白面板/配件包：非功能设备。
const EXCLUDE = [
  /\d室\s*\d厅/,
  /\*\s*\d\s*\+/,
  /推窗器/,
  /空白面板/,
  /配件包/,
]

function mapType(category, name) {
  const n = String(name ?? "")
  if (EXCLUDE.some((re) => re.test(n))) return null
  for (const [kw, type, scope] of RULES) {
    if (scope && scope !== category) continue
    if (new RegExp(kw, "i").test(n)) {
      if (!validTypes.has(type)) throw new Error(`未知类型 ${type}`)
      return type
    }
  }
  return null
}

const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:15432/fmkj" })
await c.connect()
const rows = (await c.query(`select id::text, sku, name, category, device_type_id, catalog_kind, mapping_revision
  from products where deleted_at is null and device_type_id is null order by category, name`)).rows

const mapped = []
const unmatched = []
for (const r of rows) {
  const t = mapType(r.category, r.name)
  if (t) mapped.push({ ...r, type: t })
  else unmatched.push(r)
}

console.log(`待映射 ${rows.length} 条 → 可映射 ${mapped.length}，无法可靠判断 ${unmatched.length}`)
console.log()
const byType = {}
for (const m of mapped) byType[m.type] = (byType[m.type] ?? 0) + 1
console.log("按目标类型（含抽样核对）:")
for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  const def = deviceTypes.find((x) => x.id === t)
  console.log(`  ${t.padEnd(28)} ${String(n).padStart(4)}   ${def?.name ?? ""}`)
  const samples = mapped.filter((m) => m.type === t).slice(0, 3).map((m) => String(m.name).slice(0, 34))
  console.log(`      例: ${samples.join(" | ")}`)
}
console.log()
console.log("无法判断的（保持留空）:")
const unByCat = {}
for (const u of unmatched) { unByCat[u.category] ??= []; unByCat[u.category].push(u.name) }
for (const [cat, names] of Object.entries(unByCat).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  【${cat}】${names.length} 条，例：${names.slice(0, 3).map((x) => String(x).slice(0, 30)).join(" / ")}`)
}

if (emit) {
  const changes = mapped.map((m) => ({
    productId: m.id,
    name: m.name,
    sku: m.sku,
    expectedMappingRevision: m.mapping_revision,
    before: { catalogKind: m.catalog_kind, deviceTypeId: null },
    after: { deviceTypeId: m.type },
    reason: `按分类「${m.category}」与产品名称关键词判定设备类型为 ${m.type}；仅补类型，未改规格与价格。`,
    references: { quoteItems: 0, points: 0 },
  }))
  const out = {
    format: "fmkj-product-mapping-review",
    version: 1,
    auditedAt: new Date().toISOString(),
    changeId: crypto.randomUUID(),
    notice: "只读变更模板生成后经人工核对，仅整理 deviceTypeId，不写 specs/协议/能力/价格。",
    changes,
  }
  const p = ".local/product-catalog-collection/20261015-old-data/device-type-changes.json"
  writeFileSync(p, JSON.stringify(out, null, 2))
  console.log(`\n变更集已写出: ${p} (${changes.length} 条)`)
}

await c.end()
