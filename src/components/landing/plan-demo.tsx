'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'

import { deviceLook } from '@/board/packs/smart-home/look'
import { planAreaLabelAt } from '@/components/plan-figure'
import { PointMarker } from '@/components/point-marker'
import { Badge } from '@astryxdesign/core/Badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { categoryOfType, DEVICE_CATEGORIES, deviceTypeOf } from '@/lib/device-types'
import type { LandingShowcase, ShowcaseLine, ShowcasePoint } from '@/lib/landing-showcase'

import { cn } from '@/lib/utils'

import { money } from './section'

/** 点位图坐标系：标准图纸 3:2 */
const VW = 1200
const VH = 800
const ICON = 34

type Row = { type: string; qty: number; line: ShowcaseLine | null; subtotal: number }

const catSlug = (type: string) => categoryOfType(type)?.slug ?? 'other'
const catOrder = (type: string) => DEVICE_CATEGORIES.findIndex((c) => c.slug === catSlug(type))
const typeName = (type: string) => deviceTypeOf(type)?.name ?? '设备'

/**
 * 首页产品窗口：示例项目的真实户型图与点位，右侧清单按「点位数量 × 报价单价」实时汇总。
 * 悬停（或点按）设备看价签；点清单行在图上高亮同类设备；点图例隐藏某类设备，清单即时重算。
 */
export function PlanDemo({ data }: { data: LandingShowcase }) {
  const [sheetId, setSheetId] = useState(data.sheets[0]?.id ?? '')
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [hoverType, setHoverType] = useState<string | null>(null)
  const [pinnedType, setPinnedType] = useState<string | null>(null)
  const [ticket, setTicket] = useState<ShowcasePoint | null>(null)
  const sheet = data.sheets.find((s) => s.id === sheetId) ?? data.sheets[0]
  const quote = data.quote
  const focusType = hoverType ?? pinnedType

  const lineOf = useMemo(() => {
    const m = new Map<string, ShowcaseLine>()
    for (const l of quote?.lines ?? []) if (!m.has(l.type)) m.set(l.type, l)
    return m
  }, [quote])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of sheet?.points ?? [])
      counts.set(catSlug(p.type), (counts.get(catSlug(p.type)) ?? 0) + 1)
    return DEVICE_CATEGORIES.filter((c) => counts.has(c.slug)).map((c) => ({
      ...c,
      count: counts.get(c.slug)!,
    }))
  }, [sheet])

  const visible = useMemo(
    () => (sheet?.points ?? []).filter((p) => !hidden.has(catSlug(p.type))),
    [sheet, hidden],
  )
  // 入场顺序：从左到右扫过图纸
  const order = useMemo(
    () => new Map([...visible].sort((a, b) => a.rx - b.rx).map((p, i) => [p.id, i])),
    [visible],
  )

  const rows: Row[] = useMemo(() => {
    const qty = new Map<string, number>()
    for (const p of visible) qty.set(p.type, (qty.get(p.type) ?? 0) + 1)
    return [...qty]
      .map(([type, n]) => {
        const line = lineOf.get(type) ?? null
        return { type, qty: n, line, subtotal: line ? line.price * n : 0 }
      })
      .sort((a, b) => catOrder(a.type) - catOrder(b.type) || b.subtotal - a.subtotal)
  }, [visible, lineOf])
  const floorTotal = rows.reduce((s, r) => s + r.subtotal, 0)

  if (!sheet) return null
  const toggleCategory = (slug: string, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (on) next.delete(slug)
      else next.add(slug)
      return next
    })
  const ticketLine = ticket ? lineOf.get(ticket.type) : undefined

  return (
    <div
      role="group"
      aria-label={`示例项目「${data.project.name}」点位图演示`}
      className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-window"
    >
      {/* 窗口抬头：项目、楼层、报价状态 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted/50 px-4 py-2.5 sm:px-5">
        <p className="min-w-0 truncate text-sm font-medium">
          {data.project.name}
          <span className="hidden font-normal text-muted-foreground sm:inline"> · 点位图</span>
        </p>
        {/* 系统内置的示例项目，不是真实客户案例 */}
        <Badge variant="neutral" className="shrink-0" label={'示例项目'} />
        <Tabs
          value={sheet.id}
          onValueChange={(v) => {
            setSheetId(v)
            setTicket(null)
            setPinnedType(null)
          }}
          className="order-last w-full sm:order-none sm:w-auto"
        >
          <TabsList
            aria-label="楼层"
            className="w-full bg-background/70 sm:w-auto dark:bg-background/40"
          >
            {data.sheets.map((s) => (
              <TabsTrigger
                key={s.id}
                value={s.id}
                aria-controls="plan-canvas"
                className="gap-1.5 px-3 text-xs"
              >
                {s.floor}
                <span className="text-muted-foreground tabular-nums">{s.points.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {quote ? (
          <p className="ml-auto flex shrink-0 items-center gap-2 text-sm">
            <Badge variant="success" className="hidden sm:inline-flex" label={'已确认'} />
            <span className="font-semibold tabular-nums">{money(quote.total)}</span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[10.5rem_minmax(0,1fr)_21rem] xl:grid-cols-[11rem_minmax(0,1fr)_23rem] [&>*]:min-w-0">
        {/* 图例：设备类别，点一下隐藏 / 显示 */}
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 lg:border-r lg:border-b-0 lg:px-3 lg:py-4">
          <p className="px-1 text-xs text-muted-foreground">图例 · 点击筛选</p>
          <div
            className="flex flex-wrap gap-1 lg:flex-col"
            role="group"
            aria-label="按设备类别显示"
          >
            {categories.map((c) => (
              <Toggle
                key={c.slug}
                size="sm"
                pressed={!hidden.has(c.slug)}
                onPressedChange={(on) => toggleCategory(c.slug, on)}
                className="h-8 justify-start gap-2 rounded-lg px-2 text-xs font-normal text-muted-foreground line-through decoration-muted-foreground/60 aria-pressed:bg-transparent aria-pressed:text-foreground aria-pressed:no-underline aria-pressed:hover:bg-muted lg:w-full"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="flex-1 text-left">{c.name}</span>
                <span className="text-muted-foreground tabular-nums">{c.count}</span>
              </Toggle>
            ))}
          </div>
        </div>

        {/* 户型图与点位：图纸始终是白纸 */}
        <div className="border-b border-border p-3 sm:p-4 lg:border-r lg:border-b-0">
          <div
            id="plan-canvas"
            className="relative aspect-3/2 overflow-hidden rounded-lg bg-white ring-1 ring-border"
          >
            {/*
              这张 demo 户型图是 public/ 下的静态 PNG（/demo-plans/*）。
              本项目的 next/image 用的是 Figma 自定义 loader，它在 fill 模式下
              无法从 loader 拿到宽度，会报
                "Image with src ... has a loader property that does not implement width"
              静态 demo 图本来就不需要按需缩放，直接用 unoptimized 交给浏览器原样加载。
            */}
            <Image
              src={sheet.url}
              alt={`${data.project.name} ${sheet.name}`}
              fill
              sizes="(min-width: 1280px) 780px, (min-width: 1024px) 560px, 100vw"
              className="object-contain opacity-70"
              unoptimized
              priority
            />
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className="absolute inset-0 size-full"
              role="img"
              aria-label={`${sheet.floor}点位图，显示 ${visible.length} 个设备点位`}
            >
              {sheet.areas.map((a) => (
                <text
                  key={a.id}
                  x={planAreaLabelAt(a)[0] * VW + 8}
                  y={planAreaLabelAt(a)[1] * VH + 22}
                  fontSize={15}
                  fontWeight={500}
                  className="fill-neutral-500"
                  stroke="white"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {a.name}
                </text>
              ))}
              {visible.map((p) => {
                const dim = focusType != null && p.type !== focusType
                const src = deviceLook(p.type).art?.srcSm
                return (
                  <g
                    key={`${sheet.id}-${p.id}`}
                    className="cursor-pointer [transform-box:fill-box] [transform-origin:center] motion-safe:animate-marker-in"
                    style={{ animationDelay: `${(order.get(p.id) ?? 0) * 9}ms` }}
                    onPointerEnter={() => setTicket(p)}
                    onPointerLeave={() => setTicket((t) => (t?.id === p.id ? null : t))}
                    onClick={() => setTicket((t) => (t?.id === p.id ? null : p))}
                  >
                    <g
                      className="transition-opacity duration-200"
                      style={{ opacity: dim ? 0.14 : 1 }}
                    >
                      {focusType === p.type ? (
                        <circle
                          cx={p.rx * VW}
                          cy={p.ry * VH}
                          r={ICON * 0.7}
                          className="fill-primary/15 stroke-primary"
                          strokeWidth={1.5}
                        />
                      ) : null}
                      {src ? (
                        <image
                          href={src}
                          x={p.rx * VW - ICON / 2}
                          y={p.ry * VH - ICON / 2}
                          width={ICON}
                          height={ICON}
                        />
                      ) : (
                        <circle
                          cx={p.rx * VW}
                          cy={p.ry * VH}
                          r={8}
                          fill={categoryOfType(p.type)?.color}
                        />
                      )}
                      <circle cx={p.rx * VW} cy={p.ry * VH} r={ICON * 0.6} fill="transparent" />
                    </g>
                  </g>
                )
              })}
            </svg>
            {ticket ? <PriceTicket point={ticket} line={ticketLine ?? null} /> : null}
          </div>
        </div>

        {/* 实时清单 */}
        <aside aria-label="实时报价清单" className="relative flex min-h-96 flex-col lg:min-h-0">
          <div className="flex flex-col lg:absolute lg:inset-0">
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <p className="text-sm font-medium">实时清单 · {sheet.floor}</p>
              <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                {visible.length} 个点位 → {rows.length} 行
              </p>
            </div>
            {/* 清单：外层给固定高度、内部滚动。原来写死 `max-h-80`（320px），
                在窄栏里只能露出 3–4 行，一屏看不全 —— 改成撑满父容器的可用高度。 */}
            <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
              {rows.map((r, i) => (
                <li
                  key={r.type}
                  className="px-1.5 motion-safe:animate-ledger-in"
                  style={{ animationDelay: `${120 + i * 40}ms` }}
                >
                  {/*
                    行结构：图标 · 名称（最多两行，不再截断成省略号）· 数量×单价 · 小计。
                    原来型号名和副标题都 truncate，一窄就只剩「电脑屏幕挂灯护眼…」这种，
                    业主看不出具体型号 —— 现在名称允许折两行，副行只留「数量 × 单价」。
                  */}
                  <button
                    type="button"
                    aria-pressed={pinnedType === r.type}
                    aria-label={`在图上高亮${typeName(r.type)}`}
                    onClick={() => setPinnedType(pinnedType === r.type ? null : r.type)}
                    onMouseEnter={() => setHoverType(r.type)}
                    onMouseLeave={() => setHoverType(null)}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                      pinnedType === r.type ? 'bg-primary/8' : 'hover:bg-muted/60',
                    )}
                  >
                    <PointMarker type={r.type} className="mt-0.5 size-6 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] leading-snug text-foreground">
                        {r.line?.name ?? typeName(r.type)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                        {r.line
                          ? `${r.qty} ${r.line.unit} × ${money(r.line.price)}`
                          : `${r.qty} 个 · 未选型`}
                      </span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-right text-[13px] font-medium tabular-nums">
                      {r.line ? money(r.subtotal) : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-4 sm:px-5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">本层设备小计</span>
                <span className="font-medium tabular-nums">{money(floorTotal)}</span>
              </div>
              {quote ? (
                <>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">全屋报价合计</span>
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">
                      {money(quote.total)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {data.sheets.length} 层设备 {money(quote.productTotal)}
                    {quote.fees.map((f) => ` · ${f.name} ${money(f.amount)}`).join('')}
                    {quote.discount ? ` · 优惠 −${money(quote.discount)}` : ''}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** 价签：设备名称、型号、单价、所在房间 */
function PriceTicket({ point, line }: { point: ShowcasePoint; line: ShowcaseLine | null }) {
  const below = point.ry < 0.28
  const shift = point.rx < 0.18 ? '0%' : point.rx > 0.82 ? '-100%' : '-50%'
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-60 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{
        left: `${point.rx * 100}%`,
        top: `${point.ry * 100}%`,
        transform: `translate(${shift}, ${below ? '22px' : 'calc(-100% - 22px)'})`,
      }}
    >
      <div className="flex items-start gap-2.5">
        <PointMarker type={point.type} className="size-8" />
        <div className="min-w-0">
          <p className="text-sm leading-snug font-medium">{line?.name ?? typeName(point.type)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{line?.sku || '尚未选型'}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between border-t border-border pt-2 text-xs">
        <span className="text-muted-foreground">
          {point.room ?? '未分区'}
          {point.code ? ` · ${point.code}` : ''}
        </span>
        <span className="text-base font-semibold tabular-nums">
          {line ? money(line.price) : '—'}
          {line ? (
            <span className="text-xs font-normal text-muted-foreground"> / {line.unit}</span>
          ) : null}
        </span>
      </div>
    </div>
  )
}
