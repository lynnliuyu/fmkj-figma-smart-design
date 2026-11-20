import Link from 'next/link'

import { LinkPending } from '@/components/link-pending'
import { cn } from '@/lib/utils'

export type FilterTab = {
  label: React.ReactNode
  href: string
  active: boolean
  count?: number
  key?: string
}

/**
 * 列表页通用的单选筛选条（阶段、状态、排序等）。
 * 基于链接实现，服务端组件可直接使用；选项多时在窄屏横向滚动而不是换成多行。
 */
export function FilterTabs({
  items,
  label,
  className,
  trackClassName,
}: {
  items: FilterTab[]
  label: string
  className?: string
  trackClassName?: string
}) {
  return (
    <nav
      aria-label={label}
      role="tablist"
      className={cn(
        'flex max-w-full min-w-0 items-center overflow-x-auto [scrollbar-width:none]',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-8 min-w-max items-center gap-0.5 rounded-lg bg-muted p-0.5',
          trackClassName,
        )}
      >
        {items.map((it, i) => (
          <Link
            key={it.key ?? i}
            href={it.href}
            scroll={false}
            role="tab"
            aria-selected={it.active ? 'true' : undefined}
            aria-current={it.active ? 'true' : undefined}
            className={cn(
              'relative inline-flex h-full shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 ease-out-quart',
              'focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none',
              it.active
                ? 'bg-background text-foreground shadow-xs dark:bg-accent'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LinkPending />
            {it.label}
            {typeof it.count === 'number' ? (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-[11px] leading-[18px] font-medium tabular-nums',
                  it.active
                    ? 'bg-primary/10 text-primary'
                    : 'bg-foreground/[0.06] text-muted-foreground dark:bg-foreground/10',
                )}
              >
                {it.count}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  )
}
