const { api, upload, toast, absUrl } = require('../../utils/request')
const { dateTime, yuan, quoteBadge, contractBadge } = require('../../utils/format')
const { openDocument } = require('../../utils/route')
const { pickImage } = require('../../utils/pick')
const { getMeta } = require('../../utils/meta')
const decorate = require('../../utils/decorate')

Page({
  data: {
    id: '',
    loading: true,
    p: null,
    unassigned: null,
    claiming: false,
    owner: null,
    summary: null,
    quotes: [],
    contract: null,
    documents: [],
    archived: false,
    stepLabels: ['信息', '点位', '报价', '合同', '归档'],
    // 交付方案模板：当前模板卡片 + 底部抽屉
    proposal: null,
    tplSheet: false,
    tplLoading: false,
    templates: [],
    tplCurrent: '',
    tplEditable: false,
  },
  version: -1,

  onLoad(query) {
    this.poolView = query.view === 'unassigned'
    this.setData({ id: query.id })
  },
  onShow() {
    const v = getApp().globalData.dataVersion
    if (v !== this.version) {
      this.version = v
      this.load()
    }
  },
  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  async load() {
    try {
      const d = await api.get('/projects/' + this.data.id, this.poolView ? { view: 'unassigned' } : undefined)
      if (d.unassigned) {
        const entry = d.unassigned
        wx.setNavigationBarTitle({ title: '未分配项目' })
        this.setData({
          loading: false, p: null,
          unassigned: {
            ...entry,
            budgetText: entry.budget == null ? '待估算' : yuan(entry.budget),
            date: dateTime(entry.submittedAt),
            pendingPriceNames: (entry.pendingPriceCategories || []).join('、'),
          },
        })
        return
      }
      const p = decorate.project(d.project)
      wx.setNavigationBarTitle({ title: p.displayName })
      const c = d.contract
      this.setData({
        loading: false,
        unassigned: null,
        p,
        owner: d.owner,
        archived: d.project.status === 'archived',
        summary: Object.assign({}, d.summary, { totalText: yuan(d.summary.total) }),
        quotes: d.quotes.map((q) => Object.assign({}, q, { totalText: yuan(q.total), badge: quoteBadge(q.status) })),
        contract: c ? Object.assign({}, c, { amountText: yuan(c.amount), badge: contractBadge(c.status), received: c.payments.filter((x) => x.received).length }) : null,
        documents: d.documents,
        proposal: d.proposal ? Object.assign({}, d.proposal, { thumbUrl: absUrl(d.proposal.thumb) }) : null,
      })
    } catch (e) {
      this.setData({ loading: false, ...(e.status === 404 ? { unassigned: null, p: null } : {}) })
    }
  },

  async claim() {
    const entry = this.data.unassigned
    if (!entry || this.data.claiming) return
    this.setData({ claiming: true })
    try {
      await api.post('/projects/' + this.data.id + '/claim', { ticket: entry.claimTicket })
      this.poolView = false
      getApp().touchData()
      toast('已领取')
      await this.load()
    } catch (error) {
      if (error.code === 'PROJECT_CLAIMED') {
        getApp().touchData()
        wx.navigateBack()
      } else if (error.status === 404) {
        await this.load()
      }
    } finally {
      this.setData({ claiming: false })
    }
  },

  call() {
    wx.makePhoneCall({ phoneNumber: this.data.p.customerPhone })
  },
  edit() {
    wx.navigateTo({ url: '/pages/project-edit/index?id=' + this.data.id })
  },
  openPointMap() {
    wx.navigateTo({ url: '/pages/pointmap/index?id=' + this.data.id })
  },
  openQuote(e) {
    wx.navigateTo({ url: '/pages/quote/index?id=' + e.currentTarget.dataset.id })
  },
  openContract() {
    wx.navigateTo({ url: '/pages/contract/index?projectId=' + this.data.id })
  },
  openDoc(e) {
    openDocument(e.currentTarget.dataset.path, e.currentTarget.dataset.title)
  },
  openAiWithProject() {
    if (!this.data.p) return
    getApp().globalData.pending = {
      action: 'bind-project',
      project: { id: this.data.id, name: this.data.p.displayName || this.data.p.name },
    }
    wx.switchTab({ url: '/pages/ai/index' })
  },

  /** 打开模板抽屉：按缩略图、适合客户与会员等级挑选交付方案模板 */
  async openTemplates() {
    this.setData({ tplSheet: true, tplLoading: true })
    try {
      const d = await api.get('/projects/' + this.data.id + '/template')
      this.setData({
        tplLoading: false,
        tplEditable: d.editable,
        tplCurrent: d.current ? d.current.slug : '',
        templates: d.options.map((t) => Object.assign({}, t, { thumbUrl: absUrl(t.thumb) })),
      })
    } catch (e) {
      this.setData({ tplLoading: false, tplSheet: false })
    }
  },
  closeTemplates() {
    this.setData({ tplSheet: false })
  },
  async pickTemplate(e) {
    const slug = e.currentTarget.dataset.slug
    const t = this.data.templates.find((x) => x.slug === slug)
    if (!t || slug === this.data.tplCurrent) return this.closeTemplates()
    if (t.locked) return toast('「' + t.label + '」是 ' + t.tierBadge + ' 模板，升级会员后可用')
    if (!this.data.tplEditable) return toast(this.data.archived ? '项目已归档，恢复后才能切换模板' : '你对该项目仅有查看权限')
    wx.showLoading({ title: '正在切换', mask: true })
    try {
      await api.put('/projects/' + this.data.id + '/template', { template: slug })
      wx.hideLoading()
      toast('已切换为「' + t.label + '」')
      this.setData({ tplSheet: false, tplCurrent: slug })
      getApp().touchData()
      this.load()
    } catch (err) {
      wx.hideLoading()
    }
  },
  /** 在抽屉里预览某个模板套用本项目数据的效果（不切换） */
  previewTemplate(e) {
    const slug = e.currentTarget.dataset.slug
    const t = this.data.templates.find((x) => x.slug === slug)
    openDocument('/print/projects/' + this.data.id + '/proposal?template=' + encodeURIComponent(slug), (t ? t.label : '方案') + ' · 预览')
  },
  previewProposal() {
    const p = this.data.proposal
    if (!p) return
    openDocument('/print/projects/' + this.data.id + '/proposal?template=' + encodeURIComponent(p.slug), p.label + ' · 方案预览')
  },

  nextStep() {
    const section = this.data.p.progress.next.section
    if (section === 'points') this.openPointMap()
    else if (section === 'quotes') this.generateQuote()
    else if (section === 'contract') this.openContract()
    else if (section === 'archive') this.toggleArchive()
  },

  /** 上传户型图：自动裁掉图框和标题栏，不会生成任何默认点位。 */
  async uploadSheet() {
    const img = await pickImage()
    if (!img) return
    const name = await new Promise((resolve) =>
      wx.showModal({ title: '图纸名称', editable: true, placeholderText: '例如：一层平面图', success: (r) => resolve(r.confirm ? (r.content || '').trim() : null) }),
    )
    if (name === null) return
    wx.showLoading({ title: '正在处理图纸', mask: true })
    try {
      const r = await upload('/projects/' + this.data.id + '/sheets', img.path, { name })
      wx.hideLoading()
      toast('已添加图纸「' + r.sheetName + '」')
      getApp().touchData()
      this.openPointMap()
    } catch (e) {
      wx.hideLoading()
    }
  },

  async generateQuote() {
    const m = await getMeta()
    wx.showActionSheet({
      itemList: m.pointScopes.map((s) => s.fullLabel),
      success: async (r) => {
        wx.showLoading({ title: '正在生成', mask: true })
        try {
          const d = await api.post('/projects/' + this.data.id + '/quotes', { scope: m.pointScopes[r.tapIndex].value })
          wx.hideLoading()
          getApp().touchData()
          wx.navigateTo({ url: '/pages/quote/index?id=' + d.quoteId })
          if (d.pending) toast(d.pending + ' 个点位待选型，未计入报价')
        } catch (e) {
          wx.hideLoading()
        }
      },
    })
  },

  toggleArchive() {
    const archived = this.data.archived
    wx.showModal({
      title: archived ? '恢复项目' : '归档项目',
      content: archived ? '恢复后项目回到「进行中」，可以继续修改。' : '归档后点位、报价、合同都转为只读，之后可以随时恢复。',
      success: async (r) => {
        if (!r.confirm) return
        await api.put('/projects/' + this.data.id, { status: archived ? 'active' : 'archived' })
        getApp().touchData()
        toast(archived ? '已恢复' : '已归档')
        this.load()
      },
    })
  },
})
