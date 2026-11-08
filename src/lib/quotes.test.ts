import { describe, expect, it } from 'vitest'

import { quoteTotals, yuan, quoteStatusLabel, quoteStatusVariant } from './quotes'

describe('quoteTotals', () => {
  it('按行合计：单价 × 数量 + 费用，再减去优惠', () => {
    expect(quoteTotals([{ price: 100, quantity: 2 }], [{ amount: 50 }], 30)).toEqual({
      productTotal: 200,
      feeTotal: 50,
      total: 220,
    })
  })

  it('金额四舍五入到分，避免浮点误差外泄', () => {
    // 0.1 * 3 在二进制浮点里是 0.30000000000000004，必须收敛成 0.3
    expect(quoteTotals([{ price: 0.1, quantity: 3 }])).toEqual({ productTotal: 0.3, feeTotal: 0, total: 0.3 })
    expect(quoteTotals([{ price: 33.335, quantity: 1 }], [{ amount: 0.005 }])).toEqual({
      productTotal: 33.34,
      feeTotal: 0.01,
      total: 33.35,
    })
  })

  it('不传参数时全为 0', () => {
    expect(quoteTotals()).toEqual({ productTotal: 0, feeTotal: 0, total: 0 })
    expect(quoteTotals([], [])).toEqual({ productTotal: 0, feeTotal: 0, total: 0 })
  })

  it('price / quantity / amount 为 null 或 undefined 时按 0 计', () => {
    expect(quoteTotals([{ price: null, quantity: null }, {}], [{}, { amount: null }])).toEqual({
      productTotal: 0,
      feeTotal: 0,
      total: 0,
    })
    // undefined 数量 → 该项不计金额（不是按 1 计）
    expect(quoteTotals([{ price: 99 }]).productTotal).toBe(0)
  })

  it('总额被夹在 0 以上：优惠大于总额时结果是 0 而不是负数', () => {
    expect(quoteTotals([{ price: 100, quantity: 1 }], [], 500).total).toBe(0)
    expect(quoteTotals([{ price: 100, quantity: 1 }], [], 100).total).toBe(0)
  })

  it('discount 为 NaN / undefined 时按 0 处理，不影响总额', () => {
    // `discount || 0` 把 NaN、undefined、0 一并归零
    expect(quoteTotals([{ price: 100, quantity: 1 }], [], NaN).total).toBe(100)
    expect(quoteTotals([{ price: 100, quantity: 1 }], [], undefined).total).toBe(100)
  })

  it('负数优惠按无优惠处理，不会变相加价', () => {
    expect(quoteTotals([{ price: 100, quantity: 1 }], [], -50).total).toBe(100)
  })
})

describe('yuan', () => {
  it('格式化为带千分位、固定两位小数的金额', () => {
    expect(yuan(1234.5)).toBe('¥1,234.50')
    expect(yuan(0)).toBe('¥0.00')
    expect(yuan(1234567.891)).toBe('¥1,234,567.89')
  })

  it('null / undefined 显示为 ¥0.00', () => {
    expect(yuan(null)).toBe('¥0.00')
    expect(yuan(undefined)).toBe('¥0.00')
  })

  it('负数保留符号', () => {
    expect(yuan(-5)).toBe('¥-5.00')
  })

  it('NaN / Infinity 落 0，不输出脏金额', () => {
    expect(yuan(NaN)).toBe('¥0.00')
    expect(yuan(Infinity)).toBe('¥0.00')
    expect(yuan(-Infinity)).toBe('¥0.00')
  })
})

describe('报价状态取值', () => {
  it('徽章样式：accepted → success，sent → warning，其余 → outline', () => {
    expect(quoteStatusVariant('accepted')).toBe('success')
    expect(quoteStatusVariant('sent')).toBe('warning')
    expect(quoteStatusVariant('draft')).toBe('outline')
    expect(quoteStatusVariant(undefined)).toBe('outline')
    expect(quoteStatusVariant(null)).toBe('outline')
  })

  it('标签未知时回落到「草稿」', () => {
    expect(quoteStatusLabel('accepted')).toBe('已确认')
    expect(quoteStatusLabel('sent')).toBe('已发送')
    expect(quoteStatusLabel('bogus')).toBe('草稿')
    expect(quoteStatusLabel(undefined)).toBe('草稿')
  })
})
