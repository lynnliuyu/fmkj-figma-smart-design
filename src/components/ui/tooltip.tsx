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

/** radix 式的 Trigger；真正的渲染由外层 `Tooltip` 解析后交给官方组件。 */
export function TooltipTrigger({ children }: { children?: React.ReactNode; asChild?: boolean }) {
  return <>{children}</>
}

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

/** 从子元素里认出触发物与文案（三段式 → 官方的两段式）。 */
function splitParts(children: React.ReactNode): {
  trigger: React.ReactNode
  content: React.ReactNode
  side?: string
  align?: string
} {
  let trigger: React.ReactNode = null
  let content: React.ReactNode = null
  let side: string | undefined
  let align: string | undefined

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const p = child.props as { children?: React.ReactNode; side?: string; align?: string }
    const name =
      typeof child.type === 'function'
        ? (child.type as { name?: string }).name
        : typeof child.type === 'string'
          ? child.type
          : ''

    if (name === 'TooltipTrigger') trigger = p.children
    else if (name === 'TooltipContent') {
      content = p.children
      side = p.side
      align = p.align
    }
  })

  return { trigger, content, side, align }
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
  const { trigger, content, side, align } = splitParts(children)

  // 文案可能被包在 <p> 之类的节点里；官方只想要文本，这里退化成「原样传 ReactNode」。
  if (content === null || content === undefined) {
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
