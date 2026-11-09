'use client'

import * as React from 'react'
import { Avatar as AstryxAvatar } from '@astryxdesign/core/Avatar'

import { cn } from '@/lib/utils'

/**
 * 头像：内部换成 Astryx 官方 Avatar。
 *
 * 本仓原来的用法是 `<Avatar><AvatarImage/><AvatarFallback/></Avatar>` 三段式（radix），
 * 官方是单组件（`src` + `name` + 内置兜底）。为了让既有调用点不改，这里保留三段的导出名，
 * 但在 `Avatar` 根组件内部把子元素解析成 `src` / `name`，交给官方渲染。
 */

/** 只作为宿主：真正的渲染在 `Avatar` 根组件里完成，这两个子组件不直接产出 DOM。 */
export function AvatarImage(_props: React.ComponentProps<'img'>) {
  return null
}
export function AvatarFallback(_props: React.ComponentProps<'span'>) {
  return null
}

function pickFrom(children: React.ReactNode): { src?: string; name?: string } {
  const out: { src?: string; name?: string } = {}
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const p = child.props as { src?: string; alt?: string; children?: React.ReactNode }
    if (typeof p.src === 'string') out.src = p.src
    const text = typeof p.children === 'string' ? p.children : undefined
    if (text) out.name = text
    else if (p.alt) out.name = p.alt
  })
  return out
}

export function Avatar({
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & { size?: 'sm' | 'default' | 'lg' }) {
  const { src, name } = pickFrom(children)
  const size = (props as { size?: string }).size
  const mapped = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md'

  return (
    <AstryxAvatar
      src={src}
      name={name}
      alt={name}
      size={mapped as never}
      shape="circle"
      tooltip={false}
      data-slot="avatar"
      className={cn('shrink-0', className)}
    />
  )
}
