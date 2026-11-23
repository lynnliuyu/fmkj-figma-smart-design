/**
 * 报价集合 hook 的回归：金额只能由服务端按明细重算，客户端的 total 一律不认。
 * 算错钱是客户立刻会发现的问题，所以这里直接驱动真实 hook，而不是只测 quoteTotals。
 */
import { APIError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/project-guards', () => ({
  assertProjectEditable: vi.fn(async () => undefined),
  ARCHIVED_MESSAGE: '项目已归档，恢复项目后才能修改',
  READONLY_COLLAB_MESSAGE: '你对该项目仅有查看权限，无法修改',
  readableError: () => 'x',
}))

import { MANUAL_QUOTE_PRODUCT_TAG } from '@/lib/quotes'
import { Quotes } from './Quotes'

const beforeChange = Quotes.hooks!.beforeChange as unknown as Array<
  (args: Record<string, unknown>) => Promise<Record<string, unknown>>
>
const archiveLock = beforeChange[0]!
const recomputeTotals = beforeChange[1]!
const checkManualPrices = beforeChange[2]!

const memberReq = (find: unknown = vi.fn(async () => ({ docs: [] }))) =>
  ({
    user: { id: 'u-1', collection: 'users', status: 'active' },
    payload: { find },
  }) as never

const asAdminReq = () =>
  ({
    user: { id: 'admin-1', collection: 'admins' },
    payload: { find: vi.fn(async () => ({ docs: [] })) },
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('报价金额由服务端重算', () => {
  it('忽略客户端提交的 total：按明细重算，0.1 × 3 收敛为 0.3', async () => {
    const data = await recomputeTotals({
      data: {
        // 客户端伪造的合计必须被覆盖
        total: 999999,
        productTotal: 999999,
        feeTotal: 999999,
        items: [{ price: 0.1, quantity: 3 }],
        fees: [],
        discount: 0,
      },
    })
    expect(data.productTotal).toBe(0.3)
    expect(data.feeTotal).toBe(0)
    expect(data.total).toBe(0.3)
    // 浮点尾差不能外泄到单据上
    expect(String(data.total)).toBe('0.3')
  })

  it('附加费用计入总额，优惠在费用之后扣减', async () => {
    const data = await recomputeTotals({
      data: {
        items: [{ price: 100, quantity: 2 }],
        fees: [{ amount: 50 }, { amount: 0.2 }],
        discount: 30.5,
      },
    })
    expect(data.productTotal).toBe(200)
    expect(data.feeTotal).toBe(50.2)
    expect(data.total).toBe(219.7)
  })

  it('优惠超过小计时总额夹在 0，不给负数报价', async () => {
    const data = await recomputeTotals({
      data: { items: [{ price: 100, quantity: 1 }], fees: [], discount: 500 },
    })
    expect(data.total).toBe(0)
  })

  it('负数优惠视为无优惠（不能靠「负优惠」变相加价）', async () => {
    const data = await recomputeTotals({
      data: { items: [{ price: 100, quantity: 1 }], fees: [], discount: -50 },
    })
    expect(data.total).toBe(100)
  })

  it('更新只提交部分字段时，其余字段沿用原文档（不会把明细清零）', async () => {
    const data = await recomputeTotals({
      data: { discount: 10 },
      originalDoc: {
        items: [{ price: 50, quantity: 2 }],
        fees: [{ amount: 5 }],
        discount: 0,
      },
    })
    expect(data.productTotal).toBe(100)
    expect(data.feeTotal).toBe(5)
    expect(data.total).toBe(95)
  })

  it('明细为空数组时按 0 计，而不是沿用旧明细', async () => {
    // 显式清空明细应得到 0：`??` 不能把空数组当成缺失
    const data = await recomputeTotals({
      data: { items: [], fees: [], discount: 0 },
      originalDoc: { items: [{ price: 100, quantity: 9 }], fees: [], discount: 0 },
    })
    expect(data.productTotal).toBe(0)
    expect(data.total).toBe(0)
  })
})

describe('手工报价商品的集合写入校验', () => {
  it.each([undefined, 0, -1])('直接写入时拒绝单价 %s', async (price) => {
    const find = vi.fn(async () => ({
      docs: [{ name: '待价开关', status: 'inactive', tags: [MANUAL_QUOTE_PRODUCT_TAG] }],
    }))
    await expect(
      checkManualPrices({ data: { items: [{ product: 'manual', price }] }, req: memberReq(find) }),
    ).rejects.toMatchObject({ status: 400, message: '「待价开关」请填写大于 0 的单价' })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'products',
        overrideAccess: false,
        where: { id: { in: ['manual'] } },
      }),
    )
  })

  it('保留复制后的正价快照和正常商品的零价赠品', async () => {
    const find = vi.fn(async () => ({ docs: [{ status: 'active', tags: [] }] }))
    const data = {
      items: [
        { product: 'manual', price: 177 },
        { product: 'gift', price: 0 },
      ],
    }
    await expect(checkManualPrices({ data, req: memberReq(find) })).resolves.toEqual(data)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['gift'] } } }))
  })
})

describe('已用于已签订合同的报价被锁定', () => {
  it('更新被合同引用的报价：403，提示先撤销签订', async () => {
    const find = vi.fn(async () => ({ docs: [{ number: 'HT-1' }] }))
    const error = await rejectionOf(archiveLock, find)
    expect(error).toBeInstanceOf(APIError)
    expect(error.status).toBe(403)
    expect(error.message).toContain('撤销签订')
  })

  it('没有被合同引用的报价可以改', async () => {
    const data = { title: '新名字' }
    await expect(
      archiveLock({
        data,
        operation: 'update',
        originalDoc: { id: 'q-1', project: 'p-1' },
        req: memberReq(vi.fn(async () => ({ docs: [] }))),
      }),
    ).resolves.toBe(data)
  })

  it('CMS 管理员不受成员侧锁定限制', async () => {
    const data = { title: '后台修正' }
    await expect(
      archiveLock({ data, operation: 'update', originalDoc: { id: 'q-1' }, req: asAdminReq() }),
    ).resolves.toBe(data)
  })
})

async function rejectionOf(
  hook: (args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  find: ReturnType<typeof vi.fn>,
) {
  try {
    await hook({
      data: { title: 'x' },
      operation: 'update',
      originalDoc: { id: 'q-1', project: 'p-1' },
      req: memberReq(find),
    })
  } catch (error) {
    return error as APIError
  }
  throw new Error('期望 hook 抛错，但它通过了')
}
