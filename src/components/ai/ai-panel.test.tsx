// @vitest-environment happy-dom
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// React 19 的 act() 需要显式声明测试环境。
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))

// 外壳测试不加载真实 dock（它会发会话请求）；只保留 collapsed / 收起 / 关闭
// 回调的接线，并复刻一条 header 供抽屉结构与关闭按钮的断言使用。
vi.mock('./ai-sidebar-dock', () => ({
  AiSidebarDock: ({
    collapsed,
    onToggleCollapsed,
    onClose,
  }: {
    collapsed?: boolean
    onToggleCollapsed?: () => void
    onClose?: () => void
  }) => (
    <div data-slot="ai-panel-header">
      <button
        type="button"
        data-testid="dock-stub"
        data-collapsed={collapsed ? 'true' : 'false'}
        aria-label={collapsed ? '展开 AI 对话' : '收起 AI 对话'}
        onClick={onToggleCollapsed}
      />
      {onClose ? <button type="button" aria-label="关闭 AI 对话" onClick={onClose} /> : null}
    </div>
  ),
}))

vi.mock('next/dynamic', async () => {
  const { AiSidebarDock } = await import('./ai-sidebar-dock')
  return { default: () => AiSidebarDock }
})

// 视口宽度可切换：1600 = 常驻列，1280 = 抽屉。
const viewport = vi.hoisted(() => ({ width: 1600 }))
vi.mock('@/hooks/use-viewport-width', () => ({ useViewportWidth: () => viewport.width }))

import { AiPanel, AiPanelProvider, AiPanelToggle } from './ai-panel'
import { AI_PANEL_COLLAPSED_WIDTH, AI_PANEL_DEFAULT_WIDTH } from '@/lib/ai-panel-width'

let container: HTMLDivElement
let root: Root

async function mount(ui: React.ReactElement) {
  await act(async () => {
    root.render(ui)
    // 让 dynamic、localStorage 回读的 effect 都跑完。
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  window.localStorage.clear()
  viewport.width = 1600
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  window.localStorage.clear()
})

describe('AiPanel 外壳收起态', () => {
  it('收起时 resizer 隐藏，内容层仍保持展开宽度', async () => {
    window.localStorage.setItem('fmkj:ai-panel-collapsed', '1')
    window.localStorage.setItem('fmkj:ai-panel-width', String(AI_PANEL_DEFAULT_WIDTH))

    await mount(
      <AiPanelProvider enabled>
        <AiPanel plugins={[]} projects={[]} credits={10} configured models={[]} userId="user-1" />
      </AiPanelProvider>,
    )

    const resizer = container.querySelector('[data-slot="ai-panel-resizer"]') as HTMLButtonElement
    const aside = container.querySelector('[data-slot="ai-panel"]') as HTMLElement
    const surface = container.querySelector('[data-slot="ai-panel-surface"]') as HTMLElement
    expect(resizer).toBeTruthy()
    expect(aside).toBeTruthy()
    expect(surface).toBeTruthy()

    expect(resizer.hidden).toBe(true)
    expect(aside.style.width).toBe(`${AI_PANEL_COLLAPSED_WIDTH}px`)
    const expandedSurfaceWidth = surface.style.width
    expect(expandedSurfaceWidth).toBe(`${AI_PANEL_DEFAULT_WIDTH}px`)

    const stub = container.querySelector('[data-testid="dock-stub"]') as HTMLButtonElement
    expect(stub.getAttribute('data-collapsed')).toBe('true')
    await act(async () => {
      stub.click()
      await Promise.resolve()
    })

    expect(resizer.hidden).toBe(false)
    expect(aside.style.width).toBe(`${AI_PANEL_DEFAULT_WIDTH}px`)
    expect(
      (container.querySelector('[data-slot="ai-panel-surface"]') as HTMLElement).style.width,
    ).toBe(expandedSurfaceWidth)
  })
})

describe('AiPanel 窄屏模式（#190：不再抽屉，/ai 整页承接）', () => {
  it('视口 <1024：右栏不渲染，也不出现任何 Sheet/抽屉', async () => {
    viewport.width = 900
    await mount(
      <AiPanelProvider enabled>
        <AiPanel plugins={[]} projects={[]} credits={10} configured models={[]} userId="user-1" />
      </AiPanelProvider>,
    )
    expect(container.querySelector('[data-slot="ai-panel"]')).toBeNull()
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
  })

  it('1280（原抽屉断点）：右栏常驻参与布局，没有 Sheet/backdrop', async () => {
    viewport.width = 1280
    await mount(
      <AiPanelProvider enabled>
        <AiPanel plugins={[]} projects={[]} credits={10} configured models={[]} userId="user-1" />
      </AiPanelProvider>,
    )
    const aside = container.querySelector('[data-slot="ai-panel"]') as HTMLElement
    expect(aside).toBeTruthy()
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    // 参与布局：sticky 流式列而非 fixed 遮挡
    expect(aside.className).toContain('sticky')
  })
})
