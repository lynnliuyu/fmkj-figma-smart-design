import { describe, expect, it } from 'vitest'

import { clampPage, MAX_PAGE, PAGE_SIZE, resolvePageView } from './projects-pagination'

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

/**
 * 越界回落的编排（#210 A / #213 窄验遗留项）。
 *
 * 真实请求能兜住这条路径，但一旦有人改 `clampPage` 或 `totalPages` 的计算就会静默退化，
 * 所以用表驱动锁住：正常页不重查、越界页重查到末页、空账号不退化成第 0 页。
 */
describe('resolvePageView', () => {
  const docs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))

  it('正常页：不重查，页码与总页数原样返回', () => {
    for (const [requested, totalPages, expectPage] of [
      [1, 11, 1],
      [2, 11, 2],
      [11, 11, 11],
    ] as const) {
      const got = resolvePageView(requested, { docs: docs(50), totalPages })
      expect(got).toEqual({ page: expectPage, totalPages, needsRefetch: false })
    }
  })

  it('越界页：空 docs + 补算总数 → 重查末页', () => {
    // 502 条 / 每页 50 → 11 页；请求第 999 页
    const got = resolvePageView(999, { docs: [], totalPages: 1 }, 502)
    expect(got.page).toBe(11)
    expect(got.totalPages).toBe(11)
    expect(got.needsRefetch).toBe(true)
  })

  it('越界但夹取后正好等于末页：不需要重查', () => {
    const got = resolvePageView(11, { docs: docs(2), totalPages: 11 }, 502)
    expect(got).toEqual({ page: 11, totalPages: 11, needsRefetch: false })
  })

  it('空账号（0 条）：不论请求哪页都停在第 1 页，且总页数至少 1', () => {
    for (const requested of [1, 7, 999]) {
      const got = resolvePageView(requested, { docs: [], totalPages: 0 }, 0)
      expect(got.page).toBe(1)
      expect(got.totalPages).toBe(1)
    }
  })

  it('第一页为空但 requested 是 1：不重查（无匹配搜索的正常空态）', () => {
    const got = resolvePageView(1, { docs: [], totalPages: 1 }, 0)
    expect(got.needsRefetch).toBe(false)
  })

  it('没有补算总数时沿用第一页查询给的 totalPages', () => {
    const got = resolvePageView(3, { docs: docs(50), totalPages: 4 })
    expect(got).toEqual({ page: 3, totalPages: 4, needsRefetch: false })
  })
})
