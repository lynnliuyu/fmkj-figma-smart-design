/**
 * 核心用户主流程回归（issue #177）：
 *  项目编辑 → 保存 → 重新打开 → 从点位图生成报价 → 保存报价 → 重新打开，
 * 外加权限 / 换型号等有实际风险的失败分支。
 *
 * 这些服务是网页 Server Action 与微信小程序共用的入口。沿用
 * quote-contract-money.test.ts 的模式：内存假 Payload 驱动真实实现，
 * 断言最终写进数据库的 data 与返回的错误，而不是「调用了一下没抛错」。
 *
 * 边界声明：这里验证的是服务层逻辑（白名单字段、权限、报价一致性）；
 * Payload 集合 hook 的合计重算与数据库持久化由 CI 冒烟（e2e/smoke.mjs
 * 真库 + 真浏览器）与生产构建覆盖，不在本文件重复。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPayloadClient: vi.fn(),
  getCatalog: vi.fn(),
  getCompanyInfo: vi.fn(),
  getProjectOwnerOptions: vi.fn(),
}))

vi.mock('@/lib/payload', () => ({ getPayloadClient: mocks.getPayloadClient }))
vi.mock('@/lib/cached-data', () => ({
  getCatalog: mocks.getCatalog,
  getCompanyInfo: mocks.getCompanyInfo,
  resolveMediaUrl: (m: { url?: string } | null) => m?.url ?? null,
}))
// saveProjectInput 通过 canManageProject 判定负责人角色，不需要 mock。
// getProjectOwnerOptions 不被 saveProjectInput 调用，仅用于类型兼容。

import type { CatalogProduct } from '@/lib/cached-data'
import { saveProjectInput } from './project-service'
import { createQuoteForProject, saveQuoteInput, syncQuoteWithPointMap } from './quote-service'

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

const user = { id: 'u-1' } as never
const ownerUser = { id: 'u-owner' } as never

beforeEach(() => {
  mocks.getPayloadClient.mockReset()
  mocks.getCatalog.mockReset()
  mocks.getCompanyInfo.mockReset()
  mocks.getCatalog.mockResolvedValue([product()])
  mocks.getCompanyInfo.mockResolvedValue({ quoteNotes: '默认备注' })
})

type WriteArgs = { data: Record<string, any> }
const write = <T>(result: T) => vi.fn(async (_args: WriteArgs) => result)

function fakePayload(overrides: Record<string, unknown> = {}) {
  return {
    findByID: vi.fn(async () => null),
    create: write({ id: 'p-new', name: '新项目' }),
    update: write({ id: 'p-1', name: '新项目' }),
    find: vi.fn(async () => ({ docs: [] })),
    count: vi.fn(async () => ({ totalDocs: 0 })),
    ...overrides,
  }
}

/** 构造一个带 pointMap 的假项目文档。 */
const projectWithPointMap = (elements: unknown[]) => ({
  id: 'p-1',
  name: '湖山赋别墅',
  owner: 'u-owner',
  platform: '米家',
  defaultProducts: {},
  pointMap: { elements, appState: {}, files: {} },
})

const pointElement = (over: Record<string, unknown> = {}) => ({
  id: `el-${Math.random().toString(36).slice(2)}`,
  type: 'rectangle',
  isDeleted: false,
  customData: {
    code: 'K1',
    deviceType: 'switch-2',
    ...over,
  },
})

describe('saveProjectInput：项目编辑 → 保存 → 重新打开（字段保留）', () => {
  it('新建项目：写库的 data 只有白名单字段，owner 默认自己', async () => {
    const payload = fakePayload({ create: write({ id: 'p-new' }) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveProjectInput(user, null, {
      name: '湖山赋 1 栋 101',
      customerName: '林先生',
      customerPhone: '13800000000',
      community: '湖山赋',
      address: '长沙 1 栋 101',
      platform: '米家',
      budget: '50000',
      notes: '客户要求全屋米家',
      // 白名单外的字段不该写进库
      evil: 'drop table users',
    })

    expect(r).toEqual({ ok: true, id: 'p-new' })
    const data = payload.create.mock.calls[0]![0].data
    expect(data).toMatchObject({
      name: '湖山赋 1 栋 101',
      customerName: '林先生',
      customerPhone: '13800000000',
      community: '湖山赋',
      address: '长沙 1 栋 101',
      platform: '米家',
      budget: 50000,
      notes: '客户要求全屋米家',
      owner: 'u-1', // 默认负责人是提交者自己
      status: 'active',
    })
    expect(data.evil).toBeUndefined()
  })

  it('名称留空时自动生成（由集合处理，服务层传空字符串）', async () => {
    const payload = fakePayload()
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveProjectInput(user, null, {
      customerName: '王女士',
      community: '万科城',
    })
    expect(r.ok).toBe(true)
    const data = payload.create.mock.calls[0]![0].data
    expect(data.name).toBe('') // 空名交给集合按小区/客户自动生成
    expect(data.customerName).toBe('王女士')
  })

  it('编辑已有项目：id 存在时走 update 而非 create', async () => {
    const payload = fakePayload({
      findByID: vi.fn(async () => ({
        id: 'p-1',
        name: '旧名',
        owner: 'u-1',
        collaborators: [],
      })),
      update: write({ id: 'p-1', name: '新名' }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveProjectInput(user, 'p-1', {
      name: '新名',
      customerName: '林先生',
      platform: '米家',
    })
    expect(r.ok).toBe(true)
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.update).toHaveBeenCalledTimes(1)
    const data = payload.update.mock.calls[0]![0].data
    expect(data).toMatchObject({ name: '新名', customerName: '林先生' })
  })

  it('保存后重新打开：读取到刚保存的字段（重开路径 = findByID 返回持久化的值）', async () => {
    // 第一次保存：写入的值
    const payload = fakePayload({
      create: write({ id: 'p-1' }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)
    await saveProjectInput(user, null, {
      name: '湖山赋 1 栋 101',
      customerName: '林先生',
      community: '湖山赋',
      platform: '米家',
      budget: '50000',
    })
    const saved = payload.create.mock.calls[0]![0].data // 拿到写库的值

    // 重新打开：findByID 返回持久化值（此处模拟从库读回）
    mocks.getPayloadClient.mockResolvedValue(
      fakePayload({
        findByID: vi.fn(async () => saved),
      }),
    )
    const reopened = await (
      await mocks.getPayloadClient()
    ).findByID({ collection: 'projects', id: 'p-1' })
    expect(reopened).toMatchObject({
      name: '湖山赋 1 栋 101',
      customerName: '林先生',
      community: '湖山赋',
      budget: 50000,
    })
  })

  it('非法 platform 拒绝并返回字段错误，不写库', async () => {
    const payload = fakePayload()
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveProjectInput(user, null, { platform: '不是平台' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors?.platform).toBe('取值无效')
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('非负数字校验：负数预算拒绝', async () => {
    const payload = fakePayload()
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveProjectInput(user, null, { budget: '-100' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors?.budget).toBe('预算需为非负数字')
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('负责人转让：非负责人不能改 owner', async () => {
    // 项目 owner 是别人（u-owner），提交者是普通协作者 u-1（无 owner 角色）
    const payload = fakePayload({
      findByID: vi.fn(async () => ({
        id: 'p-1',
        name: '项目',
        owner: 'u-owner',
        collaborators: [{ user: 'u-1', role: 'edit' }],
      })),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveProjectInput(user, 'p-1', { owner: 'u-9' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('只有项目创建者（负责人）可以转让负责人')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('负责人转让给不在协作者名单里的人被拒绝', async () => {
    // 提交者自己是 owner，但目标 u-9 不在协作者名单
    const payload = fakePayload({
      findByID: vi.fn(async () => ({
        id: 'p-1',
        name: '项目',
        owner: 'u-1',
        collaborators: [{ user: 'u-2', role: 'edit' }],
      })),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveProjectInput(user, 'p-1', { owner: 'u-9' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors?.owner).toContain('只能将负责人转让给')
    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('createQuoteForProject：点位图 → 报价（生成与待选型）', () => {
  it('从点位图生成草稿报价：按产品计数、快照设备类型与图片', async () => {
    const payload = fakePayload({
      findByID: vi.fn(async () =>
        projectWithPointMap([
          pointElement({ code: 'K1', deviceType: 'switch-2' }),
          pointElement({ code: 'K2', deviceType: 'switch-2' }),
        ]),
      ),
      count: vi.fn(async () => ({ totalDocs: 0 })),
      create: write({ id: 'q-1', title: '湖山赋别墅 智能家居报价' }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await createQuoteForProject(user, 'p-1', 'all')
    expect(r).toEqual({ ok: true, quoteId: 'q-1', pending: 0 })
    const data = payload.create.mock.calls[0]![0].data
    expect(data.title).toBe('湖山赋别墅 智能家居报价')
    expect(data.status).toBe('draft')
    expect(data.project).toBe('p-1')
    // 2 个 switch-2 点位 → 1 行 quantity 2
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject({
      product: 'prod-1',
      deviceType: 'switch-2',
      quantity: 2,
      price: 199,
    })
  })

  it('点位类型未指定默认型号时记为待选型（pending），不计入报价', async () => {
    // 点位 deviceType = light-strip（合法类型），但产品库里没有该类型的在售产品
    // → resolvePoint 的自动兕底找不到同类型产品 → 记为 pending（待选型）
    mocks.getCatalog.mockResolvedValue([product()]) // 只有 switch-2
    const payload = fakePayload({
      findByID: vi.fn(async () =>
        projectWithPointMap([pointElement({ deviceType: 'light-strip' })]),
      ),
      count: vi.fn(async () => ({ totalDocs: 0 })),
      create: write({ id: 'q-1', title: '湖山赋别墅 智能家居报价' }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await createQuoteForProject(user, 'p-1', 'all')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.pending).toBeGreaterThan(0)
    const data = payload.create.mock.calls[0]![0].data
    expect(data.items).toHaveLength(0)
  })

  it('scope 过滤：只统计范围内的点位', async () => {
    const payload = fakePayload({
      findByID: vi.fn(async () =>
        projectWithPointMap([
          pointElement({ code: 'K1', deviceType: 'switch-2' }),
          pointElement({ code: 'L1', deviceType: 'light-strip' }),
        ]),
      ),
      count: vi.fn(async () => ({ totalDocs: 0 })),
      create: write({ id: 'q-1', title: '湖山赋别墅 智能家居报价（不含灯具）' }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    // 'switch' 范围：光带不在范围内
    const r = await createQuoteForProject(user, 'p-1', 'switch')
    expect(r.ok).toBe(true)
    const data = payload.create.mock.calls[0]![0].data
    expect(data.items).toHaveLength(1)
    expect(data.items[0].deviceType).toBe('switch-2')
  })

  it('项目不存在返回 404', async () => {
    const payload = fakePayload() // findByID → null
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await createQuoteForProject(user, 'p-missing', 'all')
    expect(r).toEqual({ ok: false, error: '项目不存在或已被删除', status: 404 })
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('saveQuoteInput：保存报价 → 重新打开（字段保留）', () => {
  const storedQuote = () => ({
    id: 'q-1',
    items: [
      {
        id: 'row-1',
        product: 'prod-1',
        deviceType: 'switch-2',
        image: 'm-1',
        name: '双键开关',
        shortName: '双键',
        sku: 'SW-2',
        unit: '只',
        price: 199,
        quantity: 1,
      },
    ],
  })
  const baseInput = () => ({
    title: '湖山赋智能家居报价',
    status: 'draft',
    discount: 0,
    notes: '含安装',
    items: [],
    fees: [],
  })

  it('保存报价：写库的 data 含完整明细与费用，重新打开能读到', async () => {
    const payload = fakePayload({
      findByID: vi.fn(async () => storedQuote()),
      update: write({ total: 597 }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [
        { id: 'row-1', name: '双键开关', price: 199, quantity: 2 },
        { name: '三键开关', price: 199, quantity: 1 },
      ],
      fees: [{ name: '安装费', amount: 100 }],
    })
    expect(r).toEqual({ ok: true, total: 597 })
    const data = payload.update.mock.calls[0]![0].data
    expect(data).toMatchObject({
      title: '湖山赋智能家居报价',
      status: 'draft',
      discount: 0,
      notes: '含安装',
      fees: [{ name: '安装费', amount: 100 }],
    })
    expect(data.items).toHaveLength(2)
    // 重新打开：findByID 返回持久化的值
    mocks.getPayloadClient.mockResolvedValue(
      fakePayload({
        findByID: vi.fn(async () => ({ ...storedQuote(), ...data })),
      }),
    )
    const reopened = await (
      await mocks.getPayloadClient()
    ).findByID({
      collection: 'quotes',
      id: 'q-1',
    })
    expect(reopened.items).toHaveLength(2)
    expect(reopened.title).toBe('湖山赋智能家居报价')
  })

  it('换型号为已下架产品被拒绝', async () => {
    // 换型号（productId 变化）时，新产品已下架（status != 'active'）→ 拒绝
    mocks.getCatalog.mockResolvedValue([
      product(), // prod-1 switch-2 active（原型号）
      product({ id: 'prod-9', deviceType: 'switch-2', status: 'draft', name: '已下架开关' }),
    ])
    const payload = fakePayload({ findByID: vi.fn(async () => storedQuote()) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ id: 'row-1', name: '已下架开关', price: 199, quantity: 1, product: 'prod-9' }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('已下架')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('新增行关联不存在产品被拒绝', async () => {
    mocks.getCatalog.mockResolvedValue([product()]) // 只有 prod-1
    const payload = fakePayload({ findByID: vi.fn(async () => storedQuote()) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ name: '神秘设备', price: 1, quantity: 1, product: 'no-such-product' }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('关联的产品不存在')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('空标题 / 非法状态 / 负数金额都拒绝', async () => {
    const payload = fakePayload({ findByID: vi.fn(async () => storedQuote()) })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const noTitle = await saveQuoteInput(user, 'q-1', { ...baseInput(), title: '  ' })
    expect(noTitle.ok).toBe(false)
    if (!noTitle.ok) expect(noTitle.error).toContain('报价名称')

    const badStatus = await saveQuoteInput(user, 'q-1', { ...baseInput(), status: 'nonsense' })
    expect(badStatus.ok).toBe(false)
    if (!badStatus.ok) expect(badStatus.error).toContain('报价状态无效')

    const badMoney = await saveQuoteInput(user, 'q-1', {
      ...baseInput(),
      items: [{ name: '双键开关', price: -5, quantity: 1 }],
    })
    expect(badMoney.ok).toBe(false)
    if (!badMoney.ok) expect(badMoney.error).toContain('单价或数量无效')
    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('换型号的风险边界：设备类型不一致必须拒绝', () => {
  it('同一行的产品换成不同设备类型 → 拒绝并提示，避免报价与点位图脱节', async () => {
    // 库里有两个产品：switch-2（原型号）和 downlight（另一种设备类型）
    mocks.getCatalog.mockResolvedValue([
      product({ id: 'prod-1', deviceType: 'switch-2' }),
      product({ id: 'prod-9', deviceType: 'downlight', name: '筒灯', shortName: '筒灯' }),
    ])
    const payload = fakePayload({
      findByID: vi.fn(async () => ({
        id: 'q-1',
        items: [
          {
            id: 'row-1',
            product: 'prod-1',
            deviceType: 'switch-2',
            image: 'm-1',
            name: '双键开关',
            shortName: '双键',
            sku: 'SW-2',
            unit: '只',
            price: 199,
            quantity: 1,
          },
        ],
      })),
      update: write({ total: 199 }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      title: '客厅报价',
      status: 'draft',
      discount: 0,
      notes: '',
      items: [{ id: 'row-1', product: 'prod-9', name: '筒灯', price: 399, quantity: 1 }],
      fees: [],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('同一设备类型')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('换成同设备类型的产品则放行（价格/短名跟随新产品）', async () => {
    mocks.getCatalog.mockResolvedValue([
      product({ id: 'prod-1', deviceType: 'switch-2', price: 199 }),
      product({
        id: 'prod-2',
        name: '智能开关（三键）',
        shortName: '三键',
        deviceType: 'switch-2',
        price: 259,
      }),
    ])
    const payload = fakePayload({
      findByID: vi.fn(async () => ({
        id: 'q-1',
        items: [
          {
            id: 'row-1',
            product: 'prod-1',
            deviceType: 'switch-2',
            name: '双键开关',
            price: 199,
            quantity: 1,
          },
        ],
      })),
      update: write({ total: 259 }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await saveQuoteInput(user, 'q-1', {
      title: '客厅报价',
      status: 'draft',
      discount: 0,
      notes: '',
      items: [{ id: 'row-1', product: 'prod-2', name: '三键', price: 259, quantity: 1 }],
      fees: [],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.total).toBe(259)
    const data = payload.update.mock.calls[0]![0].data
    expect(data.items[0]).toMatchObject({
      product: 'prod-2',
      deviceType: 'switch-2', // 继承原行的设备类型
      shortName: '三键', // 短名跟随新产品
    })
  })
})

describe('syncQuoteWithPointMap：点位更新同步到已有报价', () => {
  it('同步后保留换过的型号与价格，只更新数量', async () => {
    const payload = fakePayload({
      findByID: vi.fn(async (args: { collection: string }) =>
        args.collection === 'quotes'
          ? {
              id: 'q-1',
              title: '湖山赋别墅 智能家居报价',
              project: 'p-1',
              items: [
                {
                  id: 'row-1',
                  product: 'prod-1',
                  deviceType: 'switch-2',
                  image: 'm-1',
                  name: '双键开关',
                  shortName: '双键',
                  sku: 'SW-2',
                  unit: '只',
                  price: 199,
                  quantity: 1,
                },
              ],
            }
          : projectWithPointMap([
              pointElement({ code: 'K1', deviceType: 'switch-2' }) as never,
              pointElement({ code: 'K2', deviceType: 'switch-2' }) as never,
            ]),
      ),
      update: write({ total: 398, id: 'q-1' }),
    })
    mocks.getPayloadClient.mockResolvedValue(payload)

    const r = await syncQuoteWithPointMap(user, 'q-1')
    expect(r.ok).toBe(true)
    const data = payload.update.mock.calls[0]![0].data
    // 数量从 1 变 2（点位图上有 2 个 switch-2），保留原价格 199
    expect(data.items[0]).toMatchObject({
      id: 'row-1',
      product: 'prod-1',
      price: 199,
      quantity: 2,
    })
  })
})
