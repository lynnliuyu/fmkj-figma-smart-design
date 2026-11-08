'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * 按原尺寸排版、整体缩放到容器宽度的画框（模板缩略图用）：
 * 子元素按 width × height 原尺寸渲染，外框保持同样比例并铺满容器宽度。
 */
export function ScaledFrame({
  width,
  height,
  children,
  className,
  label,
}: {
  width: number
  height: number
  children: React.ReactNode
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w) setScale(w / width)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  return (
    <div
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={cn('relative w-full overflow-hidden', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div
        aria-hidden
        inert
        className="pointer-events-none absolute top-0 left-0 origin-top-left select-none"
        style={{
          width,
          height,
          transform: `scale(${scale || 0.001})`,
          opacity: scale ? 1 : 0,
          transition: 'opacity 160ms ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * 一整列按原宽度排版的页面（例如 1440px 的横版方案），缩放到容器宽度显示，高度跟着内容走。
 * 容器比原宽度宽时不放大。
 */
export function ScaledStack({
  width,
  children,
  className,
}: {
  width: number
  children: React.ReactNode
  className?: string
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const update = () => {
      if (o.clientWidth) setScale(Math.min(1, o.clientWidth / width))
      setHeight(i.scrollHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(o)
    ro.observe(i)
    return () => ro.disconnect()
  }, [width])

  return (
    <div
      ref={outer}
      className={cn('relative w-full overflow-hidden', className)}
      style={{ height: scale ? height * scale : undefined }}
    >
      <div
        ref={inner}
        className="origin-top-left"
        style={{ width, transform: `scale(${scale || 1})`, opacity: scale ? 1 : 0 }}
      >
        {children}
      </div>
    </div>
  )
}
