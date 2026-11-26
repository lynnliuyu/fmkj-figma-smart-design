const { getToken } = require('./utils/request')
const { getIdentity, isOwner } = require('./utils/identity')
const { captureLaunchTicket, consumePendingWebLogin } = require('./utils/web-login')

App({
  globalData: {
    me: null,
    /** AI 或其他页面修改了数据后加一，列表页 onShow 时据此刷新 */
    dataVersion: 0,
    /** 跨页面传递的一次性参数（例如工作台点「上传户型图」后跳到项目页） */
    pending: null,
    /** 微信扫一扫电脑端登录小程序码进入时携带的待确认票据 */
    pendingLoginTicket: '',
  },
  onLaunch(options) {
    captureLaunchTicket(options, this)
    this.setupPrivacyAuthorization()
    // 首次进入先选身份；业主免登录，集成商沿用原来的登录要求。
    // 入口页是 home（员工工作台），所以已选业主的人必须立刻被带到业主首页，
    // 否则 home 的 requireLogin 会把他踢到员工登录页。
    if (!getIdentity()) {
      wx.reLaunch({ url: '/pages/identity/index' })
    } else if (isOwner()) {
      wx.reLaunch({ url: '/pages/plans/index' })
    } else if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/index' })
    }
    const update = wx.getUpdateManager && wx.getUpdateManager()
    if (update) {
      update.onUpdateReady(() => {
        wx.showModal({ title: '发现新版本', content: '新版本已准备好，是否重启使用？', success: (r) => r.confirm && update.applyUpdate() })
      })
    }
  },
  onShow(options) {
    const ticket = captureLaunchTicket(options, this)
    if (ticket && !isOwner() && getToken()) {
      setTimeout(() => consumePendingWebLogin(), 300)
    }
  },
  /**
   * 微信隐私授权：当 wx.chooseMedia / wx.chooseMessageFile 等隐私接口触发时，
   * 找到当前页面的 <privacy-popup /> 组件展示协议；用户同意后放行。
   */
  setupPrivacyAuthorization() {
    if (!wx.onNeedPrivacyAuthorization) return
    wx.onNeedPrivacyAuthorization((resolve) => {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      const popup = page && page.selectComponent && page.selectComponent('#privacy-popup')
      if (popup && popup.request) {
        popup.request(resolve)
        return
      }
      // 兜底：页面没有挂载组件时走微信原生隐私授权，避免接口被直接拒绝。
      if (wx.requirePrivacyAuthorize) {
        wx.requirePrivacyAuthorize({
          success: () => resolve({ event: 'agree' }),
          fail: () => resolve({ event: 'disagree' }),
        })
        return
      }
      resolve({ event: 'disagree' })
    })
  },
  touchData() {
    this.globalData.dataVersion += 1
  },
})
