'use client'

import { useMemo, useState } from 'react'
import { Maximize2 } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { PointMarker } from '@/components/point-marker'
import { ProductThumb } from '@/components/product-thumb'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import {
  DocFacts,
  DocFooter,
  DocHeader,
  DocRoot,
  DocSectionHeading,
  DocSignatures,
  DocTitle,
  docTable,
} from '@/documents/parts'
import { docVars } from '@/documents/theme'
import type { DocLayout, DocStyle } from '@/documents/types'
import type { CompanyInfo } from '@/lib/cached-data'
import { DEFAULT_PAYMENTS, paymentAmounts, rmbUpper } from '@/lib/contracts'
import { categoryOfType, DEVICE_CATEGORIES, deviceTypeOf } from '@/lib/device-types'
import type { LandingShowcase, ShowcaseQuote } from '@/lib/landing-showcase'
import { quoteShortTitle } from '@/lib/project-name'
import { yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'

import { money } from './section'

/**
 * 首页报价单样张：与正式打印页（/print/quotes/[id]）共用最新款报价模板架构，
 * 支持 6 套报价版式（按系统版 / 分区版 / 预算概览 / 图文版 / 标准版 / 精简版）× 7 套视觉风格（默认「栖序雅致」）即时切换。
 */
export function QuoteShowcase({
  data,
  quote,
  styles,
  layouts,
  company,
}: {
  data: LandingShowcase
  quote: ShowcaseQuote
  styles: DocStyle[]
  layouts: DocLayout[]
  company: CompanyInfo
}) {
  const [styleId, setStyleId] = useState(() =>
    styles.some((s) => s.id === 'qixu') ? 'qixu' : (styles[0]?.id ?? ''),
  )
  const [layoutId, setLayoutId] = useState<string>('system')
  const [zoomOpen, setZoomOpen] = useState(false)
  const active = styles.find((s) => s.id === styleId) ?? styles[0]!
  const activeLayout = layouts.find((l) => l.value === layoutId) ?? layouts[0]!

  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start xl:col-span-4">
        <h2 id="quote-title" className="text-headline font-medium">
          报价单
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          同一份清单，6 种版式应对不同场合；7 套视觉风格跟着方案走。
        </p>

        <div className="mt-7 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-foreground">报价版式</span>
            <span className="text-xs text-muted-foreground">{activeLayout?.label}</span>
          </div>
          <TabList
            value={layoutId}
            onChange={setLayoutId}
            layout="fill"
            size="sm"
            aria-label="报价单版式"
          >
            {layouts.map((l) => (
              <Tab key={l.value} value={l.value} label={l.label} panelId="quote-preview" />
            ))}
          </TabList>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-foreground">视觉风格</span>
            <span className="text-muted-foreground">{active.name}</span>
          </div>
          <TabList
            value={styleId}
            onChange={setStyleId}
            layout="fill"
            size="sm"
            aria-label="报价单风格"
          >
            {styles.map((s) => (
              <Tab
                key={s.id}
                value={s.id}
                label={s.name}
                panelId="quote-preview"
                icon={
                  <span
                    aria-hidden
                    style={docVars(s)}
                    className="size-2.5 rounded-full bg-doc-accent ring-1 ring-foreground/15 dark:ring-foreground/40"
                  />
                }
              />
            ))}
          </TabList>
        </div>
      </div>

      <div className="relative min-w-0 rounded-[var(--radius-container)] bg-muted/40 p-2 sm:p-4 lg:col-span-7 xl:col-span-8">
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          title="放大查看"
          aria-label="放大查看报价单"
          className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-[var(--radius-element)] bg-background/90 text-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur transition-colors hover:bg-background"
        >
          <Maximize2 className="size-4" />
        </button>
        <div
          id="quote-preview"
          role="region"
          onClick={() => setZoomOpen(true)}
          title="点击放大查看"
          aria-label={`报价单样张（${activeLayout?.label ?? '标准版'} · ${active.name}风格）：${quote.title}，合计 ${money(quote.total)}`}
          className="cursor-zoom-in"
        >
          <QuoteSheet
            style={active}
            layout={layoutId}
            quote={quote}
            data={data}
            company={company}
          />
        </div>
        {/* 专供「下载方案与报价 PDF」使用的完整展开版（固定标准桌面 A4 宽度，包含全部系统与全部设备明细） */}
        <div
          aria-hidden
          className="pointer-events-none fixed top-0 -left-[9999px] -z-10 w-[794px] opacity-0"
        >
          <QuoteSheet
            style={active}
            layout={layoutId}
            quote={quote}
            data={data}
            company={company}
            expanded
            exportPage
          />
        </div>
      </div>

      <Dialog
        isOpen={zoomOpen}
        onOpenChange={setZoomOpen}
        width="min(94vw,1080px)"
        maxHeight="92vh"
      >
        <Layout
          header={
            <DialogHeader
              title={`报价单 · ${data.project.name}`}
              subtitle="高清放大浏览完整报价单，支持切换版式与视觉风格"
              onOpenChange={setZoomOpen}
              hasDivider
            />
          }
          content={
            <LayoutContent padding={5} className="bg-muted/60">
              {/* 切换器从标题区挪到内容区：官方 DialogHeader 的 endContent 只适合图标按钮，
                  两组 Tab 放进去会把标题挤成一条竖线（真机截图验证过）。 */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <TabList value={layoutId} onChange={setLayoutId} size="sm" aria-label="报价单版式">
                  {layouts.map((l) => (
                    <Tab key={l.value} value={l.value} label={l.label} />
                  ))}
                </TabList>
                <TabList value={styleId} onChange={setStyleId} size="sm" aria-label="报价单风格">
                  {styles.map((s) => (
                    <Tab
                      key={s.id}
                      value={s.id}
                      label={s.name}
                      icon={
                        <span
                          aria-hidden
                          style={docVars(s)}
                          className="size-2 rounded-full bg-doc-accent"
                        />
                      }
                    />
                  ))}
                </TabList>
              </div>
              <QuoteSheet
                style={active}
                layout={layoutId}
                quote={quote}
                data={data}
                company={company}
                expanded
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </div>
  )
}

function QuoteSheet({
  style,
  layout,
  quote,
  data,
  company,
  expanded = false,
  exportPage = false,
}: {
  style: DocStyle
  layout: string
  quote: ShowcaseQuote
  data: LandingShowcase
  company: CompanyInfo
  expanded?: boolean
  exportPage?: boolean
}) {
  const t = docTable(style)
  const address =
    [data.project.community, data.project.address].filter(Boolean).join(' ') || data.project.name
  const quoteLabel = quoteShortTitle(quote.title, data.project.name)
  const showImages =
    layout !== 'compact' && layout !== 'budget' && quote.lines.some((l) => Boolean(l.image))

  // 按系统分组（用于按系统版、预算概览、图文版）
  const systems = useMemo(() => {
    const indexed = quote.lines.map((item, i) => ({ item, i }))
    const groups = DEVICE_CATEGORIES.map((c) => ({
      key: c.slug,
      name: c.name,
      color: c.color as string,
      rows: indexed.filter(({ item }) => categoryOfType(item.type)?.slug === c.slug),
    })).filter((g) => g.rows.length > 0)
    const ungrouped = indexed.filter(({ item }) => !categoryOfType(item.type))
    const all = [
      ...groups,
      ...(ungrouped.length
        ? [{ key: 'other', name: '其他', color: '#525252', rows: ungrouped }]
        : []),
    ]
    return all.map((g) => ({
      ...g,
      subtotal: g.rows.reduce((s, { item }) => s + item.price * item.qty, 0),
      quantity: g.rows.reduce((s, { item }) => s + item.qty, 0),
    }))
  }, [quote.lines])

  const productSum = systems.reduce((s, g) => s + g.subtotal, 0) || 1
  const share = (n: number) => `${Math.round((n / productSum) * 100)}%`

  // 按楼层与房间统计（用于分区版、预算概览）
  const floors = useMemo(() => {
    const lineByType = new Map(quote.lines.map((l) => [l.type, l]))
    return data.sheets.map((sh) => {
      const roomMap = new Map<
        string,
        {
          name: string
          pointCount: number
          subtotal: number
          lines: Map<
            string,
            {
              type: string
              name: string
              sku: string
              unit: string
              price: number
              qty: number
              subtotal: number
            }
          >
        }
      >()
      for (const pt of sh.points) {
        const roomName = pt.room || '公共区域'
        let r = roomMap.get(roomName)
        if (!r) {
          r = { name: roomName, pointCount: 0, subtotal: 0, lines: new Map() }
          roomMap.set(roomName, r)
        }
        r.pointCount += 1
        const line = lineByType.get(pt.type)
        const price = line?.price ?? 0
        r.subtotal += price
        const existing = r.lines.get(pt.type)
        if (existing) {
          existing.qty += 1
          existing.subtotal += price
        } else {
          r.lines.set(pt.type, {
            type: pt.type,
            name: line?.name || deviceTypeOf(pt.type)?.name || '设备',
            sku: line?.sku || '',
            unit: line?.unit || '个',
            price,
            qty: 1,
            subtotal: price,
          })
        }
      }
      const rooms = [...roomMap.values()].map((r) => ({ ...r, lines: [...r.lines.values()] }))
      return {
        sheetId: sh.id,
        floorName: sh.floor,
        sheetName: sh.name,
        pointCount: sh.points.length,
        rooms,
        subtotal: rooms.reduce((s, r) => s + r.subtotal, 0),
      }
    })
  }, [data.sheets, quote.lines])

  const feeTotal = quote.fees.reduce((s, f) => s + f.amount, 0)
  const mobileRows = expanded ? quote.lines.length : 6
  const folded = expanded ? 0 : quote.lines.length - mobileRows
  const visibleSystems = expanded ? systems : systems.slice(0, 3)
  const visibleFloors = expanded ? floors : floors.slice(0, 2)
  const deskCell = exportPage ? 'table-cell' : 'hidden sm:table-cell'

  return (
    <DocRoot
      style={style}
      className={cn(
        'mx-auto overflow-hidden rounded-md shadow-sm ring-1 ring-foreground/10',
        expanded ? 'max-w-4xl' : 'max-w-3xl',
      )}
    >
      <div
        data-export-page={exportPage ? 'flow' : undefined}
        className={cn('bg-doc-paper text-xs leading-relaxed', exportPage ? 'p-8' : 'p-4 sm:p-8')}
      >
        <DocHeader style={style} company={company} meta="报价单样张" />
        <div className="mt-6">
          <DocTitle
            style={style}
            no={yuan(quote.total).replace('.00', '')}
            title="报价单"
            subtitle={`${data.project.name} · ${quoteLabel}（${data.sheets.length} 层 · ${data.pointCount} 个点位）`}
            tag="QUOTATION"
          />
        </div>
        <DocFacts
          cols={2}
          className="mt-5 border-y border-doc-rule py-3"
          items={[
            ['客户', data.project.customer || '—'],
            ['项目', data.project.name],
            ['地址', address],
            ['主平台', data.project.platform || '—'],
            [
              '规模',
              `${data.sheets.length} 层 · ${data.roomCount} 个房间 · ${data.pointCount} 个点位`,
            ],
            ['有效期', '30 天'],
          ]}
        />

        <div className="mt-5">
          {layout === 'system' ? (
            <div className="space-y-5">
              <section>
                <DocSectionHeading
                  style={style}
                  className="mb-2"
                  title="系统汇总"
                  note={`${systems.length} 个系统 · ${quote.lines.length} 行设备`}
                />
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr className={t.head}>
                      <th className={t.th}>系统</th>
                      <th className={cn(t.th, deskCell, 'w-16 text-right')}>行数</th>
                      <th className={cn(t.th, 'w-16 text-right')}>数量</th>
                      <th className={cn(t.th, 'w-24 text-right')}>小计</th>
                      <th className={cn(t.th, deskCell, 'w-32')}>占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systems.map((g, i) => (
                      <tr key={g.key} className={t.row(i)}>
                        <td className={cn(t.td, 'py-1.5')}>
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: g.color }}
                            />
                            {g.name}
                          </span>
                        </td>
                        <td className={cn(t.td, deskCell, 'py-1.5 text-right tabular-nums')}>
                          {g.rows.length}
                        </td>
                        <td className={cn(t.td, 'py-1.5 text-right tabular-nums')}>{g.quantity}</td>
                        <td className={cn(t.td, 'py-1.5 text-right tabular-nums')}>
                          {yuan(g.subtotal)}
                        </td>
                        <td className={cn(t.td, deskCell, 'py-1.5')}>
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-doc-stripe">
                              <span
                                className="block h-full rounded-full"
                                style={{ width: share(g.subtotal), backgroundColor: g.color }}
                              />
                            </span>
                            <span className="w-8 text-right text-[10.5px] text-doc-muted tabular-nums">
                              {share(g.subtotal)}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {visibleSystems.map((g) => (
                <section key={g.key}>
                  <DocSectionHeading
                    style={style}
                    className="mb-2"
                    title={
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}系统
                      </span>
                    }
                    note={`${g.rows.length} 行 · 小计 ${yuan(g.subtotal)}`}
                  />
                  <table className="w-full table-fixed border-collapse text-[11.5px]">
                    <thead>
                      <tr className={t.head}>
                        <th className={cn(t.th, deskCell, 'w-11 whitespace-nowrap')}>序号</th>
                        {showImages ? (
                          <th className={cn(t.th, deskCell, 'w-12 whitespace-nowrap')}>图片</th>
                        ) : null}
                        <th className={t.th}>产品</th>
                        {expanded ? (
                          <th className={cn(t.th, 'w-36 whitespace-nowrap')}>型号</th>
                        ) : null}
                        <th className={cn(t.th, 'w-20 text-right whitespace-nowrap')}>单价</th>
                        <th className={cn(t.th, 'w-16 text-right whitespace-nowrap')}>数量</th>
                        <th className={cn(t.th, 'w-24 text-right whitespace-nowrap')}>金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(({ item, i }, k) => (
                        <tr key={`${item.sku}-${i}`} className={t.row(k)}>
                          <td className={cn(t.td, deskCell, 'py-1.5 text-doc-muted tabular-nums')}>
                            {i + 1}
                          </td>
                          {showImages ? (
                            <td className={cn(t.td, deskCell, 'py-1')}>
                              <ProductThumb
                                src={item.image}
                                alt={item.name}
                                size={96}
                                loading="lazy"
                                className="size-8"
                              />
                            </td>
                          ) : null}
                          <td className={cn(t.td, 'py-1.5')}>
                            <span
                              className={cn(
                                'flex min-w-0 gap-1.5',
                                expanded ? 'items-start' : 'items-center',
                              )}
                            >
                              <PointMarker type={item.type} className="size-3.5 shrink-0" />
                              <span className={expanded ? undefined : 'truncate'}>{item.name}</span>
                            </span>
                          </td>
                          {expanded ? (
                            <td className={cn(t.td, 'py-1.5 break-all text-doc-muted')}>
                              {item.sku}
                            </td>
                          ) : null}
                          <td
                            className={cn(t.td, 'py-1.5 text-right whitespace-nowrap tabular-nums')}
                          >
                            {yuan(item.price)}
                          </td>
                          <td
                            className={cn(t.td, 'py-1.5 text-right whitespace-nowrap tabular-nums')}
                          >
                            {item.qty} {item.unit}
                          </td>
                          <td
                            className={cn(t.td, 'py-1.5 text-right whitespace-nowrap tabular-nums')}
                          >
                            {yuan(item.price * item.qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
              {!expanded && systems.length > 3 ? (
                <p className="text-center text-[11px] text-doc-muted">
                  …… 另有{' '}
                  {systems
                    .slice(3)
                    .map((s) => `${s.name}系统`)
                    .join('、')}
                  （完整版包含全部 {systems.length} 个系统分表）
                </p>
              ) : null}
            </div>
          ) : layout === 'budget' ? (
            <div className="space-y-5">
              <section className="grid grid-cols-1 items-end gap-4 rounded-doc border border-doc-rule p-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="text-[11.5px] text-doc-muted">报价合计</div>
                  <div className="doc-numeral mt-1 text-[30px] leading-none text-doc-accent">
                    {yuan(quote.total)}
                  </div>
                  <div className="mt-2 text-[11.5px] text-doc-muted">
                    大写：{rmbUpper(quote.total)}
                  </div>
                </div>
                <div className="space-y-1 text-left text-[11.5px] sm:text-right">
                  <div>
                    <span className="text-doc-muted">设备 </span>
                    <span className="tabular-nums">{yuan(quote.productTotal)}</span>
                  </div>
                  {feeTotal > 0 ? (
                    <div>
                      <span className="text-doc-muted">服务与附加 </span>
                      <span className="tabular-nums">{yuan(feeTotal)}</span>
                    </div>
                  ) : null}
                  {quote.discount ? (
                    <div>
                      <span className="text-doc-muted">优惠 </span>
                      <span className="tabular-nums">-{yuan(quote.discount)}</span>
                    </div>
                  ) : null}
                  <div className="text-doc-muted">
                    {quote.lines.length} 行设备 · 共 {quote.lines.reduce((s, i) => s + i.qty, 0)} 件
                  </div>
                </div>
              </section>
              <section>
                <DocSectionHeading
                  style={style}
                  className="mb-2"
                  title="各系统预算"
                  note="按设备类别汇总"
                />
                <div className="space-y-2 text-[11.5px]">
                  {systems.map((g) => (
                    <div
                      key={g.key}
                      className="grid grid-cols-[6rem_1fr_5.5rem_2.5rem] items-center gap-2.5"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-doc-stripe">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: share(g.subtotal), backgroundColor: g.color }}
                        />
                      </span>
                      <span className="text-right tabular-nums">{yuan(g.subtotal)}</span>
                      <span className="text-right text-doc-muted tabular-nums">
                        {share(g.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              {floors.length ? (
                <section>
                  <DocSectionHeading
                    style={style}
                    className="mb-2"
                    title="各楼层设备"
                    note="按点位图统计"
                  />
                  <table className="w-full border-collapse text-[11.5px]">
                    <thead>
                      <tr className={t.head}>
                        <th className={t.th}>楼层</th>
                        <th className={cn(t.th, 'text-right')}>房间</th>
                        <th className={cn(t.th, 'text-right')}>点位</th>
                        <th className={cn(t.th, 'text-right')}>设备金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floors.map((f, i) => (
                        <tr key={f.sheetId} className={t.row(i)}>
                          <td className={cn(t.td, 'py-1.5')}>{f.floorName}</td>
                          <td className={cn(t.td, 'py-1.5 text-right tabular-nums')}>
                            {f.rooms.length}
                          </td>
                          <td className={cn(t.td, 'py-1.5 text-right tabular-nums')}>
                            {f.pointCount}
                          </td>
                          <td className={cn(t.td, 'py-1.5 text-right tabular-nums')}>
                            {yuan(f.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
              <section>
                <DocSectionHeading
                  style={style}
                  className="mb-2"
                  title="参考付款节点"
                  note="签订合同后以合同约定为准"
                />
                <table className="w-full border-collapse text-[11.5px]">
                  <tbody>
                    {DEFAULT_PAYMENTS.map((p, i) => (
                      <tr key={p.name} className={t.row(i)}>
                        <td className={cn(t.td, 'w-8 py-1.5 tabular-nums')}>{i + 1}</td>
                        <td className={cn(t.td, 'py-1.5')}>{p.name}</td>
                        <td className={cn(t.td, 'w-14 py-1.5 text-right tabular-nums')}>
                          {p.percent}%
                        </td>
                        <td className={cn(t.td, 'w-28 py-1.5 text-right tabular-nums')}>
                          {yuan(paymentAmounts(quote.total, DEFAULT_PAYMENTS)[i] ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          ) : layout === 'detailed' ? (
            <div className="space-y-5">
              {visibleSystems.map((g) => (
                <section key={g.key}>
                  <DocSectionHeading
                    style={style}
                    className="mb-2"
                    title={
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}
                      </span>
                    }
                    note={`小计 ${yuan(g.subtotal)}`}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.rows.map(({ item, i }) => (
                      <div
                        key={`${item.sku}-${i}`}
                        className="flex gap-3 rounded-doc border border-doc-rule p-2"
                      >
                        <ProductThumb
                          src={item.image}
                          alt={item.name}
                          size={120}
                          loading="lazy"
                          className="size-14 shrink-0"
                        />
                        <div className="flex min-w-0 flex-1 flex-col text-[11px]">
                          {item.brandName ? (
                            <BrandLogo
                              name={item.brandName}
                              logo={item.brandLogo ?? null}
                              className="h-3 max-w-14"
                            />
                          ) : null}
                          <div className="doc-strong mt-0.5 line-clamp-1 leading-snug">
                            {item.name}
                          </div>
                          <div className="truncate text-[10px] text-doc-muted">{item.sku}</div>
                          <div className="mt-auto flex justify-between pt-1 tabular-nums">
                            <span className="text-doc-muted">
                              {yuan(item.price)} × {item.qty}
                              {item.unit}
                            </span>
                            <span className="doc-strong">{yuan(item.price * item.qty)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {!expanded && systems.length > 3 ? (
                <p className="text-center text-[11px] text-doc-muted">
                  …… 另有{' '}
                  {systems
                    .slice(3)
                    .map((s) => s.name)
                    .join('、')}{' '}
                  等系统产品卡片
                </p>
              ) : null}
            </div>
          ) : layout === 'area' ? (
            <div className="space-y-5">
              <DocSectionHeading
                style={style}
                title="按楼层 · 房间配置明细"
                note={`${floors.length} 层 · ${floors.reduce((s, f) => s + f.rooms.length, 0)} 个房间`}
              />
              {visibleFloors.map((floor) => (
                <div key={floor.sheetId} className="space-y-2.5">
                  <div className="flex items-baseline justify-between bg-doc-stripe px-2.5 py-1.5 text-[11.5px]">
                    <div>
                      <span className="doc-strong">{floor.floorName}</span>
                      <span className="ml-2 text-[10.5px] text-doc-muted">
                        {floor.sheetName} · {floor.rooms.length} 个房间 · {floor.pointCount} 个点位
                      </span>
                    </div>
                    <span className="doc-strong tabular-nums">楼层小计 {yuan(floor.subtotal)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(expanded ? floor.rooms : floor.rooms.slice(0, 4)).map((r) => (
                      <div
                        key={r.name}
                        className="rounded-doc border border-doc-rule p-2.5 text-[11px]"
                      >
                        <div className="doc-strong mb-1.5 flex items-baseline justify-between border-b border-doc-rule/60 pb-1">
                          <span>
                            {r.name}
                            <span className="doc-body ml-1 text-doc-muted">
                              （{r.pointCount} 点位）
                            </span>
                          </span>
                          <span className="tabular-nums">{yuan(r.subtotal)}</span>
                        </div>
                        <div className="divide-y divide-doc-rule/60">
                          {(expanded ? r.lines : r.lines.slice(0, 4)).map((l) => (
                            <div
                              key={l.type}
                              className="flex items-center gap-1.5 py-1 first:pt-0 last:pb-0"
                            >
                              <PointMarker type={l.type} className="size-3.5 shrink-0" />
                              <div className="min-w-0 flex-1 truncate">{l.name}</div>
                              <div className="shrink-0 text-right tabular-nums">
                                {yuan(l.price)} × {l.qty}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!expanded && floors.length > 2 ? (
                <p className="text-center text-[11px] text-doc-muted">
                  …… 另有{' '}
                  {floors
                    .slice(2)
                    .map((f) => f.floorName)
                    .join('、')}{' '}
                  房间配置及整单产品汇总表
                </p>
              ) : null}
            </div>
          ) : (
            <table
              className={cn(
                'w-full table-fixed border-collapse',
                layout === 'compact' ? 'text-[11px]' : 'text-[11.5px]',
              )}
            >
              <thead>
                <tr className={t.head}>
                  <th className={cn(t.th, deskCell, 'w-11 whitespace-nowrap')}>序号</th>
                  {showImages ? (
                    <th className={cn(t.th, deskCell, 'w-12 whitespace-nowrap')}>图片</th>
                  ) : null}
                  <th className={t.th}>产品</th>
                  {expanded ? <th className={cn(t.th, 'w-36 whitespace-nowrap')}>型号</th> : null}
                  <th className={cn(t.th, 'w-20 text-right whitespace-nowrap')}>单价</th>
                  <th className={cn(t.th, 'w-16 text-right whitespace-nowrap')}>数量</th>
                  <th className={cn(t.th, 'w-24 text-right whitespace-nowrap')}>金额</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((item, i) => (
                  <tr
                    key={`${item.sku}-${i}`}
                    className={cn(t.row(i), i >= mobileRows && 'max-sm:hidden')}
                  >
                    <td
                      className={cn(
                        t.td,
                        deskCell,
                        'text-doc-muted tabular-nums',
                        layout === 'compact' ? 'py-1' : 'py-2',
                      )}
                    >
                      {i + 1}
                    </td>
                    {showImages ? (
                      <td className={cn(t.td, deskCell, 'py-1')}>
                        <ProductThumb
                          src={item.image}
                          alt={item.name}
                          size={96}
                          loading="lazy"
                          className="size-8"
                        />
                      </td>
                    ) : null}
                    <td className={cn(t.td, layout === 'compact' ? 'py-1' : 'py-2')}>
                      <span
                        className={cn(
                          'flex min-w-0 gap-2',
                          expanded ? 'items-start' : 'items-center',
                        )}
                      >
                        <PointMarker type={item.type} className="size-4 shrink-0" />
                        <span className={expanded ? undefined : 'truncate'}>{item.name}</span>
                      </span>
                    </td>
                    {expanded ? (
                      <td className={cn(t.td, 'break-all text-doc-muted')}>{item.sku}</td>
                    ) : null}
                    <td className={cn(t.td, 'text-right whitespace-nowrap tabular-nums')}>
                      {yuan(item.price)}
                    </td>
                    <td className={cn(t.td, 'text-right whitespace-nowrap tabular-nums')}>
                      {item.qty} {item.unit}
                    </td>
                    <td className={cn(t.td, 'text-right whitespace-nowrap tabular-nums')}>
                      {yuan(item.price * item.qty)}
                    </td>
                  </tr>
                ))}
                {folded > 0 ? (
                  <tr className="sm:hidden">
                    <td colSpan={4} className={cn(t.td, 'py-2 text-center text-doc-muted')}>
                      …… 另有 {folded} 行设备
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>

        {layout !== 'budget' ? (
          <div className="mt-5 ml-auto w-full max-w-72 space-y-1">
            <SumRow label="产品小计" value={yuan(quote.productTotal)} />
            {quote.fees.map((fee) => (
              <SumRow key={fee.name} label={fee.name} value={yuan(fee.amount)} />
            ))}
            {quote.discount ? <SumRow label="优惠" value={`-${yuan(quote.discount)}`} /> : null}
            <div className="flex items-baseline justify-between border-t border-doc-ink/30 pt-2">
              <span className="doc-strong">合计</span>
              <span className="doc-numeral text-xl text-doc-accent">{yuan(quote.total)}</span>
            </div>
          </div>
        ) : null}

        <DocSignatures
          className="mt-8"
          parties={[{ label: '客户确认签字' }, { label: `${company.name} 盖章` }]}
        />
        <DocFooter className="mt-6" left={address} center="QUOTATION · V1.0" right={company.name} />
      </div>
    </DocRoot>
  )
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-doc-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
