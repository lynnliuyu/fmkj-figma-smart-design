import { categoryOfType, DEVICE_CATEGORIES, deviceTypeOf } from '@/lib/device-types'
import { markerSrc } from '@/lib/point-marker-data'
import { cn } from '@/lib/utils'

type LegendPoint = { deviceType: string }

/** 按设备类别汇总图上出现的设备类型（类别顺序与设备库一致） */
export function legendGroups(points: LegendPoint[]) {
  const counts = new Map<string, number>()
  for (const p of points) counts.set(p.deviceType, (counts.get(p.deviceType) ?? 0) + 1)
  const groups = new Map<
    string,
    {
      slug: string
      name: string
      code: string
      color: string
      order: number
      rows: { type: string; name: string; count: number }[]
    }
  >()
  for (const [type, count] of counts) {
    const c = categoryOfType(type)
    const slug = c?.slug ?? 'other'
    const cat = DEVICE_CATEGORIES.find((x) => x.slug === slug)
    const g = groups.get(slug) ?? {
      slug,
      name: cat?.name ?? '其他',
      code: cat?.code ?? '',
      color: cat?.color ?? '#525252',
      order: cat?.sortOrder ?? 999,
      rows: [],
    }
    g.rows.push({ type, name: deviceTypeOf(type)?.name ?? '设备', count })
    groups.set(slug, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => b.count - a.count) }))
}

/**
 * 点位图图例：图标 → 设备名称的映射，按类别分组，只列本张图上出现的设备。
 * table：带框的分组表（类别色标题 + 图标格 + 名称 + 数量），多栏排布；
 * inline：一行流式排列，用于横版提案页。
 * 图标为内嵌 SVG DataURL，导出 PDF / PNG 不漏图。
 */
export function PlanLegend({
  points,
  variant = 'table',
  columns = 3,
  className,
}: {
  points: LegendPoint[]
  variant?: 'table' | 'inline'
  columns?: 2 | 3 | 4
  className?: string
}) {
  const groups = legendGroups(points)
  if (!groups.length) return null
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-[14px] gap-y-[6px] text-[11px] leading-none',
          className,
        )}
      >
        <span className="doc-strong tracking-[0.12em]">图例</span>
        {groups.flatMap((g) =>
          g.rows.map((r) => (
            <span key={r.type} className="inline-flex items-center gap-[5px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={markerSrc(r.type)} alt="" className="size-[16px]" />
              <span>{r.name}</span>
              <span className="doc-latin opacity-60">×{r.count}</span>
            </span>
          )),
        )}
      </div>
    )
  }
  const cols = { 2: 'columns-2', 3: 'columns-3', 4: 'columns-4' }[columns]
  return (
    <div className={cn('text-[10.5px]', className)}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="doc-strong text-[11px] tracking-[0.2em]">图例 · LEGEND</span>
        <span className="text-doc-muted">
          {groups.reduce((s, g) => s + g.rows.length, 0)} 种设备 · {points.length} 个点位
        </span>
      </div>
      <div className={cn(cols, 'gap-2.5')}>
        {groups.map((g) => (
          <div
            key={g.slug}
            className="mb-2.5 break-inside-avoid overflow-hidden rounded-doc border border-doc-rule bg-white text-[#2a2a2a]"
          >
            <div
              className="flex items-center gap-1.5 border-b border-doc-rule px-2 py-1"
              style={{ background: `${g.color}14` }}
            >
              <span className="size-2 rounded-full" style={{ background: g.color }} />
              <span className="font-semibold">{g.name}</span>
              {g.code ? (
                <span
                  className="ml-auto font-mono text-[9.5px] font-semibold"
                  style={{ color: g.color }}
                >
                  {g.code}
                </span>
              ) : null}
            </div>
            {g.rows.map((r, i) => (
              <div
                key={r.type}
                className={cn('flex items-center', i > 0 && 'border-t border-doc-rule/70')}
              >
                <div className="flex w-8 shrink-0 items-center justify-center self-stretch border-r border-doc-rule/70 py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={markerSrc(r.type)} alt="" className="size-[18px]" />
                </div>
                <span className="min-w-0 flex-1 truncate px-2">{r.name}</span>
                <span className="pr-2 tabular-nums text-neutral-500">×{r.count}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
