'use client'

import * as React from 'react'

/**
 * 工作区外壳的共享状态（当前只有侧栏折叠态）。
 *
 * AppShell / SideNav 是受控折叠（controlled collapsible），把状态放在这里
 * 是为了让页面（点位图画布）也能主动收起侧栏、离开时恢复——原来的
 * shadcn sidebar 用 Provider 暴露 `open/setOpen`，迁移后行为保持一致。
 */
type WorkspaceChromeValue = {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
}

const WorkspaceChromeContext = React.createContext<WorkspaceChromeValue>({
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
})

const STORAGE_KEY = 'fmkj:sidebar-collapsed'

export function WorkspaceChromeProvider({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)

  // 首帧固定展开（SSR 一致），挂载后读回上次选择。
  React.useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // 隐私模式下读不到就保持默认
    }
  }, [])

  const setSidebarCollapsedPersisted = React.useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // 写失败不影响本次会话
    }
  }, [])

  const value = React.useMemo(
    () => ({ sidebarCollapsed, setSidebarCollapsed: setSidebarCollapsedPersisted }),
    [sidebarCollapsed, setSidebarCollapsedPersisted],
  )
  return <WorkspaceChromeContext.Provider value={value}>{children}</WorkspaceChromeContext.Provider>
}

export function useWorkspaceChrome() {
  return React.useContext(WorkspaceChromeContext)
}
