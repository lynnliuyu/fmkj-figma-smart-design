/**
 * CAD 开关/灯具布置图符号检测器（纯像素连通域与几何特征识别）。
 *
 * 核心能力：
 * 1. 区域屏蔽：自动定位建筑墙体核心框，屏蔽左下角图例表、右下角标题栏、四周尺寸标注链与外图框；
 * 2. 彩色/淡黄色优先识别：放宽淡黄色开关饱和度下限（明度+色相组合），结合旁侧 L1-Kxx 标签文字二次确认；
 * 3. 图例几何模板区分：严格区分带斜杆旗齿/T柄的开关（switch-1/2/3）与空心圆环/回路圆点灯具（downlight/spotlight）；
 * 4. 房间自动分区：基于主墙体投影切分房间功能区，使点位自动归属对应房间，不再全部落入「公共区」；
 * 5. 分类统计与按需导入：输出开关、筒灯/射灯、其他设备的分类统计，支持「仅导入开关 / 导入全部 / 手动调整」。
 */
import { detectPlanBounds, type Pixels } from './floor-plan-crop'

export type DetectedCadPoint = {
  type: string
  x: number
  y: number
  category?: 'switch' | 'light' | 'other'
  room?: string
}

export type DetectedCadArea = {
  name: string
  type: string
  rect: [number, number, number, number]
}

export type DetectedCadSummary = {
  total: number
  switches: number
  lights: number
  others: number
  areas: number
  byType: Record<string, number>
  confirmText: string
}

export type CadDetectionResult = {
  points: DetectedCadPoint[]
  switchPoints: DetectedCadPoint[]
  lightPoints: DetectedCadPoint[]
  areas: DetectedCadArea[]
  summary: DetectedCadSummary
  /** 是否识别到了彩色/淡黄色专用图层符号（false 表示是纯黑白单色图纸，适合交给视觉大模型增强识图） */
  hasColorSymbols?: boolean
}

const isSwitchType = (t: string) => t.startsWith('switch-')
export const isLightType = (t: string) =>
  t === 'downlight' ||
  t === 'spotlight' ||
  t === 'ceiling-light' ||
  t === 'panel-light' ||
  t === 'light-strip' ||
  t === 'track-light' ||
  t === 'pendant-light' ||
  t === 'wall-light'

export function buildCadDetectionSummary(
  points: DetectedCadPoint[],
  areas: DetectedCadArea[],
): DetectedCadSummary {
  const byType: Record<string, number> = {}
  let switches = 0
  let lights = 0
  let others = 0
  for (const p of points) {
    byType[p.type] = (byType[p.type] ?? 0) + 1
    if (isSwitchType(p.type)) switches++
    else if (isLightType(p.type)) lights++
    else others++
  }
  const swParts: string[] = []
  if (byType['switch-1']) swParts.push(`单极 ${byType['switch-1']}`)
  if (byType['switch-2']) swParts.push(`双极 ${byType['switch-2']}`)
  if (byType['switch-3']) swParts.push(`三极 ${byType['switch-3']}`)
  if (byType['switch-4']) swParts.push(`四极 ${byType['switch-4']}`)
  const swDetail = swParts.length ? `（${swParts.join(' · ')}）` : ''
  const confirmText =
    points.length > 0
      ? `识别到 ${points.length} 个符号：\n- 开关 ${switches}${swDetail}\n- 筒灯/射灯 ${lights}\n- 其他 ${others}`
      : '未识别到标准点位符号'
  return {
    total: points.length,
    switches,
    lights,
    others,
    areas: areas.length,
    byType,
    confirmText,
  }
}

const buildSummary = buildCadDetectionSummary

/**
 * 根据建筑核心框内的墙体投影峰值自动切分房间区域，避免点位全部落入「公共区」。
 */
function partitionRoomsFromWalls(
  W: number,
  H: number,
  coreX0: number,
  coreY0: number,
  coreX1: number,
  coreY1: number,
  isWallPixel: (x: number, y: number) => boolean,
): DetectedCadArea[] {
  const cw = coreX1 - coreX0
  const ch = coreY1 - coreY0
  if (cw < 240 || ch < 200) return []

  const colProj = new Int32Array(cw)
  const rowProj = new Int32Array(ch)
  for (let y = coreY0; y < coreY1; y += 2) {
    for (let x = coreX0; x < coreX1; x += 2) {
      if (isWallPixel(x, y)) {
        colProj[x - coreX0]++
        rowProj[y - coreY0]++
      }
    }
  }

  const findSplits = (proj: Int32Array, len: number, maxSplits: number): number[] => {
    const minMargin = Math.floor(len * 0.22)
    const minGap = Math.floor(len * 0.24)
    const candidates: { idx: number; score: number }[] = []
    for (let i = minMargin; i <= len - minMargin; i += 4) {
      let sum = 0
      for (let d = -6; d <= 6; d++) {
        if (i + d >= 0 && i + d < len) sum += proj[i + d]
      }
      candidates.push({ idx: i, score: sum })
    }
    candidates.sort((a, b) => b.score - a.score)
    const chosen: number[] = []
    for (const c of candidates) {
      if (c.score < 18) break
      if (chosen.every((prev) => Math.abs(prev - c.idx) >= minGap)) {
        chosen.push(c.idx)
        if (chosen.length >= maxSplits) break
      }
    }
    return chosen.sort((a, b) => a - b)
  }

  const xSplits = [0, ...findSplits(colProj, cw, 2), cw]
  const ySplits = [0, ...findSplits(rowProj, ch, 2), ch]

  const ROOM_PRESETS: { name: string; type: string }[][] = [
    [
      { name: '次卧', type: 'bedroom' },
      { name: '主卫 / 公卫', type: 'bathroom' },
      { name: '主卧', type: 'bedroom' },
    ],
    [
      { name: '阳台', type: 'balcony' },
      { name: '客厅', type: 'living' },
      { name: '厨房 / 餐厅', type: 'dining' },
    ],
    [
      { name: '玄关 / 入户', type: 'entrance' },
      { name: '餐厅 / 过道', type: 'corridor' },
      { name: '书房 / 多功能房', type: 'study' },
    ],
  ]

  const areas: DetectedCadArea[] = []
  for (let r = 0; r < ySplits.length - 1; r++) {
    for (let c = 0; c < xSplits.length - 1; c++) {
      const ax0 = coreX0 + xSplits[c]
      const ay0 = coreY0 + ySplits[r]
      const ax1 = coreX0 + xSplits[c + 1]
      const ay1 = coreY0 + ySplits[r + 1]
      if (ax1 - ax0 < 90 || ay1 - ay0 < 80) continue
      const presetRow = ROOM_PRESETS[Math.min(r, ROOM_PRESETS.length - 1)]!
      const preset = presetRow[Math.min(c, presetRow.length - 1)]!
      areas.push({
        name: preset.name,
        type: preset.type,
        rect: [
          Math.round((ax0 / W) * 1000) / 1000,
          Math.round((ay0 / H) * 1000) / 1000,
          Math.round(((ax1 - ax0) / W) * 1000) / 1000,
          Math.round(((ay1 - ay0) / H) * 1000) / 1000,
        ],
      })
    }
  }
  return areas
}

/**
 * 分析 2400×1600 标准图纸像素，检测 CAD 暗装开关（实心黑圆点+斜杆）与灯具（圆圈+十字/花灯）符号。
 * 仅返回高置信度的符号中心比例坐标（0–1）；无匹配符号时返回空数组。
 */
export function detectCadSymbolsFromPixels(
  img: Pixels,
  opts: { sheetName?: string; mode?: 'switches' | 'all' } = {},
): CadDetectionResult {
  const W = img.width
  const H = img.height
  const ch = img.channels ?? 4
  const d = img.data
  const emptyResult = (): CadDetectionResult => ({
    points: [],
    switchPoints: [],
    lightPoints: [],
    areas: [],
    summary: buildSummary([], []),
  })

  // 1. 先找出平面图主体范围，向内缩进一点，避开外围尺寸标注文字
  const bounds = detectPlanBounds(img)
  const xMin = bounds.x + Math.floor(bounds.width * 0.015)
  const xMax = bounds.x + Math.floor(bounds.width * 0.985)
  const yMin = bounds.y + Math.floor(bounds.height * 0.02)
  const yMax = bounds.y + Math.floor(bounds.height * 0.98)

  if (xMax <= xMin + 100 || yMax <= yMin + 100) {
    return emptyResult()
  }

  // 判断背景是白底还是深色底（部分 CAD 导出图为黑底白线）
  let lumSum = 0
  let lumSamples = 0
  for (let y = yMin; y < yMax; y += 8) {
    for (let x = xMin; x < xMax; x += 8) {
      const i = (y * W + x) * ch
      if (ch === 4 && d[i + 3] < 64) continue
      lumSum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      lumSamples++
    }
  }
  const avgLum = lumSamples > 0 ? lumSum / lumSamples : 255
  const darkBg = avgLum < 90

  const isDark = (x: number, y: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return false
    const i = (y * W + x) * ch
    const a = ch === 4 ? d[i + 3] : 255
    if (a < 64) return false
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    return darkBg ? lum > 145 : lum < 155
  }

  // 统计主体区域墨迹比例：如果不是白底黑线的 CAD 图纸（如深色渲染图/彩色照片），直接返回空
  let darkCount = 0
  const totalSample = (xMax - xMin) * (yMax - yMin)
  for (let y = yMin; y < yMax; y += 2) {
    for (let x = xMin; x < xMax; x += 2) {
      if (isDark(x, y)) darkCount++
    }
  }
  const inkRatio = (darkCount * 4) / totalSample
  if (inkRatio < 0.005 || inkRatio > 0.35) {
    return emptyResult()
  }

  // 1b. 精确计算建筑外墙核心框 [wx0, wy0, wx1, wy1]，剔除四周尺寸链、左下角图例表与右下角标题栏
  const isThickWall = (cx: number, cy: number) => {
    let cnt = 0
    for (let dy = -3; dy <= 3; dy += 2) {
      for (let dx = -3; dx <= 3; dx += 2) {
        if (isDark(cx + dx, cy + dy)) cnt++
      }
    }
    return cnt >= 14
  }
  const isWallLine = (cx: number, cy: number) => {
    let h = 0
    let v = 0
    for (let k = -12; k <= 12; k += 2) {
      if (isDark(cx + k, cy)) h++
      if (isDark(cx, cy + k)) v++
    }
    return h >= 11 || v >= 11
  }

  const rowThick = new Int32Array(H)
  const colThick = new Int32Array(W)
  let totalThickSamples = 0
  for (
    let y = Math.max(yMin, Math.floor(H * 0.06));
    y < Math.min(yMax, Math.floor(H * 0.9));
    y += 2
  ) {
    for (
      let x = Math.max(xMin, Math.floor(W * 0.08));
      x < Math.min(xMax, Math.floor(W * 0.92));
      x += 2
    ) {
      if (isThickWall(x, y)) {
        rowThick[y]++
        colThick[x]++
        totalThickSamples++
      }
    }
  }

  let wx0 = xMin
  let wx1 = xMax
  let wy0 = yMin
  let wy1 = yMax
  if (totalThickSamples >= 40) {
    let tx0 = 0
    let tx1 = W - 1
    let ty0 = 0
    let ty1 = H - 1
    while (tx0 < W && colThick[tx0] < 3) tx0++
    while (tx1 > tx0 && colThick[tx1] < 3) tx1--
    while (ty0 < H && rowThick[ty0] < 3) ty0++
    while (ty1 > ty0 && rowThick[ty1] < 3) ty1--
    if (tx1 - tx0 > 300 && ty1 - ty0 > 240) {
      wx0 = Math.max(xMin, tx0 - 16)
      wy0 = Math.max(yMin, ty0 - 16)
      wx1 = Math.min(xMax, tx1 + 16)
      wy1 = Math.min(yMax, ty1 + 16)
    }
  }

  const inMaskedCorner = (x: number, y: number) =>
    (x < W * 0.28 && y > H * 0.72) ||
    (x > W * 0.68 && y > H * 0.82) ||
    (x < W * 0.28 && y < H * 0.25) ||
    (x > W * 0.62 && y < H * 0.21)

  const nearThickWall = (cx: number, cy: number) => {
    for (let dy = -36; dy <= 36; dy += 4) {
      for (let dx = -36; dx <= 36; dx += 4) {
        const d2 = dx * dx + dy * dy
        if (d2 >= 49 && d2 <= 1296 && isThickWall(cx + dx, cy + dy)) return true
      }
    }
    return false
  }
  const nearAnyWall = (cx: number, cy: number) => {
    for (let dy = -34; dy <= 34; dy += 4) {
      for (let dx = -34; dx <= 34; dx += 4) {
        const d2 = dx * dx + dy * dy
        if (d2 >= 49 && d2 <= 1156) {
          if (isThickWall(cx + dx, cy + dy)) return true
          if (isWallLine(cx + dx, cy + dy)) return true
        }
      }
    }
    return false
  }

  const analyzeSectors = (cx: number, cy: number, rMin: number, rMax: number) => {
    const sec = new Int32Array(12)
    let totalInk = 0
    let totalPts = 0
    for (let dy = -rMax; dy <= rMax; dy++) {
      for (let dx = -rMax; dx <= rMax; dx++) {
        const r = Math.hypot(dx, dy)
        if (r < rMin || r > rMax) continue
        totalPts++
        if (isDark(cx + dx, cy + dy)) {
          totalInk++
          let ang = Math.atan2(dy, dx)
          if (ang < 0) ang += Math.PI * 2
          sec[Math.min(11, Math.floor((ang / (Math.PI * 2)) * 12))]++
        }
      }
    }
    let maxSec = 0
    for (let i = 0; i < 12; i++) {
      const pair = sec[i] + sec[(i + 1) % 12]
      if (pair > maxSec) maxSec = pair
    }
    return {
      totalInk,
      ratio: totalPts > 0 ? totalInk / totalPts : 0,
      activeSectors: sec.filter((v) => v >= 3).length,
      emptySectors: sec.filter((v) => v === 0).length,
      maxSec,
    }
  }

  const coreScore = (cx: number, cy: number) => {
    let cInk = 0
    let cTot = 0
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy <= 20) {
          cTot++
          if (isDark(cx + dx, cy + dy)) cInk++
        }
      }
    }
    return cInk / cTot
  }

  const visited = new Uint8Array(W * H)

  const markVisited = (cx: number, cy: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) visited[ny * W + nx] = 1
      }
    }
  }

  const colorSwitches: { x: number; y: number; type: string }[] = []
  const otherColorPoints: { x: number; y: number; type: string }[] = []

  // 1.5 Pass 0：优先检测家装水电图常见的「彩底白字开关铭牌」（如草绿底白字「双开/单开」、橙底白字「三开」、天蓝底白字「双开」、红底白字「智能屏」）
  // 这类图纸同时用纯色实心小竖条（无白字）表示五孔/四孔插座，若检出彩底白字开关铭牌，则严格过滤掉纯色无字插座条！
  const badgeVisited = new Uint8Array(W * H)
  const badgeSwitches: { x: number; y: number; type: string }[] = []
  const badgeOthers: { x: number; y: number; type: string }[] = []

  // 判断 (px, py) 是否属于实心色块内部（排除 1~2px 宽的红色标注外框细线）
  const isSolidColorPixel = (px: number, py: number) => {
    let neighbors = 0
    for (const [ox, oy] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ]) {
      const idx = ((py + oy) * W + (px + ox)) * ch
      const nr = d[idx]
      const ng = d[idx + 1]
      const nb = d[idx + 2]
      if (Math.max(nr, ng, nb) - Math.min(nr, ng, nb) >= 50 || (nr > 185 && ng > 160 && nb > 160)) {
        neighbors++
      }
    }
    return neighbors >= 3
  }

  for (let y = wy0; y < wy1; y += 2) {
    for (let x = wx0; x < wx1; x += 2) {
      if (badgeVisited[y * W + x] || inMaskedCorner(x, y)) continue
      const i = (y * W + x) * ch
      if (ch === 4 && d[i + 3] < 128) continue
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      // 开关铭牌底色具有明显高饱和度，只从实心底色启动（避开外圈抗锯齿浅色晕染边）
      if (max < 115 || max - min < 80 || min > 115) continue
      if (!isSolidColorPixel(x, y)) continue

      const q: [number, number][] = [[x, y]]
      const seenInBlob: number[] = [y * W + x]
      badgeVisited[y * W + x] = 1
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      let sumR = 0
      let sumG = 0
      let sumB = 0
      let count = 0

      while (q.length > 0 && count < 1500) {
        const [cx, cy] = q.pop()!
        count++
        const ci = (cy * W + cx) * ch
        sumR += d[ci]
        sumG += d[ci + 1]
        sumB += d[ci + 2]
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < wx0 || nx >= wx1 || ny < wy0 || ny >= wy1) continue
          if (Math.abs(nx - x) > 48 || Math.abs(ny - y) > 15) continue
          if (badgeVisited[ny * W + nx]) continue
          const ni = (ny * W + nx) * ch
          const nr = d[ni]
          const ng = d[ni + 1]
          const nb = d[ni + 2]
          const nmax = Math.max(nr, ng, nb)
          const nmin = Math.min(nr, ng, nb)
          if (!isSolidColorPixel(nx, ny)) continue
          if (
            nmax >= 105 &&
            nmax - nmin >= 65 &&
            nmin <= 130 &&
            Math.abs(nr - r) + Math.abs(ng - g) + Math.abs(nb - b) < 175
          ) {
            badgeVisited[ny * W + nx] = 1
            seenInBlob.push(ny * W + nx)
            q.push([nx, ny])
          }
        }
      }

      const bw = maxX - minX + 1
      const bh = maxY - minY + 1
      const area = bw * bh
      // 如果扫到的是外围细长红框线（跨度过大或过扁），解除其内部像素占用，避免把框内的开关/智能屏吞掉
      if (bw > 56 || bh > 18) {
        for (const idx of seenInBlob) badgeVisited[idx] = 0
        badgeVisited[y * W + x] = 1
        continue
      }
      // 标准横向开关铭牌：单个宽 19~34px（两个并排相连时宽 38~52px），高 11~16px
      if (count >= 95 && bw >= 19 && bw <= 54 && bh >= 10 && bh <= 16 && count / area >= 0.34) {
        let lightPx = 0
        for (let py = minY + 1; py < maxY; py++) {
          for (let px = minX + 1; px < maxX; px++) {
            const pi = (py * W + px) * ch
            const pr = d[pi]
            const pg = d[pi + 1]
            const pb = d[pi + 2]
            if (0.299 * pr + 0.587 * pg + 0.114 * pb > 182 && Math.min(pr, pg, pb) > 145) lightPx++
          }
        }
        // 内部必须有清晰的白色汉字笔画（排除 lightPx === 0 的纯色实心插座条）
        if (lightPx >= 36 && lightPx / area <= 0.58) {
          const ar = sumR / count
          const ag = sumG / count
          const ab = sumB / count
          const mx = Math.max(ar, ag, ab)
          const mn = Math.min(ar, ag, ab)
          const delta = Math.max(1, mx - mn)
          let hue = 0
          if (mx === ar) hue = ((ag - ab) / delta) % 6
          else if (mx === ag) hue = (ab - ar) / delta + 2
          else hue = (ar - ag) / delta + 4
          hue = Math.round(hue * 60)
          if (hue < 0) hue += 360

          const cy = Math.round((minY + maxY) / 2)
          const cx = Math.round((minX + maxX) / 2)
          const isDoubleBadge = bw >= 38

          if (hue >= 24 && hue <= 48) {
            // 橙黄色底白字「三开」
            if (isDoubleBadge) {
              const x1 = Math.round(minX + bw * 0.25)
              const x2 = Math.round(minX + bw * 0.75)
              badgeSwitches.push({ x: x1, y: cy, type: 'switch-3' })
              badgeSwitches.push({ x: x2, y: cy, type: 'switch-3' })
              markVisited(x1, cy, 14)
              markVisited(x2, cy, 14)
            } else {
              badgeSwitches.push({ x: cx, y: cy, type: 'switch-3' })
              markVisited(cx, cy, 18)
            }
          } else if ((hue >= 68 && hue <= 108) || (hue >= 190 && hue <= 215)) {
            // 草绿色/天蓝色底白字「双开 / 单开」
            if (isDoubleBadge) {
              const x1 = Math.round(minX + bw * 0.25)
              const x2 = Math.round(minX + bw * 0.75)
              badgeSwitches.push({ x: x1, y: cy, type: 'switch-2' })
              badgeSwitches.push({ x: x2, y: cy, type: 'switch-2' })
              markVisited(x1, cy, 14)
              markVisited(x2, cy, 14)
            } else {
              // 单开汉字「单」笔画比「双」稍疏，结合白字像素占比区分单开与双开
              const swType = lightPx <= 66 ? 'switch-1' : 'switch-2'
              badgeSwitches.push({ x: cx, y: cy, type: swType })
              markVisited(cx, cy, 18)
            }
          } else if ((hue >= 345 || hue <= 14) && bw >= 28 && cx > W * 0.42 && cx < W * 0.62) {
            // 过道中央红底白字「智能屏」
            badgeSwitches.push({ x: cx, y: cy, type: 'touch-panel' })
            markVisited(cx, cy, 20)
          }
        }
      }
    }
  }

  if (badgeSwitches.length >= 4) {
    colorSwitches.push(...badgeSwitches)
    otherColorPoints.push(...badgeOthers)
  }

  // 2. Pass 1：优先扫描淡黄色开关标记（放宽饱和度下限，用明度+色相组合判断，并结合旁侧 L1-Kxx 标签或斜杆墨迹二次确认）与高饱和彩色点位
  const isPaleYellowSwitchPixel = (r: number, g: number, b: number) => {
    if (r < 175 || g < 160) return false
    if (r - b < 20 || g - b < 15) return false
    if (Math.abs(r - g) > 45) return false
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max > 0 ? (max - min) / max : 0
    return sat >= 0.08
  }

  if (badgeSwitches.length < 4)
    for (let y = wy0 + 12; y < wy1 - 12; y += 2) {
      for (let x = wx0 + 12; x < wx1 - 12; x += 2) {
        if (visited[y * W + x] || inMaskedCorner(x, y)) continue
        const i = (y * W + x) * ch
        if (ch === 4 && d[i + 3] < 128) continue
        const r = d[i]
        const g = d[i + 1]
        const b = d[i + 2]
        const paleYellow = isPaleYellowSwitchPixel(r, g, b)
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const sat = max > 0 ? (max - min) / max : 0
        const strongColor = max >= 85 && max - min >= 55 && sat >= 0.35
        if (!paleYellow && !strongColor) continue

        let colorInner = 0
        let colorOuter = 0
        let sumX = 0
        let sumY = 0
        for (let dy = -16; dy <= 16; dy += 2) {
          for (let dx = -16; dx <= 16; dx += 2) {
            const idx = ((y + dy) * W + (x + dx)) * ch
            const pr = d[idx]
            const pg = d[idx + 1]
            const pb = d[idx + 2]
            const isCol = paleYellow
              ? isPaleYellowSwitchPixel(pr, pg, pb)
              : Math.max(pr, pg, pb) >= 80 && Math.max(pr, pg, pb) - Math.min(pr, pg, pb) >= 50
            const r2 = dx * dx + dy * dy
            if (r2 <= 64 && isCol) {
              colorInner++
              sumX += x + dx
              sumY += y + dy
            } else if (r2 >= 169 && r2 <= 256 && isCol) {
              colorOuter++
            }
          }
        }
        if (colorInner >= 8 && colorOuter <= 16) {
          const cx = Math.round(sumX / colorInner)
          const cy = Math.round(sumY / colorInner)
          let hue = 0
          const delta = Math.max(1, max - min)
          if (max === r) hue = ((g - b) / delta) % 6
          else if (max === g) hue = (b - r) / delta + 2
          else hue = (r - g) / delta + 4
          hue = Math.round(hue * 60)
          if (hue < 0) hue += 360

          if (paleYellow || (hue >= 25 && hue <= 72)) {
            const ring = analyzeSectors(cx, cy, 4, 16)
            const labelRing = analyzeSectors(cx, cy, 16, 42)
            if (ring.totalInk >= 6 || labelRing.totalInk >= 12) {
              const stemInk = ring.maxSec
              const swType = stemInk >= 36 ? 'switch-3' : stemInk >= 22 ? 'switch-2' : 'switch-1'
              colorSwitches.push({ x: cx, y: cy, type: swType })
              markVisited(cx, cy, 22)
            }
            continue
          }

          let dt = 'switch-2'
          if (hue >= 115 && hue <= 165) dt = 'motion-sensor'
          else if (hue > 165 && hue <= 198) dt = 'ap-node'
          else if (hue >= 200 && hue <= 250) dt = 'switch-2'
          else if (hue > 250 && hue <= 300) dt = 'gateway'
          else if (hue > 300 && hue <= 345) dt = 'curtain-track'

          if (isSwitchType(dt)) colorSwitches.push({ x: cx, y: cy, type: dt })
          else otherColorPoints.push({ x: cx, y: cy, type: dt })
          markVisited(cx, cy, 20)
        }
      }
    }

  const bwSwitches: { x: number; y: number; type: string }[] = []
  const bwLights: { x: number; y: number; type: string }[] = []

  // 3. Pass 2：按图例几何特征扫描黑白 CAD 开关符号（实心圆核+斜杆旗齿 / 空心圆圈+T柄，且必须紧贴墙体）
  if (colorSwitches.length < 3) {
    for (let y = wy0; y <= wy1; y += 2) {
      for (let x = wx0; x <= wx1; x += 2) {
        if (visited[y * W + x] || inMaskedCorner(x, y)) continue

        if (isDark(x, y) && coreScore(x, y) >= 0.75) {
          let cx = x
          let cy = y
          let best = coreScore(x, y)
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const s = coreScore(x + dx, y + dy)
              if (s > best) {
                best = s
                cx = x + dx
                cy = y + dy
              }
            }
          }
          const onThick = nearThickWall(cx, cy)
          const useThinWall = totalThickSamples < 14000
          if (
            best >= 0.86 &&
            !visited[cy * W + cx] &&
            (onThick || (useThinWall && nearAnyWall(cx, cy)))
          ) {
            const ring = analyzeSectors(cx, cy, 7, 13)
            const outer = analyzeSectors(cx, cy, 12, 18)
            const farRing = analyzeSectors(cx, cy, 18, 26)
            // 排除盆栽绿植、家具填充等大面积密集团块噪点（farRing 墨迹过高说明处于复杂家具/植物团块内部）
            if (
              ring.ratio >= 0.035 &&
              ring.ratio <= 0.22 &&
              ring.activeSectors >= 1 &&
              ring.activeSectors <= 3 &&
              ring.emptySectors >= 7 &&
              outer.totalInk >= 14 &&
              outer.totalInk <= 95 &&
              outer.emptySectors >= (onThick ? 6 : 7) &&
              farRing.ratio <= 0.22 &&
              farRing.emptySectors >= 5
            ) {
              const stemInk = ring.maxSec + outer.maxSec
              const type = stemInk >= 58 ? 'switch-3' : stemInk >= 40 ? 'switch-2' : 'switch-1'
              bwSwitches.push({ x: cx, y: cy, type })
              markVisited(cx, cy, 26)
              continue
            }
          }
        }

        if (!isDark(x, y)) {
          let hCore = 0
          let hRing = 0
          let hRingTot = 0
          for (let dy = -7; dy <= 7; dy++) {
            for (let dx = -7; dx <= 7; dx++) {
              const r2 = dx * dx + dy * dy
              const dk = isDark(x + dx, y + dy)
              if (r2 <= 4 && dk) hCore++
              else if (r2 >= 12 && r2 <= 42) {
                hRingTot++
                if (dk) hRing++
              }
            }
          }
          if (
            hCore === 0 &&
            hRing / hRingTot >= 0.45 &&
            (isDark(x - 5, y) || isDark(x - 4, y)) &&
            (isDark(x + 5, y) || isDark(x + 4, y)) &&
            (isDark(x, y - 5) || isDark(x, y - 4)) &&
            (isDark(x, y + 5) || isDark(x, y + 4))
          ) {
            const moat = analyzeSectors(x, y, 7, 13)
            const outer = analyzeSectors(x, y, 12, 18)
            if (
              nearThickWall(x, y) &&
              moat.emptySectors >= 6 &&
              moat.ratio <= 0.24 &&
              moat.totalInk >= 14 &&
              moat.activeSectors >= 2 &&
              moat.activeSectors <= 4 &&
              outer.totalInk >= 12 &&
              outer.totalInk <= 90
            ) {
              const stemInk = moat.maxSec + outer.maxSec
              const type = stemInk >= 48 ? 'switch-3' : stemInk >= 34 ? 'switch-2' : 'switch-1'
              bwSwitches.push({ x, y, type })
              markVisited(x, y, 24)
            }
          }
        }
      }
    }
  }

  // 4. Pass 3：扫描圆圈灯具与回路上的小圆点灯位（全部归类为 downlight，绝不冒充开关）
  for (let y = wy0; y <= wy1; y += 2) {
    for (let x = wx0; x <= wx1; x += 2) {
      if (visited[y * W + x] || inMaskedCorner(x, y)) continue

      if (!isDark(x, y)) {
        let hCore = 0
        let hRing = 0
        let hRingTot = 0
        for (let dy = -7; dy <= 7; dy++) {
          for (let dx = -7; dx <= 7; dx++) {
            const r2 = dx * dx + dy * dy
            const dk = isDark(x + dx, y + dy)
            if (r2 <= 4 && dk) hCore++
            else if (r2 >= 12 && r2 <= 42) {
              hRingTot++
              if (dk) hRing++
            }
          }
        }
        if (
          hCore === 0 &&
          hRing / hRingTot >= 0.45 &&
          (isDark(x - 5, y) || isDark(x - 4, y)) &&
          (isDark(x + 5, y) || isDark(x + 4, y)) &&
          (isDark(x, y - 5) || isDark(x, y - 4)) &&
          (isDark(x, y + 5) || isDark(x, y + 4))
        ) {
          const moat = analyzeSectors(x, y, 8, 12)
          if (moat.emptySectors >= 6 && moat.ratio <= 0.22) {
            bwLights.push({ x, y, type: 'downlight' })
            markVisited(x, y, 18)
            continue
          }
        }
      }

      const cs = coreScore(x, y)
      if (cs >= 0.55 && !isThickWall(x, y)) {
        const moat = analyzeSectors(x, y, 7, 12)
        const outerMoat = analyzeSectors(x, y, 13, 20)
        if (
          moat.ratio >= 0.04 &&
          moat.ratio <= 0.15 &&
          moat.activeSectors >= 1 &&
          moat.activeSectors <= 2 &&
          moat.emptySectors >= 9 &&
          outerMoat.ratio <= 0.16 &&
          (isDark(x - 3, y) || isDark(x + 3, y)) &&
          (isDark(x, y - 3) || isDark(x, y + 3))
        ) {
          bwLights.push({ x, y, type: 'downlight' })
          markVisited(x, y, 16)
        }
      }
    }
  }

  const finalSwitches =
    colorSwitches.length >= 3 ? colorSwitches : [...colorSwitches, ...bwSwitches]
  const finalLights = bwLights.slice(0, 200)

  // 5. 自动房间区域切分（基于建筑墙体投影）
  const areas = partitionRoomsFromWalls(W, H, wx0, wy0, wx1, wy1, isThickWall)

  const toPoint = (c: { x: number; y: number; type: string }): DetectedCadPoint => {
    const rx = Math.round((c.x / W) * 1000) / 1000
    const ry = Math.round((c.y / H) * 1000) / 1000
    const matchedArea = areas.find(
      (a) =>
        rx >= a.rect[0] &&
        rx <= a.rect[0] + a.rect[2] &&
        ry >= a.rect[1] &&
        ry <= a.rect[1] + a.rect[3],
    )
    const category: 'switch' | 'light' | 'other' = isSwitchType(c.type)
      ? 'switch'
      : isLightType(c.type)
        ? 'light'
        : 'other'
    return {
      type: c.type,
      x: rx,
      y: ry,
      category,
      ...(matchedArea ? { room: matchedArea.name } : {}),
    }
  }

  const switchPoints = finalSwitches.map(toPoint)
  const lightPoints = finalLights.map(toPoint)
  const otherPoints = otherColorPoints.map(toPoint)
  const allPoints = [...switchPoints, ...lightPoints, ...otherPoints]

  if (allPoints.length < 2 || allPoints.length > 300) {
    return emptyResult()
  }

  const summary = buildSummary(allPoints, areas)

  // 如果调用方指定了 mode='switches'，或者图纸名称明确是「开关布置图」且存在开关点位，默认 points 只返回开关点位
  const preferSwitchesOnly =
    opts.mode === 'switches' ||
    (opts.mode !== 'all' &&
      Boolean(opts.sheetName && /开关/.test(opts.sheetName)) &&
      switchPoints.length > 0)

  return {
    points: preferSwitchesOnly ? switchPoints : allPoints,
    switchPoints,
    lightPoints,
    areas,
    summary,
    hasColorSymbols: colorSwitches.length >= 2 || otherColorPoints.length >= 2,
  }
}

/**
 * 视觉大模型识图结果 + 本地像素「磁吸对齐器（Snap-to-Cad-Ink）」：
 * 大模型擅长看懂非标图纸语义但坐标会有 1%~3% 漂移；本函数在模型给出的 (x, y) 周围搜索最符合符号几何特征的墨迹中心进行吸附对齐。
 */
/**
 * 把一个视觉模型给出的近似坐标（0–1）吸附到附近最像符号中心的墨迹/色块上（找不到合适位置时保持原坐标）。
 */
export function snapPointToInk(
  pixels: Pixels,
  x: number,
  y: number,
  isSwitch: boolean,
): { x: number; y: number; snapped: boolean } {
  const { data: d, width: W, height: H, channels: ch = 4 } = pixels
  const isDark = (px: number, py: number) => {
    if (px < 2 || px >= W - 2 || py < 2 || py >= H - 2) return false
    const i = (py * W + px) * ch
    if (ch === 4 && d[i + 3] < 128) return false
    return (d[i] + d[i + 1] + d[i + 2]) / 3 < 155
  }
  const px0 = Math.round(x * W)
  const py0 = Math.round(y * H)
  const searchRadius = isSwitch ? 30 : 24
  let bestX = px0
  let bestY = py0
  let bestScore = -1
  for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
      const cx = px0 + dx
      const cy = py0 + dy
      if (cx < 16 || cx >= W - 16 || cy < 16 || cy >= H - 16) continue
      // 7x7 局部圆核墨迹密度 + 外围适度留白（避免直接吸到实心粗黑墙体正中间）
      let inner = 0
      let ring = 0
      for (let iy = -3; iy <= 3; iy++) {
        for (let ix = -3; ix <= 3; ix++) {
          if (isDark(cx + ix, cy + iy)) inner++
        }
      }
      if (inner < 6) continue
      for (let ry = -9; ry <= 9; ry += 3) {
        for (let rx = -9; rx <= 9; rx += 3) {
          if (Math.abs(rx) <= 3 && Math.abs(ry) <= 3) continue
          if (isDark(cx + rx, cy + ry)) ring++
        }
      }
      // 理想符号圆心：中心有墨迹，外围有斜杆或圆环但不是全黑实心墙
      if (inner <= 42 && ring >= 2 && ring <= 24) {
        const score = inner * 1.4 - Math.abs(ring - 10) * 0.8 - Math.hypot(dx, dy) * 0.35
        if (score > bestScore) {
          bestScore = score
          bestX = cx
          bestY = cy
        }
      }
    }
  }
  return {
    x: Math.round((bestX / W) * 1000) / 1000,
    y: Math.round((bestY / H) * 1000) / 1000,
    snapped: bestScore >= 0,
  }
}

export function snapVisionPointsToCadInk(
  pixels: Pixels,
  visionPoints: { type: string; x: number; y: number; room?: string }[],
  existingAreas: DetectedCadArea[],
  opts: { sheetName?: string } = {},
): CadDetectionResult {
  const snapped: DetectedCadPoint[] = []
  for (const vp of visionPoints) {
    const isSw = isSwitchType(vp.type)
    const { x: rx, y: ry } = snapPointToInk(pixels, vp.x, vp.y, isSw)
    const matchedArea = existingAreas.find(
      (a) =>
        rx >= a.rect[0] &&
        rx <= a.rect[0] + a.rect[2] &&
        ry >= a.rect[1] &&
        ry <= a.rect[1] + a.rect[3],
    )
    const category: 'switch' | 'light' | 'other' = isSw
      ? 'switch'
      : isLightType(vp.type)
        ? 'light'
        : 'other'
    snapped.push({
      type: vp.type,
      x: rx,
      y: ry,
      category,
      room: vp.room || matchedArea?.name,
    })
  }

  const switchPoints = snapped.filter((p) => p.category === 'switch')
  const lightPoints = snapped.filter((p) => p.category === 'light')
  const summary = buildSummary(snapped, existingAreas)
  const preferSwitchesOnly =
    Boolean(opts.sheetName && /开关/.test(opts.sheetName)) && switchPoints.length > 0

  return {
    points: preferSwitchesOnly ? switchPoints : snapped,
    switchPoints,
    lightPoints,
    areas: existingAreas,
    summary,
    hasColorSymbols: false,
  }
}
