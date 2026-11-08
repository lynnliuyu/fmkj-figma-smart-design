/**
 * AI 识别结果导入（以及导出）。
 *
 * 格式（fmkj-points v1）——坐标相对「标准图纸」（裁切后的 3:2 图，左上角为原点）：
 * {
 *   "format": "fmkj-points", "version": 1,
 *   "sheets": [{
 *     "name": "一层开关",                 // 按名称匹配图纸；也可以用 "index": 1（第 1 张）
 *     "unit": "ratio",                    // ratio：0–1 的比例（默认）；px：标准图纸像素 2400×1600
 *     "areas":  [{ "name": "客厅", "type": "living", "rect": [0.30, 0.10, 0.72, 0.58] }],
 *     "points": [{ "type": "downlight", "x": 0.412, "y": 0.233, "note": "人体感应筒灯" }]
 *   }]
 * }
 * 只给一张图纸时可以省略 sheets，直接写 { "points": [...] }，导入到当前图纸。
 */
import { AREA_TYPES, inferAreaType, isAreaType, type AreaType } from '@/lib/area-types'
import {
  categoryOf,
  categoryOfType,
  DEVICE_TYPES,
  deviceTypeOf,
  inferDeviceType,
  isDeviceType,
} from '@/lib/device-types'
import {
  buildAreaElements,
  buildPointElements,
  nextPointCode,
  type AreaInfo,
  type PointInfo,
  type SceneEl,
  type SheetInfo,
} from '@/lib/point-scene'
import { DESIGN_RULE_TEXT, isDrawingOnlyType, NEEDS_SWITCH_TYPES } from '@/lib/design-rules'
import { SHEET } from '@/lib/sheet-spec'

export const IMPORT_FORMAT = 'fmkj-points'

type PlanPoint = {
  deviceType: string
  rx: number
  ry: number
  note: string | null
  fromDesign?: boolean
}
type PlanArea = { name: string; areaType: AreaType; rect: [number, number, number, number] }
export type ImportPlan = {
  sheets: { sheet: SheetInfo; points: PlanPoint[]; areas: PlanArea[] }[]
  warnings: string[]
  pointCount: number
  areaCount: number
}

const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : null
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** AI 常把 JSON 包在说明文字或 ```json 代码块里，这里取出第一个完整的 JSON。 */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = (fenced ? fenced[1] : text).trim()
  try {
    return JSON.parse(body)
  } catch {
    const start = body.search(/[[{]/)
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1))
    throw new Error('not json')
  }
}

const typeByName = new Map<string, string>()
for (const t of DEVICE_TYPES) {
  typeByName.set(t.name, t.value)
  typeByName.set(`${categoryOf(t.category)?.name}${t.name}`, t.value)
  typeByName.set(`${categoryOf(t.category)?.name}·${t.name}`, t.value)
}

/** 设备类型：字典值、中文名（筒灯、双开）或产品式名称（智能双键开关）都能识别。 */
export function resolveDeviceType(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  if (isDeviceType(s)) return s
  const lower = s.toLowerCase().replace(/\s+/g, '-')
  if (isDeviceType(lower)) return lower
  const byName = typeByName.get(s.replace(/\s+/g, ''))
  if (byName) return byName
  const inferred = inferDeviceType(s, /开关|键/.test(s) ? 'switch' : null)
  return inferred === 'other' ? null : inferred
}

function pickSheet(
  raw: Record<string, unknown>,
  sheets: SheetInfo[],
  fallback: SheetInfo,
): SheetInfo | null {
  const name =
    typeof raw.name === 'string'
      ? raw.name.trim()
      : typeof raw.sheet === 'string'
        ? raw.sheet.trim()
        : ''
  if (name) {
    const hit =
      sheets.find((s) => s.name === name) ??
      sheets.find((s) => s.name.includes(name) || name.includes(s.name))
    if (hit) return hit
  }
  const index = num(raw.index ?? (typeof raw.sheet === 'number' ? raw.sheet : null))
  if (index !== null) return sheets[Math.round(index) - 1] ?? null
  return name ? null : fallback
}

/** 解析 AI 返回的内容，得到导入计划（还没有修改画布）。 */
export function parsePointImport(
  input: unknown,
  sheets: SheetInfo[],
  activeSheetId?: string | null,
): { ok: true; plan: ImportPlan } | { ok: false; error: string } {
  if (!sheets.length) return { ok: false, error: '请先添加图纸，再导入识别结果' }
  let data: unknown = input
  if (typeof input === 'string') {
    try {
      data = extractJson(input)
    } catch {
      return { ok: false, error: '没有找到有效的 JSON，请粘贴 AI 返回的完整结果' }
    }
  }
  const fallback = sheets.find((s) => s.id === activeSheetId) ?? sheets[0]
  let rawSheets: Record<string, unknown>[]
  if (Array.isArray(data)) rawSheets = [{ points: data }]
  else if (data && typeof data === 'object' && Array.isArray((data as { sheets?: unknown }).sheets))
    rawSheets = (data as { sheets: Record<string, unknown>[] }).sheets
  else if (
    data &&
    typeof data === 'object' &&
    (Array.isArray((data as { points?: unknown }).points) ||
      Array.isArray((data as { areas?: unknown }).areas))
  )
    rawSheets = [data as Record<string, unknown>]
  else return { ok: false, error: 'JSON 里没有 points（点位）或 sheets（图纸）' }

  const warnings: string[] = []
  const unknownTypes = new Map<string, number>()
  let skipped = 0
  let ruleSkipped = 0
  const plan: ImportPlan = { sheets: [], warnings, pointCount: 0, areaCount: 0 }
  for (const raw of rawSheets) {
    if (!raw || typeof raw !== 'object') continue
    const sheet = pickSheet(raw, sheets, fallback)
    if (!sheet) {
      warnings.push(`没有找到图纸「${String(raw.name ?? raw.sheet ?? raw.index)}」，这部分已跳过`)
      continue
    }
    const points = Array.isArray(raw.points) ? (raw.points as Record<string, unknown>[]) : []
    const areas = Array.isArray(raw.areas) ? (raw.areas as Record<string, unknown>[]) : []
    // 没写单位时自动判断：出现大于 1.5 的坐标就是像素
    const coords = [
      ...points.flatMap((p) => [num(p?.x), num(p?.y)]),
      ...areas.flatMap((a) => (Array.isArray(a?.rect) ? a.rect.map(num) : [])),
    ].filter((n): n is number => n !== null)
    const px = raw.unit === 'px' || (raw.unit !== 'ratio' && coords.some((n) => n > 1.5))
    const sx = (n: number) => clamp01(px ? n / SHEET.pixelWidth : n)
    const sy = (n: number) => clamp01(px ? n / SHEET.pixelHeight : n)
    const entry = { sheet, points: [] as PlanPoint[], areas: [] as PlanArea[] }
    for (const p of points) {
      const x = num(p?.x)
      const y = num(p?.y)
      if (x === null || y === null) {
        skipped++
        continue
      }
      const resolved = resolveDeviceType(p.type ?? p.deviceType ?? p.name)
      // 设计规范：开关 / 插座 / 灯具只照图识别，AI 自行设计（source: design）的一律不导入
      if (resolved && p.source === 'design' && isDrawingOnlyType(resolved)) {
        ruleSkipped++
        continue
      }
      if (!resolved)
        unknownTypes.set(
          String(p.type ?? p.name ?? '未写类型'),
          (unknownTypes.get(String(p.type ?? p.name ?? '未写类型')) ?? 0) + 1,
        )
      entry.points.push({
        deviceType: resolved ?? 'other',
        rx: sx(x),
        ry: sy(y),
        note: typeof p.note === 'string' ? p.note.slice(0, 60) : null,
        fromDesign: p.source === 'design',
      })
    }
    for (const a of areas) {
      const name = typeof a?.name === 'string' ? a.name.trim().slice(0, 30) : ''
      let r = Array.isArray(a?.rect) ? a.rect.map(num) : null
      if (!r && a && typeof a === 'object') {
        const x = num(a.x),
          y = num(a.y),
          w = num(a.width),
          h = num(a.height)
        if (x !== null && y !== null && w !== null && h !== null) r = [x, y, x + w, y + h]
      }
      if (!name || !r || r.length !== 4 || r.some((n) => n === null)) {
        skipped++
        continue
      }
      const [x0, y0, x1, y1] = r as number[]
      const rect: [number, number, number, number] = [
        sx(Math.min(x0, x1)),
        sy(Math.min(y0, y1)),
        sx(Math.max(x0, x1)),
        sy(Math.max(y0, y1)),
      ]
      if (rect[2] - rect[0] < 0.01 || rect[3] - rect[1] < 0.01) {
        skipped++
        continue
      }
      entry.areas.push({ name, areaType: isAreaType(a.type) ? a.type : inferAreaType(name), rect })
    }
    plan.pointCount += entry.points.length
    plan.areaCount += entry.areas.length
    // 设计规范：中控屏对照开关点位布置，这张图纸没有开关点位时，AI 设计的中控屏不导入
    if (!entry.points.some((p) => categoryOfType(p.deviceType)?.slug === 'switch')) {
      const before = entry.points.length
      entry.points = entry.points.filter(
        (p) => !(p.fromDesign && NEEDS_SWITCH_TYPES.has(p.deviceType)),
      )
      ruleSkipped += before - entry.points.length
    }
    if (entry.points.length || entry.areas.length) plan.sheets.push(entry)
  }
  if (unknownTypes.size)
    warnings.push(
      `${[...unknownTypes.entries()].map(([t, n]) => `「${t}」${n} 个`).join('、')}无法识别设备类型，已记为「其他设备」`,
    )
  if (ruleSkipped)
    warnings.push(
      `按设计规范，${ruleSkipped} 个 AI 推测的点位未导入（开关 / 插座 / 灯具只照图生成；没有开关点位时不加中控屏）`,
    )
  if (skipped) warnings.push(`${skipped} 条数据缺少坐标或名称，已跳过`)
  if (!plan.pointCount && !plan.areaCount)
    return { ok: false, error: warnings[0] ?? '没有可导入的点位或区域' }
  return { ok: true, plan }
}

/** 把导入计划变成场景元素：区域放在点位下面，点位代号接着现有编号往下排。 */
export function planToElements(plan: ImportPlan, usedCodes: Iterable<string>) {
  const used = new Set(usedCodes)
  const areas: SceneEl[] = []
  const points: SceneEl[] = []
  for (const { sheet, points: pts, areas: ars } of plan.sheets) {
    for (const a of ars) {
      areas.push(
        ...buildAreaElements({
          name: a.name,
          areaType: a.areaType,
          x: sheet.x + a.rect[0] * sheet.width,
          y: sheet.y + a.rect[1] * sheet.height,
          width: (a.rect[2] - a.rect[0]) * sheet.width,
          height: (a.rect[3] - a.rect[1]) * sheet.height,
        }),
      )
    }
    // 从上到下、从左到右编号，方便现场按顺序找点位
    const ordered = pts
      .slice()
      .sort((a, b) => Math.round(a.ry * 20) - Math.round(b.ry * 20) || a.rx - b.rx)
    for (const p of ordered) {
      const code = nextPointCode(p.deviceType, used)
      used.add(code)
      points.push(
        ...buildPointElements({
          deviceType: p.deviceType,
          cx: sheet.x + p.rx * sheet.width,
          cy: sheet.y + p.ry * sheet.height,
          code,
        }),
      )
    }
  }
  return { areas, points }
}

const r3 = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000)

/** 导出当前点位为同一格式（备份、交给 AI 继续修改）。 */
export function exportPoints(sheets: SheetInfo[], areas: AreaInfo[], points: PointInfo[]) {
  return {
    format: IMPORT_FORMAT,
    version: 1,
    sheets: sheets.map((s) => ({
      name: s.name,
      index: s.index + 1,
      unit: 'ratio',
      areas: areas
        .filter((a) => a.sheetId === s.id)
        .map((a) => ({
          name: a.name,
          type: a.areaType,
          rect: [
            r3((a.x - s.x) / s.width),
            r3((a.y - s.y) / s.height),
            r3((a.x + a.width - s.x) / s.width),
            r3((a.y + a.height - s.y) / s.height),
          ],
        })),
      points: points
        .filter((p) => p.sheetId === s.id)
        .map((p) => ({ type: p.deviceType, x: r3(p.rx), y: r3(p.ry), code: p.code })),
    })),
  }
}

/** 给 AI 的识别提示词：附上标准图纸图片一起发送。 */
export function recognitionPrompt(sheetName: string) {
  const types = DEVICE_TYPES.map(
    (t) => `- ${t.value}：${categoryOf(t.category)?.name}·${t.name}`,
  ).join('\n')
  const areas = AREA_TYPES.filter((a) => a.value !== 'other')
    .map((a) => `${a.value}（${a.label}）`)
    .join('、')
  return `你是全屋智能设计助手。附图是一张已经裁掉图框和标题栏的户型图（标准图纸，宽高比 3:2，图名「${sheetName}」）。
请划分房间区域并输出点位，只输出 JSON，不要其他文字。

设计规范（必须遵守）：${DESIGN_RULE_TEXT}
- 识别：图上已画出的设备符号（开关、灯具、插座等）按符号中心照图输出，source 为 "drawing"。
- 设计：按房间功能布置上述默认设备，source 为 "design"。没有准确开关 / 灯光点位的图纸，只输出默认设计设备。

坐标规则：以图片左上角为原点，x 向右、y 向下，用 0–1 的比例表示（x = 距左边 / 图片宽度，y = 距上边 / 图片高度），保留 3 位小数。点位坐标取图例符号的中心。

设备类型只能用下面的值：
${types}

区域类型可选：${areas}。区域用矩形 rect [左, 上, 右, 下] 表示。

输出格式：
{
  "format": "fmkj-points",
  "version": 1,
  "sheets": [{
    "name": "${sheetName}",
    "unit": "ratio",
    "areas": [{ "name": "客厅", "type": "living", "rect": [0.30, 0.10, 0.72, 0.58] }],
    "points": [{ "type": "ap-node", "x": 0.412, "y": 0.233, "source": "design", "note": "可选，原图标注" }]
  }]
}`
}

export const typeLabel = (v: string) => deviceTypeOf(v)?.name ?? '其他设备'
