const { request, toast } = require('../../utils/request')
const { ownerNeedToken, ownerNeedRevision } = require('../../utils/identity')

/**
 * 业主版「看清单」tab：tabBar 页不能带 query，
 * 所以由这里读出本机 token/revision 再 navigateTo 真正的清单页。
 */
Page({
  data: { loading: true, error: '', token: '', revision: '' },
  onShow() {
    this.open()
  },
  async open() {
    const token = ownerNeedToken()
    if (!token) {
      this.setData({ loading: false, error: '', token: '', revision: '' })
      return
    }
    let revision = ownerNeedRevision()
    if (!revision) {
      const data = await request('/need-leads/' + encodeURIComponent(token), { auth: false, silent: true }).catch(() => null)
      revision = (data && data.revision) || ''
    }
    if (!revision) {
      this.setData({ loading: false, error: '清单还没同步，请稍后重试', token, revision: '' })
      return
    }
    this.setData({ loading: false, error: '', token, revision })
    wx.navigateTo({
      url: '/pages/need-result/index?token=' + encodeURIComponent(token) + '&revision=' + encodeURIComponent(revision),
      fail: () => toast('无法打开清单，请重试'),
    })
  },
  startNeed() {
    wx.navigateTo({ url: '/pages/need/index' })
  },
  retry() {
    this.open()
  },
})
