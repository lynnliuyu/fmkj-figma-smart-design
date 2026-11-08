import { notFound, redirect } from 'next/navigation'

import { PlanFigure } from '@/components/plan-figure'
import { PointMarker } from '@/components/point-marker'
import { PrintToolbar } from '@/components/print-toolbar'
import { ProductThumb } from '@/components/product-thumb'
import {
  DocEmpty,
  DocFooter,
  DocHeader,
  DocRoot,
  DocSheetPage,
  DocTitle,
  docTable,
} from '@/documents/parts'
import { docToolbarGroups, resolveDocSetup } from '@/documents/registry'
import { appAuth } from '@/lib/app-auth'
import { deviceTypeOf, DEVICE_TYPE_ORDER } from '@/lib/device-types'
import {
  docNumber,
  isPointScope,
  loadProjectDocs,
  POINT_SCOPES,
  scopeTitle,
} from '@/lib/project-docs'
import { cn } from '@/lib/utils'
import { planAreaOf } from '@/lib/point-scene'

export const metadata = { title: '点位图', robots: { index: false, follow: false } }

const pad = (n: number) => String(n).padStart(2, '0')

/** 点位图：每张图纸一页横向 A4（设备图标 / 产品图 / 大图），最后一页按图纸统计设备数量。 */
export default async function PlansPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string; layout?: string; scope?: string; quoteId?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/projects/${id}/plans`)
  const scope = isPointScope(sp.scope) ? sp.scope : 'all'
  const d = await loadProjectDocs(id, user, scope, sp.quoteId ?? null)
  if (!d) notFound()
  const setup = await resolveDocSetup('plans', sp, d.owner?.id ?? user.id)
  const { style, layout, company } = setup
  const markers = layout === 'product' ? 'product' : 'symbol'
  const sheets = d.sheets.filter((s) => scope === 'all' || d.points.some((p) => p.sheetId === s.id))
  const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const docNo = docNumber(d, 'DW')
  const place = [
    [d.project.community, d.project.address].filter(Boolean).join(' '),
    d.project.customerName,
  ]
    .filter(Boolean)
    .join(' / ')
  const t = docTable(style)
  const usedTypes = DEVICE_TYPE_ORDER.filter((type) => d.points.some((p) => p.deviceType === type))
  const withSummary = sheets.length > 1 && usedTypes.length > 0
  const totalPages = sheets.length + (withSummary ? 1 : 0)
  const kind = scopeTitle(scope) ? `${scopeTitle(scope)}点位图` : '点位图'
  const base = `/print/projects/${id}/plans`
  const href = (patch: { style?: string; layout?: string; scope?: string }) =>
    `${base}?${new URLSearchParams({ style: patch.style ?? style.id, layout: patch.layout ?? layout, scope: patch.scope ?? scope }).toString()}`

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <style>{'@media print { @page { size: A4 landscape; margin: 0; } }'}</style>
      <PrintToolbar
        back={{ href: `/projects/${id}/archive`, label: '返回归档' }}
        exportName={`${d.project.name}-${kind}`}
        groups={[
          ...(d.projectList.length > 1
            ? [
                {
                  label: '项目',
                  value: id,
                  options: d.projectList.slice(0, 5).map((p) => ({
                    value: p.id,
                    label: `${p.name}（${p.pointCount}点）`,
                    href: `/print/projects/${p.id}/plans?style=${style.id}&layout=${layout}&scope=${scope}`,
                  })),
                },
              ]
            : []),
          ...docToolbarGroups(setup, href),
          {
            label: '范围',
            value: scope,
            options: POINT_SCOPES.map((s) => ({
              value: s.value,
              label: s.label,
              href: href({ scope: s.value }),
            })),
          },
        ]}
      />
      <DocRoot style={style}>
        <div className="space-y-6 py-6 print:space-y-0 print:py-0">
          {sheets.length === 0 ? (
            <DocEmpty projectId={id}>
              还没有图纸或点位。先上传户型图并布置设备，这里会每张图纸出一页点位图。
            </DocEmpty>
          ) : null}
          {sheets.map((sheet, i) => {
            const pts = d.points.filter((p) => p.sheetId === sheet.id)
            const areas = d.areas
              .filter((a) => a.sheetId === sheet.id)
              .map((a) => planAreaOf(a, sheet))
            const types = DEVICE_TYPE_ORDER.filter((type) => pts.some((p) => p.deviceType === type))
            const rooms = new Set(pts.map((p) => p.areaId).filter(Boolean)).size
            const figure = (
              <PlanFigure
                sheetUrl={sheet.url}
                points={pts.map((p) => ({
                  ...p,
                  image: p.productId ? d.productById.get(p.productId)?.image?.url : null,
                }))}
                areas={areas}
                mode={markers}
                effects
                dim={0.7}
                className="max-h-full w-full"
              />
            )
            return (
              <DocSheetPage key={sheet.id} className="px-[9mm] py-[7mm]">
                <DocHeader style={style} company={company} meta={`${d.project.name} · ${date}`} />
                <div className="mt-3">
                  <DocTitle
                    style={style}
                    no={pad(i + 1)}
                    title={`${sheet.name} · ${kind}`}
                    subtitle={`${pts.length} 个点位 · ${rooms} 个房间 · ${types.length} 类设备`}
                    tag="FLOOR PLAN"
                  />
                </div>
                <div
                  className={cn(
                    'mt-3 grid min-h-0 flex-1 gap-[4mm]',
                    layout === 'clean' ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_52mm]',
                  )}
                >
                  <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-doc border border-doc-rule bg-white p-[1.5mm]">
                    {figure}
                  </div>
                  {layout === 'clean' ? null : (
                    <div className="min-h-0 overflow-hidden text-[10px]">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className={t.head}>
                            <th className={cn(t.th, 'py-1.5 text-[10px]')}>图例</th>
                            <th className={cn(t.th, 'py-1.5 text-right text-[10px]')}>数量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {types.slice(0, 16).map((type, r) => {
                            const list = pts.filter((p) => p.deviceType === type)
                            const product = list[0]?.productId
                              ? d.productById.get(list[0].productId)
                              : null
                            return (
                              <tr key={type} className={t.row(r)}>
                                <td className={cn(t.td, 'py-1')}>
                                  <span className="flex items-center gap-1.5">
                                    {markers === 'product' && product?.image ? (
                                      <ProductThumb
                                        src={product.image.url}
                                        alt={product.name}
                                        className="size-5 rounded-full"
                                      />
                                    ) : (
                                      <PointMarker type={type} className="size-4" />
                                    )}
                                    <span className="min-w-0">
                                      <span className="doc-strong block">
                                        {deviceTypeOf(type)?.name}
                                      </span>
                                      {markers === 'product' ? (
                                        <span className="block truncate text-[8.5px] text-doc-muted">
                                          {product ? product.name : '待选型'}
                                        </span>
                                      ) : null}
                                    </span>
                                  </span>
                                </td>
                                <td
                                  className={cn(
                                    t.td,
                                    'py-1 text-right tabular-nums text-doc-accent',
                                  )}
                                >
                                  {list.length}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {types.length > 16 ? (
                        <p className="mt-1 text-[9px] text-doc-muted">
                          另有 {types.length - 16} 类设备
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
                {layout === 'clean' ? (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-doc-muted">
                    {types.map((type) => (
                      <span key={type} className="inline-flex items-center gap-1">
                        <PointMarker type={type} className="size-3" />
                        {deviceTypeOf(type)?.name} {pts.filter((p) => p.deviceType === type).length}
                      </span>
                    ))}
                  </div>
                ) : null}
                <DocFooter
                  className="mt-3"
                  left={place || d.project.name}
                  center={`${docNo}  /  ${date}`}
                  right={`${pad(i + 1)} / ${pad(totalPages)}`}
                />
              </DocSheetPage>
            )
          })}
          {withSummary ? (
            <DocSheetPage>
              <DocHeader style={style} company={company} meta={`${d.project.name} · ${date}`} />
              <div className="mt-4">
                <DocTitle
                  style={style}
                  no={pad(totalPages)}
                  title="点位统计"
                  subtitle={`共 ${d.points.length} 个点位，按图纸和设备类型统计`}
                  tag="SUMMARY"
                />
              </div>
              <div className="mt-5 min-h-0 flex-1 overflow-hidden">
                <table className="w-full border-collapse text-[10.5px]">
                  <thead>
                    <tr className={t.head}>
                      <th className={t.th}>设备</th>
                      {sheets.map((s) => (
                        <th key={s.id} className={cn(t.th, 'text-right')}>
                          {s.name}
                        </th>
                      ))}
                      <th className={cn(t.th, 'text-right')}>合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usedTypes.slice(0, 22).map((type, r) => (
                      <tr key={type} className={t.row(r)}>
                        <td className={cn(t.td, 'py-1')}>
                          <span className="flex items-center gap-1.5">
                            <PointMarker type={type} className="size-3.5" />
                            {deviceTypeOf(type)?.name}
                          </span>
                        </td>
                        {sheets.map((s) => {
                          const n = d.points.filter(
                            (p) => p.sheetId === s.id && p.deviceType === type,
                          ).length
                          return (
                            <td
                              key={s.id}
                              className={cn(
                                t.td,
                                'py-1 text-right tabular-nums',
                                !n && 'text-doc-muted',
                              )}
                            >
                              {n || '—'}
                            </td>
                          )
                        })}
                        <td
                          className={cn(
                            t.td,
                            'doc-strong py-1 text-right tabular-nums text-doc-accent',
                          )}
                        >
                          {d.points.filter((p) => p.deviceType === type).length}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-doc-ink">
                      <td className={cn(t.td, 'doc-strong py-1.5')}>合计</td>
                      {sheets.map((s) => (
                        <td
                          key={s.id}
                          className={cn(t.td, 'doc-strong py-1.5 text-right tabular-nums')}
                        >
                          {d.points.filter((p) => p.sheetId === s.id).length}
                        </td>
                      ))}
                      <td
                        className={cn(
                          t.td,
                          'doc-strong py-1.5 text-right tabular-nums text-doc-accent',
                        )}
                      >
                        {d.points.length}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {usedTypes.length > 22 ? (
                  <p className="mt-1 text-[9px] text-doc-muted">
                    另有 {usedTypes.length - 22}{' '}
                    类设备未逐行列出，已计入合计；完整清单见点位交底清单。
                  </p>
                ) : null}
              </div>
              <DocFooter
                className="mt-3"
                left={place || d.project.name}
                center={`${docNo}  /  ${date}`}
                right={`${pad(totalPages)} / ${pad(totalPages)}`}
              />
            </DocSheetPage>
          ) : null}
        </div>
      </DocRoot>
    </div>
  )
}
