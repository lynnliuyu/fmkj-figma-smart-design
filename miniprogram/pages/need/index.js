const { absUrl, request, toast } = require('../../utils/request')

const TOKEN_KEY = 'fmkj_need_token'
const DRAFT_KEY = 'fmkj_need_answers'
const SYNC_KEY = 'fmkj_need_draft_v2'

/** 需求小助手：三条入口（场景/预算/问卷）写同一份 answers（issue #194） */
Page({
  data: {
    catalog: null,
    failedAssets: {},
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
    opening: false,
    saveMessage: '',
    saveFailed: false,
    draftConflict: false,
    loading: true,
  },

  onLoad() {
    const stored = wx.getStorageSync(SYNC_KEY)
    const legacy = wx.getStorageSync(DRAFT_KEY)
    const hasLegacyAnswers = legacy && typeof legacy === 'object'
    this._draft = stored || {
      answers: Object.assign({}, this.data.answers, hasLegacyAnswers ? legacy : {}),
      token: wx.getStorageSync(TOKEN_KEY) || '',
      revision: '',
      change: hasLegacyAnswers ? 1 : 0,
      confirmed: -1,
      pending: null,
    }
    this.setData({ answers: this._draft.answers })
    this.showSaveStatus()
    if (this._draft.token && !this._draft.revision && !this._draft.pending) {
      this._restoring = this.restoreFromServer().catch((error) => this.showSaveError(error))
    }
    this.loadCatalog()
  },

  onUnload() {
    this._closed = true
    clearTimeout(this._saveTimer)
  },

  async restoreFromServer(replaceAnswers = this._draft.change === 0) {
    const draft = this._draft
    const change = draft.change
    const data = await request('/need-leads/' + encodeURIComponent(draft.token), { auth: false, silent: true })
    if (this._closed) return
    if (!data?.revision) throw new Error('服务器未返回草稿版本，请重试')
    draft.revision = data.revision
    if (replaceAnswers && draft.change === change) {
      draft.answers = Object.assign({}, draft.answers, data.answers)
      draft.confirmed = draft.change
      this.setData({ answers: draft.answers })
    }
    this.persistDraft()
    this.showSaveStatus()
  },

  async loadCatalog() {
    try {
      const data = await request('/need-leads/catalog', { auth: false, silent: true })
      const options = data.options || {}
      for (const key of ['lightingDesigns', 'lightingColors']) {
        options[key] = (options[key] || []).map((option) => ({
          ...option,
          assetUrl: option.alt && /^\/need-assets\/[a-z0-9.-]+$/.test(option.asset) ? absUrl(option.asset) : '',
        }))
      }
      this.setData({ catalog: { ...data, options }, steps: data.steps || [], loading: false })
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

  onLightingAssetError(e) {
    const assetUrl = e.currentTarget.dataset.url
    this.setData({ failedAssets: { ...this.data.failedAssets, [assetUrl]: true } })
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

  setAnswer(key, value) {
    const draft = this._draft
    draft.answers = Object.assign({}, draft.answers, { [key]: value })
    draft.change += 1
    this.setData({ answers: draft.answers })
    this.persistDraft()
    if (!this.data.draftConflict) {
      this.showSaveStatus()
      this.saveDebounced()
    }
  },

  persistDraft() {
    wx.setStorageSync(SYNC_KEY, this._draft)
  },

  isSaved() {
    const { revision, pending, confirmed, change } = this._draft
    return Boolean(revision && !pending && confirmed === change)
  },

  showSaveStatus() {
    const draft = this._draft
    const message = this.isSaved() ? '已同步到服务器' : draft.change > 0 ? '已保留在本机，待同步' : ''
    this.setData({ saveMessage: message, saveFailed: false, draftConflict: false })
  },

  showSaveError(error) {
    if (this._closed) return
    const conflict = error?.code === 'DRAFT_CHANGED'
    const reason = conflict ? '另一处已更新。用本机答案重试将覆盖服务端草稿。' : error?.message || '保存未完成，请重试'
    this.setData({ saveMessage: reason, saveFailed: true, draftConflict: conflict })
  },

  saveDebounced() {
    clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      if (!this.data.opening && !this._retrying) this.save()
    }, 600)
  },

  save() {
    if (this._saving) return this._saving
    if (this.isSaved()) return Promise.resolve(true)
    this.setData({ saving: true })
    this._saving = this.saveDraft().then(
      () => {
        if (!this._closed) {
          this.showSaveStatus()
          if (!this.isSaved() && !this.data.opening) this.saveDebounced()
        }
        return true
      },
      (error) => {
        this.showSaveError(error)
        return false
      },
    ).finally(() => {
      this._saving = null
      if (!this._closed) this.setData({ saving: false })
    })
    return this._saving
  },

  async saveDraft() {
    const draft = this._draft
    if (this._restoring) {
      const restoring = this._restoring
      this._restoring = null
      await restoring
    }
    if (this._closed || this.isSaved()) return
    if (!draft.token) {
      const ticket = await request('/need-leads', { auth: false, silent: true })
      if (this._closed) return
      draft.token = ticket.token
    } else if (!draft.revision && !draft.pending) {
      await this.restoreFromServer()
      if (this._closed || this.isSaved()) return
    }

    // Persist the exact payload before sending. After a lost acknowledgement, replay it first.
    draft.pending ||= { change: draft.change, answers: draft.answers, source: this.data.entry }
    const pending = draft.pending
    this.persistDraft()
    const saved = await request('/need-leads', {
      method: 'POST',
      auth: false,
      silent: true,
      data: { token: draft.token, revision: draft.revision, source: pending.source, answers: pending.answers },
    })
    if (this._closed) return
    if (!saved?.revision) throw new Error('服务器未确认保存，请重试')
    draft.revision = saved.revision
    draft.confirmed = pending.change
    draft.pending = null
    this.persistDraft()
  },

  async retrySave() {
    if (this._retrying || this._saving || this.data.opening) return
    this._retrying = true
    try {
      if (this.data.draftConflict) {
        await this.restoreFromServer(false)
        if (this._closed) return
        this._draft.pending = null
        this._draft.confirmed = -1
        this.persistDraft()
      }
      await this.save()
    } catch (error) {
      this.showSaveError(error)
    } finally {
      this._retrying = false
    }
  },

  refreshSavedDraft() {
    if (!this.isSaved()) return
    this._draft.revision = ''
    this._draft.change = 0
    this._draft.confirmed = -1
    this.persistDraft()
    this._restoring = this.restoreFromServer(true).catch((error) => this.showSaveError(error))
  },

  async openResult() {
    if (this.data.opening || this._retrying || this.data.draftConflict) return
    clearTimeout(this._saveTimer)
    this.setData({ opening: true })
    try {
      // At most one pending snapshot and one follow-up containing the latest edits.
      for (let attempt = 0; attempt < 2 && !this.isSaved(); attempt += 1) {
        if (!(await this.save()) || this._closed) return
      }
      if (!this.isSaved()) {
        this.showSaveError(new Error('答案刚有更新，请再试一次'))
        return
      }
      const { token, revision } = this._draft
      await new Promise((resolve) => wx.navigateTo({
        url: '/pages/need-result/index?token=' + encodeURIComponent(token) + '&revision=' + encodeURIComponent(revision),
        events: { needDraftChanged: () => this.refreshSavedDraft() },
        fail: () => toast('无法打开清单，请重试'),
        complete: resolve,
      }))
    } finally {
      if (!this._closed) this.setData({ opening: false })
    }
  },
})
