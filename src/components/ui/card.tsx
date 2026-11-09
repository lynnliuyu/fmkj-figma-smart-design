'use client'

import * as React from 'react'
import { Card as AstryxCard } from '@astryxdesign/core/Card'

import { cn } from '@/lib/utils'

/**
 * 卡片：根组件换成 Astryx 官方 Card，**子部件保留**（官方 Card 是内容中立的容器）。
 *
 * ## 为什么只换根、不换子部件
 *
 * 官方 Card 只知道「一块带背景/圆角/内边距的面」，没有 Header/Title/Content/Footer 的概念。
 * 本仓有 7 个部件、且 `CardHeader` 用 grid 处理「标题 + 右上操作」的排布，
 * 硬拆成官方写法会丢掉这套布局。所以：
 *
 * - **根** → 官方 Card，拿到官方的表面样式与配色 token
 * - **子部件** → 仍是布局 div，但内边距继续由 `--card-spacing` 统一驱动，
 *   各部件左右对齐（这正是原来那套被 14 个页面依赖的行为）
 *
 * ## 为什么传 `padding={0}`
 *
 * 官方 Card 默认自带内边距，而本仓把内边距下发给各个子部件（这样 Header/Content/Footer
 * 的左右边距才对得齐）。两者叠加会双层缩进，所以显式关掉官方的内边距。
 */
function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <AstryxCard
      padding={0}
      data-slot="card"
      data-size={size}
      className={cn(
        // 三点必须显式保留（都是实测出来的）：
        //  1. `border-0` —— 官方 Card 自带 borderTop/Bottom 各 1px，占盒模型 → 卡片高 2px
        //     （实测 103 → 105）。本仓原来用 `ring-1`（不占空间），所以要先把官方边框归零。
        //  2. `ring-1 ring-border` —— 恢复本仓的描边方式，高度与改造前一致。
        //  3. `bg-card` / `text-card-foreground` —— 保留本仓语义 token，避免被官方配色盖掉。
        'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-[var(--radius-container)] border-0 bg-card py-(--card-spacing) text-sm text-card-foreground shadow-xs ring-1 ring-border [--card-spacing:--spacing(5)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-[var(--radius-container)] *:[img:last-child]:rounded-b-[var(--radius-container)]',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t-[var(--radius-container)] px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-heading text-base font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('px-(--card-spacing)', className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-[var(--radius-container)] px-(--card-spacing) [.border-t]:pt-(--card-spacing)',
        className,
      )}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
