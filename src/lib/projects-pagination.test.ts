import { describe, expect, it } from 'vitest'

import { clampPage, MAX_PAGE, PAGE_SIZE } from './projects-pagination'

/**
 * `?page=` 的边界回归（#210 A）。
 *
 * 背景：#213 窄验实测 `?page=1e18` 会让 `payload.find({ page })` 拼出溢出 offset 直接 500
 * （`bigint out of range` / `column "infinity" does not exist`）。这里的用例锁住修复后的取值规则，
 * 避免下次改分页时又把「过大」当成「非法」。
 */
describe('clampPage', () => {
  it('接受正常的整数页码', () => {
    for (const [raw, want] of [
      ['1', 1],
      ['2', 2],
      ['11', 11],
      ['999999', 999_999],
    ] as const) {
      expect(clampPage(raw)).toBe(want)
    }
  })

  it('超过上限或无穷大 → 夹到 MAX_PAGE（调用方随后回落末页）', () => {
    for (const raw of ['1000000', '1000001', '9999999', '1e18', '1e308', 'Infinity']) {
      expect(clampPage(raw)).toBe(MAX_PAGE)
    }
  })

  it('非数字 / 空 / 0 / 负数 / 小数 → 第 1 页', () => {
    for (const raw of ['', 'abc', 'NaN', '0', '-5', '-Infinity', '1.9']) {
      expect(clampPage(raw)).toBe(1)
    }
  })

  it('不会返回 0、负数或超过 MAX_PAGE 的值', () => {
    const inputs = ['', 'abc', '0', '-5', '1', '50', '1e18', 'Infinity', '1.9', '9999999']
    for (const raw of inputs) {
      const got = clampPage(raw)
      expect(got).toBeGreaterThanOrEqual(1)
      expect(got).toBeLessThanOrEqual(MAX_PAGE)
      expect(Number.isInteger(got)).toBe(true)
    }
  })

  it('每页条数是常量，不是从 URL 来的', () => {
    expect(PAGE_SIZE).toBe(50)
    expect(MAX_PAGE).toBeGreaterThan(PAGE_SIZE)
  })
})
