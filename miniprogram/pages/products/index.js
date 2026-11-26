const { requireLogin } = require('../../utils/auth')
const { syncTabBar } = require('../../utils/tabbar-sync')

Page({
  onShow() {
    syncTabBar(this, false)
    requireLogin()
  },
  onReachBottom() {
    this.selectComponent('#list').loadMore()
  },
  onPullDownRefresh() {
    this.selectComponent('#list')
      .reload()
      .finally(() => wx.stopPullDownRefresh())
  },
  open(e) {
    wx.navigateTo({ url: '/pages/product/index?id=' + e.detail.id })
  },
})
