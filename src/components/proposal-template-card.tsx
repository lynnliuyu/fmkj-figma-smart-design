import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import type { PickerTemplate } from '@/plugins/proposal/picker-data'
import { Swatches } from '@/plugins/proposal/template-picker'
import { cn } from '@/lib/utils'

/** 模板库卡片：真实封面缩略图 + 适合客户 / 使用时机 / 外观特点，点进去看整套样张 */
export function TemplateCard({
  t,
  thumb,
  className,
}: {
  t: PickerTemplate
  thumb: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={`/templates/${t.value}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      <div className="relative border-b bg-muted/40">{thumb}</div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold tracking-tight">{t.label}</h3>
          <span className="flex items-center gap-2">
            <Swatches colors={t.swatches} />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.frameworkLabel}
          {t.sections.length ? ` · ${t.sections.length} 章` : ''}
          {t.pages ? ` · 样张 ${t.pages} 页` : ''}
          {t.priceShown ? '' : ' · 不含价格'}
        </p>
        <dl className="space-y-1 text-sm leading-relaxed">
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">适合</dt>
            <dd>{t.audience}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">时机</dt>
            <dd>{t.occasion}</dd>
          </div>
        </dl>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div className="flex flex-wrap gap-1">
            {t.highlights.map((h) => (
              <span
                key={h}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {h}
              </span>
            ))}
          </div>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            整套样张
            <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}
