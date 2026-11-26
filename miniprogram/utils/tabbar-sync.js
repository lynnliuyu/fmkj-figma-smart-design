/**
 * 页面切换后同步底部导航高亮。
 *
 * 微信自定义 tabBar 的 `pageLifetimes.show` 在切页时并不触发（实测：打点为空、
 * 实例被换掉），只在 attached 里算一次，所以从 A 页切到 B 页高亮永远停在第一次的结果。
 * 官方推荐做法是每个 tabBar 页在自己 onShow 里主动设置 selected。
 */

/** 员工版五项的下标（与 app.json tabBar.list 顺序一致）。 */
const STAFF_TAB_INDEX = {
  'pages/home/index': 0,
  'pages/projects/index': 1,
  'pages/ai/index': 2,
  'pages/products/index': 3,
  'pages/mine/index': 4,
}

/** 业主版四项的下标（与 utils/identity.js 的 TABS.owner 顺序一致）。 */
const OWNER_TAB_INDEX = {
  'pages/plans/index': 0,
  'pages/lists/index': 1,
  'pages/advisor/index': 2,
  'pages/mine/index': 3,
}

/**
 * 同步原生自定义 tabBar 的高亮。
 * mine 页两种身份共用：业主时按业主四项算，员工时按员工五项算。
 */
function syncTabBar(page, isOwner) {
  if (!page || typeof page.getTabBar !== 'function') return
  const bar = page.getTabBar()
  if (!bar || typeof bar.setData !== 'function') return
  const table = isOwner ? OWNER_TAB_INDEX : STAFF_TAB_INDEX
  const index = table[page.route]
  if (typeof index !== 'number') return
  bar.setData({ selected: index })
}

module.exports = { STAFF_TAB_INDEX, OWNER_TAB_INDEX, syncTabBar }
