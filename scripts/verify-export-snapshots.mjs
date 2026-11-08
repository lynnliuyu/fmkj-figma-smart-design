/**
 * Run with Node 24: node scripts/verify-export-snapshots.mjs
 * Real scene parsing, point resolution, quote selection and proposal modeling run unchanged.
 * Only Payload/catalog/company/scene-library reads use in-memory fixtures. No backend is contacted.
 */
import nodeAssert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { registerHooks, stripTypeScriptTypes } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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
const catalog = [
  {
    id: 'ap',
    deviceType: 'ap-node',
    status: 'active',
    name: 'Router AP',
    sku: 'AP-CURRENT',
    price: 999,
    unit: '台',
    image: null,
    brand: { name: 'Network Brand' },
    platforms: [],
  },
  {
    id: 'lamp',
    deviceType: 'downlight',
    status: 'active',
    name: 'Yeelight Lamp',
    sku: 'LAMP',
    price: 80,
    unit: '盏',
    image: null,
    brand: { name: 'Yeelight' },
    platforms: [],
  },
]
const point = (id, productId, x) => ({
  id,
  type: 'image',
  x,
  y: 100,
  width: 20,
  height: 20,
  customData: { deviceType: 'ap-node', productId, pointCode: `N${id}` },
})
const project = {
  id: 'p',
  name: 'Regression example',
  platform: '米家',
  pointCount: 3,
  defaultProducts: { 'ap-node': 'ap' },
  pointMap: {
    elements: [
      {
        id: 'sheet',
        type: 'image',
        x: 0,
        y: 0,
        width: 1000,
        height: 700,
        fileId: 'floor',
        customData: { kind: 'sheet', sheetId: 's1', name: '一层' },
      },
      point('1', 'lamp', 100),
      point('2', 'ap', 200),
      point('3', 'ap', 300),
    ],
    files: { floor: { id: 'floor', dataURL: '/sample-floor.png', mimeType: 'image/png' } },
  },
}
let quotes = []
let contracts = []
globalThis.__fixture = {
  catalog,
  company: { name: 'Example company', documentDefaults: {} },
  payload: {
    find: async ({ collection }) => ({
      docs: collection === 'quotes' ? quotes : collection === 'contracts' ? contracts : [],
    }),
    findByID: async ({ collection }) => (collection === 'projects' ? project : null),
  },
}
const mocks = {
  '@/lib/payload': 'export const getPayloadClient = async () => globalThis.__fixture.payload',
  '@/lib/cached-data':
    'export const getCatalog = async () => globalThis.__fixture.catalog; export const getCompanyInfo = async () => globalThis.__fixture.company; export const resolveMediaUrl = m => m?.url ?? null',
  '@/lib/scenes':
    'export const loadSceneLibrary = async () => ({ scenes: [], source: "builtin" }); export const assignScenes = () => []',
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) return { url: `fixture:${specifier}`, shortCircuit: true }
    let candidate
    if (specifier.startsWith('@/')) candidate = path.join(root, 'src', specifier.slice(2))
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:'))
      candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
    if (candidate) {
      const resolved = [candidate, `${candidate}.ts`, `${candidate}.tsx`].find(
        (p) => fs.existsSync(p) && fs.statSync(p).isFile(),
      )
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('fixture:'))
      return { format: 'module', source: mocks[url.slice(8)], shortCircuit: true }
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      return {
        format: 'module',
        source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url), 'utf8')),
        shortCircuit: true,
      }
    }
    return nextLoad(url, context)
  },
})
const { resolvePoint } = await import(
  pathToFileURL(path.join(root, 'src/lib/point-map-items.ts')).href
)
const { loadProjectDocs } = await import(
  pathToFileURL(path.join(root, 'src/lib/project-docs.ts')).href
)
const { buildDeck } = await import(
  pathToFileURL(path.join(root, 'src/plugins/proposal/deck/model.ts')).href
)
const byId = new Map(catalog.map((p) => [p.id, p]))
assert.deepEqual(
  resolvePoint({ deviceType: 'ap-node', productId: 'lamp' }, byId, { 'ap-node': 'ap' }),
  { deviceType: 'ap-node', productId: 'ap', source: 'default' },
)
assert.deepEqual(resolvePoint({ productId: 'lamp' }, byId, {}), {
  deviceType: 'downlight',
  productId: 'lamp',
  source: 'point',
})
assert.deepEqual(
  resolvePoint({ deviceType: 'ap-node', productId: 'lamp' }, new Map([['lamp', catalog[1]]]), {}),
  { deviceType: 'ap-node', productId: null, source: 'pending' },
)
assert.deepEqual(resolvePoint({ deviceType: 'ap-node', productId: 'ap' }, byId, {}), {
  deviceType: 'ap-node',
  productId: 'ap',
  source: 'point',
})

quotes = [
  {
    id: 'q',
    title: 'All devices',
    status: 'accepted',
    updatedAt: '2026-11-01',
    total: 10,
    fees: [],
    discount: 0,
    items: [
      {
        id: 'bad',
        product: 'lamp',
        deviceType: 'ap-node',
        name: 'Wrong AP snapshot',
        sku: 'WRONG',
        price: 10,
        quantity: 1,
      },
    ],
  },
]
let docs = await loadProjectDocs('p', { id: 'user' }, 'all', 'q')
assert.equal(docs.points.find((p) => p.code === 'N1').productId, 'ap')
assert.equal(docs.productById.get('lamp').name, 'Yeelight Lamp')
assert.equal(docs.productById.get('lamp').price, 80)
assert.ok(docs.points.every((p) => docs.productById.get(p.productId)?.deviceType === p.deviceType))

quotes = [
  {
    id: 'q',
    title: 'Approved snapshot',
    status: 'accepted',
    updatedAt: '2026-11-01',
    total: 21277,
    fees: [{ name: 'Installation', amount: 350 }],
    discount: 73,
    items: [
      {
        id: 'a',
        product: 'ap',
        deviceType: 'ap-node',
        name: 'Quoted AP model A',
        sku: 'AP-SNAPSHOT-A',
        unit: '台',
        price: 10000,
        quantity: 2,
      },
      {
        id: 'b',
        product: 'ap',
        deviceType: 'ap-node',
        name: 'Quoted AP model B',
        sku: 'AP-SNAPSHOT-B',
        unit: '台',
        price: 500,
        quantity: 2,
      },
    ],
  },
]
contracts = [
  {
    id: 'contract',
    quote: 'q',
    number: 'TEST-CONTRACT',
    amount: 21277,
    status: 'signed',
    payments: [
      { name: 'First', percent: 33.33 },
      { name: 'Second', percent: 33.33 },
      { name: 'Last', percent: 33.34 },
    ],
  },
]
docs = await loadProjectDocs('p', { id: 'user' }, 'all', 'q')
docs.total = 31952
const serialize = (v) => JSON.stringify(v, (_, x) => (x instanceof Map ? [...x] : x))
const before = serialize(docs)
const model = buildDeck(docs)
assert.equal(model.finalAmount, 21277)
assert.equal(model.deviceTotal, 21000)
assert.equal(model.serviceTotal, 350)
assert.equal(model.discount, 73)
assert.deepEqual(
  model.items.map(({ name, sku, count, price, subtotal }) => ({
    name,
    sku,
    count,
    price,
    subtotal,
  })),
  [
    { name: 'Quoted AP model A', sku: 'AP-SNAPSHOT-A', count: 2, price: 10000, subtotal: 20000 },
    { name: 'Quoted AP model B', sku: 'AP-SNAPSHOT-B', count: 2, price: 500, subtotal: 1000 },
  ],
)
assert.deepEqual(
  model.items.map((i) => i.codes.length),
  [2, 1],
)
assert.equal(new Set(model.items.flatMap((i) => i.codes)).size, 3)
assert.deepEqual(
  model.sheets.flatMap((s) => s.points).map((p) => [p.id, p.cx, p.cy]),
  docs.points.map((p) => [p.id, p.cx, p.cy]),
)
assert.equal(Math.round(model.nodes.reduce((sum, n) => sum + n.amount, 0) * 100), 2127700)
assert.deepEqual(
  model.nodes.map((n) => n.percent),
  [33.33, 33.33, 33.34],
)
assert.equal(serialize(docs), before)

const custom = {
  ...docs,
  quote: {
    ...quotes[0],
    total: null,
    fees: [],
    discount: 0,
    items: [
      {
        id: 'custom',
        product: null,
        deviceType: null,
        name: 'Manual cable',
        sku: 'CABLE-SNAPSHOT',
        unit: '米',
        price: 12.5,
        quantity: 2.5,
      },
    ],
  },
}
const customModel = buildDeck(custom)
assert.equal(customModel.finalAmount, 31.25)
assert.equal(customModel.items[0].count, 2.5)
assert.equal(customModel.items[0].sku, 'CABLE-SNAPSHOT')
assert.equal(customModel.items[0].codes.length, 0)
const estimatedModel = buildDeck({ ...docs, quote: null })
assert.equal(estimatedModel.finalAmount, 31952)
assert.equal(estimatedModel.items[0].count, 3)
// Missing/deactivated products must not override a working AP selection.
catalog.push({ ...catalog[0], id: 'inactive-ap', status: 'inactive', name: 'Retired AP' })
for (const productId of ['missing-ap', 'inactive-ap']) {
  quotes = [
    {
      ...quotes[0],
      items: [
        {
          id: 'stale',
          product: productId,
          deviceType: 'ap-node',
          name: 'Stale AP snapshot',
          sku: 'STALE',
          unit: '台',
          price: 100,
          quantity: 1,
        },
      ],
    },
  ]
  const staleDocs = await loadProjectDocs('p', { id: 'user' }, 'all', 'q')
  assert.ok(staleDocs.points.every((p) => p.productId === 'ap'))
  assert.equal(buildDeck(staleDocs).items[0].name, 'Stale AP snapshot')
}

// Manually entered rows without relationship/row IDs keep distinct identities and amounts.
quotes = [
  {
    ...quotes[0],
    total: 350,
    fees: [],
    discount: 0,
    items: [
      {
        product: null,
        deviceType: 'ap-node',
        name: 'Manual AP one',
        sku: 'MANUAL-1',
        unit: '台',
        price: 100,
        quantity: 2,
      },
      {
        product: null,
        deviceType: 'ap-node',
        name: 'Manual AP two',
        sku: 'MANUAL-2',
        unit: '台',
        price: 150,
        quantity: 1,
      },
    ],
  },
]
const manualDocs = await loadProjectDocs('p', { id: 'user' }, 'all', 'q')
assert.equal(manualDocs.productById.get('quote-item-0').name, 'Manual AP one')
assert.equal(manualDocs.productById.get('quote-item-1').name, 'Manual AP two')
const manualModel = buildDeck(manualDocs)
assert.deepEqual(
  manualModel.items.map((i) => [i.sku, i.count, i.subtotal]),
  [
    ['MANUAL-1', 2, 200],
    ['MANUAL-2', 1, 150],
  ],
)
assert.equal(manualModel.finalAmount, 350)
assert.equal(manualModel.items.flatMap((i) => i.codes).length, 1)

const zeroModel = buildDeck({
  ...docs,
  quote: { ...docs.quote, items: [], fees: [], discount: 0, total: 0 },
})
assert.equal(zeroModel.items.length, 0)
assert.equal(zeroModel.finalAmount, 0)
console.log(
  `PASS ${checks} assertions: type-safe points and quote overrides, snapshot lines/counts/prices, duplicate-product allocation, fees/discount, signed-payment rounding, unchanged spatial data, custom fractional/manual rows, inactive/missing products, and no-quote estimates`,
)
