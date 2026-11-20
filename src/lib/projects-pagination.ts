/**
 * 项目列表分页的取值规则（#210 A）。
 *
 * 为什么单独成文件：`?page=` 的边界（Infinity、1e18、负数、小数）曾让
 * `payload.find({ page })` 拼出溢出的 offset 直接 500，所以这套规则需要单测锁住，
 * 不能只活在页面组件里靠人工点击验证。
 */

/** 每页条数。 */
export const PAGE_SIZE = 50

/** 页码上限：够大以容纳任何真实数据量，又不会让数据库拼出溢出的 offset。 */
export const MAX_PAGE = 1_000_000

/**
 * `?page=` 的取值规则：
 * - 整数且在 1..MAX_PAGE → 原样使用；
 * - 超过 MAX_PAGE（含 `Infinity`、`1e18`、`1e308`）→ 夹到 MAX_PAGE，之后由调用方按总数回落末页；
 * - 非数字、0、负数、小数（`abc`、``、`0`、`-5`、`1.9`）→ 第 1 页。
 *
 * `Infinity` 与 `1e18` 归为「过大」而不是「非法」，因为它们在语义上都是「翻到很后面」，
 * 用户看到的应该是末页；把它们当第 1 页会静默丢失「翻到最后」的意图。
 */
export function clampPage(raw: string): number {
  const n = Math.floor(Number(raw))
  if (Number.isNaN(n) || n < 1) return 1
  if (!Number.isFinite(n)) return MAX_PAGE
  return Math.min(n, MAX_PAGE)
}
