'use client'

import { Skeleton as AstryxSkeleton } from '@astryxdesign/core/Skeleton'

import { cn } from '@/lib/utils'

/**
 * 骨架块：内部换成 Astryx 官方 Skeleton。
 *
 * ## 两个必须守住的点
 *
 * **1. `data-slot="skeleton"` 不能少** —— `e2e/smoke.mjs` 靠它统计「还没消失的骨架块」。
 * 少了它，那条断言会永远返回 0，「页面卡在加载态」这类问题就再也抓不到了。
 *
 * **2. 官方 Skeleton 是收窄的 props**（只有 width/height/radius/index），不接受任意 div 属性。
 * 而本仓调用点习惯用 Tailwind 类表达尺寸（`className="h-4 w-32"`）。两者
 * 不能混着传 —— 所以这里**只透传 className**（官方支持 className 做非 StyleX 集成），
 * 尺寸照旧由调用点的类控制；显式的 width/height/radius 也放行，供新代码使用。
 */
export function Skeleton({
  className,
  ...props
}: React.ComponentProps<'div'> & {
  width?: number | string
  height?: number | string
  radius?: 'none' | 0 | 1 | 2 | 3 | 4 | 'rounded'
  index?: number
}) {
  const { width, height, radius, index } = props

  return (
    <AstryxSkeleton
      data-slot="skeleton"
      width={width}
      height={height}
      radius={radius}
      index={index}
      className={cn('block', className)}
    />
  )
}
