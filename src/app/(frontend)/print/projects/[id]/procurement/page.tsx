import { notFound, redirect } from 'next/navigation'

import { BrandLogo } from '@/components/brand-logo'
import { PointMarker } from '@/components/point-marker'
import { PrintToolbar } from '@/components/print-toolbar'
import { ProductThumb } from '@/components/product-thumb'
import { DocArticle, DocCheckbox, DocEmpty, DocFacts, DocFooter, DocHeader, DocRoot, DocSectionHeading, DocSignatures, DocTitle, docTable } from '@/documents/parts'
import { resolveDocSetup } from '@/documents/registry'
import { appAuth } from '@/lib/app-auth'
import { deviceTypeOf } from '@/lib/device-types'
import { loadProjectDocs } from '@/lib/project-docs'
import { projectDisplayName } from '@/lib/project-name'
import { yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'

export const metadata = { title: '采购与备货核验单', robots: { index: false, follow: false } }

export default async function ProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string; cost?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/projects/${id}/procurement`)

  const d = await loadProjectDocs(id, user)
  if (!d) notFound()
  const ownerId = d.owner?.id ?? user.id
  const setup = await resolveDocSetup('checklist', sp, ownerId)

  // 「采购与备货单」已封存为 Beta 文档，不再受插件开关控制
  const { style, company } = setup
  const showCost = sp.cost !== '0'
  const t = docTable(style)
  const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' })
  const base = `/print/projects/${id}/procurement`
  const href = (patch: { style?: string; cost?: string }) => {
    const q = new URLSearchParams({ style: patch.style ?? style.id, cost: patch.cost ?? (showCost ? '1' : '0') })
    return `${base}?${q.toString()}`
  }

  const brandGroups = new Map<string, { brandName: string; brandLogo: string | null; rows: typeof d.products }>()
  for (const row of d.products) {
    const bName = row.product.brand?.name || '其他品牌'
    const existing = brandGroups.get(bName) ?? { brandName: bName, brandLogo: row.product.brand?.logo ?? null, rows: [] }
    existing.rows.push(row)
    brandGroups.set(bName, existing)
  }
  const groups = [...brandGroups.values()].sort((a, b) => b.rows.reduce((s, r) => s + r.count, 0) - a.rows.reduce((s, r) => s + r.count, 0))

  const totalQty = d.products.reduce((s, r) => s + r.count, 0)
  const totalCost = d.products.reduce((s, r) => s + (r.product.cost ?? r.product.price) * r.count, 0)
  const totalRetail = d.total
  const estMargin = totalRetail - totalCost
  const address = [d.project.community, d.project.address].filter(Boolean).join(' ')
  const projectName = projectDisplayName(d.project.name)

  return (
    <div className="min-h-screen bg-muted/40 pb-8 print:bg-white print:pb-0">
      <PrintToolbar
        back={{ href: `/projects/${id}/archive`, label: '返回归档' }}
        exportName={`${projectName}-采购与备货核验单`}
        groups={[
          {
            label: '成本列',
            value: showCost ? '1' : '0',
            options: [
              { value: '1', label: '含内部成本', href: href({ cost: '1' }) },
              { value: '0', label: '隐藏成本（到场核验）', href: href({ cost: '0' }) },
            ],
          },
          ...(setup.styles.length > 1
            ? [{ label: '风格', value: style.id, options: setup.styles.map((s) => ({ value: s.id, label: s.name, href: href({ style: s.id }) })) }]
            : []),
        ]}
      />

      {d.products.length === 0 ? (
        <DocEmpty projectId={id}>项目点位尚未关联产品型号。完成选型后，这里会自动按品牌生成采购与到货核验单。</DocEmpty>
      ) : (
        <DocRoot style={style}>
          <DocArticle>
            <DocHeader style={style} company={company} meta={date} />
            <div className="mt-7">
              <DocTitle
                style={style}
                no={String(totalQty).padStart(2, '0')}
                title={showCost ? '采购与备货成本单' : '设备到场开箱核验单'}
                subtitle={`${projectName} · 共 ${groups.length} 个品牌 · ${d.products.length} 款型号 · ${totalQty} 件设备`}
                tag="PROCUREMENT & CHECK"
              />
            </div>

            <DocFacts
              className="mt-6 border-y border-doc-rule py-4"
              items={[
                ['项目', projectName],
                ['客户', d.project.customerName],
                ['收货/安装地址', address],
                ['项目负责人', d.owner?.name ?? user.name],
                ['设备款数 / 总件数', `${d.products.length} 款 / ${totalQty} 件`],
                ['未选型点位', d.pending ? `${d.pending} 个点位待定` : '全部已选型'],
              ]}
            />

            {showCost ? (
              <section data-pdf-block className="mt-6 grid grid-cols-3 gap-3 break-inside-avoid">
                <div className="rounded-doc border border-doc-rule p-3">
                  <div className="text-[11px] text-doc-muted">预估采购总成本</div>
                  <div className="doc-numeral mt-1 text-[22px] leading-none">{yuan(totalCost)}</div>
                </div>
                <div className="rounded-doc border border-doc-rule p-3">
                  <div className="text-[11px] text-doc-muted">设备零售小计</div>
                  <div className="doc-numeral mt-1 text-[22px] leading-none">{yuan(totalRetail)}</div>
                </div>
                <div className="rounded-doc border border-doc-rule p-3">
                  <div className="text-[11px] text-doc-muted">预估设备毛利</div>
                  <div className="doc-numeral mt-1 text-[22px] leading-none text-doc-accent">
                    {yuan(estMargin)}（{totalRetail > 0 ? `${Math.round((estMargin / totalRetail) * 100)}%` : '0%'}）
                  </div>
                </div>
              </section>
            ) : null}

            <div className="mt-6 space-y-6">
              {groups.map((g) => {
                const groupQty = g.rows.reduce((s, r) => s + r.count, 0)
                const groupCost = g.rows.reduce((s, r) => s + (r.product.cost ?? r.product.price) * r.count, 0)
                return (
                  <section key={g.brandName}>
                    <DocSectionHeading
                      style={style}
                      className="mb-2"
                      title={
                        <span className="flex items-center gap-2.5">
                          <BrandLogo name={g.brandName} logo={g.brandLogo} className="h-4 max-w-20" />
                          <span>{g.brandName}</span>
                        </span>
                      }
                      note={`${g.rows.length} 款 · 共 ${groupQty} 件${showCost ? ` · 成本小计 ${yuan(groupCost)}` : ''}`}
                    />
                    <table className="w-full table-fixed border-collapse text-[11.5px]">
                      <thead>
                        <tr className={t.head}>
                          <th className={cn(t.th, 'w-12')}>图片</th>
                          <th className={t.th}>产品名称 / 型号</th>
                          <th className={cn(t.th, 'w-32')}>安装房间</th>
                          {showCost ? <th className={cn(t.th, 'w-20 text-right')}>成本单价</th> : null}
                          <th className={cn(t.th, 'w-16 text-right')}>采购数</th>
                          {showCost ? <th className={cn(t.th, 'w-24 text-right')}>成本小计</th> : null}
                          <th className={cn(t.th, 'w-32 text-center')}>备货与到场状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, idx) => {
                          const unitCost = r.product.cost ?? r.product.price
                          return (
                            <tr key={r.product.id} className={t.row(idx)}>
                              <td className={cn(t.td, 'py-1.5')}>
                                <ProductThumb src={r.product.image?.url} alt={r.product.name} className="size-8" />
                              </td>
                              <td className={cn(t.td, 'py-1.5')}>
                                <div className="flex items-center gap-1.5">
                                  <PointMarker type={r.deviceType} className="size-3.5 shrink-0" />
                                  <span className="doc-strong truncate">{r.product.name}</span>
                                </div>
                                <div className="mt-0.5 truncate text-[10.5px] text-doc-muted">
                                  {deviceTypeOf(r.deviceType)?.name} · {r.product.sku}
                                  {r.product.stock !== null ? ` · 库存 ${r.product.stock}` : ''}
                                </div>
                              </td>
                              <td className={cn(t.td, 'py-1.5 truncate text-doc-muted')}>
                                {r.rooms.slice(0, 3).join('、')}
                                {r.rooms.length > 3 ? `等${r.rooms.length}处` : ''}
                              </td>
                              {showCost ? <td className={cn(t.td, 'py-1.5 text-right tabular-nums')}>{yuan(unitCost)}</td> : null}
                              <td className={cn(t.td, 'py-1.5 text-right font-semibold tabular-nums')}>
                                {r.count} {r.product.unit || '个'}
                              </td>
                              {showCost ? <td className={cn(t.td, 'py-1.5 text-right tabular-nums')}>{yuan(unitCost * r.count)}</td> : null}
                              <td className={cn(t.td, 'py-1.5 text-center text-[10.5px] whitespace-nowrap text-doc-muted')}>
                                <span className="inline-flex items-center gap-1">
                                  <DocCheckbox />
                                  已订
                                </span>
                                <span className="ml-2 inline-flex items-center gap-1">
                                  <DocCheckbox />
                                  到场
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </section>
                )
              })}
            </div>

            <section data-pdf-block className="mt-8 break-inside-avoid">
              <DocSignatures parties={[{ label: '备货/仓管核对签字' }, { label: '安装工程师签收' }, { label: '业主到场核验签字' }]} />
              <DocFooter className="mt-6" left={address || projectName} center={date} right={company.name} />
            </section>
          </DocArticle>
        </DocRoot>
      )}
    </div>
  )
}
