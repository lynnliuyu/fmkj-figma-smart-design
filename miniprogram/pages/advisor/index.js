const { request } = require('../../utils/request')

Page({
  data: { company: null, error: '' },
  onShow() {
    request('/company', { auth: false, silent: true })
      .then((data) => this.setData({ company: data.company || null, error: '' }))
      .catch(() => this.setData({ error: '暂时读不到顾问信息，请稍后再试' }))
  },
  call() {
    const phone = this.data.company && this.data.company.phone
    if (phone) wx.makePhoneCall({ phoneNumber: String(phone) })
  },
})
