'use client'

import * as React from 'react'
import { Divider } from '@astryxdesign/core/Divider'

import { cn } from '@/lib/utils'

/**
 * 分隔线：内部换成 Astryx 官方 Divider。
 *
 * 对外 API 保留 `orientation` 与 `decorative`（radix 的写法），
 * 并把它们翻译到官方 Divider 的 `orientation` / `label`。
 * `decorative=false` 表示这条线有语义（如分隔两个 section），官方用 `label` 承载，
 * 这里保持无标签，只让 `role` 与 `aria-orientation` 跟着变。
 */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}) {
  return (
    <Divider
      orientation={orientation}
      data-slot="separator"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'separator'}
      className={cn('shrink-0', className)}
      {...props}
    />
  )
}
