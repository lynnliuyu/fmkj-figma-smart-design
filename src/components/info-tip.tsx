'use client'

import { CircleHelp } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * 帮助提示：一个可聚焦的小问号图标，悬停/聚焦显示说明。
 *
 * 之前散落 19 处「图标 + Tooltip 三件套 + aria-label」的手写组合，容易漏掉可访问性标签、
 * 图标尺寸也不统一。这里收敛成一个组件：图标尺寸、对比色、aria-label 都由它负责。
 *
 * 用法：
 *   <InfoTip content="点位图会自动吸附到最近的墙面" />
 *   <InfoTip content="…" side="right" className="ml-1" />
 */
export function InfoTip({
  content,
  label = '查看说明',
  side = 'top',
  className,
}: {
  /** 提示内容 */
  content: React.ReactNode
  /** 无障碍标签，默认「查看说明」；内容含具体名词时可传更准确的描述 */
  label?: string
  /** 提示弹出方向 */
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            className,
          )}
        >
          <CircleHelp className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-pretty">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
