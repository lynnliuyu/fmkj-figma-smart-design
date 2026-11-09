'use client'

import * as React from 'react'
import { Switch as AstryxSwitch } from '@astryxdesign/core/Switch'

/**
 * 开关：内部换成 Astryx 官方 Switch。
 *
 * 同样把 radix 的 `checked` + `onCheckedChange` 转译到官方的
 * `value` + `onChange(checked, e)`，调用点保持不变。
 * 官方会渲染自己的文字标签，本仓的开关多数是「开关 + 外部标签」的排布，
 * 所以隐藏内置标签（`isLabelHidden`），可访问名称由 `aria-label` 提供。
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  ...props
}: Omit<React.ComponentProps<'input'>, 'onChange' | 'checked'> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  const ariaLabel = (props as { 'aria-label'?: string })['aria-label']
  const name = (props as { name?: string }).name

  return (
    <AstryxSwitch
      value={Boolean(checked)}
      onChange={(next) => onCheckedChange?.(next)}
      isDisabled={Boolean(disabled)}
      isLabelHidden
      label={ariaLabel || ' '}
      htmlName={name}
      id={id}
      data-slot="switch"
      className={className}
    />
  )
}
