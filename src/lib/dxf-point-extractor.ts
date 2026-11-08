import sharp from 'sharp'

import {
  buildCadDetectionSummary,
  type CadDetectionResult,
  type DetectedCadArea,
  type DetectedCadPoint,
} from './cad-point-detector'
import { SHEET } from './sheet-spec'

type DxfLine = { x1: number; y1: number; x2: number; y2: number; layer: string }
type DxfCircle = { cx: number; cy: number; r: number; layer: string }
type DxfInsert = { name: string; layer: string; x: number; y: number }
type DxfText = { text: string; layer: string; x: number; y: number }

const ROOM_NAME_MAP: { re: RegExp; name: string; type: string }[] = [
  { re: /主卧|主人房|master\s*bed/i, name: '主卧', type: 'master-bedroom' },
  { re: /次卧\s*1|卧\s*1|南次卧/i, name: '次卧1', type: 'bedroom' },
  { re: /次卧\s*2|卧\s*2|北次卧/i, name: '次卧2', type: 'bedroom' },
  { re: /次卧\s*3|卧\s*3|客房/i, name: '次卧3', type: 'bedroom' },
  { re: /儿童房|小孩房|kids/i, name: '儿童房', type: 'bedroom' },
  { re: /次卧|卧室|bedroom/i, name: '次卧', type: 'bedroom' },
  { re: /客厅|起居室|living/i, name: '客厅', type: 'living-room' },
  { re: /餐厅|饭厅|dining/i, name: '餐厅', type: 'dining-room' },
  { re: /厨房|中厨|西厨|kitchen/i, name: '厨房', type: 'kitchen' },
  { re: /主卫|内卫/i, name: '主卫', type: 'bathroom' },
  { re: /公卫|客卫|次卫|卫生间|洗手间|bath|toilet/i, name: '公卫', type: 'bathroom' },
  { re: /阳台|露台|balcony/i, name: '阳台', type: 'balcony' },
  { re: /玄关|入户|门厅|foyer|entrance/i, name: '玄关', type: 'hallway' },
  { re: /书房|工作间|study/i, name: '书房', type: 'study' },
  { re: /衣帽间|cloak/i, name: '衣帽间', type: 'bedroom' },
]

/** 根据 CAD 图块名（INSERT name）或图层名推断设备点位类型 */
function inferDeviceFromDxfBlock(blockName: string, layerName: string): string | null {
  const s = `${blockName} ${layerName}`.toLowerCase()
  // 忽略图框、标题栏、轴网、尺寸、家具图块
  if (
    /title|border|图框|标题|dim|标注|axis|轴|furn|家具|bed|床|sofa|沙发|table|餐桌|toilet|马桶|sink|盆栽|plant|door|门|window|窗/i.test(
      s,
    )
  ) {
    return null
  }
  if (/四联|四极|四位|4gang|4-gang|sw[-_]?4|k4|开关4/i.test(s)) return 'switch-4'
  if (/三联|三极|三位|3gang|3-gang|sw[-_]?3|k3|开关3/i.test(s)) return 'switch-3'
  if (/双联|双极|两位|二联|二极|2gang|2-gang|sw[-_]?2|k2|开关2/i.test(s)) return 'switch-2'
  if (/单联|单极|一位|一联|1gang|1-gang|sw[-_]?1|k1|开关1/i.test(s)) return 'switch-1'
  if (/switch|开关|面板/i.test(s)) return 'switch-2'
  if (/spotlight|射灯|导轨灯/i.test(s)) return 'spotlight'
  if (/downlight|筒灯|天花灯/i.test(s)) return 'downlight'
  if (/chandelier|吊灯|吸顶灯|主灯|ceiling[-_]?light/i.test(s)) return 'ceiling-light'
  if (/strip|灯带|线性灯/i.test(s)) return 'light-strip'
  if (/light|lamp|灯/i.test(s)) return 'downlight'
  if (/socket|outlet|插座/i.test(s)) return 'socket'
  if (/ap|wifi|无线/i.test(s)) return 'ap-node'
  if (/gateway|网关|hub/i.test(s)) return 'gateway'
  if (/curtain|窗帘/i.test(s)) return 'curtain-track'
  if (/sensor|感应|人体|存在/i.test(s)) return 'motion-sensor'
  return null
}

function decodeDxfText(raw: string): string {
  // 处理 CAD 常见 \U+XXXX Unicode 转义及 MTEXT 格式控制符（如 {\fSimSun|...;主卧}）
  return raw
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\P/g, ' ')
    .replace(/\{?\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .trim()
}

/**
 * 解析 DXF 矢量文本，提取建筑线段、设备图块坐标、房间文字，并渲染为 2400×1600 标准 PNG 图纸。
 */
export async function parseDxfAndRenderFloorPlan(
  dxfText: string,
  opts: { sheetName?: string } = {},
): Promise<{ png: Buffer; detection: CadDetectionResult } | null> {
  const linesRaw = dxfText.split(/\r?\n/)
  if (linesRaw.length < 20) return null

  const lines: DxfLine[] = []
  const circles: DxfCircle[] = []
  const inserts: DxfInsert[] = []
  const texts: DxfText[] = []

  let inEntities = false
  let currentEntity = ''
  let layer = '0'
  let name = ''
  let textVal = ''
  let x1 = NaN
  let y1 = NaN
  let x2 = NaN
  let y2 = NaN
  let r = NaN
  let polyPts: { x: number; y: number }[] = []
  let polyClosed = false
  let pendingPolyX = NaN

  const flushEntity = () => {
    if (!currentEntity) return
    if (
      currentEntity === 'LINE' &&
      Number.isFinite(x1) &&
      Number.isFinite(y1) &&
      Number.isFinite(x2) &&
      Number.isFinite(y2)
    ) {
      lines.push({ x1, y1, x2, y2, layer })
    } else if (currentEntity === 'LWPOLYLINE' && polyPts.length >= 2) {
      for (let i = 0; i < polyPts.length - 1; i++) {
        lines.push({
          x1: polyPts[i].x,
          y1: polyPts[i].y,
          x2: polyPts[i + 1].x,
          y2: polyPts[i + 1].y,
          layer,
        })
      }
      if (polyClosed && polyPts.length >= 3) {
        const last = polyPts[polyPts.length - 1]
        lines.push({ x1: last.x, y1: last.y, x2: polyPts[0].x, y2: polyPts[0].y, layer })
      }
    } else if (
      currentEntity === 'CIRCLE' &&
      Number.isFinite(x1) &&
      Number.isFinite(y1) &&
      Number.isFinite(r) &&
      r > 0
    ) {
      circles.push({ cx: x1, cy: y1, r, layer })
    } else if (currentEntity === 'INSERT' && Number.isFinite(x1) && Number.isFinite(y1) && name) {
      inserts.push({ name, layer, x: x1, y: y1 })
    } else if (
      (currentEntity === 'TEXT' || currentEntity === 'MTEXT') &&
      Number.isFinite(x1) &&
      Number.isFinite(y1) &&
      textVal
    ) {
      texts.push({ text: decodeDxfText(textVal), layer, x: x1, y: y1 })
    }
    currentEntity = ''
    layer = '0'
    name = ''
    textVal = ''
    x1 = NaN
    y1 = NaN
    x2 = NaN
    y2 = NaN
    r = NaN
    polyPts = []
    polyClosed = false
    pendingPolyX = NaN
  }

  for (let i = 0; i < linesRaw.length - 1; i += 2) {
    const code = parseInt(linesRaw[i].trim(), 10)
    const val = linesRaw[i + 1].trim()
    if (Number.isNaN(code)) continue

    if (code === 0 && val === 'SECTION') continue
    if (code === 2 && val === 'ENTITIES') {
      inEntities = true
      continue
    }
    if (code === 0 && val === 'ENDSEC' && inEntities) {
      flushEntity()
      break
    }
    if (!inEntities) continue

    if (code === 0) {
      flushEntity()
      currentEntity = val
      continue
    }
    if (code === 8) layer = val
    else if (code === 2) name = val
    else if (code === 1 || code === 3) textVal += val
    else if (code === 70 && currentEntity === 'LWPOLYLINE')
      polyClosed = (parseInt(val, 10) & 1) === 1
    else if (code === 10) {
      const num = parseFloat(val)
      if (currentEntity === 'LWPOLYLINE') pendingPolyX = num
      else x1 = num
    } else if (code === 20) {
      const num = parseFloat(val)
      if (currentEntity === 'LWPOLYLINE' && Number.isFinite(pendingPolyX)) {
        polyPts.push({ x: pendingPolyX, y: num })
        pendingPolyX = NaN
      } else {
        y1 = num
      }
    } else if (code === 11) x2 = parseFloat(val)
    else if (code === 21) y2 = parseFloat(val)
    else if (code === 40) r = parseFloat(val)
  }

  if (lines.length === 0 && inserts.length === 0 && circles.length === 0) return null

  // 计算有效坐标边界（使用分位数过滤离群图框）
  const xs: number[] = []
  const ys: number[] = []
  for (const l of lines) {
    xs.push(l.x1, l.x2)
    ys.push(l.y1, l.y2)
  }
  for (const ins of inserts) {
    xs.push(ins.x)
    ys.push(ins.y)
  }
  if (xs.length < 4) return null
  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)
  const minX = xs[Math.floor(xs.length * 0.02)]
  const maxX = xs[Math.floor(xs.length * 0.98)]
  const minY = ys[Math.floor(ys.length * 0.02)]
  const maxY = ys[Math.floor(ys.length * 0.98)]
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)

  const W = SHEET.pixelWidth
  const H = SHEET.pixelHeight
  const pad = 90
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY)
  const offsetX = (W - spanX * scale) / 2
  const offsetY = (H - spanY * scale) / 2

  const toPxX = (x: number) => offsetX + (x - minX) * scale
  // CAD 坐标系 Y 轴向上，屏幕像素坐标系 Y 轴向下
  const toPxY = (y: number) => H - (offsetY + (y - minY) * scale)

  // 1. 提取房间文字并构建房间区域
  const areas: DetectedCadArea[] = []
  const seenRooms = new Set<string>()
  for (const t of texts) {
    if (t.x < minX || t.x > maxX || t.y < minY || t.y > maxY) continue
    const matched = ROOM_NAME_MAP.find((rm) => rm.re.test(t.text))
    if (!matched) continue
    const rx = toPxX(t.x) / W
    const ry = toPxY(t.y) / H
    if (rx < 0.05 || rx > 0.95 || ry < 0.05 || ry > 0.92) continue
    const uniqueName = seenRooms.has(matched.name)
      ? `${matched.name}-${areas.length + 1}`
      : matched.name
    seenRooms.add(uniqueName)
    const rw = 0.18
    const rh = 0.2
    areas.push({
      name: uniqueName,
      type: matched.type,
      rect: [
        Math.round(Math.max(0.04, rx - rw / 2) * 1000) / 1000,
        Math.round(Math.max(0.04, ry - rh / 2) * 1000) / 1000,
        rw,
        rh,
      ],
    })
  }

  // 2. 提取开关、灯具与各类智能点位（INSERT 图块 + 标注文字 K1/K2/K3）
  const rawPoints: DetectedCadPoint[] = []
  const dedup = (rx: number, ry: number) =>
    rawPoints.some((p) => Math.hypot(p.x - rx, p.y - ry) < 0.014)

  for (const ins of inserts) {
    if (ins.x < minX || ins.x > maxX || ins.y < minY || ins.y > maxY) continue
    const dt = inferDeviceFromDxfBlock(ins.name, ins.layer)
    if (!dt) continue
    const rx = Math.round((toPxX(ins.x) / W) * 1000) / 1000
    const ry = Math.round((toPxY(ins.y) / H) * 1000) / 1000
    if (rx < 0.04 || rx > 0.96 || ry < 0.04 || ry > 0.92 || dedup(rx, ry)) continue
    const category: 'switch' | 'light' | 'other' = dt.startsWith('switch-')
      ? 'switch'
      : dt === 'downlight' || dt === 'spotlight' || dt === 'ceiling-light' || dt === 'light-strip'
        ? 'light'
        : 'other'
    const matchedArea = areas.find(
      (a) =>
        rx >= a.rect[0] &&
        rx <= a.rect[0] + a.rect[2] &&
        ry >= a.rect[1] &&
        ry <= a.rect[1] + a.rect[3],
    )
    rawPoints.push({
      type: dt,
      x: rx,
      y: ry,
      category,
      ...(matchedArea ? { room: matchedArea.name } : {}),
    })
  }

  // 补充：如果 CAD 图没有用标准命名图块，而是用 L1-Kxx / K1~K4 文字标注开关位置
  for (const t of texts) {
    if (t.x < minX || t.x > maxX || t.y < minY || t.y > maxY) continue
    if (!/\b(L\d+-?K\d+|K[1-4]|单极|双极|三极|四极)\b/i.test(t.text)) continue
    const rx = Math.round((toPxX(t.x) / W) * 1000) / 1000
    const ry = Math.round((toPxY(t.y) / H) * 1000) / 1000
    if (rx < 0.08 || rx > 0.92 || ry < 0.06 || ry > 0.86 || dedup(rx, ry)) continue
    const swType = /四极|K4/i.test(t.text)
      ? 'switch-4'
      : /三极|K3/i.test(t.text)
        ? 'switch-3'
        : /单极|K1\b/i.test(t.text)
          ? 'switch-1'
          : 'switch-2'
    rawPoints.push({ type: swType, x: rx, y: ry, category: 'switch' })
  }

  // 3. 将 DXF 建筑线段渲染成干净的 2400×1600 标准户型底图 PNG
  const svgLines = lines
    .slice(0, 18000)
    .map((l) => {
      const px1 = toPxX(l.x1).toFixed(1)
      const py1 = toPxY(l.y1).toFixed(1)
      const px2 = toPxX(l.x2).toFixed(1)
      const py2 = toPxY(l.y2).toFixed(1)
      const isWall = /wall|墙|柱|col|window|窗/i.test(l.layer)
      return `<line x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}" stroke="${isWall ? '#1e293b' : '#475569'}" stroke-width="${isWall ? '2.4' : '1.2'}" />`
    })
    .join('')

  const svgCircles = circles
    .slice(0, 3000)
    .map((c) => {
      const cx = toPxX(c.cx).toFixed(1)
      const cy = toPxY(c.cy).toFixed(1)
      const cr = Math.max(2, Math.min(80, c.r * scale)).toFixed(1)
      return `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="none" stroke="#334155" stroke-width="1.4" />`
    })
    .join('')

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="100%" height="100%" fill="#ffffff" />
    <g stroke-linecap="round" stroke-linejoin="round">${svgLines}${svgCircles}</g>
  </svg>`

  const png = await sharp(Buffer.from(svgContent)).png().toBuffer()

  const switchPoints = rawPoints.filter((p) => p.category === 'switch')
  const lightPoints = rawPoints.filter((p) => p.category === 'light')
  const summary = buildCadDetectionSummary(rawPoints, areas)
  const preferSwitchesOnly =
    Boolean(opts.sheetName && /开关/.test(opts.sheetName)) && switchPoints.length > 0

  return {
    png,
    detection: {
      points: preferSwitchesOnly ? switchPoints : rawPoints,
      switchPoints,
      lightPoints,
      areas,
      summary,
      hasColorSymbols: true,
    },
  }
}
