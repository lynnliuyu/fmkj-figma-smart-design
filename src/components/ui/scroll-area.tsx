'use client'

import * as React from 'react'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'

import { cn } from '@/lib/utils'

/**
 * 可滚动区域：内部换成 Astryx 官方 ScrollableArea。
 *
 * ## 为什么不整包透传 props
 *
 * 官方 ScrollableArea 的 props 是**收窄的**（`role` 只接受 `group` / `region`），
 * 而 `React.ComponentProps<'div'>` 的 `role` 是宽泛的 `AriaRole`（含 `none` 等），
 * 直接展开会类型冲突。所以只挑真正需要下传的：`className`（非 StyleX 集成）与
 * `aria-label`（可访问名称）。
 *
 * 官方要求 `label` 必填；调用点没传时用中性文案兜底 —— 滚动区在键盘可达序列里，
 * 没有名称的 region 对读屏用户等于「未命名容器」。
 *
 * `ScrollBar` 是对外保留的空壳：官方把滚动条收进组件内部。保留导出是为了
 * 不让既有 import 断掉。
 */
export function ScrollArea({
  className,
  children,
  label,
  ...props
}: React.ComponentProps<'div'> & { label?: string }) {
  const ariaLabel = (props as { 'aria-label'?: string })['aria-label']

  return (
    <ScrollableArea
      label={label || ariaLabel || '内容'}
      axis="block"
      data-slot="scroll-area"
      className={cn('relative', className)}
    >
      {children}
    </ScrollableArea>
  )
}

/** 保留导出，避免既有 import 断掉（官方把滚动条收进 ScrollableArea 内部了）。 */
export function ScrollBar(_props: React.ComponentProps<'div'> & { orientation?: string }) {
  return null
}
