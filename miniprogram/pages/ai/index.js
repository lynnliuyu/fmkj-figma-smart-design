const { api, upload, absUrl, toast } = require('../../utils/request')
const { syncTabBar } = require('../../utils/tabbar-sync')
const { requireLogin } = require('../../utils/auth')
const { getMeta } = require('../../utils/meta')
const { relTime } = require('../../utils/format')
const { toHtml } = require('../../utils/markdown')
const { streamNdjson } = require('../../utils/stream')
const { buildMessage, parseStored } = require('../../utils/attachments')
const { openHref } = require('../../utils/route')
const { pickImage } = require('../../utils/pick')
const decorate = require('../../utils/decorate')

const MODEL_STORAGE_KEY = 'fmkj_mp_ai_model'

const FALLBACK_MODEL = {
  id: 'auto',
  cleanName: 'Auto（智能路由）',
  shortName: 'Auto',
  tag: '日常 DeepSeek · 识图与重工具自动切 Qwen/GLM',
  description: '日常对话使用 DeepSeek Flash 高速响应；上传图纸或调用专业工具时自动切换高阶模型',
  cost: 1,
  provider: '智能多模型调度',
  tierBadge: 'Go',
  reasoning: false,
  locked: false,
}

/**
 * AI 助手：与网页侧栏共用同一个后端（/ai/chat 流式接口、会话记录、积分）。
 * AI 可以直接新建项目、添加户型图、识别导入点位、智能选型、生成报价和合同；工具结果点一下就能跳到对应页面。
 */
const QUICK_TASKS = [
  {
    tag: '新建与识图',
    title: '新建项目并配置户型',
    desc: '自动创建项目档案，或上传户型图识别房间与点位',
    prompt: '帮我新建一个项目：万科城 3-1201，米家，客户张先生',
  },
  {
    tag: '点位审查',
    title: '检查全屋点位完整性',
    desc: '逐房间核查开关、灯光、传感器与网关覆盖是否遗漏',
    prompt: '检查当前项目每个房间的点位配置是否完整，列出缺失项和优化建议',
  },
  {
    tag: '智能配单',
    title: '智能选型并生成报价单',
    desc: '按客户预算档位匹配在售产品型号，直接生成报价',
    prompt: '按标准档为当前项目智能选型，然后生成报价单',
  },
]

const PROMPTS = [
  '帮我新建一个项目：万科城 3-1201，米家，客户张先生',
  '检查当前项目每个房间的点位配置是否完整',
  '按标准档为当前项目智能选型，然后生成报价单',
  '客户觉得贵，把当前报价打九五折',
]

function normalizeModel(m) {
  const cleanName = m.cleanName || String(m.name || '').replace(/^\[[^\]]+\]\s*/, '') || 'AI 模型'
  const shortName = m.shortName || cleanName.replace(/（[^）]*）|\([^)]*\)/g, '').trim() || cleanName
  return {
    id: m.id,
    cleanName,
    shortName,
    tag: m.tag || '工具调用',
    description: m.description || '',
    cost: m.cost || 1,
    provider: m.provider || '',
    tierBadge: m.tierBadge || 'Go',
    reasoning: Boolean(m.reasoning),
    locked: Boolean(m.locked),
    isDefault: Boolean(m.isDefault),
  }
}

const KIND_TEXT = { 'floor-plan': '户型/点位图纸', 'quote-document': '报价单/清单截图', photo: '实景照片', rendering: '效果图', other: '图片' }

/** 附件摘要：图纸显示识别数量与视觉复核进度，其他图片显示视觉判断的类型 */
function uploadSummary(r) {
  const kind = r.imageKind || 'floor-plan'
  if (kind !== 'floor-plan') return '已识别为' + (KIND_TEXT[kind] || '图片') + ' · 发送后视觉看图'
  const sw = r.detectedSwitchCount || 0
  const lt = r.detectedLightCount || 0
  const ar = r.detectedAreaCount || 0
  const counts = sw || lt ? '开关 ' + sw + (lt ? ' · 灯具 ' + lt : '') + (ar ? ' · ' + ar + ' 个房间' : '') : '图纸已就绪（无默认点位）'
  if (r.visionStatus === 'pending') return counts + ' · 视觉复核中'
  if (r.visionStatus === 'done') return counts + ' · 已视觉复核'
  return counts
}

Page({
  data: {
    messages: [],
    input: '',
    attachments: [],
    streaming: false,
    credits: 0,
    project: null,
    projects: [],
    conversationId: '',
    conversations: [],
    showHistory: false,
    showModelSheet: false,
    showProjectSheet: false,
    showTemplateSheet: false,
    models: [FALLBACK_MODEL],
    currentModel: FALLBACK_MODEL,
    templates: [],
    pluginCount: 0,
    quickTasks: QUICK_TASKS,
    prompts: PROMPTS,
    aiReady: true,
  },
  modelId: 'auto',
  pluginIds: [],
  acc: '',
  reasonAcc: '',

  onLoad() {
    this.refreshMeta(false)
  },

  refreshMeta(force) {
    return getMeta(force)
      .then((m) => {
        const rawModels = Array.isArray(m.aiModels) && m.aiModels.length ? m.aiModels.map(normalizeModel) : [FALLBACK_MODEL]
        const savedId = wx.getStorageSync(MODEL_STORAGE_KEY) || this.modelId
        const picked =
          rawModels.find((x) => x.id === savedId && !x.locked) ||
          rawModels.find((x) => x.isDefault && !x.locked) ||
          rawModels.find((x) => !x.locked) ||
          rawModels[0]
        this.modelId = picked.id
        this.pluginIds = (m.plugins || []).map((p) => p.id)
        const templates = m.aiTemplates || []
        const extra = templates.slice(0, 2).map((t) => t.name)
        this.setData({
          aiReady: m.ai,
          models: rawModels,
          currentModel: picked,
          templates,
          pluginCount: this.pluginIds.length,
          prompts: PROMPTS.concat(extra),
        })
        this.templates = templates
      })
      .catch(() => null)
  },

  onShow() {
    syncTabBar(this, false)
    if (!requireLogin()) return
    const me = getApp().globalData.me
    if (me) this.setData({ credits: me.aiCredits })
    api
      .get('/me', null, { silent: true })
      .then((u) => {
        getApp().globalData.me = u
        this.setData({ credits: u.aiCredits })
      })
      .catch(() => null)
    const pending = getApp().globalData.pending
    if (pending) {
      getApp().globalData.pending = null
      if (pending.action === 'pick-image') {
        if (pending.project) this.setData({ project: pending.project })
        this.addImage()
      } else if (pending.action === 'bind-project' && pending.project) {
        this.setData({ project: pending.project })
      }
    }
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },
  usePrompt(e) {
    const text = e.currentTarget.dataset.text
    const tpl = (this.templates || []).find((t) => t.name === text)
    this.setData({ input: tpl ? tpl.prompt : text })
  },
  useQuickTask(e) {
    const prompt = e.currentTarget.dataset.prompt
    if (prompt) this.setData({ input: prompt })
  },
  scrollBottom() {
    wx.pageScrollTo({ scrollTop: 1e6, duration: 120 })
  },

  /* ---------- 模型选择与技能模板 ---------- */

  openModelSheet() {
    if (this.data.streaming) return
    this.refreshMeta(true)
    this.setData({ showModelSheet: true })
  },
  closeModelSheet() {
    this.setData({ showModelSheet: false })
  },
  selectModel(e) {
    const id = e.currentTarget.dataset.id
    const target = this.data.models.find((m) => m.id === id)
    if (!target) return
    if (target.locked) {
      this.setData({ showModelSheet: false })
      wx.showModal({
        title: target.tierBadge + ' 会员专属模型',
        content: '「' + target.cleanName + '」为 ' + target.tierBadge + ' 会员专属高阶模型。是否前往「我的」页面激活兑换码或查看会员权益？',
        confirmText: '去升级',
        success: (r) => {
          if (r.confirm) wx.switchTab({ url: '/pages/mine/index' })
        },
      })
      return
    }
    this.modelId = target.id
    wx.setStorageSync(MODEL_STORAGE_KEY, target.id)
    this.setData({ currentModel: target, showModelSheet: false })
    toast('已切换为 ' + target.shortName)
  },

  openTemplateSheet() {
    if (this.data.streaming) return
    this.setData({ showTemplateSheet: true })
  },
  closeTemplateSheet() {
    this.setData({ showTemplateSheet: false })
  },
  selectTemplate(e) {
    const id = e.currentTarget.dataset.id
    const tpl = (this.data.templates || []).find((t) => t.id === id)
    if (!tpl) return
    const next = { input: tpl.prompt, showTemplateSheet: false }
    if (tpl.recommendedModelId) {
      const recId = String(tpl.recommendedModelId).toLowerCase()
      const unlocked = this.data.models.filter((m) => !m.locked)
      const rec =
        unlocked.find((m) => m.id === tpl.recommendedModelId) ||
        (recId.indexOf('vl') >= 0 ? unlocked.find((m) => /vl|vision/i.test(m.cleanName)) : null) ||
        (recId.indexOf('r1') >= 0 ? unlocked.find((m) => m.reasoning) : null)
      if (rec && rec.id !== this.modelId) {
        this.modelId = rec.id
        wx.setStorageSync(MODEL_STORAGE_KEY, rec.id)
        next.currentModel = rec
        toast('已填入模板并切换至 ' + rec.shortName)
      } else {
        toast('已填入「' + tpl.name + '」模板')
      }
    } else {
      toast('已填入「' + tpl.name + '」模板')
    }
    this.setData(next)
  },

  toggleReasoning(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const msg = this.data.messages[idx]
    if (!msg) return
    this.setData({ ['messages[' + idx + '].reasoningCollapsed']: !msg.reasoningCollapsed })
  },

  /* ---------- 附件 ---------- */

  async addImage() {
    const img = await pickImage()
    if (!img) return
    const id = 'a' + Date.now()
    this.setData({ attachments: this.data.attachments.concat({ id, name: img.name, status: 'uploading', preview: img.path, summary: '上传中…' }) })
    try {
      const r = await upload('/ai/upload', img.path, { name: img.name })
      const sw = r.detectedSwitchCount || 0
      const lt = r.detectedLightCount || 0
      const ar = r.detectedAreaCount || 0
      const summaryText = uploadSummary(r)
      this.setData({
        attachments: this.data.attachments.map((a) =>
          a.id === id
            ? Object.assign({}, a, {
                status: 'ready',
                url: r.url,
                mediaId: r.mediaId,
                detectedPoints: r.detectedPoints || [],
                detectedPointCount: r.detectedPointCount || 0,
                detectedSwitchCount: sw,
                detectedLightCount: lt,
                detectedAreaCount: ar,
                imageKind: r.imageKind || 'floor-plan',
                visionStatus: r.visionStatus || '',
                summary: summaryText,
              })
            : a,
        ),
      })
      if (r.visionStatus === 'pending' && r.mediaId) this.pollRecognition(id, r.mediaId, 0)
    } catch (e) {
      this.setData({ attachments: this.data.attachments.filter((a) => a.id !== id) })
    }
  },
  /** 轮询户型图视觉复核结果（每 3 秒，最多约 75 秒），完成后更新附件摘要 */
  pollRecognition(attId, mediaId, round) {
    if (round > 24) return
    setTimeout(() => {
      api
        .get('/ai/upload', { mediaId }, { silent: true })
        .then((d) => {
          if (!d || d.status === 'pending') return this.pollRecognition(attId, mediaId, round + 1)
          this.setData({
            attachments: this.data.attachments.map((a) =>
              a.id === attId
                ? Object.assign({}, a, {
                    visionStatus: d.status,
                    detectedSwitchCount: d.detectedSwitchCount || 0,
                    detectedLightCount: d.detectedLightCount || 0,
                    summary: uploadSummary(Object.assign({}, d, { visionStatus: d.status, imageKind: d.imageKind || a.imageKind })),
                  })
                : a,
            ),
          })
        })
        .catch(() => this.pollRecognition(attId, mediaId, round + 1))
    }, 3000)
  },
  removeAttachment(e) {
    this.setData({ attachments: this.data.attachments.filter((a) => a.id !== e.currentTarget.dataset.id) })
  },
  preview(e) {
    wx.previewImage({ urls: [e.currentTarget.dataset.url] })
  },

  /* ---------- 发送与流式接收 ---------- */

  onSendTap() {
    if (this.data.streaming) this.stop()
    else this.send()
  },

  send() {
    const ready = this.data.attachments.filter((a) => a.status === 'ready')
    const text = this.data.input.trim()
    if (!text && !ready.length) return
    if (this.data.attachments.some((a) => a.status === 'uploading')) return toast('图片还在上传')
    if (!this.data.aiReady) return toast('服务器还没有配置 AI 密钥')
    const names = ready.map((a) => a.name).join('、')
    const allPlans = ready.every((a) => (a.imageKind || 'floor-plan') === 'floor-plan')
    const prompt =
      text ||
      (allPlans
        ? '请将上传的户型图（' + names + '）添加到' + (this.data.project ? '当前项目' : '新项目') + '的点位图中。'
        : '请帮我看看上传的图片（' + names + '），说明图片内容并给出建议。')
    const now = Date.now()
    const userMsg = { id: 'u' + now, role: 'user', text: prompt, images: ready.map((a) => ({ url: a.preview || absUrl(a.url) })) }
    const reply = {
      id: 'r' + now,
      role: 'assistant',
      modelName: this.data.currentModel.shortName,
      tierBadge: this.data.currentModel.tierBadge,
      reasoning: '',
      reasoningCollapsed: false,
      text: '',
      html: '',
      tools: [],
      pending: true,
      error: false,
      cost: 0,
    }
    this.acc = ''
    this.reasonAcc = ''
    this.setData({ messages: this.data.messages.concat(userMsg, reply), input: '', attachments: [], streaming: true })
    this.scrollBottom()
    this.task = streamNdjson(
      '/ai/chat',
      {
        conversationId: this.data.conversationId || null,
        message: buildMessage(prompt, ready),
        modelId: this.modelId,
        projectId: this.data.project ? this.data.project.id : null,
        pluginIds: this.pluginIds,
      },
      (ev) => this.onEvent(ev),
    )
  },

  stop() {
    if (this.task) this.task.abort()
  },

  onEvent(ev) {
    const idx = this.data.messages.length - 1
    const path = 'messages[' + idx + ']'
    const msg = this.data.messages[idx]
    if (!msg) return
    if (ev.type === 'status') {
      this.setData({ [path + '.status']: ev.text || '' })
    } else if (ev.type === 'meta') {
      const metaPatch = { conversationId: ev.conversationId }
      if (ev.modelName) metaPatch[path + '.modelName'] = ev.modelName
      this.setData(metaPatch)
    } else if (ev.type === 'tool') {
      this.setData({ [path + '.tools']: msg.tools.concat({ name: ev.pluginName, summary: ev.summary, href: ev.href || '', label: ev.hrefLabel || '' }) })
      this.scrollBottom()
    } else if (ev.type === 'project' && ev.project) {
      const clean = String(ev.project.name || '').replace(/^\[示例\]\s*/, '')
      this.setData({ project: { id: ev.project.id, name: clean || ev.project.name } })
    } else if (ev.type === 'reasoning') {
      this.reasonAcc += ev.text || ''
      this.flushSoon(path)
    } else if (ev.type === 'delta') {
      this.acc += ev.text || ''
      if (msg.status) this.setData({ [path + '.status']: '' })
      this.flushSoon(path)
    } else if (ev.type === 'done') {
      this.flush(path)
      const credits = typeof ev.balance === 'number' ? ev.balance : this.data.credits
      const donePatch = { [path + '.pending']: false, [path + '.cost']: ev.cost || 0, [path + '.reasoningCollapsed']: Boolean(this.reasonAcc), credits }
      if (ev.modelName) donePatch[path + '.modelName'] = ev.modelName
      this.setData(donePatch)
      if (getApp().globalData.me) getApp().globalData.me.aiCredits = credits
      if (ev.mutated) getApp().touchData()
    } else if (ev.type === 'error') {
      this.acc = this.acc || '发送失败：' + (ev.error || '请稍后重试')
      this.flush(path)
      this.setData({ [path + '.pending']: false, [path + '.error']: true })
    } else if (ev.type === 'closed' || ev.type === 'aborted') {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
      if (ev.type === 'aborted' && !this.acc && !this.reasonAcc) this.acc = '已停止'
      this.flush(path)
      this.setData({ streaming: false, [path + '.pending']: false })
      this.task = null
    }
  },
  flushSoon(path) {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush(path)
    }, 80)
  },
  flush(path) {
    if (!this.acc && !this.reasonAcc) return
    const patch = {}
    if (this.reasonAcc) patch[path + '.reasoning'] = this.reasonAcc
    if (this.acc) {
      patch[path + '.html'] = toHtml(this.acc)
      patch[path + '.text'] = this.acc
    }
    this.setData(patch)
    this.scrollBottom()
  },

  openTool(e) {
    const href = e.currentTarget.dataset.href
    if (href && !openHref(href)) toast('请在网页版打开')
  },
  copy(e) {
    wx.setClipboardData({ data: this.data.messages[Number(e.currentTarget.dataset.index)].text })
  },

  /* ---------- 项目、会话 ---------- */

  async pickProject() {
    this.setData({ showProjectSheet: true })
    try {
      const d = await api.get('/projects', { status: 'active', limit: 20 }, { silent: true })
      this.setData({ projects: (d.items || []).map(decorate.project) })
    } catch (e) {
      // ignore
    }
  },
  closeProjectSheet() {
    this.setData({ showProjectSheet: false })
  },
  selectProject(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      this.setData({ project: null, showProjectSheet: false })
      return
    }
    const found = this.data.projects.find((p) => p.id === id)
    if (found) {
      this.setData({ project: { id: found.id, name: found.displayName || found.name }, showProjectSheet: false })
    }
  },
  clearProject() {
    this.setData({ project: null })
  },
  newChat() {
    if (this.data.streaming) return
    this.setData({ messages: [], conversationId: '', attachments: [] })
  },
  async openHistory() {
    this.setData({ showHistory: true })
    const d = await api.get('/ai/conversations')
    this.setData({ conversations: d.items.map((c) => Object.assign({}, c, { time: relTime(c.updatedAt) })) })
  },
  closeHistory() {
    this.setData({ showHistory: false })
  },
  async openConversation(e) {
    if (this.data.streaming) return
    const id = e.currentTarget.dataset.id
    this.setData({ showHistory: false })
    wx.showLoading({ title: '加载中' })
    try {
      const d = await api.get('/ai/conversations/' + id)
      const messages = d.messages.map((m) => {
        if (m.role === 'user') {
          const parsed = parseStored(m.content)
          return { id: m.id, role: 'user', text: parsed.text, images: parsed.images.map((i) => ({ url: absUrl(i.url) })) }
        }
        const rawModelId = m.model ? String(m.model) : ''
        const isAutoRouted = rawModelId.indexOf('auto:') === 0
        const actualId = isAutoRouted ? rawModelId.slice(5) : rawModelId
        const modelObj = actualId ? this.data.models.find((x) => x.id === actualId) : null
        const displayModelName = isAutoRouted
          ? 'Auto · ' + (modelObj ? modelObj.shortName : actualId)
          : modelObj
            ? modelObj.shortName
            : actualId
        return {
          id: m.id,
          role: 'assistant',
          modelName: displayModelName,
          tierBadge: modelObj ? modelObj.tierBadge : '',
          text: m.content,
          html: toHtml(m.content),
          tools: (m.toolCalls || []).map((t) => ({ name: t.pluginName, summary: t.summary, href: t.href || '', label: t.hrefLabel || '' })),
          pending: false,
          cost: m.cost || 0,
        }
      })
      const next = { messages, conversationId: id }
      if (d.project && d.project.id) {
        next.project = { id: d.project.id, name: String(d.project.name || '').replace(/^\[示例\]\s*/, '') }
      }
      if (d.model) {
        const convModel = this.data.models.find((x) => x.id === d.model && !x.locked)
        if (convModel) {
          this.modelId = convModel.id
          next.currentModel = convModel
        }
      }
      this.setData(next)
      setTimeout(() => this.scrollBottom(), 100)
    } finally {
      wx.hideLoading()
    }
  },
  deleteConversation(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除对话',
      content: '删除后无法恢复，积分记录保留。',
      confirmColor: '#a51d24',
      success: async (r) => {
        if (!r.confirm) return
        await api.del('/ai/conversations/' + id)
        this.setData({ conversations: this.data.conversations.filter((c) => c.id !== id) })
        if (id === this.data.conversationId) this.newChat()
      },
    })
  },
})
