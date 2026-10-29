import Link from 'next/link'

import { LinkPending } from '@/components/link-pending'
import { cn } from '@/lib/utils'

export type FilterTab = { label: React.ReactNode; href: string; active: boolean; count?: number; key?: string }

/**
 * 列表页通用的单选筛选条（阶段、状态、排序等）。
 * 基于链接实现，服务端组件可直接使用；选项多时在窄屏横向滚动而不是换成多行。
 */
export function FilterTabs({ items, label, className }: { items: FilterTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn('-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]', className)}>
      <div className="inline-flex h-9 items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5">
        {items.map((it, i) => (
          <Link
            key={it.key ?? i}
            href={it.href}
            scroll={false}
            aria-current={it.active ? 'true' : undefined}
            className={cn(
              'relative inline-flex h-full shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              it.active ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LinkPending />
            {it.label}
            {typeof it.count === 'number' ? <span className="text-xs text-muted-foreground tabular-nums">{it.count}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  )
}
