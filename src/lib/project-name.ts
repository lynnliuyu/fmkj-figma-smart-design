/** 系统为新用户发放的示例项目，名称以此前缀开头。界面上去掉前缀，改用「示例」徽章标出。 */
export const DEMO_PREFIX = '【示例】'

export const isDemoProjectName = (name: string) => name.startsWith(DEMO_PREFIX)

/** 界面显示用的项目名称（去掉示例前缀） */
export const projectDisplayName = (name: string) =>
  (isDemoProjectName(name) ? name.slice(DEMO_PREFIX.length) : name).trim()

/** 项目头像首字：跳过括号、标点，英文转大写 */
export const projectInitial = (name: string) =>
  (projectDisplayName(name).match(/[\p{L}\p{N}]/u)?.[0] ?? '项').toUpperCase()

/**
 * 项目内显示的报价名称：报价名常以项目名开头（如「XX 方案 报价（不含灯具）」），
 * 在已经显示项目名的地方去掉重复部分。去完为空时回落为「报价」。
 */
export const quoteShortTitle = (title: string, projectName: string | null | undefined) => {
  if (!projectName) return title
  const short = title.replace(projectName, '').replace(projectDisplayName(projectName), '').trim()
  return short || '报价'
}
