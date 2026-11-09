'use client'

import * as React from 'react'
import { Badge as AstryxBadge } from '@astryxdesign/core/Badge'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * 徽标：对外 API 不变，内部走 Astryx 官方 Badge。
 *
 * Astryx 的 Badge 只有「语义色 + 色名」两族变体（neutral/info/success/warning/error + 色名），
 * 没有本仓的 default/brand/secondary/outline/ghost/link 这套「强调层级」。
 * 映射原则：**语义色的搬到官方语义变体，强调层级的归到 neutral/info** ——
 * 后者在视觉上会从「深浅两级」变成「统一的石灰色」，这是切到官方配色后的一致结果。
 *
 * `asChild` 走 Fallback 路径（Badge 常被当作链接标签用）。
 */

/** Fallback 路径（asChild）用的样式，仍由 token 驱动。 */
const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/85',
        brand:
          'bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset dark:bg-primary/15 [a]:hover:bg-primary/15',
        secondary: 'bg-muted text-fg-secondary ring-1 ring-border ring-inset [a]:hover:bg-muted/70',
        destructive:
          // 浅红底上的红字必须用 -strong 那一档：直接用 --destructive 只有 4.0:1，达不到 4.5:1。
          'bg-destructive/10 text-destructive-strong ring-1 ring-destructive/20 ring-inset focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline:
          'bg-background text-fg-secondary ring-1 ring-border ring-inset dark:bg-transparent [a]:hover:bg-muted',
        // 业务状态用的语义色：成功（已确认）、待处理（已发送 / 需关注）。浅底配同色深字。
        success: 'bg-success/10 text-success ring-1 ring-success/20 ring-inset dark:bg-success/15',
        warning: 'bg-warning/10 text-warning ring-1 ring-warning/25 ring-inset dark:bg-warning/15',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type Variant =
  | 'default'
  | 'brand'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'ghost'
  | 'link'

/** 旧变体 → Astryx 官方变体。语义色一一对应，强调层级归到 neutral / info。 */
const ASTRYX_VARIANT: Record<Variant, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  default: 'neutral',
  brand: 'info',
  secondary: 'neutral',
  destructive: 'error',
  outline: 'neutral',
  success: 'success',
  warning: 'warning',
  ghost: 'neutral',
  link: 'info',
}

export function Badge({
  className,
  variant = 'default',
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
  }) {
  const v = (variant ?? 'default') as Variant

  // asChild：把样式交给子元素（通常是 <Link>），DOM 里只留一个元素。
  if (asChild) {
    return (
      <Slot.Root
        data-slot="badge"
        data-variant={v}
        className={cn(badgeVariants({ variant: v }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }

  return (
    <AstryxBadge
      variant={ASTRYX_VARIANT[v]}
      label={children as never}
      data-slot="badge"
      data-variant={v}
      className={className}
    />
  )
}

export { badgeVariants }
