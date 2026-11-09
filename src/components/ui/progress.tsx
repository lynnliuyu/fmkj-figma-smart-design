'use client'

import * as React from 'react'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'

/**
 * 进度条：内部换成 Astryx 官方 ProgressBar。
 *
 * 对外保留 `value` / `max` / `className`（沿用 radix 时代的调用方式）。
 * 官方要求 `label`（无障碍名称），调用点没传时用占位文案兜底 ——
 * 进度条的可访问名称不能为空，否则读屏软件只会念出「进度条」三个字。
 */
export function Progress({
  value = 0,
  max = 100,
  className,
  ...props
}: React.ComponentProps<'div'> & { value?: number | null; max?: number }) {
  const label = (props as { 'aria-label'?: string })['aria-label'] ?? '进度'

  return (
    <ProgressBar
      label={label}
      value={value ?? 0}
      max={max}
      hasValueLabel
      data-slot="progress"
      className={className}
    />
  )
}
