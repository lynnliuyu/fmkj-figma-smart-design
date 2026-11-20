import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { BROWSER_WARN_INIT_SCRIPT } from './browser-check'
import {
  BANNER_ELEMENT_ID,
  BANNER_OFFSET_CSS,
  BANNER_OFFSET_PROPERTY,
  BANNER_STYLE,
  BANNER_STYLE_CSS,
  CLOSE_BUTTON_STYLE,
  CLOSE_BUTTON_STYLE_CSS,
  toCssText,
} from './browser-warn-style'

/**
 * 旧浏览器横幅两版样式一致性（#204）。
 *
 * 横幅有两份实现：React 版（`components/browser-warning.tsx`）与内联脚本版
 * （`BROWSER_WARN_INIT_SCRIPT`）。两版各写一遍样式必然漂移——之前关闭按钮的
 * 命中区就只有 22.7×28，窄屏点不到。这里锁住三件事：
 *
 * 1. 内联脚本确实用的是共享常量，没有回退成手写字符串；
 * 2. 共享常量本身满足触屏尺寸与「不覆盖顶栏」的要求；
 * 3. `toCssText()` 能把样式对象正确序列化（内联版靠它生成样式）。
 */
describe('browser warning style', () => {
  it('内联脚本引用共享样式，而不是手写一份', () => {
    expect(BROWSER_WARN_INIT_SCRIPT).toContain(BANNER_STYLE_CSS)
    expect(BROWSER_WARN_INIT_SCRIPT).toContain(CLOSE_BUTTON_STYLE_CSS)
    // 旧的手写声明不应再出现在脚本里
    expect(BROWSER_WARN_INIT_SCRIPT).not.toContain('position:fixed;left:0;right:0;top:0')
    expect(BROWSER_WARN_INIT_SCRIPT).not.toContain('padding:4px 6px')
  })

  it('关闭按钮命中区不小于 44×44，且带可访问名称', () => {
    expect(CLOSE_BUTTON_STYLE.minWidth).toBe(44)
    expect(CLOSE_BUTTON_STYLE.minHeight).toBe(44)
    expect(CLOSE_BUTTON_STYLE_CSS).toContain('min-width:44px')
    expect(CLOSE_BUTTON_STYLE_CSS).toContain('min-height:44px')
    expect(BROWSER_WARN_INIT_SCRIPT).toContain('关闭浏览器过旧提示')
  })

  it('横幅固定顶部，但不靠覆盖顶栏实现——靠给 body 让位', () => {
    // 固定定位是必须的：内联脚本在 body 末尾追加，sticky/文档流会落到页面最底部；
    // 插到 body 最前又会和 React 水合冲突（实测 Hydration failed）。
    expect(BANNER_STYLE.position).toBe('fixed')
    expect(BANNER_STYLE.top).toBe(0)
    expect(BANNER_STYLE_CSS).toContain('position:fixed')
    // 补偿逻辑必须在两版里都存在，否则横幅会重新盖住顶栏
    const banner = readFileSync(
      new URL('../components/browser-warning.tsx', import.meta.url),
      'utf8',
    )
    expect(banner).toContain('document.getElementById(BANNER_ELEMENT_ID)')
    expect(banner).toContain('document.documentElement.style')
    expect(banner).toContain('rootStyle.setProperty(BANNER_OFFSET_PROPERTY,')
    expect(banner).toContain('rootStyle.removeProperty(BANNER_OFFSET_PROPERTY)')
    expect(BROWSER_WARN_INIT_SCRIPT).toContain(`d.id='${BANNER_ELEMENT_ID}'`)
    expect(BROWSER_WARN_INIT_SCRIPT).toContain(
      `root.style.setProperty('${BANNER_OFFSET_PROPERTY}',`,
    )
    expect(BROWSER_WARN_INIT_SCRIPT).toContain(
      `root.style.removeProperty('${BANNER_OFFSET_PROPERTY}')`,
    )
    expect(BROWSER_WARN_INIT_SCRIPT).not.toContain('document.body.style')
    expect(BANNER_OFFSET_CSS).toBe(`body{padding-top:var(${BANNER_OFFSET_PROPERTY},0px)}`)
  })

  it('横幅右侧为关闭按钮留出足够内边距', () => {
    const paddingRight = Number(BANNER_STYLE.paddingRight)
    const buttonWidth = Number(CLOSE_BUTTON_STYLE.minWidth)
    expect(paddingRight).toBeGreaterThanOrEqual(buttonWidth)
  })

  it('toCssText 把 camelCase 转成 kebab-case 并给数字加 px', () => {
    expect(toCssText({ minWidth: 44, background: '#7f1d1d' })).toBe(
      'min-width:44px;background:#7f1d1d',
    )
    // 不写 px 的单位会原样保留
    expect(toCssText({ font: '14px/1.5 sans-serif' })).toBe('font:14px/1.5 sans-serif')
  })

  it('内联版用 right 兜底逻辑属性，兼容旧内核', () => {
    expect(CLOSE_BUTTON_STYLE_CSS).not.toContain('inset-inline-end')
    expect(CLOSE_BUTTON_STYLE_CSS).toContain('right:4px')
  })
})
