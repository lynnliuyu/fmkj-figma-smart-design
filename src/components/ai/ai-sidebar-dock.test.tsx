// @vitest-environment happy-dom
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// React 19 的 act() 需要显式声明测试环境，否则每个副作用都会刷一条警告。
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// 面板在浏览器里依赖 App Router 的当前路径与路由对象；组件测试只关心 DOM 行为。
vi.mock('next/navigation', () => ({
  usePathname: () => '/projects',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))

import { AiSidebarDock } from './ai-sidebar-dock'
import { DEFAULT_AI_TEMPLATES } from '@/plugins/ai-copilot/templates'

const baseProps = {
  plugins: [],
  projects: [],
  credits: 1234,
  configured: true,
  userId: 'user-1',
}

/** 受控的收起态：让测试像真实面板一样在展开/收起之间切换。 */
function DockHarness({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed)
  return (
    <AiSidebarDock
      {...baseProps}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((value) => !value)}
    />
  )
}

let container: HTMLDivElement
let root: Root

async function mount(ui: React.ReactElement) {
  await act(async () => {
    root.render(ui)
    // 让挂载 effect（会话列表请求 / 滚动定位）跑完，避免 act 警告。
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ conversations: [] }), { status: 200 })),
  )
  // happy-dom 不实现元素的滚动方法；dock 挂载后会滚到底部。
  if (!Element.prototype.scrollTo) {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: () => {}, writable: true })
  }
  if (!globalThis.ResizeObserver) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  }
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('AiSidebarDock 收起态（右栏图标栏）', () => {
  it('渲染一列图标按钮，每个都有 aria-label，内容区 inert', async () => {
    await mount(<DockHarness initialCollapsed />)

    const header = container.querySelector('[data-slot="ai-panel-header"]')
    expect(header).toBeTruthy()
    for (const label of ['展开 AI 对话', '新对话', '会话历史', '更多']) {
      expect(header?.querySelector(`[aria-label="${label}"]`)).toBeTruthy()
    }

    const content = container.querySelector('[data-slot="ai-panel-content"]')
    expect(content?.hasAttribute('inert')).toBe(true)
  })

  it('收起态点击「新对话」结束当前会话', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/ai/conversations') {
          return new Response(JSON.stringify({ conversations: [{ id: 'c1', title: '旧对话' }] }), {
            status: 200,
          })
        }
        if (url === '/ai/conversations/c1') {
          return new Response(JSON.stringify({ ok: true, messages: [] }), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      }),
    )

    await mount(<DockHarness initialCollapsed />)

    const historyButton = container.querySelector(
      '[data-slot="ai-panel-header"] [aria-label="会话历史"]',
    ) as HTMLButtonElement
    await act(async () => {
      historyButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const conversationItem = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"], button'),
    ).find((element) => element.textContent?.includes('旧对话'))
    expect(conversationItem).toBeTruthy()

    await act(async () => {
      conversationItem?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    // 展开后标题变成刚打开的会话，再点「新对话」应回到「新对话」。
    const expandButton = container.querySelector(
      '[data-slot="ai-panel-header"] [aria-label="展开 AI 对话"]',
    ) as HTMLButtonElement
    await act(async () => {
      expandButton.click()
      await Promise.resolve()
    })
    expect(
      container.querySelector('[data-slot="ai-panel-header"] [aria-label="AI 对话：旧对话"]'),
    ).toBeTruthy()

    const newButton = container.querySelector(
      '[data-slot="ai-panel-header"] [aria-label="新对话"]',
    ) as HTMLButtonElement
    await act(async () => {
      newButton.click()
      await Promise.resolve()
    })
    expect(
      container.querySelector('[data-slot="ai-panel-header"] [aria-label="AI 对话：新对话"]'),
    ).toBeTruthy()
  })

  it('展开/收起复用同一个按钮节点，焦点不丢', async () => {
    await mount(<DockHarness initialCollapsed />)

    const expandButton = container.querySelector(
      '[data-slot="ai-panel-header"] [aria-label="展开 AI 对话"]',
    ) as HTMLButtonElement
    expect(expandButton).toBeTruthy()

    await act(async () => {
      expandButton.focus()
      expandButton.click()
      await Promise.resolve()
    })

    const collapseButton = container.querySelector(
      '[data-slot="ai-panel-header"] [aria-label="收起 AI 对话"]',
    ) as HTMLButtonElement
    expect(collapseButton).toBe(expandButton)
    expect(document.activeElement).toBe(expandButton)

    const content = container.querySelector('[data-slot="ai-panel-content"]')
    expect(content?.hasAttribute('inert')).toBe(false)
  })
})

describe('AiSidebarDock 抽屉模式', () => {
  it('只渲染一条 header：右侧是关闭按钮，点击触发 onClose', async () => {
    const onClose = vi.fn()
    await mount(<AiSidebarDock {...baseProps} onClose={onClose} />)

    const header = container.querySelector('[data-slot="ai-panel-header"]')
    expect(header).toBeTruthy()

    const closeButton = header?.querySelector('[aria-label="关闭 AI 对话"]') as HTMLButtonElement
    expect(closeButton).toBeTruthy()
    await act(async () => {
      closeButton.click()
      await Promise.resolve()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('AiSidebarDock 空态（常用任务）', () => {
  it('渲染「常用任务」分组行，点选后把模板填进输入框', async () => {
    await mount(<DockHarness />)

    expect(container.textContent).toContain('常用任务')

    const first = DEFAULT_AI_TEMPLATES[0]
    const row = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(first.name),
    ) as HTMLButtonElement
    expect(row).toBeTruthy()

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('')

    await act(async () => {
      row.click()
      await Promise.resolve()
    })
    expect(textarea.value.length).toBeGreaterThan(0)
  })

  it('会话接口请求失败（无桥接 / 离线）也能渲染', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )

    await mount(<DockHarness />)
    expect(container.querySelector('[data-slot="ai-panel-header"]')).toBeTruthy()
  })
})
