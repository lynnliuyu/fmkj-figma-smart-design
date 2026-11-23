/**
 * 报价 / 合同服务层的「算钱」与「锁定」回归。
 *
 * 这些函数是网页 Server Action 和小程序共用的入口。这里用内存假 Payload 驱动真实实现，
 * 断言的是最终写进数据库的 data，而不是「调用了一下没抛错」。
 */
import { APIError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPayloadClient: vi.fn(),
  getCatalog: vi.fn(),
  getCompanyInfo: vi.fn(),
}))

vi.mock('@/lib/payload', () => ({ getPayloadClient: mocks.getPayloadClient }))
vi.mock('@/lib/cached-data', () => ({
  getCatalog: mocks.getCatalog,
  getCompanyInfo: mocks.getCompanyInfo,
  resolveMediaUrl: (m: { url?: string } | null) => m?.url ?? null,
}))

import type { CatalogProduct } from '@/lib/cached-data'
import { MANUAL_QUOTE_PRODUCT_TAG } from '@/lib/quotes'
import { saveContractInput } from './contract-service'
import { saveQuoteInput, syncQuoteWithPointMap } from './quote-service'

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: 'prod-1',
  name: '智能开关（双键）',
  shortName: '双键开关',
  sku: 'SW-2',
  price: 199,
  cost: null,
  unit: '只',
  stock: null,
  description: null,
  platforms: ['米家'],
  status: 'active',
  deviceType: 'switch-2',
  tags: [],
  updatedAt: '2026-01-01',
  brand: null,
  category: null,
  image: { id: 'm-1', url: '/img/sw.jpg', alt: 'switch' },
  ...over,
})

const manualProduct = () =>
  product({
    id: 'manual-1',
    sku: 'MANUAL-1',
    price: 0,
    status: 'inactive',
    tags: [MANUAL_QUOTE_PRODUCT_TAG],
  })

const user = { id: 'u-1' } as never

beforeEach(() => {
  mocks.getPayloadClient.mockReset()
  mocks.getCatalog.mockReset()
  mocks.getCompanyInfo.mockReset()
  mocks.getCatalog.mockResolvedValue([product()])
  mocks.getCompanyInfo.mockResolvedValue({ quoteNotes: '默认备注' })
})

type WriteArgs = { data: Record<string, any> }
/** 让 mock 的参数有明确类型，断言才能安全地读到写库的 data（测试文件不参与 ESLint）。 */
const write = <T>(result: T) => vi.fn(async (_args: WriteArgs) => result)

function fakePayload(overrides: Record<string, unknown> = {}) {
  return {
    findByID: vi.fn(async (..._args: unknown[]): Promise<unknown> => null),
    update: write({ total: 0 }),
    ...overrides,
  }
}

describe('saveQuoteInput：写进库的金额由服务端决定', () => {
  const stored = () => ({
    items: [
      {
        id: 'row-1',
        product: 'prod-1',
        deviceType: 'switch-2',
        image: 'm-1',
        name: '旧名称',
        shortName: '旧短名',
        sku: 'SW-2',
        unit: '只',
        price: 100,
        quantity: 1,
      },
    ],
  })

  const baseInput = () => ({
    title: '客厅报价',
    status: 'draft',
    discount: 0,
    notes: '',
    items: [],
    fees: [],
  })

  it('单价 × 数量由集合 hook 重算，返回的 total 来自服务端', async () => {
    const payload = fakePayload({
      findByID: vi.fn(async () => stored()),
      update: write({ total: 398 }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ id: 'row-1', name: '开关', price: 199, quantity: 2 }],
    })

    expect(r).toEqual({ ok: true, total: 398 })
    const data = payload.update.mock.calls[0]![0].data
    // 客户端无法伪造合计：提交里根本没有 total 字段
    expect(data.total).toBeUndefined()
    expect(data.items[0]).toMatchObject({ price: 199, quantity: 2 })
  })

  it('拒绝负数单价 / 数量（防止负金额混入明细）', async () => {
    const payload = fakePayload({ findByID: vi.fn(async () => stored()) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ name: '开关', price: -1, quantity: 2 }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('单价或数量无效')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('拒绝负数优惠（优惠只允许抵扣，不能加价）', async () => {
    const payload = fakePayload({ findByID: vi.fn(async () => stored()) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', { ...baseInput(), discount: -5 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('优惠金额需为非负数字')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('明细超过 300 行直接拒绝（防止一次提交撑爆文档）', async () => {
    const payload = fakePayload({ findByID: vi.fn(async () => stored()) })
    mocks.getPayloadClient.mockResolvedValue(payload)
    const items = Array.from({ length: 301 }, (_, i) => ({ name: `行${i}`, price: 1, quantity: 1 }))

    const r = await saveQuoteInput(user, 'q-1', { ...baseInput(), items })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('明细条数过多')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('已下架产品不能加入报价', async () => {
    mocks.getCatalog.mockResolvedValue([product({ status: 'inactive', tags: ['Aqara 批次'] })])
    mocks.getPayloadClient.mockResolvedValue(fakePayload({ findByID: vi.fn(async () => stored()) }))

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ product: 'prod-1', name: '开关', price: 1, quantity: 1 }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('已下架')
  })

  it.each([undefined, 0, -1])('拒绝手工报价商品的无效单价 %s（新增及再次编辑）', async (price) => {
    const manual = manualProduct()
    mocks.getCatalog.mockResolvedValue([manual])
    const payload = fakePayload({
      findByID: vi.fn(async () => ({ items: [{ id: 'saved', product: manual.id }] })),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)
    for (const id of [undefined, 'saved']) {
      const result = await saveQuoteInput(user, 'q-1', {
        ...baseInput(),
        items: [{ id, product: manual.id, name: manual.name, price: price as number, quantity: 1 }],
      })
      expect(result.ok).toBe(false)
    }
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('手填单价和数量只写当前报价，保留型号图片及零价赠品', async () => {
    const manual = manualProduct()
    const gift = product({ price: 0 })
    mocks.getCatalog.mockResolvedValue([manual, gift])
    const quotes = new Map<string, { items: Record<string, unknown>[] }>([
      ['q-1', { items: [] }],
      ['q-2', { items: [{ id: 'other', product: manual.id, price: 347, quantity: 1 }] }],
    ])
    const update = vi.fn(
      async ({
        id,
        collection,
        data,
      }: {
        id: string
        collection: string
        data: { items: Record<string, unknown>[] }
      }) => {
        expect(collection).toBe('quotes')
        quotes.set(id, { items: data.items.map((row, i) => ({ ...row, id: `row-${i}` })) })
        return { total: 0 }
      },
    )
    mocks.getPayloadClient.mockResolvedValue(
      fakePayload({
        findByID: vi.fn(async ({ id }: { id: string }) => quotes.get(id)),
        update,
      }),
    )
    const line = { product: manual.id, name: manual.name, price: 159, quantity: 1 }
    const giftLine = { product: gift.id, name: '零价赠品', price: 0, quantity: 1 }
    const input = baseInput()
    expect((await saveQuoteInput(user, 'q-1', { ...input, items: [line, giftLine] })).ok).toBe(true)
    expect(quotes.get('q-1')?.items[0]).toMatchObject({
      sku: manual.sku,
      image: manual.image?.id,
      price: 159,
    })
    expect(
      (
        await saveQuoteInput(user, 'q-1', {
          ...input,
          items: [
            { ...line, id: 'row-0', price: 169, quantity: 3 },
            { ...giftLine, id: 'row-1' },
          ],
        })
      ).ok,
    ).toBe(true)
    expect(quotes.get('q-1')?.items).toMatchObject([
      { sku: manual.sku, image: manual.image?.id, price: 169, quantity: 3 },
      { price: 0 },
    ])
    expect(quotes.get('q-2')?.items[0]).toMatchObject({ price: 347, quantity: 1 })
    expect(manual.price).toBe(0)
    expect(update.mock.calls.every(([args]) => args.id === 'q-1')).toBe(true)
  })

  it('换型号只能换成同一设备类型', async () => {
    mocks.getCatalog.mockResolvedValue([
      product(),
      product({ id: 'prod-2', deviceType: 'camera', name: '摄像头' }),
    ])
    mocks.getPayloadClient.mockResolvedValue(fakePayload({ findByID: vi.fn(async () => stored()) }))

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ id: 'row-1', product: 'prod-2', name: '摄像头', price: 1, quantity: 1 }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('同一设备类型')
  })

  it('未知报价状态被拒绝，不会写进非法状态', async () => {
    mocks.getPayloadClient.mockResolvedValue(fakePayload({ findByID: vi.fn(async () => stored()) }))

    const r = await saveQuoteInput(user, 'q-1', { ...baseInput(), status: 'signed' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('报价状态无效')
  })

  it('新增明细行时复制产品库短名', async () => {
    const payload = fakePayload({ findByID: vi.fn(async () => stored()) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ product: 'prod-1', name: '双键开关', price: 199, quantity: 1 }],
    })

    expect(r.ok).toBe(true)
    expect(payload.update.mock.calls[0]![0].data.items[0]).toMatchObject({
      product: 'prod-1',
      shortName: '双键开关',
    })
  })

  it('只改价格 / 数量时保留原短名快照，不因客户端漏传而清空', async () => {
    const payload = fakePayload({ findByID: vi.fn(async () => stored()) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ id: 'row-1', product: 'prod-1', name: '旧名称', price: 120, quantity: 2 }],
    })

    expect(r.ok).toBe(true)
    expect(payload.update.mock.calls[0]![0].data.items[0]).toMatchObject({
      shortName: '旧短名',
      price: 120,
      quantity: 2,
    })
  })

  it('换型号时不传短名也会换成新产品短名，不会留下旧短名', async () => {
    mocks.getCatalog.mockResolvedValue([
      product(),
      product({ id: 'prod-2', name: '智能开关（单键）', shortName: '单键开关', sku: 'SW-1' }),
    ])
    const payload = fakePayload({
      findByID: vi.fn(async () => ({
        items: [
          {
            id: 'row-1',
            product: 'prod-1',
            deviceType: 'switch-2',
            name: '旧名称',
            shortName: '旧短名',
            price: 100,
            quantity: 1,
          },
        ],
      })),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ id: 'row-1', product: 'prod-2', name: '智能开关（单键）', price: 88, quantity: 1 }],
    })

    expect(r.ok).toBe(true)
    expect(payload.update.mock.calls[0]![0].data.items[0]).toMatchObject({
      product: 'prod-2',
      shortName: '单键开关',
    })
  })

  it('不存在的产品关联被拒绝，不会留下悬空引用', async () => {
    mocks.getPayloadClient.mockResolvedValue(fakePayload({ findByID: vi.fn(async () => stored()) }))

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ product: 'ghost', name: '幽灵', price: 1, quantity: 1 }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('关联的产品不存在')
  })
})

describe('syncQuoteWithPointMap：同步后保留人工改过的价格', () => {
  it('同型号保留临时单价，数量跟随点位', async () => {
    const quote = {
      id: 'q-1',
      title: '项目报价',
      project: 'p-1',
      items: [
        {
          id: 'row-1',
          product: 'prod-1',
          deviceType: 'switch-2',
          name: '人工改名',
          shortName: '人工短名',
          sku: 'SW-2',
          unit: '只',
          price: 188.88, // 人工压价
          quantity: 1,
        },
      ],
    }
    const project = {
      id: 'p-1',
      name: '某项目',
      platform: '米家',
      defaultProducts: {},
      pointMap: {
        elements: [
          { customData: { deviceType: 'switch-2' } },
          { customData: { deviceType: 'switch-2' } },
          { customData: { deviceType: 'switch-2' } },
        ],
      },
    }
    const update = write({ total: 566.64 })
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'quotes' ? quote : project,
      ),
      update,
    })

    const r = await syncQuoteWithPointMap(user, 'q-1')

    expect(r.ok).toBe(true)
    const data = update.mock.calls[0]![0].data
    expect(data.items[0]).toMatchObject({
      id: 'row-1',
      price: 188.88,
      quantity: 3,
      name: '人工改名',
      shortName: '人工短名',
    })
    if (r.ok) expect(r.total).toBe(566.64)
  })

  it('同步不从点位选待价商品，也不覆盖已存手工行的数量或单价', async () => {
    const manual = manualProduct()
    mocks.getCatalog.mockResolvedValue([manual, product()])
    const manualLine = {
      id: 'manual-line',
      product: manual.id,
      deviceType: 'switch-2',
      name: manual.name,
      price: 168,
      quantity: 4,
    }
    const quote = { title: '项目报价', project: 'p-1', items: [manualLine] }
    const project = {
      id: 'p-1',
      platform: '米家',
      defaultProducts: { 'switch-2': manual.id },
      pointMap: { elements: [{ customData: { deviceType: 'switch-2', productId: manual.id } }] },
    }
    const update = write({ total: 871 })
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'quotes' ? quote : project,
      ),
      update,
    })
    expect((await syncQuoteWithPointMap(user, 'q-1')).ok).toBe(true)
    expect(update.mock.calls[0]![0].data.items).toMatchObject([
      { product: 'prod-1', price: 199, quantity: 1 },
      manualLine,
    ])
  })

  it('点位全部消失时明细随之清空（不留下幽灵条目）', async () => {
    const quote = {
      id: 'q-1',
      title: '项目报价',
      project: 'p-1',
      items: [{ id: 'row-1', product: 'prod-1', name: '开关', price: 199, quantity: 5 }],
    }
    const project = { id: 'p-1', name: '某项目', pointMap: { elements: [] } }
    const update = write({ total: 0 })
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'quotes' ? quote : project,
      ),
      update,
    })

    await syncQuoteWithPointMap(user, 'q-1')
    expect(update.mock.calls[0]![0].data.items).toEqual([])
  })
})

describe('saveContractInput：合同金额与付款比例', () => {
  const storedDraft = () => ({
    status: 'draft',
    quote: 'q-1',
    payments: [{ id: 'pay-1', name: '首付款', percent: 100, received: false }],
  })
  const storedSigned = () => ({
    status: 'signed',
    quote: 'q-1',
    payments: [
      { id: 'pay-1', name: '首付款', percent: 50, received: false },
      { id: 'pay-2', name: '尾款', percent: 50, received: false },
    ],
  })
  const input = (over: Record<string, unknown> = {}) => ({
    number: 'HT20261030-01',
    quoteId: 'q-1',
    amount: 10000,
    customerName: '张三',
    customerPhone: '',
    address: '',
    durationDays: 15,
    warrantyMonths: 12,
    terms: '',
    payments: [
      { name: '首付款', percent: 50, received: false },
      { name: '尾款', percent: 50, received: false },
    ],
    ...over,
  })

  it('金额四舍五入到分后写库（10000.016 → 10000.02）', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedDraft()),
      update,
    })

    const r = await saveContractInput(user, 'c-1', input({ amount: 10000.016 }))
    expect(r).toEqual({ ok: true })
    expect(update.mock.calls[0]![0].data.amount).toBe(10000.02)
  })

  it('金额为负数 / 非数字：拒绝，不写库', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedDraft()),
      update,
    })

    for (const amount of [-1, NaN]) {
      const r = await saveContractInput(user, 'c-1', input({ amount }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('合同金额需为非负数字')
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('付款比例合计不是 100：拒绝，不写库', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedDraft()),
      update,
    })

    const r = await saveContractInput(
      user,
      'c-1',
      input({
        payments: [
          { name: '首付款', percent: 50, received: false },
          { name: '尾款', percent: 45, received: false },
        ],
      }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('100')
    expect(update).not.toHaveBeenCalled()
  })

  it('付款比例越界（>100 / <0）：拒绝', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedDraft()),
      update,
    })

    for (const percent of [101, -1]) {
      const r = await saveContractInput(
        user,
        'c-1',
        input({ payments: [{ name: '首付款', percent, received: false }] }),
      )
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('0–100')
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('已签订合同：只写收款标记，金额 / 条款等字段不进 update', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedSigned()),
      update,
    })

    const r = await saveContractInput(
      user,
      'c-1',
      input({
        amount: 1,
        number: '被篡改的编号',
        payments: [
          { name: '任意改名', percent: 10, received: true },
          { name: '任意改名2', percent: 10, received: false },
        ],
      }),
    )

    expect(r).toEqual({ ok: true })
    const data = update.mock.calls[0]![0].data
    expect(data).not.toHaveProperty('amount')
    expect(data).not.toHaveProperty('number')
    // 比例和名称沿用原文档，只接收款标记
    expect(data.payments).toEqual([
      { id: 'pay-1', name: '首付款', percent: 50, received: true },
      { id: 'pay-2', name: '尾款', percent: 50, received: false },
    ])
  })

  it('工期 / 质保月数超出范围时写 null（不写非法值）', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedDraft()),
      update,
    })

    await saveContractInput(user, 'c-1', input({ durationDays: 999, warrantyMonths: -3 }))
    const data = update.mock.calls[0]![0].data
    expect(data.durationDays).toBeNull()
    expect(data.warrantyMonths).toBeNull()
  })

  it('合同不存在时提前返回，不发起 update', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({ findByID: vi.fn(async () => null), update })

    const r = await saveContractInput(user, 'c-1', input())
    expect(r).toEqual({ ok: false, error: '合同不存在或已被删除' })
    expect(update).not.toHaveBeenCalled()
  })

  it('付款期数超过 6：拒绝', async () => {
    const update = write({})
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedDraft()),
      update,
    })
    const payments = Array.from({ length: 7 }, (_, i) => ({
      name: `第${i + 1}期`,
      percent: 100 / 7,
      received: false,
    }))

    const r = await saveContractInput(user, 'c-1', input({ payments }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('最多 6 期')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('serviceFailure 的 4xx 透传', () => {
  it('保存时业务错误（4xx）把服务端中文提示原样交给用户', async () => {
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => storedDraftForFailure()),
      update: vi.fn(async () => {
        throw new APIError('这份报价已用于已签订的合同，撤销签订后才能修改', 403)
      }),
    })

    const r = await saveContractInput(user, 'c-1', inputForFailure())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('撤销签订')
  })
})

function storedDraftForFailure() {
  return {
    status: 'draft',
    quote: 'q-1',
    payments: [{ id: 'pay-1', name: '首付款', percent: 100, received: false }],
  }
}
function inputForFailure() {
  return {
    number: 'HT20261030-01',
    quoteId: 'q-1',
    amount: 1,
    customerName: '',
    customerPhone: '',
    address: '',
    durationDays: null,
    warrantyMonths: null,
    terms: '',
    payments: [{ name: '首付款', percent: 100, received: false }],
  }
}
