import type { CSSProperties } from 'react'

/**
 * 旧浏览器提示横幅的样式（issue #188 / #204）。
 *
 * ## 为什么不用 Astryx 组件
 *
 * 这条横幅的使命是「CSS/JS 失效的旧内核也能显示出来」。用组件库会把它和组件库的
 * 样式/脚本绑在一起——一旦那些资源加载失败，提示本身也就没了。所以它是
 * **「简化统一用 Astryx」这条原则的明确例外**，不是遗漏；请不要为了统一把它改回组件。
 *
 * ## 为什么两版共用一份常量
 *
 * 横幅有两份实现：`components/browser-warning.tsx`（React 版）与
 * `lib/browser-check.ts` 里的 `BROWSER_WARN_INIT_SCRIPT`（内联脚本版，优先注入）。
 * 两版样式各写一遍必然漂移，所以样式统一放在这里：React 版直接用对象，
 * 内联版用 `toCssText()` 现场生成同样的声明。`browser-warn-style.test.ts` 会断言两者一致。
 */

/**
 * 横幅固定在视口顶部，但**不遮住内容**：显示时给 `<body>` 加等高的 `padding-top`，
 * 关闭时还原。这样顶栏与正文都被顶下来，不再被盖住（#204）。
 *
 * 为什么不用 sticky/文档流：内联脚本在 `document.body` 末尾追加节点，文档流方案会把横幅
 * 塞到页面最底部；插到 body 最前又会与 React 的水合顺序冲突（实测 "Hydration failed"）。
 * 固定定位 + 等高度补偿是唯一同时满足「旧内核可见」与「不遮顶栏」的做法。
 */
export const BANNER_STYLE: CSSProperties = {
  position: 'fixed',
  insetInline: 0,
  top: 0,
  zIndex: 2147483000,
  minHeight: 48,
  display: 'flex',
  alignItems: 'center',
  boxSizing: 'border-box',
  paddingTop: 6,
  paddingBottom: 6,
  // 右侧给关闭按钮留位（44 + 8）
  paddingLeft: 12,
  paddingRight: 56,
  background: '#7f1d1d',
  color: '#ffffff',
  font: '14px/1.5 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
}

/**
 * 关闭按钮：命中区 44×44（WCAG 2.5.5 的建议值），触屏可点。
 * 旧版只有 22.7×28，窄屏很难点中（#204）。
 */
export const CLOSE_BUTTON_STYLE: CSSProperties = {
  position: 'absolute',
  insetInlineEnd: 4,
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  minHeight: 44,
  padding: 0,
  background: 'transparent',
  border: 0,
  color: '#ffd9a8',
  cursor: 'pointer',
  font: '18px/1 sans-serif',
}

/** 内联脚本里要用的链接样式（只有 React 版有 `<a>`，这里保留给未来复用）。 */
export const BANNER_LINK_STYLE: CSSProperties = {
  color: '#ffd9a8',
  textDecoration: 'underline',
  margin: '0 2px',
}

const toKebab = (key: string) =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

const value = (v: string | number) => (typeof v === 'number' ? `${v}px` : v)

/**
 * 把 React 内联样式对象转成 `style.cssText` 能吃的字符串。
 * 只处理本文件用到的简单值（字符串/数字），不处理数组与嵌套。
 * 内联脚本必须用真实字符串（旧内核没有 React），所以只能这样共享。
 */
export function toCssText(style: CSSProperties): string {
  return (
    Object.entries(style)
      .filter(([, v]) => v !== undefined && v !== null)
      // `insetInlineEnd` 这类逻辑属性在 Chromium 87+ 才有，为兼容旧内核保留它，
      // 同时补一个 `right` 兜底（见 CLOSE_BUTTON_STYLE_CSS 的注释）。
      .map(([k, v]) => `${toKebab(k)}:${value(v as string | number)}`)
      .join(';')
  )
}

/** 内联脚本用的横幅样式字符串。 */
export const BANNER_STYLE_CSS = toCssText(BANNER_STYLE)

/** 内联脚本用的关闭按钮样式字符串（旧内核不认 insetInlineEnd，改用 right）。 */
export const CLOSE_BUTTON_STYLE_CSS = toCssText({
  ...CLOSE_BUTTON_STYLE,
  insetInlineEnd: undefined,
  right: 4,
} as CSSProperties)
