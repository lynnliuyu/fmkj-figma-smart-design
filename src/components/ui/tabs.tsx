'use client'

import * as React from 'react'
import { Tab, TabList } from '@astryxdesign/core/TabList'

import { cn } from '@/lib/utils'

/**
 * 标签页：内部换成 Astryx 官方 TabList / Tab，对外保留本仓的复合 API。
 *
 * ## 为什么必须保留复合结构
 *
 * 官方模型是「TabList 自己管选中态 + Tab 只声明 value」；
 * 本仓（radix）把状态放在 `Tabs` 上，`TabsTrigger` 与 `TabsContent` 分别订阅 ——
 * 而且 **`TabsContent` 要做条件渲染**（同时只挂载选中的那一块，10 处调用依赖这点）。
 * 官方没有 TabsContent 的概念，所以状态必须留在本仓这层。
 *
 * 解法：`Tabs` 提供 `{value, setValue}` 的 context；`TabsList` 把官方 TabList 的
 * `value`/`onChange` 接到这个 context；`TabsTrigger` / `TabsContent` 从 context 读选中态。
 * → **13 处 `Tabs`、21 处 `TabsTrigger`、10 处 `TabsContent` 的写法都不用改**。
 *
 * ⚠️ 官方 TabList 的 children 只认 `Tab`，若直接把本仓的 `TabsTrigger` 塞进去会报错，
 * 所以 `TabsList` 渲染时遍历 children，把每个 `TabsTrigger` 的 `value`/文案摘出来
 * 换成官方 `<Tab>`。
 */

type TabsCtx = { value: string; setValue: (v: string) => void }

const Ctx = React.createContext<TabsCtx | null>(null)
const useTabs = () => React.useContext(Ctx)

function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  className?: string
  children?: React.ReactNode
}) {
  const [inner, setInner] = React.useState(defaultValue ?? '')
  const current = value ?? inner

  const ctx = React.useMemo<TabsCtx>(
    () => ({
      value: current,
      setValue: (v) => {
        if (value === undefined) setInner(v)
        onValueChange?.(v)
      },
    }),
    [current, value, onValueChange],
  )

  return (
    <Ctx.Provider value={ctx}>
      <div
        data-slot="tabs"
        data-orientation="horizontal"
        className={cn('flex flex-col gap-2', className)}
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}

/** radix 的 Trigger 外壳：只承载 value 与文案，真正的渲染在 `TabsList` 里换成官方 Tab。 */
function TabsTrigger({
  value,
  children,
}: {
  value: string
  children?: React.ReactNode
  className?: string
  disabled?: boolean
}) {
  // 单独使用时（不在 TabsList 里）退化成可点击的普通标签
  const ctx = useTabs()
  const active = ctx?.value === value

  return (
    <button
      type="button"
      data-slot="tabs-trigger"
      data-active={active ? '' : undefined}
      onClick={() => ctx?.setValue(value)}
      className="inline-flex h-8 items-center justify-center rounded-[var(--radius-element)] px-2.5 text-sm font-medium"
    >
      {children}
    </button>
  )
}

function TabsList({
  className,
  children,
  variant: _variant,
  'aria-label': ariaLabel,
}: {
  className?: string
  children?: React.ReactNode
  variant?: 'default' | 'line'
  'aria-label'?: string
}) {
  const ctx = useTabs()

  // 把本仓的 TabsTrigger 摘成官方的 {value, label} 列表
  const items: {
    value: string
    label: string
    node: React.ReactNode
    end?: React.ReactNode
    icon?: React.ReactNode
  }[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const p = child.props as { value?: string; children?: React.ReactNode }
    if (typeof p.value === 'string') {
      // 首个子节点若是图标（无文本的元素），摘到官方 Tab 的 `icon` 插槽 ——
      // 否则它会被当作文本丢掉（实测侧边栏「导航 / AI 对话」的图标就是这么没的）。
      const { icon, rest } = splitLeadingIcon(p.children)
      // 文案里带「(12)」这类计数的，把括号部分拆出来做 endContent —— 官方 Tab 的
      // label 只接受字符串，实测直接把 ReactNode 塞进去会运行时被当成 [object Object]。
      const { main, end } = splitCount(rest)
      items.push({ value: p.value, label: main, node: rest, end, icon })
    }
  })

  /*
   * ⚠️ `layout` 必须跟着调用点的意图走。
   *
   * 官方 TabList 默认 `layout="hug"`（每个 tab 只贴合自身文字宽度）。
   * 而本仓的调用点普遍写 `grid w-full grid-cols-3`，意思是「三等分撑满」——
   * 若这里写死 hug，容器只有内容宽（实测 111px），三个 80px 的 tab 装不下，
   * **渲染出来只剩一个 tab + 两侧箭头，看起来像「用箭头翻页」**。
   * （2026-11-10 实测：报价区的「报价版式 6 选 1」「视觉风格 7 选 1」就是这样退化成箭头的。）
   *
   * 判断依据：className 里出现 `w-full` / `grid-cols-` → 要撑满，用 fill。
   */
  const wantsFill = Boolean(className && /(^|\s)(w-full|grid-cols-)/.test(className))

  /*
   * 统一的分段控件外观（segmented control）。
   *
   * 官方 TabList 默认渲染成「文字 + 选中下划线」，那是**页面级导航**的语言；
   * 而本仓的 Tabs 几乎都用在「几种互斥选项里选一个」的场景（报价版式 6 选 1、
   * 方案结构 3 选 1、侧边栏 导航/AI 对话），读者预期的是**分段控件**（灰槽 + 白底实心选中）。
   *
   * 之前没给这层基础样式，结果侧边栏那两个 tab 看起来像两行普通菜单文字，
   * 跟下面的「工作台 / 能力中心」分不开 —— 这就是 owner 说的「侧边栏有问题」。
   *
   * 这里把「灰底 + 内边距 + 圆角」放到容器上，选中态的实心白底交给官方 Tab 自己画
   * （它的 active 态本来就有背景）。调用点传 `bg-muted p-0.5` 之类的仍可覆盖。
   */
  return (
    <div
      data-slot="tabs-list"
      className={cn(
        'w-full rounded-[var(--radius-element)] bg-muted p-0.5',
        // 调用点自己声明了背景/内边距就尊重它（避免和我这层打架）
        /(^|\s)bg-/.test(className ?? '') && 'bg-transparent',
        /(^|\s)p-[\d.]/.test(className ?? '') && 'p-0',
        className,
      )}
    >
      <TabList
        value={ctx?.value ?? ''}
        onChange={(v) => ctx?.setValue(v)}
        size="md"
        layout={wantsFill ? 'fill' : 'hug'}
        role="tablist"
        hasDivider={false}
        aria-label={ariaLabel ?? '标签页'}
        className="w-full"
      >
        {items.map((it) => (
          // 官方 Tab 不收 children：文案走 `label`（同时是无障碍名称），
          // 额外的富内容（如「(12)」计数）走 `endContent`。
          <Tab
            key={it.value}
            value={it.value}
            label={it.label || it.value}
            isLabelHidden={!it.label}
            icon={it.icon as never}
            endContent={it.end as never}
          />
        ))}
      </TabList>
    </div>
  )
}

function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children?: React.ReactNode
  className?: string
}) {
  const ctx = useTabs()
  // 条件渲染：同时只挂载选中的那一块（与原 radix 行为一致）
  if (ctx?.value !== value) return null
  return (
    <div
      data-slot="tabs-content"
      role="tabpanel"
      className={cn('flex-1 text-sm outline-none', className)}
    >
      {children}
    </div>
  )
}

/**
 * 摘出首个子节点里的图标元素（官方 Tab 的 `icon` 插槽）。
 * 判断保守：只有「是元素且自身不含文本」才当图标，拿不准就不摘。
 */
function splitLeadingIcon(children: React.ReactNode): {
  icon?: React.ReactNode
  rest: React.ReactNode
} {
  const arr = Array.isArray(children) ? children : [children]
  const first = arr[0]
  if (!React.isValidElement(first) || textOf(first)) return { rest: children }
  return { icon: first, rest: arr.slice(1) }
}

/**
 * 把 `客户使用明细 (12)` 拆成 label `客户使用明细` + endContent `12`。
 * 拆不出括号计数时 end 为 undefined，label 仍是完整文本。
 */
function splitCount(node: React.ReactNode): { main: string; end?: React.ReactNode } {
  const full = textOf(node)
  const m = /^(.*?)\s*[（(](\d+)[）)]\s*$/.exec(full)
  if (!m) return { main: full }
  return { main: m[1].trim(), end: m[2] }
}

/** 从 children 里抽纯文本，供官方 Tab 的 label（无障碍名称）使用。 */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
