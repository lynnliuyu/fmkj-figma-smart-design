const { tabsFor } = require('../../utils/identity')

const ICONS = {
  home: '/assets/tab/home.png',
  'home-active': '/assets/tab/home-active.png',
  list: '/assets/tab/ai.png',
  'list-active': '/assets/tab/ai-active.png',
  chat: '/assets/tab/mine.png',
  'chat-active': '/assets/tab/mine-active.png',
  mine: '/assets/tab/mine.png',
  'mine-active': '/assets/tab/mine-active.png',
}

/**
 * 业主版页面内导航。
 *
 * 微信只在 `app.json` 的 tabBar.list 里注入原生 tabBar，而 list 上限 5 项、
 * 已被员工五项占满，业主三个页面拿不到 getTabBar()。所以业主页面各自挂这个组件，
 * 保证 我的方案 / 看清单 / 找顾问 / 我的 四项在任何业主页都能互相到达。
 */
Component({
  data: { list: [], selected: 0 },
  lifetimes: {
    attached() {
      this.render()
    },
  },
  methods: {
    render() {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      const path = current ? current.route : ''
      const list = tabsFor('owner').map((tab) => ({
        ...tab,
        iconPath: ICONS[tab.icon],
        selectedIconPath: ICONS[`${tab.icon}-active`],
      }))
      this.setData({ list, selected: Math.max(0, list.findIndex((t) => t.pagePath === path)) })
    },
    switchTo(e) {
      const url = e.currentTarget.dataset.path
      if (!url) return
      // 目标页可能是也可能不是原生 tabBar 页，用 reLaunch 统一处理。
      wx.reLaunch({ url: `/${url}` })
    },
  },
})
