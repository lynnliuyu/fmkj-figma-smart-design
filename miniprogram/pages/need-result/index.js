const { request, toast } = require('../../utils/request')

const SYNC_KEY = 'fmkj_need_draft_v2'

/** 需求清单 + 估算 + 提交草稿（issue #194） */
Page({
  data: {
    token: '',
    revision: '',
    loading: true,
    loadError: '',
    needsSave: false,
    result: null,
    pricing: null,
    submitting: false,
    submitted: false,
    projectId: null,
    phone: '',
  },

  onLoad(options) {
    // Tokens and revisions use URL-safe characters and require no extra decoding.
    this.setData({ token: options.token || '', revision: options.revision || '' })
    return this.load()
  },

  hasConfirmedAnswers() {
    const { token, revision } = this.data
    if (!token || !revision) return false
    const draft = wx.getStorageSync(SYNC_KEY)
    return !draft || draft.token !== token || (
      draft.revision === revision && !draft.pending && draft.confirmed === draft.change
    )
  },

  showStaleAnswers() {
    this.setData({
      loading: false,
      result: null,
      pricing: null,
      needsSave: true,
      loadError: '请返回保存最新答案，再重新生成清单。',
    })
  },

  async load() {
    if (!this.hasConfirmedAnswers()) return this.showStaleAnswers()
    this.setData({ loading: true, loadError: '', needsSave: false, result: null, pricing: null })
    try {
      const data = await request('/need-leads/' + encodeURIComponent(this.data.token) + '/structure', {
        method: 'POST',
        auth: false,
        silent: true,
        data: { revision: this.data.revision },
      })
      if (!this.hasConfirmedAnswers()) return this.showStaleAnswers()
      this.setData({ result: data.structured, pricing: data.pricing, loading: false })
    } catch (error) {
      if (error.code === 'DRAFT_CHANGED') return this.showStaleAnswers()
      this.setData({ loading: false, loadError: '清单生成失败，已保留你的答案，可重试。' })
    }
  },

  retryLoad() {
    if (!this.data.loading) return this.load()
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },

  async submit() {
    if (this.data.submitting || this.data.submitted || !this.data.result) return
    if (!this.hasConfirmedAnswers()) return this.showStaleAnswers()
    this.setData({ submitting: true })
    try {
      const res = await request('/need-leads/' + encodeURIComponent(this.data.token) + '/submit', {
        method: 'POST',
        auth: false,
        silent: true,
        data: { revision: this.data.revision, phone: this.data.phone || undefined },
      })
      this.setData({ submitted: true, projectId: res.projectId })
      toast('已提交，顾问会联系你')
    } catch (error) {
      if (error.code === 'DRAFT_CHANGED') this.showStaleAnswers()
      else toast(error.message || '提交失败，请稍后再试')
    } finally {
      this.setData({ submitting: false })
    }
  },

  goBack() {
    if (this.data.needsSave) this.getOpenerEventChannel?.()?.emit('needDraftChanged')
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/need/index' }) })
  },
})
