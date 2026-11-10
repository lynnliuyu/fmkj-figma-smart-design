/**
 * Astryx 组件主题（6 套官方主题 + 繁梦紫定制主题）。
 *
 * 与「主题风格」（`lib/appearance.ts` 的 accent）是**两套独立的东西**，别混：
 *
 * | | 主题风格 (accent) | 组件主题 (Astryx theme) |
 * |---|---|---|
 * | 写在哪 | `<html data-accent>` | `<Theme>` 渲染出的 `data-astryx-theme` |
 * | 管什么 | 页面级 Tailwind 变量（`--primary` 等） | 官方组件的 token（按钮圆角、强调色…） |
 * | 选项 | 官网 / 繁梦紫 / 青碧 / 经典 | 6 套（见 `astryx-themes.ts`）|
 *
 * 为什么不能只改 `<html>` 属性：`<Theme>` 会在**内层 `<div>`** 上再写一份
 * `data-astryx-theme`，而主题 CSS 是 `@scope ([data-astryx-theme="X"])` ——
 * 内层离组件更近，会遮蔽 `<html>` 上的值。
 * 实测：只改 `<html>` → 组件仍是旧主题；两处都改 → 才生效。
 * 所以必须让 React 的 `<Theme theme={…}>` 自己换，本模块只负责「记住选择 + 提供上下文」。
 */
import { themes, defaultThemeSlug, type ThemeSlug } from '@/astryx-themes'

export type AstryxThemeId = ThemeSlug

/** 展示用的元数据。顺序 = 设置页里的排列顺序。 */
export const ASTRYX_THEMES = [
  { id: 'stone', label: '石灰', description: '默认：近黑强调，圆角克制' },
  { id: 'neutral', label: '中性', description: '纯灰阶，最安静' },
  { id: 'butter', label: '黄油', description: '亮蓝强调，明快' },
  { id: 'matcha', label: '抹茶', description: '橄榄绿，沉稳' },
  { id: 'chocolate', label: '可可', description: '暖棕，厚重' },
  { id: 'fanmeng', label: '繁梦紫', description: '品牌紫，有梦想感' },
] as const satisfies ReadonlyArray<{ id: AstryxThemeId; label: string; description: string }>

/** 每套主题的浅色强调色（从各主题编译产物 theme.css 的 `--color-accent` 读出），用于缩略图色块。 */
export const ASTRYX_SWATCH: Record<AstryxThemeId, string> = {
  neutral: '#1b1b1b',
  stone: '#25252a',
  butter: '#225bff',
  matcha: '#3e481d',
  chocolate: '#8c5927',
  fanmeng: '#5447df',
}

export const DEFAULT_ASTRYX_THEME: AstryxThemeId = defaultThemeSlug
export const ASTRYX_THEME_STORAGE_KEY = 'fmkj-astryx-theme'

export const isAstryxTheme = (v: unknown): v is AstryxThemeId =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(themes, v)

/**
 * 在 `<head>` 里尽早执行：把上次选择的组件主题写到 `<html data-astryx-theme>`。
 *
 * 这一句能**消除首屏闪烁**：SSR 渲染的 `<Theme>` 用的是默认主题，
 * 若等 hydration 后才换，用户会先看到默认主题闪一下。
 * 之所以敢写 `<html>`（虽然内层 `<div>` 会遮蔽它），是因为hydration 后
 * `<Theme theme={…}>` 会立刻把两处都改成同一个值，两者不冲突。
 */
export const ASTRYX_THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${ASTRYX_THEME_STORAGE_KEY}');var v=['neutral','stone','butter','matcha','chocolate','fanmeng'];document.documentElement.setAttribute('data-astryx-theme',v.indexOf(t)>-1?t:'${defaultThemeSlug}')}catch(e){}})()`
