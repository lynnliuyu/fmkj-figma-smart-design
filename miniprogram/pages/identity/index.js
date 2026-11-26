const { getIdentity, setIdentity, homeFor } = require('../../utils/identity')
const { getToken } = require('../../utils/request')

Page({
  onLoad(options) {
    // 手动切换（来自「我的」→ 切换身份）：停在选择页，旧身份保持不变，
    // 直到用户真的点一张卡片才写入 —— 中途退出不会被改掉。
    if (options && options.switch === '1') return
    // 冷启动：已选过身份（含升级前就选过）就不该再被拦在身份页。
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
