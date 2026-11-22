/**
 * 外观：颜色模式（浅色 / 深色 / 跟随系统，由 next-themes 管理）。
 *
 * 2026-11-21：用户拍板「全站统一官方灰调，不要自写品牌色」，原「主题风格」
 * （`data-accent`：官网 / 繁梦紫 / 青碧 / 经典）整套删除。页面配色只由
 * `:root` / `.dark` 的语义 token 与 Astryx 官方主题决定，不再有第二套 accent。
 */

/**
 * 旧版本写下的 accent 值。留着只是为了把历史 localStorage 里的脏值清掉——
 * 读取时如果命中这里，就当作「没有选择」。
 */
export const RETIRED_ACCENTS = ['official', 'fanmeng', 'jade', 'classic'] as const
