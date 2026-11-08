'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'

import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, isAccent, type AccentId } from '@/lib/appearance'

type AccentContextValue = { accent: AccentId; setAccent: (accent: AccentId) => void }
const AccentContext = React.createContext<AccentContextValue>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
})

/** 主题风格（强调色）：写到 <html data-accent> 并记住选择。 */
function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = React.useState<AccentId>(DEFAULT_ACCENT)

  React.useEffect(() => {
    const current = document.documentElement.getAttribute('data-accent')
    if (isAccent(current)) setAccentState(current)
  }, [])

  const setAccent = React.useCallback((next: AccentId) => {
    setAccentState(next)
    document.documentElement.setAttribute('data-accent', next)
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, next)
    } catch {
      // 隐私模式下无法写入时，本次会话内仍然生效
    }
  }, [])

  const value = React.useMemo(() => ({ accent, setAccent }), [accent, setAccent])
  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>
}

export function useAccent() {
  return React.useContext(AccentContext)
}

function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      <AccentProvider>{children}</AccentProvider>
    </NextThemesProvider>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key?.toLowerCase() !== 'd') {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider }
