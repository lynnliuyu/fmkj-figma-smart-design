/** Run with Node 24: node scripts/verify-scene-products.mjs. Uses real matching code, no backend. */
import nodeAssert from 'node:assert/strict'

import { matchSceneProducts } from '../src/plugins/proposal/deck/scene-products.ts'

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

const anchor = (deviceType, patch = {}) => ({
  label: deviceType,
  deviceType,
  x: 0.5,
  y: 0.5,
  labelX: 0.25,
  labelY: 0.3,
  note: 'Scene position',
  ...patch,
})
const visual = (anchors, roomTypes = ['living']) => ({
  key: 'test-scene',
  file: 'scene.png',
  url: '/scene.png',
  label: 'Scene',
  roomTypes,
  sceneUses: [],
  anchors,
})
const point = (id, deviceType, productId, patch = {}) => ({
  id,
  deviceType,
  productId,
  sheetId: 'f1',
  areaId: 'r1',
  code: id,
  ...patch,
})
const product = (id, deviceType, patch = {}) => ({
  id,
  deviceType,
  name: id,
  sku: `${id}-SKU`,
  image: { id: `${id}-image`, url: `/real-products/${id}.png`, alt: `${id} photo` },
  ...patch,
})
const a = product('lamp-a', 'downlight')
const b = product('lamp-b', 'downlight', {
  name: 'Quoted lamp B',
  sku: 'QUOTE-B',
  image: { url: '/quotation-images/B.png', alt: 'Quoted B' },
})
const camera = product('camera', 'camera')
const byId = new Map([
  [a.id, a],
  [b.id, b],
  [camera.id, camera],
])
const lamps = visual([anchor('downlight')])

// A type match must not borrow the first catalog product's photo or name.
const exact = matchSceneProducts(lamps, [point('L1', 'downlight', 'lamp-b')], byId)
assert.equal(exact.callouts.length, 1)
assert.equal(exact.callouts[0].productId, 'lamp-b')
assert.equal(exact.callouts[0].product.name, 'Quoted lamp B')
assert.equal(exact.callouts[0].product.sku, 'QUOTE-B')
assert.equal(exact.callouts[0].product.imageUrl, '/quotation-images/B.png')
assert.equal(exact.callouts[0].product.imageAlt, 'Quoted B')
assert.equal(exact.callouts[0].status, 'ready')

// Same-model points within a room combine; another model remains explicit if slots run out.
const multiPoints = [
  point('L1', 'downlight', 'lamp-b'),
  point('L2', 'downlight', 'lamp-b'),
  point('L3', 'downlight', 'lamp-a'),
]
const multi = matchSceneProducts(lamps, multiPoints, byId)
assert.equal(multi.groups.length, 2)
assert.equal(multi.callouts[0].count, 2)
assert.deepEqual(multi.callouts[0].codes, ['L1', 'L2'])
assert.deepEqual(multi.callouts[0].pointIds, ['L1', 'L2'])
assert.equal(multi.unplaced.length, 1)
assert.equal(multi.unplaced[0].product.imageUrl, '/real-products/lamp-a.png')
assert.equal(multi.counts.unplacedPoints, 1)
assert.equal(multi.callouts.reduce((sum, c) => sum + c.count, 0) + multi.counts.unplacedPoints, 3)
const twoSlots = matchSceneProducts(
  visual([anchor('downlight'), anchor('downlight', { x: 0.7 })]),
  multiPoints,
  byId,
)
assert.deepEqual(
  twoSlots.callouts.map((c) => c.productId),
  ['lamp-b', 'lamp-a'],
)
assert.deepEqual(
  twoSlots.callouts.map((c) => c.anchorIndex),
  [0, 1],
)
assert.equal(twoSlots.unplaced.length, 0)

// Cross-floor / cross-area identities never collapse just because a model or room name is equal.
const scopePoints = [
  point('L1', 'downlight', 'lamp-a'),
  point('L2', 'downlight', 'lamp-a', { areaId: 'r2' }),
  point('L3', 'downlight', 'lamp-a', { sheetId: 'f2' }),
  point('L4', 'downlight', 'lamp-a', { sheetId: null, areaId: null }),
]
const regions = matchSceneProducts(lamps, scopePoints, byId)
assert.equal(regions.groups.length, 4)
assert.equal(new Set(regions.groups.map((g) => g.key)).size, 4)
assert.equal(regions.counts.points, 4)
assert.equal(regions.counts.unplacedPoints, 3)
const filtered = matchSceneProducts(lamps, scopePoints, byId, {
  areaIds: ['r1'],
  sheetIds: ['f2'],
  pointIds: ['L3', 'L4'],
})
assert.deepEqual(filtered.groups[0].pointIds, ['L3'])
assert.deepEqual(filtered.excludedPointIds, ['L1', 'L2', 'L4'])
const unassigned = matchSceneProducts(lamps, scopePoints, byId, {
  areaIds: [null],
  sheetIds: [null],
})
assert.deepEqual(unassigned.callouts[0].pointIds, ['L4'])
const mismatchedRoom = matchSceneProducts(lamps, scopePoints, byId, { roomType: 'bedroom' })
assert.equal(mismatchedRoom.counts.points, 0)
assert.equal(mismatchedRoom.excludedPointIds.length, 4)
assert.equal(
  matchSceneProducts(visual([anchor('downlight')], []), scopePoints, byId, { roomType: 'bedroom' })
    .counts.points,
  4,
)

// Missing selection, missing catalog record, wrong relationship and missing image are distinct.
const incompleteCatalog = new Map([
  ...byId,
  ['no-photo', product('no-photo', 'downlight', { image: null })],
  ['blank-photo', product('blank-photo', 'downlight', { image: { url: '  ', alt: '' } })],
])
const pending = matchSceneProducts(lamps, [point('P1', 'downlight', null)], incompleteCatalog)
  .callouts[0]
assert.equal(pending.status, 'pending')
assert.equal(pending.product, null)
assert.equal(pending.productId, null)
const gone = matchSceneProducts(lamps, [point('P2', 'downlight', 'deleted')], incompleteCatalog)
  .callouts[0]
assert.equal(gone.status, 'missing-product')
assert.equal(gone.product, null)
assert.equal(gone.productId, 'deleted')
const invalid = matchSceneProducts(
  visual([anchor('camera')]),
  [point('V1', 'camera', 'lamp-a')],
  incompleteCatalog,
).callouts[0]
assert.equal(invalid.status, 'type-mismatch')
assert.equal(invalid.product, null)
const noPhoto = matchSceneProducts(lamps, [point('P3', 'downlight', 'no-photo')], incompleteCatalog)
  .callouts[0]
assert.equal(noPhoto.status, 'missing-image')
assert.equal(noPhoto.product.name, 'no-photo')
assert.equal(noPhoto.product.imageUrl, null)
assert.equal(
  matchSceneProducts(lamps, [point('P4', 'downlight', 'blank-photo')], incompleteCatalog)
    .callouts[0].status,
  'missing-image',
)
const configuredFirst = matchSceneProducts(
  lamps,
  [point('pending', 'downlight', null), point('selected', 'downlight', 'lamp-b')],
  incompleteCatalog,
)
assert.equal(configuredFirst.callouts[0].productId, 'lamp-b')
assert.deepEqual(configuredFirst.unplaced[0].pointIds, ['pending'])

// Unrelated points stay listed rather than being presented as a nearby supported device.
const unrelated = matchSceneProducts(lamps, [point('V1', 'camera', 'camera')], byId)
assert.equal(unrelated.callouts.length, 0)
assert.equal(unrelated.unplaced[0].deviceType, 'camera')
assert.equal(unrelated.unplaced[0].product.imageUrl, '/real-products/camera.png')
const switches = new Map([['switch3', product('switch3', 'switch-3')]])
const switchPoint = [point('K1', 'switch-3', 'switch3')]
assert.equal(
  matchSceneProducts(visual([anchor('switch-1')]), switchPoint, switches).callouts.length,
  0,
)
const family = matchSceneProducts(
  visual([anchor('switch-1', { deviceTypes: ['switch-2', 'switch-3', 'switch-4'] })]),
  switchPoint,
  switches,
)
assert.equal(family.callouts[0].deviceType, 'switch-3')
assert.equal(family.callouts[0].product.id, 'switch3')
assert.equal(
  matchSceneProducts(visual([anchor('camera')]), [point('D1', 'doorbell', null)], byId).callouts
    .length,
  0,
)

// Display limits preserve the complete remainder; duplicated point references do not double-count.
const capped = matchSceneProducts(
  visual([anchor('downlight'), anchor('downlight')]),
  multiPoints,
  byId,
  { maxCallouts: 1 },
)
assert.equal(capped.callouts.length, 1)
assert.equal(capped.counts.points, 3)
assert.equal(capped.counts.unplacedPoints, 1)
const hidden = matchSceneProducts(lamps, multiPoints, byId, { maxCallouts: 0 })
assert.equal(hidden.callouts.length, 0)
assert.equal(hidden.counts.unplacedPoints, 3)
assert.equal(matchSceneProducts(lamps, [multiPoints[0], multiPoints[0]], byId).counts.points, 1)
assert.equal(matchSceneProducts(lamps, [], byId).groups.length, 0)

const frozenVisual = visual([anchor('downlight', { deviceTypes: ['downlight'] })])
const freeze = (v) => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const child of Object.values(v)) freeze(child)
  }
  return v
}
freeze(frozenVisual)
freeze(scopePoints)
freeze([...byId.values()])
const before = JSON.stringify([frozenVisual, scopePoints, [...byId]])
matchSceneProducts(frozenVisual, scopePoints, byId)
assert.equal(JSON.stringify([frozenVisual, scopePoints, [...byId]]), before)

console.log(
  `PASS ${checks} assertions: exact selected-product photos, quote-overridden metadata, distinct models and regions, complete remainder, scoped scene matching, explicit type families, missing/invalid states and immutable inputs`,
)
