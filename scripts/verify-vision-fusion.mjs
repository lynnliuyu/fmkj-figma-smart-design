/** Run with Node 24: node --experimental-strip-types scripts/verify-vision-fusion.mjs. Pure fusion rules, no network. */
import nodeAssert from 'node:assert/strict'
import { register } from 'node:module'

// 源码里的相对导入不带扩展名（交给 Next/TS 解析）；这里补一个最小解析钩子，让 Node 直接加载 .ts 源文件。
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
  try { return await next(specifier, context) } catch (error) {
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + '.ts', context)
    throw error
  }
}`),
)
const { collectLocalCandidates, fuseDetections, normalizeVerdictKind, normalizeVisionAnalysis } =
  await import('../src/lib/cad-point-fusion.ts')

let checks = 0
const assert = new Proxy(nodeAssert, {
  get(target, key) {
    const value = target[key]
    return typeof value === 'function'
      ? (...args) => {
          checks++
          return Reflect.apply(value, target, args)
        }
      : value
  },
})

const pt = (type, x, y) => ({
  type,
  x,
  y,
  category: type.startsWith('switch-') ? 'switch' : /light/.test(type) ? 'light' : 'other',
})
const local = (points) => ({
  points,
  switchPoints: points.filter((p) => p.type.startsWith('switch-') || p.type === 'touch-panel'),
  lightPoints: points.filter((p) => /light/.test(p.type)),
  areas: [{ name: '公共区', type: 'other', rect: [0, 0, 1, 1] }],
  summary: {
    total: points.length,
    switches: 0,
    lights: 0,
    others: 0,
    areas: 1,
    byType: {},
    confirmText: '',
  },
  hasColorSymbols: true,
})

// Verdict normalisation accepts model wording in Chinese and English.
assert.equal(normalizeVerdictKind('双开'), 'switch-2')
assert.equal(normalizeVerdictKind('switch_3'), 'switch-3')
assert.equal(normalizeVerdictKind('五孔插座'), 'socket')
assert.equal(normalizeVerdictKind('智能屏'), 'touch-panel')
assert.equal(normalizeVerdictKind('none'), 'none')
assert.equal(normalizeVerdictKind(42), null)

// Vision analysis is validated: unknown device types, out-of-range coordinates and bad areas are discarded.
const analysis = normalizeVisionAnalysis({
  drawingType: 'combined-electrical',
  legend: ['绿底白字双开=双联开关', 7],
  annotatedCounts: { 'switch-3': 5, 'switch-2': 12, 'not-a-type': 3, 'switch-1': -1 },
  socketCount: 54,
  points: [
    { type: 'switch-2', x: 0.5, y: 0.5, room: '客厅' },
    { type: 'socket-x', x: 0.4, y: 0.4 },
    { type: 'downlight', x: 1.4, y: 0.4 },
  ],
  areas: [
    { name: '主卧', type: 'bedroom', rect: [0.6, 0.1, 0.3, 0.3] },
    { name: '次卧', rect: [0.1, 0.1, 0.2, 0.2] },
    { name: '坏区域', rect: [0.9, 0.9, 0.5, 0.5] },
  ],
})
assert.equal(analysis.points.length, 1)
assert.deepEqual(analysis.annotatedCounts, { 'switch-3': 5, 'switch-2': 12 })
assert.equal(analysis.legend.length, 1)
assert.equal(analysis.areas.length, 2)
assert.equal(analysis.areas[1].type, 'bedroom')
assert.equal(analysis.socketCount, 54)
assert.equal(normalizeVisionAnalysis(null), null)

// Verification drops sockets / non-devices and corrects switch gangs; unverified points stay untouched.
const det = local([
  pt('switch-2', 0.2, 0.2),
  pt('switch-2', 0.3, 0.3),
  pt('switch-1', 0.4, 0.4),
  pt('switch-2', 0.5, 0.5),
  pt('downlight', 0.6, 0.6),
])
const candidates = collectLocalCandidates(det)
assert.equal(candidates.length, 5)
const verdicts = new Map([
  [0, { kind: 'socket', confidence: 0.9 }],
  [1, { kind: 'none', confidence: 0.4 }],
  [2, { kind: 'switch-2', confidence: 0.85 }],
  [3, { kind: 'touch-panel', confidence: 0.8 }],
])
const fused = fuseDetections({ local: det, candidates, verdicts, vision: null })
assert.equal(fused.stats.dropped, 1)
assert.equal(fused.stats.droppedSockets, 1)
assert.equal(fused.stats.retyped, 2)
assert.equal(fused.result.points.length, 4)
assert.ok(
  fused.result.points.some((p) => p.type === 'switch-2' && p.x === 0.3),
  'low-confidence verdict keeps the local point',
)
assert.ok(
  fused.result.switchPoints.some((p) => p.type === 'touch-panel'),
  'touch panels are imported with switches',
)
assert.equal(fused.result.lightPoints.length, 1)

// Missing points are added from the whole-image analysis up to the annotated count, snapped through the callback.
const sparse = local([pt('switch-3', 0.2, 0.2)])
const vision = normalizeVisionAnalysis({
  annotatedCounts: { 'switch-3': 2, 'switch-2': 1 },
  points: [
    { type: 'switch-3', x: 0.201, y: 0.202 },
    { type: 'switch-3', x: 0.7, y: 0.3, room: '主卧' },
    { type: 'switch-2', x: 0.4, y: 0.8 },
    { type: 'switch-2', x: 0.45, y: 0.82 },
  ],
  areas: [
    { name: '主卧', type: 'bedroom', rect: [0.6, 0.1, 0.35, 0.4] },
    { name: '客厅', type: 'living', rect: [0.1, 0.5, 0.5, 0.45] },
  ],
})
let snapCalls = 0
const added = fuseDetections({
  local: sparse,
  verdicts: new Map(),
  vision,
  snap: (p) => {
    snapCalls++
    return { x: p.x + 0.001, y: p.y }
  },
  modelLabel: 'Qwen',
})
assert.equal(added.stats.added, 2, 'adds only as many as the drawing annotation says are missing')
assert.equal(added.result.switchPoints.length, 3)
assert.ok(snapCalls >= 2)
assert.equal(added.result.areas.length, 2, 'vision rooms replace the wall-projection partition')
assert.ok(added.result.points.some((p) => p.room === '主卧'))
assert.match(added.confirmText, /本地几何识别 \+ Qwen复核/)
assert.match(added.confirmText, /图纸文字标注/)
assert.match(added.confirmText, /与识别结果一致/)

// Annotation mismatch is reported to the user instead of being silently "fixed".
const mismatch = fuseDetections({
  local: local([pt('switch-1', 0.2, 0.2)]),
  verdicts: new Map(),
  vision: normalizeVisionAnalysis({ annotatedCounts: { 'switch-1': 3 }, points: [], areas: [] }),
})
assert.match(mismatch.confirmText, /单开少 2 个/)

// Switch-layout sheets keep exposing only control panels in `points`.
const sheetSwitchOnly = fuseDetections({
  local: det,
  candidates,
  verdicts: new Map(),
  vision: null,
  sheetName: '开关布置图',
})
assert.ok(
  sheetSwitchOnly.result.points.every(
    (p) => p.type.startsWith('switch-') || p.type === 'touch-panel',
  ),
)

// Inputs are not mutated.
const before = JSON.stringify(det)
fuseDetections({ local: det, candidates, verdicts, vision })
assert.equal(JSON.stringify(det), before)

// vision-first：模型直读点位为主，本地只在标注数量不足时补缺，插座永远不落点。
const vfVision = normalizeVisionAnalysis({
  annotatedCounts: { 'switch-2': 2, 'switch-1': 1 },
  socketCount: 54,
  points: [
    { type: 'switch-2', x: 0.19, y: 0.2 },
    { type: 'switch-1', x: 0.3, y: 0.3 },
    { type: 'socket', x: 0.4, y: 0.4 },
  ],
  areas: [{ name: '客厅', type: 'living-room', rect: [0.1, 0.1, 0.5, 0.5] }],
})
const vfLocal = local([
  pt('switch-2', 0.2, 0.2),
  pt('switch-2', 0.8, 0.8),
  pt('switch-1', 0.3, 0.3),
  pt('socket', 0.45, 0.45),
])
const vf = fuseDetections({
  local: vfLocal,
  verdicts: new Map([[1, { kind: 'switch-2', confidence: 0.9 }]]),
  vision: vfVision,
  strategy: 'vision-first',
  modelLabel: 'Qwen3.7-plus',
})
assert.equal(vf.stats.visionFirst, true)
assert.equal(vf.stats.baseFromVision, 2, 'model points are the base')
assert.equal(vf.stats.added, 1, 'local candidate fills the annotated switch-2 deficit')
assert.equal(vf.result.switchPoints.length, 3)
assert.ok(
  vf.result.points.every((p) => !p.type.startsWith('socket')),
  'socket points never enter the point map',
)
assert.match(vf.confirmText, /视觉直读/)
assert.match(vf.confirmText, /插座约 54 个/)

// 没有局部复核结论时，仍可用本地点位补齐图纸标注缺口。
const vfNoVerdict = fuseDetections({
  local: local([pt('switch-2', 0.8, 0.8)]),
  verdicts: new Map(),
  vision: normalizeVisionAnalysis({
    annotatedCounts: { 'switch-2': 2 },
    points: [{ type: 'switch-2', x: 0.2, y: 0.2 }],
    areas: [{ name: '客厅', type: 'living-room', rect: [0.1, 0.1, 0.5, 0.5] }],
  }),
  strategy: 'vision-first',
})
assert.equal(vfNoVerdict.stats.added, 1)
assert.equal(vfNoVerdict.result.switchPoints.length, 2)

// 视觉直读点位与图纸标注数量不一致时，先做型号校准再补缺。
const vfReconcile = fuseDetections({
  local: local([]),
  verdicts: new Map(),
  vision: normalizeVisionAnalysis({
    annotatedCounts: { 'switch-2': 2, 'switch-1': 1 },
    points: [
      { type: 'switch-2', x: 0.2, y: 0.2 },
      { type: 'switch-2', x: 0.3, y: 0.3 },
      { type: 'switch-2', x: 0.4, y: 0.4 },
    ],
    areas: [{ name: '客厅', type: 'living-room', rect: [0.1, 0.1, 0.5, 0.5] }],
  }),
  strategy: 'vision-first',
})
assert.equal(vfReconcile.stats.retyped, 1)
assert.equal(vfReconcile.result.switchPoints.length, 3)
assert.equal(vfReconcile.result.switchPoints.filter((p) => p.type === 'switch-2').length, 2)
assert.equal(vfReconcile.result.switchPoints.filter((p) => p.type === 'switch-1').length, 1)

console.log(
  `PASS ${checks} assertions: verdict normalisation, vision JSON validation, socket/none removal, gang correction, annotated-count completion, room override, mismatch reporting, vision-first base/补充 and immutability`,
)
