const { setIdentity, VENDOR } = require('../../utils/identity')
const { getToken } = require('../../utils/request')

Page({
  choose(e) {
    const identity = e.currentTarget.dataset.identity
    if (identity !== 'owner' && identity !== 'vendor') return
    setIdentity(identity)
    if (identity === 'vendor' && !getToken()) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    wx.reLaunch({ url: identity === 'owner' ? '/pages/plans/index' : '/pages/home/index' })
  },
  vendorLogin() {
    setIdentity(VENDOR)
    wx.reLaunch({ url: '/pages/login/index' })
  },
})
