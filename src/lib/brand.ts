/** 产品名称与页面标题。 */
export const APP_NAME = '繁梦空间'
/** 英文名（标识副标） */
export const APP_NAME_EN = 'Dream Space'
/** 公司名称（品牌标识与版权信息使用） */
export const COMPANY_NAME = '繁梦空间智能信息技术'
export const APP_TAGLINE = '智能家居设计报价'
export const APP_DESCRIPTION =
  '个人和团队的智能家居设计报价平台：户型点位、产品选型、报价、合同和归档一站完成。'

export const pageTitle = (title: string) => `${title} · ${APP_NAME} ${APP_TAGLINE}`

/** 侧边栏字标：拉丁字母取前两个（FMKJ → FM），中文取第一个字。 */
export function brandInitials(name: string) {
  const trimmed = name.trim()
  const latin = trimmed.match(/^[A-Za-z]+/)?.[0]
  if (latin) return latin.slice(0, 2).toUpperCase()
  return trimmed.slice(0, 1) || 'FM'
}
