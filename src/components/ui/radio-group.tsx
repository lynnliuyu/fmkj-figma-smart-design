'use client'

import * as React from 'react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * 单选组：保留 radix 的复合结构，样式与语义对齐官方 Token。
 *
 * ## 为什么这个不换官方 RadioList
 *
 * 官方 `RadioList` 的模型是「整行 = 圆点 + 标签 + 描述」（`RadioListItem`）。
 * 而本仓的用法是**自定义选择卡片**：`<RadioGroupItem className="absolute top-3 right-3" />`
 * 只是卡片右上角的一个**纯视觉小圆点**，标签与描述由外层自己排。
 * 官方组件无法表达这种「圆点脱离标签」的形态 —— 硬换会把布局压成整行。
 *
 * 「保留」是判断结论，不是遗漏：本组件真正承担的是**键盘导航与 roving tabindex**
 * （radix 提供），这部分官方 RadioList 也给不了同样自由度的布局。
 * 圆点本身的配色仍读 Astryx token（`--primary` 等），主题切换时颜色一致。
 */
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid w-full gap-3', className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input bg-background shadow-2xs outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/20 dark:data-checked:bg-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground dark:size-2.5" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
