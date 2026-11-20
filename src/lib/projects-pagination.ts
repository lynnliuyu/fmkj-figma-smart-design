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

/**
 * 拿到「请求页 + 首页查询结果」后，决定实际要显示哪一页，以及是否需要再查一次。
 *
 * 为什么要单独成函数：越界页（`?page=999`）的 `find` 会返回空 docs，而且它带回的
 * `totalPages` 不可信，必须用同一 `where` 补一次 `count` 重算末页再回查。这段编排
 * 之前只由真实请求覆盖，改 `clampPage` 或 `totalPages` 计算就会静默退化，所以独立锁住。
 *
 * @param requestedPage 已经过 `clampPage()` 的页码
 * @param firstPass      用 `requestedPage` 查出来的第一页结果
 * @param totalDocs      补算的总数（仅在 `firstPass` 判定越界时才用）
 */
export function resolvePageView<T>(
  requestedPage: number,
  firstPass: { docs: T[]; totalPages?: number | null },
  totalDocs?: number,
) {
  const totalPages = Math.max(
    1,
    totalDocs === undefined ? (firstPass.totalPages ?? 1) : Math.ceil(totalDocs / PAGE_SIZE),
  )
  const page = Math.min(requestedPage, totalPages)
  const outOfRange = requestedPage > 1 && firstPass.docs.length === 0
  return {
    /** 需要显示第几页 */
    page,
    /** 总页数（用于「X / Y」） */
    totalPages,
    /** 越界且第一页查询为空——调用方要按 `page` 再查一次 */
    needsRefetch: outOfRange && page !== requestedPage,
  }
}
