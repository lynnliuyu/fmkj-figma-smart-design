'use client'

import * as React from 'react'
import { Theme } from '@astryxdesign/core/theme'

import { themes } from '@/astryx-themes'
import {
  ASTRYX_THEME_STORAGE_KEY,
  DEFAULT_ASTRYX_THEME,
  isAstryxTheme,
  type AstryxThemeId,
} from '@/lib/astryx-theme'

type AstryxThemeContextValue = {
  themeId: AstryxThemeId
  setThemeId: (id: AstryxThemeId) => void
}

const AstryxThemeContext = React.createContext<AstryxThemeContextValue>({
  themeId: DEFAULT_ASTRYX_THEME,
  setThemeId: () => {},
})

export function useAstryxTheme() {
  return React.useContext(AstryxThemeContext)
}

/**
 * 组件主题（Astryx）的 Provider。
 *
 * ⚠️ 必须由 React 渲染 `<Theme>`，**不能只改 `<html data-astryx-theme>` 属性**：
 * `<Theme>` 会在内层 `<div>` 上再写一份该属性，而主题 CSS 是
 * `@scope ([data-astryx-theme="X"])` —— 内层离组件更近，会遮蔽 `<html>`。
 * （实测：只改 `<html>` → 组件不变；两处都改 → 才生效。）
 *
 * 首屏不闪：`<head>` 里的 `ASTRYX_THEME_INIT_SCRIPT` 先把值写到 `<html>`，
 * 这里 hydration 后立刻用同一个值渲染 `<Theme>`，两处保持一致。
 */
export function AstryxThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = React.useState<AstryxThemeId>(DEFAULT_ASTRYX_THEME)

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(ASTRYX_THEME_STORAGE_KEY)
      if (isAstryxTheme(saved)) setThemeIdState(saved)
    } catch {
      // 隐私模式下读不到，保持默认主题
    }
  }, [])

  const setThemeId = React.useCallback((next: AstryxThemeId) => {
    setThemeIdState(next)
    try {
      localStorage.setItem(ASTRYX_THEME_STORAGE_KEY, next)
    } catch {
      // 隐私模式下无法写入时，本次会话内仍然生效
    }
  }, [])

  const value = React.useMemo(() => ({ themeId, setThemeId }), [themeId, setThemeId])

  return (
    <AstryxThemeContext.Provider value={value}>
      <Theme theme={themes[themeId]}>{children}</Theme>
    </AstryxThemeContext.Provider>
  )
}
