import { describe, expect, it } from 'vitest'

import {
  contractNumberPrefix,
  contractStatusLabel,
  fmtLongDate,
  isContractStatus,
  paymentAmounts,
  paymentPercentTotal,
  rmbUpper,
  shanghaiDate,
} from './contracts'

describe('isContractStatus', () => {
  it('接受两种合法状态', () => {
    expect(isContractStatus('draft')).toBe(true)
    expect(isContractStatus('signed')).toBe(true)
  })

  it('拒绝空串、null、数字和其他字符串', () => {
    expect(isContractStatus('')).toBe(false)
    expect(isContractStatus(null)).toBe(false)
    expect(isContractStatus(undefined)).toBe(false)
    expect(isContractStatus(42)).toBe(false)
    expect(isContractStatus('SIGNED')).toBe(false) // 大小写敏感
    expect(isContractStatus('paid')).toBe(false)
  })
})

describe('contractStatusLabel', () => {
  it('返回中文标签', () => {
    expect(contractStatusLabel('draft')).toBe('待签订')
    expect(contractStatusLabel('signed')).toBe('已签订')
  })

  it('未知值回落到「待签订」（新合同默认态）', () => {
    expect(contractStatusLabel('bogus')).toBe('待签订')
    expect(contractStatusLabel(undefined)).toBe('待签订')
    expect(contractStatusLabel(null)).toBe('待签订')
  })
})

describe('paymentPercentTotal', () => {
  it('合计各期比例并保留两位小数', () => {
    expect(paymentPercentTotal([{ percent: 50 }, { percent: 40 }, { percent: 10 }])).toBe(100)
    expect(paymentPercentTotal([{ percent: 33.33 }, { percent: 33.33 }, { percent: 33.34 }])).toBe(100)
  })

  it('缺失的 percent 按 0 计', () => {
    expect(paymentPercentTotal([{ percent: null }, {}])).toBe(0)
    expect(paymentPercentTotal([])).toBe(0)
  })
})

describe('paymentAmounts', () => {
  it('按比例拆分合同金额', () => {
    expect(paymentAmounts(68000, [{ percent: 50 }, { percent: 40 }, { percent: 10 }])).toEqual([34000, 27200, 6800])
  })

  it('比例合计为 100 时，最后一期补齐分位误差，保证总和等于合同金额', () => {
    const amounts = paymentAmounts(0.01, [{ percent: 33.33 }, { percent: 33.33 }, { percent: 33.34 }])
    expect(amounts).toEqual([0, 0, 0.01])
    expect(amounts.reduce((s, n) => s + n, 0)).toBeCloseTo(0.01, 10)
  })

  it('比例不等于 100 时不做末位补齐（只按比例算）', () => {
    expect(paymentAmounts(100, [{ percent: 50 }])).toEqual([50])
  })

  it('空数组返回空数组', () => {
    expect(paymentAmounts(100, [])).toEqual([])
  })
})

describe('rmbUpper 金额大写', () => {
  it('整数与小数', () => {
    expect(rmbUpper(68000)).toBe('陆万捌仟元整')
    expect(rmbUpper(20.05)).toBe('贰拾元零伍分')
    expect(rmbUpper(0.5)).toBe('伍角')
    expect(rmbUpper(0.05)).toBe('伍分')
    expect(rmbUpper(0.01)).toBe('壹分')
  })

  it('零与逐级单位', () => {
    expect(rmbUpper(0)).toBe('零元整')
    expect(rmbUpper(10)).toBe('壹拾元整')
    expect(rmbUpper(100)).toBe('壹佰元整')
    expect(rmbUpper(10000)).toBe('壹万元整')
    expect(rmbUpper(100000000)).toBe('壹亿元整')
  })

  it('中间有零的位（壹万零壹、壹亿零壹）', () => {
    expect(rmbUpper(10001)).toBe('壹万零壹元整')
    expect(rmbUpper(100010000)).toBe('壹亿零壹万元整')
    expect(rmbUpper(1000.05)).toBe('壹仟元零伍分')
  })

  it('负数与非有限数返回空串（调用方需要自行为空兜底）', () => {
    expect(rmbUpper(-1)).toBe('')
    expect(rmbUpper(NaN)).toBe('')
    expect(rmbUpper(Infinity)).toBe('')
  })

  it('万亿级金额不再丢单位', () => {
    expect(rmbUpper(1e12)).toBe('壹万亿元整')
    expect(rmbUpper(999999999999)).toBe('玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元整')
  })

  it('超出可表示范围时返回空串，而不是静默丢弃高位', () => {
    // 1e16 已超过「亿亿」量级，宁可不显示也不能给出错误大写
    expect(rmbUpper(1e16)).toBe('')
  })
})

describe('日期工具', () => {
  it('shanghaiDate 用北京时间取日期（UTC 20:00 已跨到次日）', () => {
    expect(shanghaiDate(new Date('2026-10-30T20:00:00Z'))).toBe('2026-10-31')
    expect(shanghaiDate(new Date('2026-10-30T02:00:00Z'))).toBe('2026-10-30')
  })

  it('contractNumberPrefix 生成 HT + 北京时间日期', () => {
    // UTC 2026-10-30T02:00Z = 北京 10:00，同一天
    expect(contractNumberPrefix(new Date('2026-10-30T02:00:00Z'))).toBe('HT20261030')
    // UTC 2026-10-30T20:00Z = 北京 10-31
    expect(contractNumberPrefix(new Date('2026-10-30T20:00:00Z'))).toBe('HT20261031')
  })

  it('fmtLongDate 输出中文长日期，空值返回空串', () => {
    expect(fmtLongDate('2026-10-30T02:00:00Z')).toBe('2026年10月30日')
    expect(fmtLongDate(null)).toBe('')
    expect(fmtLongDate(undefined)).toBe('')
    expect(fmtLongDate('')).toBe('')
  })
})
