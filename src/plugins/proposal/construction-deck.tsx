/**
 * 方案演示插件：施工交底（横版 A4，不含价格）——点位图、房间配置、设备清单与逐点核对表，给安装团队。
 * 给客户的 8 章提案见 ./deck。
 */
import Image from 'next/image'
import { AlertTriangle, Check, Plus } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { PlanFigure } from '@/components/plan-figure'
import { PointMarker } from '@/components/point-marker'
import { ProductThumb } from '@/components/product-thumb'
import { LEVEL_LABEL } from '@/lib/area-analysis'
import { categoryOfType, deviceTypeOf, DEVICE_TYPE_ORDER } from '@/lib/device-types'
import type { ProjectDocsData as ProposalData, Room } from '@/lib/project-docs'
import { cn } from '@/lib/utils'
import { planAreaOf } from '@/lib/point-scene'

const chunk = <T,>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n))

type Ctx = { d: ProposalData; markers: 'symbol' | 'product'; date: string }

function Page({
  ctx,
  title,
  no,
  children,
}: {
  ctx: Ctx
  title?: string
  no: number
  children: React.ReactNode
}) {
  return (
    <section
      data-export-page
      className={cn(
        'relative mx-auto flex h-[210mm] w-[297mm] min-w-[297mm] shrink-0 flex-col overflow-hidden bg-white px-[14mm] py-[11mm] text-neutral-900 shadow-sm break-after-page last:break-after-auto print:h-[209mm] print:shadow-none',
      )}
    >
      {title ? (
        <header className="mb-[6mm] flex items-end justify-between border-b border-neutral-200 pb-[3mm]">
          <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
          <span className="text-[10px] text-neutral-500">
            {ctx.d.company.name} · {ctx.d.project.name}
          </span>
        </header>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {title ? (
        <footer className="mt-[4mm] flex justify-between text-[9px] text-neutral-400">
          <span>施工交底 · 以现场复核为准</span>
          <span className="tabular-nums">{String(no).padStart(2, '0')}</span>
        </footer>
      ) : null}
    </section>
  )
}

function Cover({ ctx }: { ctx: Ctx }) {
  const { d } = ctx
  const logo = d.company.logo
  const facts = [
    ['客户', d.project.customerName],
    ['地址', [d.project.community, d.project.address].filter(Boolean).join(' ') || '—'],
    ['主平台', d.project.platform ?? '待定'],
    ['设计师', d.owner?.name ?? '—'],
    ['日期', ctx.date],
  ]
  return (
    <Page ctx={ctx} no={1}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logo ? (
              <Image
                src={logo.url}
                alt={logo.alt}
                width={logo.width ?? 96}
                height={logo.height ?? 96}
                className="h-11 w-auto"
                unoptimized
              />
            ) : null}
            <div>
              <div className="text-base font-semibold">{d.company.name}</div>
              {d.company.slogan ? (
                <div className="text-[11px] text-neutral-500">{d.company.slogan}</div>
              ) : null}
            </div>
          </div>
          <div className="flex h-2 w-40 overflow-hidden rounded-full">
            {d.categories.map((c) => (
              <span
                key={c.slug}
                className="h-full"
                style={{ backgroundColor: c.color, flex: c.count }}
              />
            ))}
          </div>
        </div>
        <div className="my-auto space-y-5">
          <p className="text-sm text-neutral-500">施工交底 · 点位布置与设备清单</p>
          <h1 className="text-[40px] leading-tight font-bold tracking-tight">{d.project.name}</h1>
          <div className="flex gap-10 text-[13px]">
            <div>
              <div className="text-3xl font-semibold tabular-nums">{d.points.length}</div>
              <div className="text-neutral-500">智能点位</div>
            </div>
            <div>
              <div className="text-3xl font-semibold tabular-nums">{d.rooms.length}</div>
              <div className="text-neutral-500">覆盖房间</div>
            </div>
            <div>
              <div className="text-3xl font-semibold tabular-nums">{d.sheets.length}</div>
              <div className="text-neutral-500">设计图纸</div>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-5 gap-4 border-t border-neutral-200 pt-4 text-[12px]">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-neutral-500">{k}</dt>
              <dd className="mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Page>
  )
}

function Overview({ ctx, no }: { ctx: Ctx; no: number }) {
  const { d } = ctx
  const max = Math.max(...d.categories.map((c) => c.count), 1)
  const acRouters = d.points.filter((p) => p.deviceType === 'ac-router')
  const allAps = d.points.filter((p) => p.deviceType === 'ap-node' || p.deviceType === 'ceiling-ap')
  const gateways = d.points.filter((p) => p.deviceType === 'gateway')
  const apRooms = d.rooms
    .map((r) => {
      const aps = r.points.filter(
        (p) => p.deviceType === 'ap-node' || p.deviceType === 'ceiling-ap',
      )
      if (!aps.length) return null
      return {
        room: r.displayName,
        codes: aps
          .map((p) => p.code)
          .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
          .join('、'),
        count: aps.length,
      }
    })
    .filter((v): v is { room: string; codes: string; count: number } => Boolean(v))

  return (
    <Page ctx={ctx} no={no} title="方案概览">
      <div className="grid flex-1 grid-cols-[1.1fr_1fr] gap-[10mm]">
        <div className="space-y-[5mm]">
          <div className="grid grid-cols-4 gap-3">
            {[
              ['智能点位', d.points.length],
              ['房间', d.rooms.length],
              ['设备型号', d.products.length],
              ['待选型', d.pending],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-neutral-200 px-3 py-3.5">
                <div className="text-[12px] text-neutral-500">{k}</div>
                <div className="mt-1 text-[26px] font-semibold leading-tight tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-[14px] font-semibold">设备构成</h3>
            <div className="space-y-1.5">
              {d.categories.map((c) => (
                <div
                  key={c.slug}
                  className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-2 text-[12px]"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  <span className="h-2 rounded-full bg-neutral-100">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(c.count / max) * 100}%`, backgroundColor: c.color }}
                    />
                  </span>
                  <span className="text-right tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
            <div className="flex flex-col items-start gap-1 text-[12px]">
              <span className="font-semibold">网络与中控拓扑（AC 控制 + 各房间 AP 节点）</span>
              <span className="text-[11px] leading-snug text-neutral-500">
                AC 核心 ×{acRouters.length || 1} · AP 房间 ×{apRooms.length}（共 {allAps.length} 台
                AP）· 中枢网关 ×{gateways.length}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
              <div className="col-span-3 flex flex-col items-start gap-1 rounded border border-neutral-300 bg-white px-2.5 py-2">
                <span className="font-medium">
                  {acRouters.length
                    ? `${acRouters.map((p) => p.code).join('、')} AC 控制器 / PoE 核心交换`
                    : '弱电箱 AC 控制器 / PoE 核心交换机'}
                </span>
                <span className="text-neutral-500">统一管控全屋 AP 漫游与千兆 PoE 供电</span>
              </div>
              {apRooms.slice(0, 6).map((r) => (
                <div
                  key={r.room}
                  className="flex min-w-0 flex-col gap-1 rounded border border-neutral-200 bg-white px-2 py-1.5"
                >
                  <span className="wrap-anywhere font-medium leading-snug">{r.room}</span>
                  <span className="font-mono text-[10px] text-cyan-700 wrap-anywhere">
                    {r.codes}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-[6mm]">
          <div>
            <h3 className="mb-2 text-[14px] font-semibold">方案亮点</h3>
            <ul className="space-y-2 text-[13px] leading-[1.55]">
              {d.analysis.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
          {d.analysis.warnings.length || d.pending ? (
            <div>
              <h3 className="mb-2 text-[14px] font-semibold">需要确认</h3>
              <ul className="space-y-1.5 text-[12px] leading-[1.55] text-neutral-600">
                {d.pending ? (
                  <li className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    {d.pending} 个点位暂未选型，请先确认型号再备货
                  </li>
                ) : null}
                {d.analysis.warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {d.rooms.length ? (
            <div>
              <h3 className="mb-2 text-[14px] font-semibold">
                房间配置完整度
                {d.analysis.score !== null ? (
                  <span className="ml-2 font-normal text-neutral-500">
                    平均 {d.analysis.score}%
                  </span>
                ) : null}
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {d.rooms.slice(0, 12).map((r) => (
                  <div
                    key={r.areaId}
                    className="min-w-0 rounded-md border border-neutral-200 px-2 py-2 text-[11px]"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="min-w-0 line-clamp-2 font-medium leading-snug wrap-anywhere">
                        {r.displayName}
                      </span>
                      <span className="shrink-0 tabular-nums text-neutral-500">{r.score}%</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-neutral-100">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          r.score >= 100
                            ? 'bg-emerald-500'
                            : r.score >= 60
                              ? 'bg-neutral-700'
                              : 'bg-amber-500',
                        )}
                        style={{ width: `${r.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Page>
  )
}

function PlanPage({ ctx, no, sheetId }: { ctx: Ctx; no: number; sheetId: string }) {
  const { d, markers } = ctx
  const sheet = d.sheets.find((s) => s.id === sheetId)!
  const pts = d.points.filter((p) => p.sheetId === sheetId)
  const areas = d.areas.filter((a) => a.sheetId === sheetId).map((a) => planAreaOf(a, sheet))
  const types = DEVICE_TYPE_ORDER.filter((t) => pts.some((p) => p.deviceType === t))
  return (
    <Page
      ctx={ctx}
      no={no}
      title={`${sheet.name} · ${ctx.d.scope === 'switch' ? '开关布局图' : ctx.d.scope === 'switch-light' ? '灯光开关布局图' : '点位图'}`}
    >
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_56mm] gap-[6mm]">
        <div className="flex items-center rounded-lg border border-neutral-200">
          <PlanFigure
            sheetUrl={sheet.url}
            points={pts.map((p) => ({
              ...p,
              image: p.productId ? d.productById.get(p.productId)?.image?.url : null,
            }))}
            areas={areas}
            mode={markers}
            showCodes
            showAreas
            className="w-full"
          />
        </div>
        <div className="min-h-0 space-y-1 text-[11px]">
          <div className="mb-1.5 flex justify-between text-[13px] font-semibold">
            <span>图例</span>
            <span className="font-normal text-neutral-500">{pts.length} 个点位</span>
          </div>
          {types.map((t) => {
            const list = pts.filter((p) => p.deviceType === t)
            const product = list[0]?.productId ? d.productById.get(list[0].productId) : null
            return (
              <div key={t} className="flex items-center gap-1.5 border-b border-neutral-100 pb-1">
                {markers === 'product' && product?.image ? (
                  <ProductThumb
                    src={product.image.url}
                    alt={product.name}
                    className="size-6 rounded-full"
                  />
                ) : (
                  <PointMarker type={t} className="size-5" />
                )}
                <span className="min-w-0 flex-1 font-medium">{deviceTypeOf(t)?.name}</span>
                <span className="shrink-0 tabular-nums">×{list.length}</span>
              </div>
            )
          })}
          <p className="pt-2 text-[10px] leading-relaxed text-neutral-500">
            图例按设备类型汇总。品牌、完整型号与备货数量见后续设备清单。
          </p>
        </div>
      </div>
    </Page>
  )
}

function RoomCard({ r }: { r: Room }) {
  const core = r.missing.filter((m) => m.level !== 'optional')
  return (
    <div className="flex min-w-0 flex-col self-start rounded-lg border border-neutral-200 p-[4mm] text-[11px] leading-[1.5]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-snug wrap-anywhere">
            {r.displayName}
          </div>
          <div className="text-neutral-500">
            {r.typeLabel} · {r.total} 个点位{r.sheets.length ? ` · ${r.sheets.join('、')}` : ''}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              'text-[16px] font-semibold tabular-nums',
              r.score >= 100
                ? 'text-emerald-600'
                : r.score >= 60
                  ? 'text-neutral-900'
                  : 'text-amber-600',
            )}
          >
            {r.score}%
          </div>
          <div className="text-[9px] text-neutral-500">配置完整度</div>
        </div>
      </div>
      <div className="mt-2 divide-y divide-neutral-100 border-y border-neutral-100 py-1">
        {r.lines.slice(0, 6).map((l) => (
          <div
            key={`${l.deviceType}-${l.product?.id ?? 'none'}`}
            className="flex items-start justify-between gap-1.5 py-1"
          >
            <span className="flex min-w-0 flex-1 items-start gap-1.5">
              <PointMarker type={l.deviceType} className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{l.typeName}</span>
                <span className="block text-[10.5px] leading-snug text-neutral-500 wrap-anywhere">
                  {l.product?.name ?? '待选型'}
                </span>
              </span>
            </span>
            <span className="shrink-0 tabular-nums">×{l.count}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 leading-relaxed text-neutral-600">
        <span className="font-medium text-neutral-900">点位：</span>
        {r.points
          .map((p) => p.code)
          .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
          .join('、')}
      </p>
      <div className="mt-2 space-y-1">
        {r.met.map((m) => (
          <p key={m.label} className="flex gap-1">
            <Check className="size-3 shrink-0 text-emerald-600" />
            <span>
              <span className="font-medium">{m.label}</span>
              <span className="text-neutral-500">：{m.reason}</span>
            </span>
          </p>
        ))}
        {core.map((m) => (
          <p key={m.label} className="flex gap-1 text-amber-700">
            <Plus className="size-3 shrink-0" />
            <span>
              建议补充{m.label}（{LEVEL_LABEL[m.level]}）：{m.reason}
            </span>
          </p>
        ))}
        {r.warnings
          .filter((w) => !w.includes('还没有放置'))
          .map((w) => (
            <p key={w} className="flex gap-1 text-amber-700">
              <AlertTriangle className="size-3 shrink-0" />
              {w}
            </p>
          ))}
      </div>
    </div>
  )
}

function ProductsPage({
  ctx,
  no,
  rows,
  title,
}: {
  ctx: Ctx
  no: number
  rows: ProposalData['products']
  title: string
}) {
  return (
    <Page ctx={ctx} no={no} title={title}>
      <div className="grid auto-rows-max grid-cols-3 content-start items-start gap-[4mm]">
        {rows.map((r) => (
          <div
            key={r.product.id}
            className="flex min-h-[44mm] min-w-0 gap-[3mm] rounded-lg border border-neutral-200 p-[3mm] text-[11px]"
          >
            {r.product.image ? (
              <ProductThumb
                src={r.product.image.url}
                alt={r.product.name}
                className="size-[24mm] shrink-0"
              />
            ) : (
              <PointMarker type={r.deviceType} className="size-[24mm] shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <BrandLogo
                name={r.product.brand?.name ?? ''}
                logo={r.product.brand?.logo ?? null}
                className="h-3 max-w-14"
              />
              <div className="mt-1 text-[12px] font-medium leading-[1.4] wrap-anywhere">
                {r.product.name}
              </div>
              <div className="mt-1 text-[10.5px] leading-snug text-neutral-500 wrap-anywhere">
                {r.product.sku}
              </div>
              <div className="mt-auto flex items-baseline justify-between pt-2">
                <span className="flex items-center gap-1 text-neutral-500">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryOfType(r.deviceType)?.color }}
                  />
                  {deviceTypeOf(r.deviceType)?.name} ×{r.count}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Page>
  )
}

function SchedulePage({
  ctx,
  no,
  rows,
  title,
}: {
  ctx: Ctx
  no: number
  rows: ProposalData['points']
  title: string
}) {
  const { d } = ctx
  const area = new Map(d.areas.map((a) => [a.id, a.name]))
  const sheet = new Map(d.sheets.map((s) => [s.id, s.name]))
  return (
    <Page ctx={ctx} no={no} title={title}>
      <table className="w-full border-collapse text-[9.5px]">
        <thead>
          <tr className="border-y border-neutral-300 bg-neutral-50 text-left">
            <th className="py-1 pl-2">代号</th>
            <th>设备</th>
            <th>房间</th>
            <th>图纸</th>
            <th>型号</th>
            <th className="pr-2 text-right">完成</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const product = p.productId ? d.productById.get(p.productId) : null
            return (
              <tr key={p.id} className="border-b border-neutral-100">
                <td
                  className="py-[1.1mm] pl-2 font-semibold tabular-nums"
                  style={{ color: categoryOfType(p.deviceType)?.color }}
                >
                  {p.code}
                </td>
                <td>{deviceTypeOf(p.deviceType)?.name}</td>
                <td>{p.areaId ? area.get(p.areaId) : '—'}</td>
                <td className="text-neutral-500">{p.sheetId ? sheet.get(p.sheetId) : '—'}</td>
                <td className="max-w-[90mm] text-neutral-600 wrap-anywhere">
                  {product ? product.sku || product.name : '待选型'}
                </td>
                <td className="pr-2 text-right text-neutral-300">□</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Page>
  )
}

/** 生成施工交底的各页。roomInsights 关闭时不出「区域配置」页。 */
export function constructionDeckPages(
  d: ProposalData,
  markers: 'symbol' | 'product',
  roomInsights: boolean,
  date: string,
) {
  const ctx: Ctx = { d, markers, date }
  const scope = d.scope
  const pages: ((no: number) => React.ReactNode)[] = []
  pages.push(() => <Cover ctx={ctx} />)
  if (scope === 'all') pages.push((no) => <Overview ctx={ctx} no={no} />)
  for (const s of d.sheets)
    if (scope === 'all' || d.points.some((p) => p.sheetId === s.id))
      pages.push((no) => <PlanPage ctx={ctx} no={no} sheetId={s.id} />)
  const roomGroups = roomInsights && scope === 'all' ? chunk(d.rooms, 3) : []
  for (const [i, group] of roomGroups.entries())
    pages.push((no) => (
      <Page ctx={ctx} no={no} title={`区域配置${roomGroups.length > 1 ? `（${i + 1}）` : ''}`}>
        <div className="grid auto-rows-max grid-cols-3 content-start items-start gap-[5mm]">
          {group.map((r) => (
            <RoomCard key={r.areaId} r={r} />
          ))}
        </div>
      </Page>
    ))
  const productPages = chunk(d.products, 9)
  for (const [i, rows] of productPages.entries())
    pages.push((no) => (
      <ProductsPage
        ctx={ctx}
        no={no}
        rows={rows}
        title={`设备清单${productPages.length > 1 ? `（${i + 1}/${productPages.length}）` : ''}`}
      />
    ))
  const sorted = d.points
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
  const sch = chunk(sorted, 26)
  for (const [i, rows] of sch.entries())
    pages.push((no) => (
      <SchedulePage ctx={ctx} no={no} rows={rows} title={`点位清单（${i + 1}/${sch.length}）`} />
    ))
  return pages
}
