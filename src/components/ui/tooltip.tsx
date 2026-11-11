'use client'

import * as React from 'react'
import { Tooltip as AstryxTooltip } from '@astryxdesign/core/Tooltip'

/**
 * 气泡提示：内部换成 Astryx 官方 Tooltip。
 *
 * ## 模型差异
 *
 * radix 是**三段式**：`<Tooltip><TooltipTrigger>触发物</TooltipTrigger><TooltipContent>文案</TooltipContent></Tooltip>`
 * （内容可以放任意 JSX、带箭头、可 Portal）。
 * 官方是**单体**：`<Tooltip content={...}>{触发物}</Tooltip>`。
 *
 * 为了让 8 处调用点不改结构，这里在 `TooltipProvider` 里把三段式**解析回**官方的两段式：
 * 从子元素里认出 `TooltipTrigger` 的 children（触发物）和 `TooltipContent` 的 children（文案）。
 *
 * ## 为什么 Provider 是空壳
 *
 * radix 需要一个 Provider 传递 delayDuration 等上下文；官方把 delay 收进单个 Tooltip。
 * 保留 Provider 导出只是为了让既有 import 不断掉。`delayDuration` 在这里被忽略 ——
 * 官方默认 200ms 延迟，而本仓原来设的是 0（立即显示）。为了不改变手感，
 * 下面把官方的 `delay` 显式设为 0。
 */

/** radix 式的 Provider；官方无此概念，这里只做占位以保留 API。 */
export function TooltipProvider({
  children,
}: {
  children?: React.ReactNode
  delayDuration?: number
}) {
  return <>{children}</>
}

/**
 * radix 式的 Trigger；只作为「触发物的载体」，由外层 `Tooltip` 解析。
 *
 * ═══ 为什么用静态属性 `__tooltipSlot` 而不是函数名 ═══
 *
 * 生产构建会把组件压成**匿名函数**：
 *   dev:  `function TooltipTrigger({children}) {...}`
 *   线上: `TooltipTrigger",0,function({children:e}){...}`   ← 函数名没了
 *
 * 所以靠 `child.type.name === 'TooltipTrigger'` 判断在**生产环境永远失败**
 * （`name` 是空串），触发物被当成「没有内容」直接丢弃 ——
 * 实测后果：**侧边栏 10 个菜单项全部消失**（只剩分组标题），
 * 而本地 dev 一切正常，这个差异让排查绕了很久。
 *
 * 静态属性跟着函数走，不会被压缩掉。
 */
export function TooltipTrigger({ children }: { children?: React.ReactNode; asChild?: boolean }) {
  return <>{children}</>
}
TooltipTrigger.__tooltipSlot = 'trigger' as const

/**
 * radix 式的 Content；只作为「文案 + 方位」的载体，由外层 `Tooltip` 解析。
 * 这里接受 `side` / `sideOffset` 等 radix 属性，避免调用点改写法（值由外层读取）。
 */
export function TooltipContent({
  children,
}: {
  children?: React.ReactNode
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  align?: string
  hidden?: boolean
}) {
  return <>{children}</>
}
TooltipContent.__tooltipSlot = 'content' as const

/** 从子元素里认出触发物与文案（三段式 → 官方的两段式）。 */
function splitParts(children: React.ReactNode): {
  trigger: React.ReactNode
  content: React.ReactNode
  side?: string
  align?: string
  hidden?: boolean
} {
  let trigger: React.ReactNode = null
  let content: React.ReactNode = null
  let side: string | undefined
  let align: string | undefined
  let hidden: boolean | undefined

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const p = child.props as {
      children?: React.ReactNode
      side?: string
      align?: string
      hidden?: boolean
    }
    // 用静态标记识别，不靠函数名（生产压缩会把名字改成匿名函数，见 TooltipTrigger 注释）
    const slot = (child.type as { __tooltipSlot?: string }).__tooltipSlot

    if (slot === 'trigger') trigger = p.children
    else if (slot === 'content') {
      content = p.children
      side = p.side
      align = p.align
      hidden = p.hidden
    }
  })

  return { trigger, content, side, align, hidden }
}

/** radix 的方位名 → 官方的逻辑方位名。 */
const PLACEMENT: Record<string, 'above' | 'below' | 'start' | 'end'> = {
  top: 'above',
  bottom: 'below',
  left: 'start',
  right: 'end',
}

export function Tooltip({
  children,
  defaultOpen: _defaultOpen,
  open,
  onOpenChange,
  delayDuration: _delayDuration,
  ...props
}: {
  children?: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  delayDuration?: number
}) {
  const { trigger, content, side, align, hidden } = splitParts(children)

  // 文案可能被包在 <p> 之类的节点里；官方只想要文本，这里退化成「原样传 ReactNode」。
  // `hidden` 是 radix 时代的遗留写法（<TooltipContent hidden={…}>）——
  // 之前适配层声明了这个 prop 但从不读取，导致 3 处「折叠时才显示」的逻辑从未生效。
  // 现在把它当成「不显示提示」，与「没有内容」同一条路。
  if (content === null || content === undefined || hidden) {
    // 没有内容就没有提示 —— 直接渲染触发物，避免出现空气泡
    return <>{trigger}</>
  }

  return (
    <AstryxTooltip
      content={content as never}
      delay={0}
      isOpen={open}
      onOpenChange={onOpenChange}
      placement={PLACEMENT[side ?? 'top'] ?? 'above'}
      alignment={(align as 'start' | 'center' | 'end') ?? 'center'}
      {...(props as object)}
    >
      {trigger as never}
    </AstryxTooltip>
  )
}
