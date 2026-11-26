const { getIdentity, tabsFor } = require('../utils/identity')

const ICONS = {
  home: '/assets/tab/home.png',
  'home-active': '/assets/tab/home-active.png',
  list: '/assets/tab/ai.png',
  'list-active': '/assets/tab/ai-active.png',
  chat: '/assets/tab/mine.png',
  'chat-active': '/assets/tab/mine-active.png',
  mine: '/assets/tab/mine.png',
  'mine-active': '/assets/tab/mine-active.png',
  projects: '/assets/tab/projects.png',
  'projects-active': '/assets/tab/projects-active.png',
  ai: '/assets/tab/ai.png',
  'ai-active': '/assets/tab/ai-active.png',
  products: '/assets/tab/products.png',
  'products-active': '/assets/tab/products-active.png',
}

Component({
  data: { list: [], selected: 0, hidden: true, native: true },
  lifetimes: {
    attached() {
      this.render()
    },
  },
  pageLifetimes: {
    show() {
      this.render()
    },
  },
  methods: {
    render() {
      const identity = getIdentity()
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      const path = current ? current.route : ''
      const native = identity !== 'owner'
      const list = tabsFor(identity).map((tab) => ({
        ...tab,
        iconPath: ICONS[tab.icon],
        selectedIconPath: ICONS[`${tab.icon}-active`],
      }))
      this.setData({
        list,
        native,
        selected: Math.max(0, list.findIndex((t) => t.pagePath === path)),
        hidden: !identity,
      })
    },
    switchTab(e) {
      const url = e.currentTarget.dataset.path
      if (!url) return
      // 业主版页面不在原生 tabBar list 里（微信上限 5 项），只能用 reLaunch。
      if (this.data.native) wx.switchTab({ url: `/${url}` })
      else wx.reLaunch({ url: `/${url}` })
    },
  },
})
