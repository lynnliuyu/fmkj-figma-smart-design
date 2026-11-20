'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { checkBrowserSupport } from '@/lib/browser-check'
import {
  BANNER_ELEMENT_ID,
  BANNER_LINK_STYLE,
  BANNER_OFFSET_PROPERTY,
  BANNER_STYLE,
  CLOSE_BUTTON_STYLE,
} from '@/lib/browser-warn-style'

/**
 * 旧浏览器提醒（issue #188）。
 *
 * - 逻辑在 `lib/browser-check.ts`（纯函数，可单测）：能力优先（@scope/CSS.supports），
 *   仅当「能力不足 + Chromium 内核 < 118」才告警；未知浏览器不误报。
 * - 组件自身用最保守的实现：只在客户端运行；文案由内联早期脚本也注入一次
 *   （见 layout 的 BROWSER_WARN_INIT_SCRIPT），这样即使 App chunk/CSS 加载失败，
 *   Edge 100 仍能看到提示。
 * - 提示可关闭（localStorage 记忆，30 天内的升级流不再打扰）；不记录访问者信息，不上报 UA。
 */
const BROWSER_WARN_STORAGE_KEY = 'fmkj:browser-warn-dismissed-until'

export function BrowserWarningBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof checkBrowserSupport>>({
    decision: 'unknown',
  })

  useEffect(() => {
    // 早期内联脚本（BROWSER_WARN_INIT_SCRIPT）已注入同一个提示时，不再重复渲染。
    if (document.getElementById(BANNER_ELEMENT_ID)) {
      setDismissed(true)
      return
    }
    setResult(checkBrowserSupport())
    try {
      const until = Number(localStorage.getItem(BROWSER_WARN_STORAGE_KEY) || '0')
      if (until && Date.now() < until) setDismissed(true)
    } catch {
      /* 隐私模式：忽略存储失败，每天最多提示一次由本地状态控制 */
    }
  }, [])

  const warn = useMemo(
    () =>
      result.decision === 'too-old'
        ? `您的浏览器版本过旧（${result.info}），界面可能显示异常。`
        : '',
    [result],
  )
  const bannerRef = useRef<HTMLDivElement>(null)
  const visible = Boolean(warn) && !dismissed

  useLayoutEffect(() => {
    const banner = bannerRef.current
    if (!visible || !banner) return
    const rootStyle = document.documentElement.style
    const reserve = () => {
      rootStyle.setProperty(BANNER_OFFSET_PROPERTY, `${banner.offsetHeight}px`)
    }
    reserve()
    window.addEventListener('resize', reserve)
    return () => {
      window.removeEventListener('resize', reserve)
      rootStyle.removeProperty(BANNER_OFFSET_PROPERTY)
    }
  }, [visible])

  if (!warn || dismissed) return null

  return (
    <div ref={bannerRef} role="status" aria-live="polite" style={BANNER_STYLE}>
      {warn}
      更新方法：
      <a
        href="https://www.microsoft.com/edge"
        target="_blank"
        rel="noreferrer"
        style={BANNER_LINK_STYLE}
      >
        Edge 设置 → 关于 Microsoft Edge
      </a>
      / Chrome 设置 → 关于 Chrome，更新后刷新页面。
      <button
        type="button"
        aria-label="关闭浏览器过旧提示"
        style={CLOSE_BUTTON_STYLE}
        onClick={() => {
          setDismissed(true)
          try {
            localStorage.setItem(BROWSER_WARN_STORAGE_KEY, String(Date.now() + 30 * 864e5))
          } catch {
            /* 忽略 */
          }
        }}
      >
        ✕
      </button>
    </div>
  )
}
