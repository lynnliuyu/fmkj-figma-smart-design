'use client'

import Link, { useLinkStatus } from 'next/link'
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowDownWideNarrow,
  Clock3,
  Loader2,
  type LucideIcon,
} from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** 排序值 → 图标；文字说明放在悬停提示和读屏标签里 */
const SORT_ICON: Record<string, LucideIcon> = {
  '': ArrowDownAZ,
  'price-asc': ArrowDownNarrowWide,
  'price-desc': ArrowDownWideNarrow,
  updated: Clock3,
}

/** 链接跳转还没返回时把图标换成转圈，避免“点了没反应” */
function SortIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus()
  return pending ? (
    <Loader2 aria-hidden className="size-4 animate-spin" />
  ) : (
    <Icon aria-hidden className="size-4" />
  )
}

/** 产品库的排序：只用图标的单选组（链接实现，保留 ?sort= 参数与服务端排序） */
export function SortToggle({
  items,
}: {
  items: { value: string; label: string; href: string; active: boolean }[]
}) {
  return (
    <nav
      aria-label="排序"
      className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {items.map((it) => {
        const label = it.value ? it.label : `按${it.label}排序`
        return (
          <Tooltip key={it.value || 'name'}>
            <TooltipTrigger asChild>
              <Link
                href={it.href}
                scroll={false}
                aria-label={label}
                aria-current={it.active ? 'true' : undefined}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md transition-[color,background-color,box-shadow] duration-150 ease-out-quart',
                  'focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none',
                  it.active
                    ? 'bg-background text-foreground shadow-xs dark:bg-accent'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <SortIcon icon={SORT_ICON[it.value] ?? ArrowDownAZ} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}
