const { getIdentity, setIdentity, homeFor } = require('../../utils/identity')
const { getToken } = require('../../utils/request')

Page({
  onLoad() {
    // 已选过身份（含升级前就选过）就不该再被拦在身份页。
    const identity = getIdentity()
    if (!identity) return
    if (identity === 'vendor' && !getToken()) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    wx.reLaunch({ url: homeFor(identity) })
  },

  choose(e) {
    const identity = e.currentTarget.dataset.identity
    if (identity !== 'owner' && identity !== 'vendor') return
    setIdentity(identity)
    if (identity === 'vendor' && !getToken()) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    wx.reLaunch({ url: homeFor(identity) })
  },
})
