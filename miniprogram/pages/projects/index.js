const { api } = require('../../utils/request')
const { syncTabBar } = require('../../utils/tabbar-sync')
const { requireLogin } = require('../../utils/auth')
const decorate = require('../../utils/decorate')

Page({
  data: {
    q: '',
    status: 'active',
    filters: [
      { value: 'active', label: '进行中' },
      { value: 'archived', label: '已归档' },
      { value: 'all', label: '全部' },
    ],
    items: [],
    page: 1,
    hasMore: false,
    total: 0,
    loading: true,
  },
  version: -1,

  onShow() {
    syncTabBar(this, false)
    if (!requireLogin()) return
    const v = getApp().globalData.dataVersion
    if (v !== this.version) {
      this.version = v
      this.reload()
    }
  },
  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh())
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(this.data.page + 1)
  },

  reload() {
    return this.load(1)
  },
  async load(page) {
    this.setData({ loading: true })
    try {
      const d = await api.get('/projects', { q: this.data.q, status: this.data.status, page, limit: 20 })
      const items = d.items.map(decorate.project)
      this.setData({ items: page === 1 ? items : this.data.items.concat(items), page, hasMore: d.hasMore, total: d.total })
    } finally {
      this.setData({ loading: false })
    }
  },

  onQuery(e) {
    this.setData({ q: e.detail.value })
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.reload(), 400)
  },
  clearQuery() {
    this.setData({ q: '' })
    this.reload()
  },
  onFilter(e) {
    this.setData({ status: e.currentTarget.dataset.value })
    this.reload()
  },
  open(e) {
    wx.navigateTo({ url: '/pages/project/index?id=' + e.currentTarget.dataset.id })
  },
  create() {
    wx.navigateTo({ url: '/pages/project-edit/index' })
  },
})
