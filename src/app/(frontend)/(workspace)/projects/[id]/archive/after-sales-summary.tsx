import Link from 'next/link'
import { ArrowRight, ShieldAlert, ShieldCheck, ShieldX, Shield } from 'lucide-react'

import { longDay, serviceTypeLabel, WARRANTY_STATUS_LABEL } from '@/lib/after-sales'
import type { AfterSalesData } from '@/lib/services/after-sales-service'
import { cn } from '@/lib/utils'

/** 归档页的售后维保摘要：质保倒计时、最近记录，点击进入完整的售后维保页 */
export function AfterSalesSummary({
  projectId,
  data,
}: {
  projectId: string
  data: AfterSalesData
}) {
  const w = data.warranty
  const Icon =
    w.status === 'expired'
      ? ShieldX
      : w.status === 'expiring'
        ? ShieldAlert
        : w.status === 'active'
          ? ShieldCheck
          : Shield
  const recent = data.records.filter((r) => r.type !== 'backup').slice(0, 3)
  return (
    <section
      aria-labelledby="after-sales-title"
      className="rounded-xl bg-card shadow-xs ring-1 ring-border"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <h2 id="after-sales-title" className="text-base font-semibold">
          售后维保
        </h2>
        <Link
          href={`/projects/${projectId}/after-sales`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          管理维保记录
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-6">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              w.status === 'active' && 'bg-success/12 text-success',
              w.status === 'expiring' && 'bg-warning/12 text-warning',
              w.status === 'expired' && 'bg-destructive/10 text-destructive-strong',
              w.status === 'none' && 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {WARRANTY_STATUS_LABEL[w.status]}
              {w.daysLeft !== null && w.daysLeft >= 0 ? (
                <span className="ml-1.5 tabular-nums">· 剩余 {w.daysLeft} 天</span>
              ) : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {w.end ? `到期 ${longDay(w.end)}` : '登记交付验收后开始计算'}
            </p>
          </div>
        </div>
        {recent.length ? (
          <ul className="space-y-1.5 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  <span className="text-muted-foreground">{serviceTypeLabel(r.type)} · </span>
                  {r.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {r.serviceDate}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="self-center text-sm text-muted-foreground">
            还没有维保记录。交付时先登记一次「交付验收」，之后的巡检、检修都记在这里。
          </p>
        )}
      </div>
    </section>
  )
}
