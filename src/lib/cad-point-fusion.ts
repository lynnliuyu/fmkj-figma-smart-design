/**
 * 本地几何识别 × 视觉大模型复核 的融合规则（纯函数，可单测，见 scripts/verify-vision-fusion.mjs）。
 *
 * 1. 本地识别器坐标精准：每个本地候选点由视觉模型在放大拼图里逐格复核——
 *    判为插座 / 非设备（且置信度足够）→ 剔除；判为其他开关极数或智能屏 → 修正型号；没有复核结论 → 原样保留。
 * 2. 视觉模型整图理解强：图纸文字标注（如「主卧三开*3」）或整图点位数量多于本地保留数量时，
 *    把视觉模型找到、但本地漏掉的点位（距离已有点位足够远的）吸附到墨迹后补充进来。
 * 3. 房间：视觉模型读出的房间名与范围优先，否则沿用本地墙体投影分区。
 */
import { inferAreaType, isAreaType } from './area-types'
import {
  buildCadDetectionSummary,
  isLightType,
  type CadDetectionResult,
  type DetectedCadArea,
  type DetectedCadPoint,
} from './cad-point-detector'
import { isDeviceType } from './device-types'

export type VisionVerdictKind =
  | 'switch-1'
  | 'switch-2'
  | 'switch-3'
  | 'switch-4'
  | 'touch-panel'
  | 'light'
  | 'socket'
  | 'sensor'
  | 'curtain'
  | 'other-device'
  | 'none'
export type VisionVerdict = { kind: VisionVerdictKind; confidence: number; text?: string }
export type VisionFullPoint = { type: string; x: number; y: number; room?: string }
export type VisionFullAnalysis = {
  drawingType?: string
  legend: string[]
  annotatedCounts: Record<string, number>
  socketCount?: number
  points: VisionFullPoint[]
  areas: DetectedCadArea[]
  summary?: string
  issues: string[]
}

export type FusionStats = {
  localCount: number
  verified: number
  dropped: number
  droppedSockets: number
  retyped: number
  added: number
  visionPoints: number
  visionFirst?: boolean
  baseFromVision?: number
}

const SOCKET_POINT_TYPES = new Set(['socket', 'socket-double', 'socket-usb'])

const VERDICT_KINDS = new Set<VisionVerdictKind>([
  'switch-1',
  'switch-2',
  'switch-3',
  'switch-4',
  'touch-panel',
  'light',
  'socket',
  'sensor',
  'curtain',
  'other-device',
  'none',
])

export const isSwitchFamily = (t: string) => t.startsWith('switch-') || t === 'touch-panel'
const categoryOf = (t: string): 'switch' | 'light' | 'other' =>
  t.startsWith('switch-') ? 'switch' : isLightType(t) ? 'light' : 'other'
const famOf = (t: string): 'switch' | 'light' | 'other' =>
  isSwitchFamily(t) ? 'switch' : isLightType(t) ? 'light' : 'other'
const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp01 = (n: number) => Math.min(0.995, Math.max(0.005, n))

export function normalizeVerdictKind(raw: unknown): VisionVerdictKind | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (VERDICT_KINDS.has(s as VisionVerdictKind)) return s as VisionVerdictKind
  // 否定式必须先判：否则「不是插座 / 非灯 / 无灯」会先命中 socket/light 名词而被读成肯定
  // 否定式先判，但要避免误伤：英文否定词必须是**独立词**（前后是空白/标点或串首尾），
  // 否则 no.1 / no.2（图纸编号）与 socket-no（后缀）会被当成否定。
  if (/(?:^|[\s,，、。;；:：])(?:none|no|not)(?=$|[\s,，、。;；:：])|不\s*是|没有|不含|无|非/.test(s)) return 'none'
  if (/^switch[-_]?1|单开|单键|一开/.test(s)) return 'switch-1'
  if (/^switch[-_]?2|双开|双键|二开|两开/.test(s)) return 'switch-2'
  if (/^switch[-_]?3|三开|三键/.test(s)) return 'switch-3'
  if (/^switch[-_]?4|四开|四键/.test(s)) return 'switch-4'
  if (/touch|screen|panel|智能屏|中控/.test(s)) return 'touch-panel'
  if (/light|lamp|灯/.test(s)) return 'light'
  if (/socket|outlet|插座/.test(s)) return 'socket'
  if (/sensor|传感/.test(s)) return 'sensor'
  if (/curtain|窗帘/.test(s)) return 'curtain'
  return 'other-device'
}

/** 校验并规整视觉模型整图分析的 JSON（坐标裁剪到图内、类型过滤、房间类型推断）。 */
export function normalizeVisionAnalysis(raw: unknown): VisionFullAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const points: VisionFullPoint[] = []
  if (Array.isArray(r.points)) {
    for (const p of r.points.slice(0, 240)) {
      if (!p || typeof p !== 'object') continue
      const o = p as Record<string, unknown>
      const type = typeof o.type === 'string' ? o.type.trim() : ''
      const x = Number(o.x)
      const y = Number(o.y)
      if (!type || !isDeviceType(type) || !Number.isFinite(x) || !Number.isFinite(y)) continue
      if (x <= 0.01 || x >= 0.99 || y <= 0.01 || y >= 0.99) continue
      points.push({
        type,
        x: round3(x),
        y: round3(y),
        ...(typeof o.room === 'string' && o.room.trim()
          ? { room: o.room.trim().slice(0, 24) }
          : {}),
      })
    }
  }
  const areas: DetectedCadArea[] = []
  if (Array.isArray(r.areas)) {
    for (const a of r.areas.slice(0, 30)) {
      if (!a || typeof a !== 'object') continue
      const o = a as Record<string, unknown>
      const rect = Array.isArray(o.rect) ? o.rect.map(Number) : []
      if (rect.length !== 4 || !rect.every(Number.isFinite)) continue
      const [x, y, w, h] = rect
      if (w < 0.03 || h < 0.03 || x < 0 || y < 0 || x + w > 1.01 || y + h > 1.01) continue
      const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 24) : '房间'
      const type = typeof o.type === 'string' && isAreaType(o.type) ? o.type : inferAreaType(name)
      areas.push({
        name,
        type,
        rect: [round3(x), round3(y), round3(Math.min(w, 1 - x)), round3(Math.min(h, 1 - y))],
      })
    }
  }
  const annotatedCounts: Record<string, number> = {}
  if (r.annotatedCounts && typeof r.annotatedCounts === 'object') {
    for (const [k, v] of Object.entries(r.annotatedCounts as Record<string, unknown>)) {
      const n = Math.round(Number(v))
      if (isDeviceType(k) && Number.isFinite(n) && n > 0 && n < 500) annotatedCounts[k] = n
    }
  }
  const strList = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v
          .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
          .map((s) => s.trim().slice(0, 120))
          .slice(0, max)
      : []
  const socketCount = Math.round(Number(r.socketCount))
  return {
    drawingType: typeof r.drawingType === 'string' ? r.drawingType.slice(0, 40) : undefined,
    legend: strList(r.legend, 20),
    annotatedCounts,
    socketCount: Number.isFinite(socketCount) && socketCount > 0 ? socketCount : undefined,
    points,
    areas,
    summary: typeof r.summary === 'string' ? r.summary.trim().slice(0, 200) : undefined,
    issues: strList(r.issues, 8),
  }
}

/** 本地识别出的全部候选点（开关 + 灯具 + 其他，去重）。 */
export function collectLocalCandidates(local: CadDetectionResult): DetectedCadPoint[] {
  const out: DetectedCadPoint[] = []
  for (const p of [...local.switchPoints, ...local.lightPoints, ...local.points]) {
    if (
      out.some(
        (q) => q.type === p.type && Math.abs(q.x - p.x) < 0.004 && Math.abs(q.y - p.y) < 0.004,
      )
    )
      continue
    out.push(p)
  }
  return out
}

const inRect = (a: DetectedCadArea, x: number, y: number) =>
  x >= a.rect[0] && x <= a.rect[0] + a.rect[2] && y >= a.rect[1] && y <= a.rect[1] + a.rect[3]

const SWITCH_LABEL: Record<string, string> = {
  'switch-1': '单开',
  'switch-2': '双开',
  'switch-3': '三开',
  'switch-4': '四开',
  'touch-panel': '智能屏',
}

export function fuseDetections(input: {
  local: CadDetectionResult
  candidates?: DetectedCadPoint[]
  verdicts: Map<number, VisionVerdict>
  vision: VisionFullAnalysis | null
  snap?: (p: VisionFullPoint) => { x: number; y: number }
  sheetName?: string
  modelLabel?: string
  minConfidence?: number
  /** vision-first：彩色铭牌图以视觉模型点位为主，本地只做吸附与按标注补缺 */
  strategy?: 'hybrid' | 'vision-first'
}): { result: CadDetectionResult; stats: FusionStats; confirmText: string } {
  const candidates = input.candidates ?? collectLocalCandidates(input.local)
  const minConf = input.minConfidence ?? 0.6
  const stats: FusionStats = {
    localCount: candidates.length,
    verified: 0,
    dropped: 0,
    droppedSockets: 0,
    retyped: 0,
    added: 0,
    visionPoints: input.vision?.points.length ?? 0,
  }

  const kept: DetectedCadPoint[] = []
  const vision = input.vision

  // vision-first：模型直读点位为主；本地候选只在标注数量不足时按型号补缺，插座永不落点
  if (
    input.strategy === 'vision-first' &&
    input.vision?.points.some((p) => isSwitchFamily(p.type))
  ) {
    const seen = new Set<string>()
    for (const vp of input.vision.points) {
      if (SOCKET_POINT_TYPES.has(vp.type)) continue
      const pos = input.snap ? input.snap(vp) : { x: vp.x, y: vp.y }
      const x = round3(clamp01(pos.x))
      const y = round3(clamp01(pos.y))
      const key = `${vp.type}:${Math.round(x * 100)}:${Math.round(y * 100)}`
      if (seen.has(key) || kept.some((k) => Math.hypot(k.x - x, k.y - y) < 0.012)) continue
      seen.add(key)
      kept.push({
        type: vp.type,
        x,
        y,
        category: categoryOf(vp.type),
        ...(vp.room ? { room: vp.room } : {}),
      })
    }
    stats.visionFirst = true
    stats.baseFromVision = kept.length
    stats.verified = kept.length
    // 标注校准：开关家族内多出的型号转成缺的型号，再裁掉仍多出的点，保证与图纸文字统计一致
    const annotatedSwitch = Object.entries(input.vision.annotatedCounts).filter(
      ([t, n]) => isSwitchFamily(t) && n > 0,
    )
    if (annotatedSwitch.length) {
      const countType = (t: string) => kept.filter((k) => k.type === t).length
      for (let guard = 0; guard < 24; guard++) {
        const over = annotatedSwitch.find(([t, n]) => countType(t) > n)
        const under = annotatedSwitch.find(([t, n]) => countType(t) < n)
        if (!over || !under) break
        const idx = kept.findIndex((k) => k.type === over[0])
        if (idx < 0) break
        kept[idx] = { ...kept[idx], type: under[0], category: categoryOf(under[0]) }
        stats.retyped++
      }
      for (const [t, n] of annotatedSwitch) {
        while (countType(t) > n) {
          const idx = kept.map((k) => k.type).lastIndexOf(t)
          if (idx < 0) break
          kept.splice(idx, 1)
          stats.dropped++
        }
      }
    }
    const deficit = new Map<string, number>()
    for (const [t, n] of Object.entries(input.vision.annotatedCounts)) {
      if (!isSwitchFamily(t)) continue
      const got = kept.filter((k) => k.type === t).length
      if (n > got) deficit.set(t, n - got)
    }
    if (deficit.size) {
      candidates.forEach((p, i) => {
        // 有局部复核结论时以结论为准；没有结论的候选只在补齐标注缺口时使用（本地铭牌识别已过滤纯色插座条）
        const v = input.verdicts.get(i)
        if (
          v &&
          v.confidence >= minConf &&
          (v.kind === 'socket' || v.kind === 'none' || !isSwitchFamily(v.kind))
        )
          return
        const type = v && isSwitchFamily(v.kind) ? v.kind : p.type
        const need = deficit.get(type)
        if (!need) return
        const pos = input.snap ? input.snap({ type, x: p.x, y: p.y }) : { x: p.x, y: p.y }
        const x = round3(clamp01(pos.x))
        const y = round3(clamp01(pos.y))
        if (kept.some((k) => Math.hypot(k.x - x, k.y - y) < 0.012)) return
        kept.push({ ...p, type, category: categoryOf(type), x, y })
        deficit.set(type, need - 1)
        stats.added++
      })
    }
  } else {
    // 1. 逐个复核本地候选
    candidates.forEach((p, i) => {
      const v = input.verdicts.get(i)
      if (!v) {
        kept.push({ ...p })
        return
      }
      stats.verified++
      const confident = v.confidence >= minConf
      if (confident && (v.kind === 'none' || v.kind === 'socket')) {
        stats.dropped++
        if (v.kind === 'socket') stats.droppedSockets++
        return
      }
      let type = p.type
      if (confident) {
        if (v.kind.startsWith('switch-') || v.kind === 'touch-panel') type = v.kind
        else if (v.kind === 'light') type = isLightType(p.type) ? p.type : 'downlight'
        else if (v.kind === 'sensor') type = p.type.endsWith('-sensor') ? p.type : 'motion-sensor'
        else if (v.kind === 'curtain') type = 'curtain-track'
      }
      if (type !== p.type) stats.retyped++
      kept.push({ ...p, type, category: categoryOf(type) })
    })

    // 2. 补充视觉模型找到而本地漏掉的点位（按类别控制数量上限，避免凭空多出）
    if (vision && vision.points.length) {
      // 其他智能设备（风管机/VRF、传感器、窗帘、门锁、摄像头、AP、网关）本地识别器基本识别不到，按视觉模型结果补充（与已有点位去重）
      let otherAdded = 0
      for (const vp of vision.points) {
        if (famOf(vp.type) !== 'other' || otherAdded >= 30) continue
        if (kept.some((k) => k.type === vp.type && Math.hypot(k.x - vp.x, k.y - vp.y) < 0.035))
          continue
        const pos = input.snap ? input.snap(vp) : { x: vp.x, y: vp.y }
        kept.push({
          type: vp.type,
          x: round3(clamp01(pos.x)),
          y: round3(clamp01(pos.y)),
          category: 'other',
          ...(vp.room ? { room: vp.room } : {}),
        })
        stats.added++
        otherAdded++
      }
      for (const fam of ['switch', 'light'] as const) {
        const keptFam = kept.filter((p) => famOf(p.type) === fam).length
        const visionFam = vision.points.filter((p) => famOf(p.type) === fam)
        const annotatedFam = Object.entries(vision.annotatedCounts)
          .filter(([t]) => famOf(t) === fam)
          .reduce((s, [, n]) => s + n, 0)
        const target = annotatedFam > 0 ? annotatedFam : visionFam.length
        let need = Math.min(40, target - keptFam)
        if (need <= 0) continue
        // 按图纸标注统计每种型号还缺几个，优先补缺的型号
        const deficit = new Map<string, number>()
        for (const [t, n] of Object.entries(vision.annotatedCounts)) {
          if (famOf(t) === fam) deficit.set(t, n - kept.filter((k) => k.type === t).length)
        }
        const pool = [...visionFam]
        // 贪心选点：每次选离已有点位最远的候选（避免把视觉模型对同一符号的重复坐标都加进来）
        while (need > 0 && pool.length) {
          const famPoints = kept.filter((k) => famOf(k.type) === fam)
          let bestIdx = -1
          let bestScore = -Infinity
          pool.forEach((vp, idx) => {
            const dist = Math.min(1, ...famPoints.map((k) => Math.hypot(k.x - vp.x, k.y - vp.y)))
            if (dist <= 0.035) return
            const score = dist + ((deficit.get(vp.type) ?? 0) > 0 ? 1 : 0)
            if (score > bestScore) {
              bestScore = score
              bestIdx = idx
            }
          })
          if (bestIdx < 0) break
          const [vp] = pool.splice(bestIdx, 1)
          const pos = input.snap ? input.snap(vp) : { x: vp.x, y: vp.y }
          if (kept.some((k) => Math.hypot(k.x - pos.x, k.y - pos.y) < 0.012)) continue
          kept.push({
            type: vp.type,
            x: round3(clamp01(pos.x)),
            y: round3(clamp01(pos.y)),
            category: categoryOf(vp.type),
            ...(vp.room ? { room: vp.room } : {}),
          })
          if (deficit.has(vp.type)) deficit.set(vp.type, (deficit.get(vp.type) ?? 0) - 1)
          stats.added++
          need--
        }
      }
    }
  }

  // 3. 房间：视觉模型读出的房间优先
  const areas = vision && vision.areas.length >= 2 ? vision.areas : input.local.areas
  const points = kept.map((p) => {
    const area = areas.find((a) => inRect(a, p.x, p.y))
    return { ...p, room: area?.name ?? p.room }
  })

  const switchPoints = points.filter((p) => isSwitchFamily(p.type))
  const lightPoints = points.filter((p) => isLightType(p.type))
  const preferSwitchesOnly =
    Boolean(input.sheetName && /开关/.test(input.sheetName)) && switchPoints.length > 0
  const summary = buildCadDetectionSummary(points, areas)
  const confirmText = buildFusionConfirmText(points, stats, vision, input.modelLabel)
  summary.confirmText = confirmText
  return {
    result: {
      points: preferSwitchesOnly ? switchPoints : points,
      switchPoints,
      lightPoints,
      areas,
      summary,
      hasColorSymbols: input.local.hasColorSymbols,
    },
    stats,
    confirmText,
  }
}

export function buildFusionConfirmText(
  points: DetectedCadPoint[],
  stats: FusionStats,
  vision: VisionFullAnalysis | null,
  modelLabel?: string,
): string {
  const count = (t: string) => points.filter((p) => p.type === t).length
  const switches = points.filter((p) => p.type.startsWith('switch-'))
  const touch = count('touch-panel')
  const lights = points.filter((p) => isLightType(p.type)).length
  const others = points.length - switches.length - touch - lights
  const subtypes = ['switch-1', 'switch-2', 'switch-3', 'switch-4']
    .map((t) => (count(t) ? `${SWITCH_LABEL[t]} ${count(t)}` : ''))
    .filter(Boolean)
    .join(' · ')
  const lines: string[] = []
  if (stats.visionFirst) {
    lines.push(
      `识别到 ${points.length} 个点位（${modelLabel || '视觉模型'}直读 + 本地几何吸附校验）：`,
    )
  } else {
    lines.push(
      `识别到 ${points.length} 个点位（${vision ? `本地几何识别 + ${modelLabel || '视觉模型'}复核` : '本地几何识别'}）：`,
    )
  }
  lines.push(
    `- 开关面板 ${switches.length}${subtypes ? `（${subtypes}）` : ''}${touch ? ` · 智能屏 ${touch}` : ''}`,
  )
  if (lights) lines.push(`- 灯具 ${lights}`)
  if (others > 0) lines.push(`- 其他设备 ${others}`)
  if (vision && stats.visionFirst) {
    lines.push(
      `视觉直读 ${stats.baseFromVision ?? points.length} 个点位${stats.retyped ? `，型号校准 ${stats.retyped} 个` : ''}${stats.added ? `，按图纸标注从本地候选补充 ${stats.added} 个` : ''}。`,
    )
  } else if (vision) {
    const fixes: string[] = []
    if (stats.dropped)
      fixes.push(
        `剔除 ${stats.dropped} 处误报${stats.droppedSockets ? `（其中插座 ${stats.droppedSockets} 处）` : ''}`,
      )
    if (stats.retyped) fixes.push(`修正 ${stats.retyped} 个型号`)
    if (stats.added) fixes.push(`补充 ${stats.added} 个漏识别点位`)
    lines.push(
      `视觉复核：${fixes.length ? fixes.join('，') : stats.verified ? `${stats.verified} 个候选全部核对通过` : '已完成整图核对'}。`,
    )
  }
  if (vision) {
    const annotated = Object.entries(vision.annotatedCounts).filter(([t]) => isSwitchFamily(t))
    if (annotated.length) {
      const label = annotated.map(([t, n]) => `${SWITCH_LABEL[t] ?? t} ${n}`).join(' / ')
      const diffs = annotated
        .map(([t, n]) => {
          const got = count(t)
          return got === n
            ? ''
            : `${SWITCH_LABEL[t] ?? t}${got < n ? `少 ${n - got}` : `多 ${got - n}`} 个`
        })
        .filter(Boolean)
      lines.push(
        `图纸文字标注：${label}；${diffs.length ? `差异：${diffs.join('、')}，请在点位图中核对` : '与识别结果一致'}。`,
      )
    }
    if (vision.socketCount)
      lines.push(`另有插座约 ${vision.socketCount} 个（按规范不生成点位，可在报价中按需添加）。`)
  }
  return lines.join('\n')
}
