const { request, toast } = require('../../utils/request')
const { ownerNeedToken, ownerNeedRevision } = require('../../utils/identity')

Page({
  data: { loading: true, error: '', token: '', status: '', answers: null, project: null },
  onShow() {
    // 自定义组件内的 pageLifetimes 不可靠，切页后由页面主动重算高亮。
    const bar = this.selectComponent && this.selectComponent('owner-tabbar')
    if (bar && bar.sync) bar.sync()
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
  async openList() {
    const token = ownerNeedToken()
    if (!token) return toast('先填写一次需求')
    // tabBar 传不了参数：token/revision 从这里读本机草稿再带进去。
    let revision = ownerNeedRevision()
    if (!revision) {
      const data = await request('/need-leads/' + encodeURIComponent(token), { auth: false, silent: true }).catch(() => null)
      revision = (data && data.revision) || ''
    }
    if (!revision) return toast('清单还没同步，请稍后重试')
    wx.navigateTo({
      url: '/pages/need-result/index?token=' + encodeURIComponent(token) + '&revision=' + encodeURIComponent(revision),
    })
  },
  retry() {
    this.load()
  },
})
