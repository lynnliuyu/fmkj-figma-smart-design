'use client'

import * as React from 'react'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'

/**
 * 复选框：内部换成 Astryx 官方 CheckboxInput。
 *
 * ## 为什么需要这层适配
 *
 * 本仓（radix 风格）用 `checked` + `onCheckedChange(checked)`；
 * 官方用 `value` + `onChange(checked, e)`，且 `label` 必填。
 * 转译一下，**8 处调用点一个字都不用改**。
 *
 * `label` 缺省时用 `aria-label`，再退回空串 —— 官方要求必填，
 * 但纯图标场景没有可见标签，这时可访问名称靠 `aria-label` 提供。
 */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  label,
  id,
  ...props
}: Omit<React.ComponentProps<'input'>, 'onChange' | 'checked' | 'value'> & {
  checked?: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean) => void
  label?: string
}) {
  const ariaLabel = (props as { 'aria-label'?: string })['aria-label']

  return (
    <CheckboxInput
      value={checked ?? false}
      onChange={(next) => onCheckedChange?.(next)}
      isDisabled={Boolean(disabled)}
      label={label || ariaLabel || ' '}
      isLabelHidden
      htmlName={(props as { name?: string }).name}
      id={id}
      data-slot="checkbox"
      className={className}
    />
  )
}
