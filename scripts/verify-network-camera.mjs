/** Run with Node 24: node scripts/verify-network-camera.mjs. No backend reads or writes. */
import nodeAssert from 'node:assert/strict'

import { buildNetworkCamera } from '../src/plugins/proposal/deck/network-camera.ts'

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

const sheets = [
  { sheet: { id: 'f1', name: '一层平面' }, floorName: '一层' },
  { sheet: { id: 'f2', name: '二层平面' }, floorName: '二层' },
]
const areas = [
  { id: 'r1', name: '客厅', sheetId: 'f1' },
  { id: 'r2', name: '客厅', sheetId: 'f2' },
]
const point = (id, deviceType, patch = {}) => ({
  id,
  deviceType,
  sheetId: 'f1',
  areaId: 'r1',
  code: id,
  productId: null,
  source: 'pending',
  cx: 100,
  cy: 100,
  rx: 0.1,
  ry: 0.1,
  ref: null,
  ...patch,
})
const item = (ref, deviceType, patch = {}) => ({
  ref,
  deviceType,
  name: ref,
  count: 1,
  price: 100,
  ...patch,
})
const model = (points, items = []) => ({
  d: { points, areas },
  sheets,
  items,
  deckPoint: (p) => ({ ...p, no: 1, room: '客厅', typeName: p.deviceType }),
})
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

assert.equal(buildNetworkCamera(model([])), null)
assert.equal(
  buildNetworkCamera(
    model([point('K1', 'switch-1'), point('L1', 'downlight'), point('G1', 'gateway')]),
  ),
  null,
)
const networkOnly = buildNetworkCamera(model([point('N1', 'ap-node')]))
assert.equal(networkOnly.networkPoints.length, 1)
assert.equal(networkOnly.cameraPoints.length, 0)
assert.equal(networkOnly.rooms.length, 1)
const cameraOnly = buildNetworkCamera(model([point('V1', 'camera')]))
assert.equal(cameraOnly.networkPoints.length, 0)
assert.equal(cameraOnly.cameraPoints.length, 1)
assert.equal(cameraOnly.apPoints.length, 0)
assert.equal(
  buildNetworkCamera(model([point('N1', 'ap-node'), point('B1', 'doorbell')])).cameraPoints.length,
  0,
)
assert.equal(
  buildNetworkCamera(model([point('G1', 'gateway'), point('V1', 'camera')])).networkPoints.length,
  0,
)
assert.deepEqual(
  buildNetworkCamera(model([point('N1', 'ap-node')], [item('Q1', 'camera')])).items,
  [],
)
assert.equal(buildNetworkCamera(model([], [item('Q1', 'camera')])), null)

const allTypes = [
  point('N1', 'ac-router'),
  point('N2', 'ap-node'),
  point('N3', 'ceiling-ap'),
  point('N4', 'network-panel'),
  point('V1', 'camera'),
  point('B1', 'doorbell'),
  point('G1', 'gateway'),
]
const all = buildNetworkCamera(model(allTypes))
assert.equal(all.networkPoints.length, 4)
assert.equal(all.cameraPoints.length, 1)
assert.deepEqual(
  all.apPoints.map((p) => p.code),
  ['N2', 'N3'],
)
assert.deepEqual(
  all.corePoints.map((p) => p.code),
  ['N1', 'N4'],
)
assert.deepEqual(
  all.rooms.flatMap((r) => r.points).map((p) => p.code),
  ['N1', 'N2', 'N3', 'N4', 'V1'],
)

// Same room names on different floors must not merge. Unassigned and unmapped points stay visible.
const points = [
  point('V2', 'camera', { sheetId: 'f2', areaId: 'r2', ref: 'Q2' }),
  point('N1', 'ap-node', { ref: 'Q1' }),
  point('V1', 'camera', { ref: 'Q2' }),
  point('N2', 'ceiling-ap', { sheetId: 'f2', areaId: 'r2', ref: 'Q1' }),
  point('N3', 'network-panel', { areaId: null }),
  point('V3', 'camera', { sheetId: null, areaId: null }),
  point('N4', 'ac-router', { sheetId: 'missing-sheet', areaId: null }),
]
const items = [
  item('Q1', 'ap-node', { name: '报价快照 AP', sku: 'SNAPSHOT-AP', price: 675 }),
  item('Q2', 'camera', { name: '报价快照摄像头', sku: 'SNAPSHOT-CAMERA' }),
  item('Q3', 'camera'),
  item('Q4', 'downlight'),
]
const input = freeze(model(points, items))
const before = JSON.stringify(input)
const result = buildNetworkCamera(input)
assert.equal(result.rooms.length, 5)
assert.equal(new Set(result.rooms.map((r) => r.key)).size, 5)
assert.deepEqual(
  result.rooms
    .filter((r) => r.name === '客厅')
    .map((r) => [r.floorName, r.networkPoints.length, r.cameraPoints.length]),
  [
    ['一层', 1, 1],
    ['二层', 1, 1],
  ],
)
assert.equal(result.rooms.find((r) => r.sheetId === 'f1' && r.areaId === null).name, '未分区')
assert.equal(result.rooms.find((r) => r.sheetId === null).floorName, '未上图')
assert.equal(result.rooms.find((r) => r.sheetId === 'missing-sheet').floorName, '未上图')
assert.deepEqual(
  result.unmappedPoints.map((p) => p.code),
  ['V3', 'N4'],
)
assert.deepEqual(
  result.sheets.map((s) => [s.floorName, s.points.length]),
  [
    ['一层', 3],
    ['二层', 2],
  ],
)
assert.equal(result.networkPoints.length + result.cameraPoints.length, points.length)
assert.equal(result.rooms.flatMap((r) => r.points).length, points.length)
assert.equal(new Set(result.rooms.flatMap((r) => r.points.map((p) => p.id))).size, points.length)
assert.deepEqual(
  result.items.map((i) => i.ref),
  ['Q1', 'Q2'],
)
assert.equal(result.items[0].name, '报价快照 AP')
assert.equal(result.items[0].price, 675)
assert.equal(JSON.stringify(input), before)

const wrongArea = buildNetworkCamera(
  model([point('N1', 'ap-node', { areaId: 'r2' }), point('V1', 'camera', { areaId: 'r2' })]),
)
assert.equal(wrongArea.rooms[0].name, '未分区')
const wrongItem = buildNetworkCamera(
  model([point('N1', 'ap-node', { ref: 'Q4' }), point('V1', 'camera')], items),
)
assert.deepEqual(wrongItem.items, [])
assert.equal(wrongItem.networkPoints[0].productId, null)
assert.equal(wrongItem.cameraPoints[0].ref, null)

// Detector-only projects still get a coverage page; no controls or lights enter this model.
const sensorTypes = [
  'motion-sensor',
  'smoke-sensor',
  'water-sensor',
  'contact-sensor',
  'temp-sensor',
]
const sensors = sensorTypes.map((type, i) =>
  point(`S${i + 1}`, type, { ref: `QS${i + 1}`, angle: (i * Math.PI) / 4 }),
)
const sensorOnly = buildNetworkCamera(
  model(sensors, [
    ...sensorTypes.map((type, i) => item(`QS${i + 1}`, type)),
    item('UNLINKED', 'motion-sensor'),
  ]),
)
assert.equal(sensorOnly.networkPoints.length, 0)
assert.equal(sensorOnly.cameraPoints.length, 0)
assert.equal(sensorOnly.sensorPoints.length, 5)
assert.deepEqual(
  sensorOnly.sensorPoints.map((p) => p.deviceType),
  sensorTypes,
)
assert.deepEqual(
  sensorOnly.items.map((i) => i.ref),
  ['QS1', 'QS2', 'QS3', 'QS4', 'QS5'],
)
assert.equal(sensorOnly.rooms[0].sensorPoints.length, 5)
assert.equal(sensorOnly.rooms[0].cameraPoints.length, 0)
assert.equal(sensorOnly.sheets[0].points.length, 5)
assert.deepEqual(sensorOnly.sheets[0].areas, [])
assert.equal(sensorOnly.sensorPoints[2].angle, Math.PI / 2)
assert.equal(sensorOnly.sheets[0].points[2].angle, Math.PI / 2)

// Identical room names retain floor identity with mixed WiFi, camera and detector points.
const mixedSensors = buildNetworkCamera(
  model([
    point('S1', 'motion-sensor'),
    point('N1', 'ap-node'),
    point('V1', 'camera'),
    point('S2', 'water-sensor', { sheetId: 'f2', areaId: 'r2', angle: 1.25 }),
    point('N2', 'ceiling-ap', { sheetId: 'f2', areaId: 'r2' }),
    point('K1', 'switch-1'),
    point('L1', 'downlight'),
    point('G1', 'gateway'),
    point('B1', 'doorbell'),
  ]),
)
assert.equal(mixedSensors.sensorPoints.length, 2)
assert.deepEqual(
  mixedSensors.rooms.map((r) => [
    r.floorName,
    r.name,
    r.networkPoints.length,
    r.cameraPoints.length,
    r.sensorPoints.length,
  ]),
  [
    ['一层', '客厅', 1, 1, 1],
    ['二层', '客厅', 1, 0, 1],
  ],
)
assert.deepEqual(
  mixedSensors.sheets.map((s) => [s.floorName, s.points.length]),
  [
    ['一层', 3],
    ['二层', 2],
  ],
)
assert.equal(mixedSensors.rooms.flatMap((r) => r.points).length, 5)
assert.equal(mixedSensors.sheets[1].points.find((p) => p.id === 'S2').angle, 1.25)

// Room geometry comes from the already-normalized deck sheet, without mutation or recalculation.
const sheetAreas = [areas[0], { id: 'r3', name: '过道', sheetId: 'f1' }]
const areaModel = freeze({
  ...model([point('N1', 'ap-node'), point('S1', 'smoke-sensor')]),
  sheets: [
    { ...sheets[0], areas: sheetAreas },
    { ...sheets[1], areas: [areas[1]] },
  ],
})
const areaBefore = JSON.stringify(areaModel)
const withAreas = buildNetworkCamera(areaModel)
assert.equal(withAreas.sheets.length, 1)
assert.equal(withAreas.sheets[0].areas, sheetAreas)
assert.deepEqual(
  withAreas.sheets[0].areas.map((a) => a.id),
  ['r1', 'r3'],
)
assert.equal(JSON.stringify(areaModel), areaBefore)

// Missing or invalid relative coordinates are a drawing concern, not an unmapped-sheet change.
const missingPositions = buildNetworkCamera(
  model([
    point('S1', 'motion-sensor', { rx: null, ry: null }),
    point('S2', 'smoke-sensor', { rx: Number.NaN }),
    point('S3', 'water-sensor', { sheetId: null, areaId: null }),
    point('S4', 'contact-sensor', { sheetId: 'missing-sheet', areaId: null }),
  ]),
)
assert.equal(missingPositions.sensorPoints.length, 4)
assert.equal(missingPositions.sheets[0].points.length, 2)
assert.deepEqual(
  missingPositions.unmappedPoints.map((p) => p.id),
  ['S3', 'S4'],
)
assert.equal(missingPositions.sensorPoints[0].rx, null)
assert.equal(Number.isNaN(missingPositions.sensorPoints[1].rx), true)

console.log(
  `PASS ${checks} assertions: network/camera/detector matching, excluded controls and lighting, floor/area identity and geometry, rotation, unmapped versus undrawable positions, complete counts/codes, quote-only product references and immutable inputs`,
)
