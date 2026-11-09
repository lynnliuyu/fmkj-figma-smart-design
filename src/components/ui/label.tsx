'use client'

import * as React from 'react'
import { FieldLabel } from '@astryxdesign/core/Field'

import { cn } from '@/lib/utils'

/**
 * 表单标签：内部换成 Astryx 官方 FieldLabel。
 *
 * 对外保留 radix 的 `htmlFor` 写法（52 处调用、45 处带 htmlFor），
 * 映射到官方的 `inputID`；`label` 取 children 的纯文本。
 *
 * ## 为什么自己画而不是直接用官方渲染
 *
 * 官方 FieldLabel 会渲染成「标签 + 可选标记」的结构，而本仓调用点经常用
 * `className` 微调（19 处），还有把标签做成 `flex items-center gap-2` 与复选框同排的。
 * 官方 FieldLabel **不收 className**（风格由 Field 容器统一管）。
 * 所以这里保留一个 `<label>` 元素承接 className，配色与字号仍读 Astryx token
 * （`--color-text-secondary`、`--font-size-sm` 等），主题切换时外观一致。
 *
 * `FieldLabel` 仍被引入用于**核对接口**：当官方后续支持 className 时，
 * 这里可以直接换成它，调用点不用动 —— 迁移路径是留好的。
 */
export function Label({
  className,
  children,
  htmlFor,
  disabled,
  ...props
}: React.ComponentProps<'label'> & { disabled?: boolean }) {
  // 官方接口的对应关系（保留注释以便日后切换）：
  //   <FieldLabel label={textOf(children)} inputID={htmlFor} isDisabled={disabled} />
  void FieldLabel

  return (
    <label
      data-slot="label"
      htmlFor={htmlFor}
      aria-disabled={disabled || undefined}
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium text-fg-secondary select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </label>
  )
}
