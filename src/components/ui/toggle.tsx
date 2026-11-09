'use client'

import * as React from 'react'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * 切换按钮：内部换成 Astryx 官方 ToggleButton。
 *
 * ## ⚠️ 必须保住 `aria-pressed`
 *
 * radix 的 Toggle 会把 `aria-pressed={pressed}` 渲染到元素上，本仓调用点的
 * className 大量依赖它写样式（`aria-pressed:bg-primary/10`、`aria-pressed:text-foreground`）。
 * 官方用 `isPressed` 表达状态，属性名不同 —— 若不管，这些类会**全部失效、按钮看不出选中**。
 * 所以这里显式把 `aria-pressed` 补回去（官方接受 data-* / aria-* 透传）。
 *
 * `onPressedChange`（radix）与官方的同名 prop 语义一致，直接映射。
 */
const toggleVariants = cva('', {
  variants: {
    variant: { default: 'bg-transparent', outline: 'border border-input bg-transparent' },
    size: {
      default: 'h-8 min-w-8 px-2.5',
      sm: 'h-7 min-w-7 px-2.5',
      lg: 'h-9 min-w-9 px-2.5',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export function Toggle({
  className,
  variant = 'default',
  pressed,
  onPressedChange,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> & {
  pressed?: boolean
  onPressedChange?: (pressed: boolean) => void
} & VariantProps<typeof toggleVariants>) {
  const ariaLabel = (props as { 'aria-label'?: string })['aria-label']

  return (
    <ToggleButton
      label={ariaLabel || ''}
      isIconOnly={!ariaLabel}
      isPressed={Boolean(pressed)}
      onPressedChange={(next) => onPressedChange?.(next)}
      isDisabled={Boolean(disabled)}
      size="md"
      aria-pressed={Boolean(pressed)}
      aria-label={ariaLabel}
      data-slot="toggle"
      className={cn(toggleVariants({ variant }), className)}
      {...(props as object)}
    >
      {children as never}
    </ToggleButton>
  )
}

export { toggleVariants }
