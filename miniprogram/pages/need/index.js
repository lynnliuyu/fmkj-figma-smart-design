const { request, toast } = require('../../utils/request')

const TOKEN_KEY = 'fmkj_need_token'
const DRAFT_KEY = 'fmkj_need_answers'

/** 需求小助手：三条入口（场景/预算/问卷）写同一份 answers（issue #194） */
Page({
  data: {
    catalog: null,
    entry: 'scene', // scene | budget | wizard
    step: 0,
    answers: {
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: null, stage: 'rough' },
      lighting: { design: 'main', color: 'warm' },
      level: { tier: 'light', prefer: 'mixed' },
      security: { camera: 'none', sensors: [] },
      panels: { screenSwitch: false, centralScreen: 'none', lock: false },
      scenes: [],
      ecosystem: { primary: 'mijia' },
      sceneCards: [],
      budgetBand: null,
    },
    steps: [],
    saving: false,
    loading: true,
  },

  onLoad() {
    const saved = wx.getStorageSync(DRAFT_KEY)
    if (saved && typeof saved === 'object') this.setData({ answers: saved })
    else this.restoreFromServer()
    this.loadCatalog()
  },

  /** 换设备/清缓存后凭 token 续填（GET /need-leads/[token]） */
  async restoreFromServer() {
    const token = wx.getStorageSync(TOKEN_KEY)
    if (!token) return
    try {
      const data = await request('/need-leads/' + encodeURIComponent(token), { auth: false, silent: true })
      if (data && data.answers && Object.keys(data.answers).length) {
        this.setData({ answers: Object.assign({}, this.data.answers, data.answers) })
        wx.setStorageSync(DRAFT_KEY, this.data.answers)
      }
    } catch (e) {
      // 需求单过期/不存在：静默从空白开始，不打断填写
    }
  },

  async loadCatalog() {
    try {
      const data = await request('/need-leads/catalog', { auth: false, silent: true })
      this.setData({ catalog: data, steps: data.steps || [], loading: false })
    } catch (e) {
      this.setData({ loading: false })
      toast('选项目录加载失败，请检查网络')
    }
  },

  switchEntry(e) {
    this.setData({ entry: e.currentTarget.dataset.key })
  },

  // ── 场景入口 ───────────────────────────────────────────────
  toggleSceneCard(e) {
    const v = e.currentTarget.dataset.value
    const list = (this.data.answers.sceneCards || []).slice()
    const i = list.indexOf(v)
    if (i >= 0) list.splice(i, 1)
    else list.push(v)
    this.setAnswer('sceneCards', list)
  },

  pickLighting(e) {
    const { field, value } = e.currentTarget.dataset
    const lighting = Object.assign({}, this.data.answers.lighting, { [field]: value })
    this.setAnswer('lighting', lighting)
  },

  // ── 预算入口 ───────────────────────────────────────────────
  pickBudget(e) {
    this.setAnswer('budgetBand', e.currentTarget.dataset.value)
  },

  // ── 问卷入口 ───────────────────────────────────────────────
  nextStep() {
    const last = Math.max(0, (this.data.steps || []).length - 1)
    this.setData({ step: Math.min(this.data.step + 1, last) })
  },
  prevStep() {
    this.setData({ step: Math.max(this.data.step - 1, 0) })
  },
  jumpStep(e) {
    this.setData({ step: Number(e.currentTarget.dataset.step) })
  },

  pickHouse(e) {
    const { field, value } = e.currentTarget.dataset
    const house = Object.assign({}, this.data.answers.house)
    house[field] = field === 'area' || field === 'bedrooms' || field === 'livingRooms' ? Number(value) : value
    this.setAnswer('house', house)
  },
  onAreaInput(e) {
    const house = Object.assign({}, this.data.answers.house, { area: Number(e.detail.value) || null })
    this.setAnswer('house', house)
  },
  pickTier(e) {
    this.setAnswer('level', Object.assign({}, this.data.answers.level, { tier: e.currentTarget.dataset.value }))
  },
  pickHabit(e) {
    this.setAnswer('level', Object.assign({}, this.data.answers.level, { prefer: e.currentTarget.dataset.value }))
  },
  pickCamera(e) {
    this.setAnswer('security', Object.assign({}, this.data.answers.security, { camera: e.currentTarget.dataset.value }))
  },
  toggleSensor(e) {
    const v = e.currentTarget.dataset.value
    const list = (this.data.answers.security.sensors || []).slice()
    const i = list.indexOf(v)
    if (i >= 0) list.splice(i, 1)
    else list.push(v)
    this.setAnswer('security', Object.assign({}, this.data.answers.security, { sensors: list }))
  },
  togglePanel(e) {
    const v = e.currentTarget.dataset.value
    const panels = Object.assign({}, this.data.answers.panels)
    panels[v] = !panels[v]
    this.setAnswer('panels', panels)
  },
  pickCentral(e) {
    this.setAnswer('panels', Object.assign({}, this.data.answers.panels, { centralScreen: e.currentTarget.dataset.value }))
  },
  toggleScene(e) {
    const v = e.currentTarget.dataset.value
    const list = (this.data.answers.scenes || []).slice()
    const i = list.indexOf(v)
    if (i >= 0) list.splice(i, 1)
    else list.push(v)
    this.setAnswer('scenes', list)
  },
  pickEcosystem(e) {
    this.setAnswer('ecosystem', { primary: e.currentTarget.dataset.value })
  },

  /** 每次改动：本地缓存 + 防抖保存到服务端（免登录，凭 token 续填） */
  setAnswer(key, value) {
    const answers = Object.assign({}, this.data.answers, { [key]: value })
    this.setData({ answers })
    wx.setStorageSync(DRAFT_KEY, answers)
    this.saveDebounced()
  },

  saveDebounced() {
    clearTimeout(this._t)
    this._t = setTimeout(() => this.save(), 600)
  },

  async save() {
    const token = wx.getStorageSync(TOKEN_KEY) || undefined
    try {
      this.setData({ saving: true })
      const res = await request('/need-leads', {
        method: 'POST',
        auth: false,
        silent: true,
        data: { token, source: this.data.entry, answers: this.data.answers },
      })
      if (res && res.token) wx.setStorageSync(TOKEN_KEY, res.token)
    } catch (e) {
      // 保存失败不阻断填写：本地缓存仍在，下次自动重试
    } finally {
      this.setData({ saving: false })
    }
  },

  async openResult() {
    await this.save()
    const token = wx.getStorageSync(TOKEN_KEY)
    if (!token) return toast('还没保存成功，请稍后再试')
    wx.navigateTo({ url: '/pages/need-result/index?token=' + encodeURIComponent(token) })
  },
})
