const { request, toast } = require('../../utils/request')

/** 需求清单 + 估算 + 提交草稿（issue #194） */
Page({
  data: {
    token: '',
    loading: true,
    result: null,
    pricing: null,
    submitting: false,
    submitted: false,
    projectId: null,
    phone: '',
  },

  onLoad(options) {
    const token = decodeURIComponent(options.token || '')
    this.setData({ token })
    this.load()
  },

  async load() {
    try {
      const data = await request('/need-leads/' + encodeURIComponent(this.data.token) + '/structure', {
        method: 'POST',
        auth: false,
        silent: true,
        data: {},
      })
      this.setData({ result: data.structured, pricing: data.pricing, loading: false })
    } catch (e) {
      // structure 失败（如网络抖动）→ 回退读回已答内容，提示可重试
      this.setData({ loading: false })
      toast('清单生成失败，已保留你的答案，可返回重试')
    }
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },

  async submit() {
    if (this.data.submitting || this.data.submitted) return
    this.setData({ submitting: true })
    try {
      const res = await request('/need-leads/' + encodeURIComponent(this.data.token) + '/submit', {
        method: 'POST',
        auth: false,
        data: { phone: this.data.phone || undefined },
      })
      this.setData({ submitted: true, projectId: res.projectId })
      toast('已提交，顾问会联系你')
    } catch (e) {
      toast('提交失败，请稍后再试')
    } finally {
      this.setData({ submitting: false })
    }
  },

  goBack() {
    wx.navigateBack()
  },
})
