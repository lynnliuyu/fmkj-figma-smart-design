'use client'

import * as React from 'react'
import { TextInput } from '@astryxdesign/core/TextInput'

import { cn } from '@/lib/utils'

/**
 * 单行输入：内部换成 Astryx 官方 TextInput。
 *
 * ## 三个必须处理的差异
 *
 * **1. `onChange` 签名不同。** 官方是 `(value, e)`，本仓 47 处调用写的是原生
 * `(e) => setX(e.target.value)`。这里把合成事件原样透传，调用点不用改。
 *
 * **2. 官方不收 `className`。** 它明确 `Omit<..., 'xstyle' | 'className' | 'style'>`，
 * 但提供了 **`controlClassName`** 用来给输入框本体加类 —— 本仓的尺寸/边框/焦点样式
 * 全部走它。这是官方给的正路，不是绕过。
 *
 * **3. 官方不支持 `defaultValue`（非受控）。** 6 处调用在用，用内部 state 承接初值，
 * 对外表现与原生 input 一致。
 *
 * `label` 官方必填：优先用调用点的 `aria-label`，再退回 `placeholder`，最后空串。
 * 本仓输入框的可访问名称多由外层 `<label htmlFor>` 提供，所以 `isLabelHidden` 避免重复标签。
 */
export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  const {
    value,
    defaultValue,
    onChange,
    disabled,
    id,
    name,
    placeholder,
    'aria-label': ariaLabel,
    ...rest
  } = props as React.ComponentProps<'input'> & { 'aria-label'?: string }

  const isControlled = value !== undefined
  const [inner, setInner] = React.useState(String(defaultValue ?? ''))
  const current = isControlled ? String(value ?? '') : inner

  // 官方只接受这几种 type；其余（number/date 等）交给原生——见下面的回退分支
  const SUPPORTED = new Set(['text', 'password', 'email', 'search', 'tel', 'url'])
  const safeType = (type ?? 'text') as string

  if (!SUPPORTED.has(safeType)) {
    // 官方 TextInput 的 type 是收窄的（不支持 number/date/file 等）。
    // 这些场景仍然渲染原生 input —— 保留原生行为（min/max/step/inputMode 等），
    // 样式与 Astryx token 保持一致，而不是硬塞进官方组件再丢功能。
    return (
      <input
        type={safeType}
        value={isControlled ? current : undefined}
        defaultValue={isControlled ? undefined : defaultValue}
        onChange={(e) => {
          if (!isControlled) setInner(e.target.value)
          ;(onChange as ((e: React.ChangeEvent<HTMLInputElement>) => void) | undefined)?.(e)
        }}
        disabled={disabled}
        id={id}
        name={name}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-slot="input-native"
        className={cn(
          'h-8 w-full min-w-0 rounded-[var(--radius-element)] border border-input bg-background px-2.5 py-1 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow,border-color] duration-150 placeholder:text-muted-foreground/75 hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-70 md:text-sm dark:bg-input/20',
          className,
        )}
        {...(rest as object)}
      />
    )
  }

  return (
    <TextInput
      type={safeType as 'text' | 'password' | 'email' | 'search' | 'tel' | 'url'}
      value={current}
      onChange={(next, e) => {
        if (!isControlled) setInner(next)
        ;(onChange as ((e: React.ChangeEvent<HTMLInputElement>) => void) | undefined)?.(e)
      }}
      label={ariaLabel || placeholder || ' '}
      isLabelHidden
      isDisabled={Boolean(disabled)}
      htmlName={name}
      id={id}
      placeholder={placeholder}
      controlClassName={cn(
        'h-8 w-full min-w-0 rounded-[var(--radius-element)] px-2.5 py-1 text-base text-foreground md:text-sm',
        className,
      )}
      data-slot="input"
      // 其余原生属性（maxLength / autoComplete / inputMode / min / step / aria-* 等）
      // 官方 BaseProps 允许透传。inputMode 虽在其 Omit 列表里，但运行时无害。
      {...(rest as object)}
    />
  )
}
