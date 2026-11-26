const { api } = require('../../utils/request')
const { syncTabBar } = require('../../utils/tabbar-sync')
const { requireLogin } = require('../../utils/auth')
const { captureLaunchTicket, consumePendingWebLogin, scanAndConfirmWebLogin } = require('../../utils/web-login')
const decorate = require('../../utils/decorate')

Page({
  data: { me: {}, stats: {}, recentProjects: [], recentQuotes: [], loading: true, greeting: '' },

  onLoad(options) {
    captureLaunchTicket(options)
  },
  onShow() {
    syncTabBar(this, false)
    if (!requireLogin()) return
    this.load()
    consumePendingWebLogin()
  },
  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  async load() {
    const h = new Date().getHours()
    this.setData({ greeting: h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好' })
    try {
      const d = await api.get('/dashboard', null, { silent: true })
      getApp().globalData.me = d.me
      this.setData({ me: d.me, stats: d.stats, recentProjects: d.recentProjects.map(decorate.project), recentQuotes: d.recentQuotes.map(decorate.quote), loading: false })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  openProject(e) {
    wx.navigateTo({ url: '/pages/project/index?id=' + e.currentTarget.dataset.id })
  },
  openQuote(e) {
    wx.navigateTo({ url: '/pages/quote/index?id=' + e.currentTarget.dataset.id })
  },
  newProject() {
    wx.navigateTo({ url: '/pages/project-edit/index' })
  },
  toProjects() {
    wx.switchTab({ url: '/pages/projects/index' })
  },
  toProducts() {
    wx.switchTab({ url: '/pages/products/index' })
  },
  toAi() {
    wx.switchTab({ url: '/pages/ai/index' })
  },
  /** 到 AI 助手里直接选择户型图 */
  aiFloorPlan() {
    getApp().globalData.pending = { action: 'pick-image' }
    wx.switchTab({ url: '/pages/ai/index' })
  },
  scanWebLogin() {
    scanAndConfirmWebLogin()
  },
})
