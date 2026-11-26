const { request, toast } = require('../../utils/request')
const { ownerNeedToken } = require('../../utils/identity')

Page({
  data: { loading: true, error: '', token: '', status: '', answers: null, project: null },
  onShow() {
    this.load()
  },
  async load() {
    const token = ownerNeedToken()
    if (!token) {
      this.setData({ loading: false, error: '', token: '', answers: null, project: null })
      return
    }
    this.setData({ loading: true, error: '' })
    try {
      const data = await request('/need-leads/' + encodeURIComponent(token), { auth: false, silent: true })
      const projectId = data.projectId || ''
      const project = projectId
        ? await request('/owner/project/' + encodeURIComponent(projectId), {
            auth: false,
            silent: true,
            headers: { Authorization: 'Bearer ' + token },
          }).then((r) => r.project).catch(() => null)
        : null
      this.setData({ loading: false, token, status: data.status || '', answers: data.structured || data.answers || null, project })
    } catch (error) {
      this.setData({ loading: false, error: error.message || '方案加载失败，请重试' })
    }
  },
  startNeed() {
    wx.navigateTo({ url: '/pages/need/index' })
  },
  openList() {
    if (!this.data.token) return toast('先填写一次需求')
    wx.navigateTo({ url: '/pages/need-result/index?token=' + encodeURIComponent(this.data.token) })
  },
  retry() {
    this.load()
  },
})
