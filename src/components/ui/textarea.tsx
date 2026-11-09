'use client'

import * as React from 'react'
import { TextArea as AstryxTextArea } from '@astryxdesign/core/TextArea'

/**
 * 多行输入：内部换成 Astryx 官方 TextArea。
 *
 * ## 适配的关键点
 *
 * 官方要求受控（`value` + `onChange(value, e)`）且 `label` 必填；
 * 而本仓 10 处调用里有 3 处用 `defaultValue`（非受控）、6 处用原生的 `onChange(e)`。
 * 两种都要照顾：
 *
 * - **受控**：`value` 有值 → 原样传给官方，`onChange` 的签名差异在这里抹平
 *   （调用点拿到的是合成事件，`e.target.value` 仍然可用）。
 * - **非受控**：官方不支持 `defaultValue`，用一个内部 state 承接初值，
 *   对外表现与原生 textarea 一致。
 *
 * `label` 走 `aria-label`，没有就退回空串 —— 官方必填，但本仓的输入框
 * 普遍由外层 `<label htmlFor>` 提供可访问名称。
 */
export function Textarea({
  value,
  defaultValue,
  onChange,
  id,
  label,
  ...props
}: React.ComponentProps<'textarea'> & {
  label?: string
}) {
  const isControlled = value !== undefined
  const [inner, setInner] = React.useState(String(defaultValue ?? ''))
  const current = isControlled ? String(value ?? '') : inner

  const ariaLabel = (props as { 'aria-label'?: string })['aria-label']
  const rows = (props as { rows?: number }).rows
  const maxLength = (props as { maxLength?: number }).maxLength
  const name = (props as { name?: string }).name
  const disabled = (props as { disabled?: boolean }).disabled

  return (
    <AstryxTextArea
      value={current}
      onChange={(next, e) => {
        if (!isControlled) setInner(next)
        // 调用点沿用原生的 `(e) => setX(e.target.value)` 写法，事件原样透传即可
        ;(onChange as ((e: React.ChangeEvent<HTMLTextAreaElement>) => void) | undefined)?.(e)
      }}
      label={label || ariaLabel || ' '}
      isLabelHidden
      isDisabled={Boolean(disabled)}
      htmlName={name}
      id={id}
      rows={rows}
      maxLength={maxLength}
      width="100%"
    />
  )
}
