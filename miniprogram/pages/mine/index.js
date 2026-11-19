const { api, toast } = require('../../utils/request')
const { requireLogin, logout } = require('../../utils/auth')
const { captureLaunchTicket, consumePendingWebLogin, scanAndConfirmWebLogin } = require('../../utils/web-login')
const { getMeta } = require('../../utils/meta')
const config = require('../../config')

Page({
  data: { me: {}, initial: '', companyName: '', pluginCount: 0, host: '', version: config.VERSION, editing: false, redeeming: false, redeemCode: '', form: { name: '', phone: '' }, saving: false },

  openNeed() {
    wx.navigateTo({ url: '/pages/need/index' })
  },

  onLoad(options) {
    captureLaunchTicket(options)
  },

  onShow() {
    if (!requireLogin()) return
    this.setData({ host: config.BASE_URL.replace(/^https?:\/\//, '') })
    this.load()
    consumePendingWebLogin()
  },

  async load() {
    const me = await api.get('/me')
    getApp().globalData.me = me
    this.setData({ me, initial: (me.name || '?').slice(0, 1) })
    getMeta()
      .then((m) => {
        this.meta = m
        this.setData({ companyName: m.company.name, pluginCount: m.plugins.length })
      })
      .catch(() => null)
  },

  openEdit() {
    this.setData({ editing: true, form: { name: this.data.me.name || '', phone: this.data.me.phone || '' } })
  },
  closeEdit() {
    this.setData({ editing: false })
  },
  openRedeem() {
    this.setData({ redeeming: true, redeemCode: '' })
  },
  closeRedeem() {
    this.setData({ redeeming: false })
  },
  onRedeemInput(e) {
    this.setData({ redeemCode: (e.detail.value || '').toUpperCase() })
  },
  async submitRedeem() {
    const code = (this.data.redeemCode || '').trim()
    if (!code) return toast('请输入兑换码')
    this.setData({ saving: true })
    try {
      const res = await api.post('/me/redeem', { code })
      toast(res.message || '兑换成功')
      this.setData({ redeeming: false, redeemCode: '' })
      this.load()
    } finally {
      this.setData({ saving: false })
    }
  },
  async claimTask(e) {
    const taskId = e.currentTarget.dataset.id
    if (!taskId || this.data.saving) return
    this.setData({ saving: true })
    try {
      const res = await api.post('/me/redeem', { taskId })
      toast(res.message || '领取成功')
      this.load()
    } finally {
      this.setData({ saving: false })
    }
  },
  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value })
  },
  async saveProfile() {
    this.setData({ saving: true })
    try {
      const me = await api.put('/me', this.data.form)
      this.setData({ me, initial: me.name.slice(0, 1), editing: false })
      toast('已保存')
    } finally {
      this.setData({ saving: false })
    }
  },

  wechat() {
    if (!this.data.me.wechatBound) return toast('退出后用「微信一键登录」即可绑定')
    wx.showModal({
      title: '解除微信绑定',
      content: '解除后需要重新用账号密码绑定，其他用微信登录的设备会退出登录。',
      confirmColor: '#a51d24',
      success: async (r) => {
        if (!r.confirm) return
        await api.del('/me/wechat')
        toast('已解除绑定')
        this.load()
      },
    })
  },
  scanWebLogin() {
    scanAndConfirmWebLogin()
  },
  company() {
    const c = this.meta && this.meta.company
    if (!c) return
    wx.showModal({
      title: c.name,
      content: [c.slogan, c.phone && '电话：' + c.phone, c.email && '邮箱：' + c.email, c.address && '地址：' + c.address].filter(Boolean).join('\n') || '在网页版「设置」里填写公司抬头和联系方式',
      showCancel: false,
    })
  },
  privacy() {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract({ fail: () => toast('当前微信版本暂不支持打开隐私协议') })
      return
    }
    toast('请在微信公众平台查看《用户隐私保护指引》')
  },
  plugins() {
    const list = (this.meta && this.meta.plugins) || []
    wx.showModal({ title: '已启用插件', content: list.map((p) => p.name).join('\n') || '没有启用的插件', showCancel: false })
  },
  logout() {
    wx.showModal({ title: '退出登录', content: '确定退出当前账号？', success: (r) => r.confirm && logout() })
  },
})
