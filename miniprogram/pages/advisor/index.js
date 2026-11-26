const { request } = require('../../utils/request')

Page({
  data: { company: null, error: '' },
  onShow() {
    // 自定义组件内的 pageLifetimes 不可靠，切页后由页面主动重算高亮。
    const bar = this.selectComponent && this.selectComponent('owner-tabbar')
    if (bar && bar.sync) bar.sync()
    request('/company', { auth: false, silent: true })
      .then((data) => this.setData({ company: data.company || null, error: '' }))
      .catch(() => this.setData({ error: '暂时读不到顾问信息，请稍后再试' }))
  },
  call() {
    const phone = this.data.company && this.data.company.phone
    if (phone) wx.makePhoneCall({ phoneNumber: String(phone) })
  },
})
