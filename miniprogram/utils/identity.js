const IDENTITY_KEY = 'fmkj_mp_identity'
const OWNER = 'owner'
const VENDOR = 'vendor'
const NEED_TOKEN_KEY = 'fmkj_need_token'
const NEED_DRAFT_KEY = 'fmkj_need_draft_v2'

const getIdentity = () => {
  const value = wx.getStorageSync(IDENTITY_KEY)
  return value === OWNER || value === VENDOR ? value : ''
}
const setIdentity = (value) => {
  if (value !== OWNER && value !== VENDOR) throw new Error('INVALID_IDENTITY')
  wx.setStorageSync(IDENTITY_KEY, value)
}
const isOwner = () => getIdentity() === OWNER

/** 业主版和集成商版各自的底部导航（原生 tabBar 只有一套，这里按身份渲染）。 */
const TABS = {
  [OWNER]: [
    { pagePath: 'pages/plans/index', text: '我的方案', icon: 'home' },
    { pagePath: 'pages/need-result/index', text: '看清单', icon: 'list' },
    { pagePath: 'pages/advisor/index', text: '找顾问', icon: 'chat' },
    { pagePath: 'pages/mine/index', text: '我的', icon: 'mine' },
  ],
  [VENDOR]: [
    { pagePath: 'pages/home/index', text: '工作台', icon: 'home' },
    { pagePath: 'pages/projects/index', text: '项目', icon: 'projects' },
    { pagePath: 'pages/ai/index', text: 'AI 助手', icon: 'ai' },
    { pagePath: 'pages/products/index', text: '产品库', icon: 'products' },
    { pagePath: 'pages/mine/index', text: '我的', icon: 'mine' },
  ],
}
const tabsFor = (identity) => TABS[identity] || TABS[VENDOR]

/** 业主的需求单：先取已保存的 token，再看本机草稿有没有更新的版本。 */
const ownerNeedToken = () => {
  const draft = wx.getStorageSync(NEED_DRAFT_KEY)
  if (draft && typeof draft.token === 'string' && draft.token) return draft.token
  const token = wx.getStorageSync(NEED_TOKEN_KEY)
  return typeof token === 'string' ? token : ''
}

module.exports = { IDENTITY_KEY, OWNER, VENDOR, getIdentity, setIdentity, isOwner, tabsFor, ownerNeedToken }
