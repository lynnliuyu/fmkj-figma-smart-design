import { notFound, redirect } from 'next/navigation'

import { PointMarker } from '@/components/point-marker'
import { PrintToolbar } from '@/components/print-toolbar'
import {
  DocArticle,
  DocFacts,
  DocFooter,
  DocHeader,
  DocRoot,
  DocSectionHeading,
  DocSignatures,
  DocTitle,
  docTable,
} from '@/documents/parts'
import { resolveDocSetup } from '@/documents/registry'
import {
  longDay,
  serviceBillingLabel,
  serviceStatusLabel,
  serviceTypeLabel,
  WARRANTY_STATUS_LABEL,
} from '@/lib/after-sales'
import { appAuth } from '@/lib/app-auth'
import { loadProjectDocs } from '@/lib/project-docs'
import { projectDisplayName } from '@/lib/project-name'
import { loadAfterSales, snapshotFromDocs } from '@/lib/services/after-sales-service'
import { cn } from '@/lib/utils'

export const metadata = { title: '售后维保卡与配置备份单', robots: { index: false, follow: false } }

const yuan = (n: number) => `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
/** 房间名通常已带楼层（如「一层 · 厨房」），只有不带时才补上楼层 */
const placeOf = (floor: string | null, room: string | null) =>
  room
    ? floor && !room.startsWith(floor)
      ? `${floor} · ${room}`
      : room
    : [floor, '公共区'].filter(Boolean).join(' · ')

/** 售后维保卡：质保起止与服务承诺、全屋设备台账（配置备份）、维保记录，交付时打印给业主留存。 */
export default async function AfterSalesPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string; backup?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/projects/${id}/after-sales`)

  const d = await loadProjectDocs(id, user)
  if (!d) notFound()
  const ownerId = d.owner?.id ?? user.id
  const setup = await resolveDocSetup('checklist', sp, ownerId)
  if (!setup.flags['after-sales']) notFound()
  const sales = await loadAfterSales(user, String(d.project.id))

  const { style, company } = setup
  const t = docTable(style)
  const date = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const base = `/print/projects/${id}/after-sales`
  const address = [d.project.community, d.project.address].filter(Boolean).join(' ')
  const projectName = projectDisplayName(d.project.name)
  const w = sales.warranty

  // 设备台账：指定的备份 → 最近一次备份 → 按当前点位图实时生成
  const chosen =
    (sp.backup ? sales.records.find((r) => r.id === sp.backup && r.snapshot) : null) ??
    sales.latestBackup
  const snapshot = chosen?.snapshot ?? snapshotFromDocs(d)
  const snapshotNote = chosen?.snapshot
    ? `配置备份于 ${chosen.serviceDate}`
    : '按当前点位图实时生成（建议在维保页留存配置备份）'
  const records = sales.records.filter((r) => r.type !== 'backup').slice(0, 40)
  const servicePhone = d.owner?.phone || company.phone || '—'

  const promises = [
    `质保期内（${w.start ? `${longDay(w.start)} 至 ${longDay(w.end)}` : `自交付验收之日起 ${w.months} 个月`}），设备在正常使用下出现的非人为质量问题，免费维修或更换同型号产品。`,
    '质保期内提供免费上门调试与远程协助：重新配网、场景与自动化调整、App 账号与家庭成员权限设置。',
    '人为损坏、私自拆改、进水受潮、雷击浪涌等不可抗力造成的损坏不在免费质保范围内，维修按实际发生费用收取。',
    '质保期满后提供有偿维修与年度维保服务，收费标准以双方约定为准。',
    `报修方式：拨打服务电话 ${servicePhone}，或在微信中联系服务团队，工作日 24 小时内响应。`,
  ]

  return (
    <div className="min-h-screen bg-muted/40 pb-8 print:bg-white print:pb-0">
      <PrintToolbar
        back={{ href: `/projects/${id}/after-sales`, label: '返回售后维保' }}
        exportName={`${projectName}-售后维保卡`}
        groups={
          setup.styles.length > 1
            ? [
                {
                  label: '风格',
                  value: style.id,
                  options: setup.styles.map((s) => ({
                    value: s.id,
                    label: s.name,
                    href: `${base}?${new URLSearchParams({ style: s.id, ...(sp.backup ? { backup: sp.backup } : {}) }).toString()}`,
                  })),
                },
              ]
            : []
        }
      />

      <DocRoot style={style}>
        <DocArticle>
          <DocHeader style={style} company={company} meta={date} />
          <div className="mt-7">
            <DocTitle
              style={style}
              no={String(records.length).padStart(2, '0')}
              title="售后维保卡与配置备份单"
              subtitle={`${projectName} · 质保权益、全屋设备台账与维保记录`}
              tag="AFTER-SALES & WARRANTY"
            />
          </div>

          <DocFacts
            className="mt-6 border-y border-doc-rule py-4"
            items={[
              ['业主姓名', d.project.customerName],
              ['联系电话', d.project.customerPhone],
              ['项目地址', address || projectName],
              ['合同编号', sales.contract?.number ?? '—'],
              [
                '质保期限',
                w.start
                  ? `${longDay(w.start)} — ${longDay(w.end)}（${w.months} 个月）`
                  : `${w.months} 个月（交付验收后起算）`,
              ],
              [
                '质保状态',
                w.status === 'none'
                  ? WARRANTY_STATUS_LABEL.none
                  : `${WARRANTY_STATUS_LABEL[w.status]}${w.daysLeft !== null && w.daysLeft >= 0 ? ` · 剩余 ${w.daysLeft} 天` : ''}`,
              ],
              ['智能生态平台', d.project.platform ?? '全屋智能'],
              ['售后服务电话', servicePhone],
            ]}
          />

          <section data-pdf-block className="mt-6 break-inside-avoid">
            <DocSectionHeading
              style={style}
              className="mb-2"
              title="一、质保权益与服务承诺"
              note="以双方签订的合同条款为准"
            />
            <ol className="space-y-1.5 rounded-doc border border-doc-rule p-3.5 text-[11.5px] leading-relaxed">
              {promises.map((line, i) => (
                <li key={line} className="flex gap-2">
                  <span className="doc-strong w-4 shrink-0 tabular-nums">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-6">
            <DocSectionHeading
              style={style}
              className="mb-2"
              title="二、全屋设备台账"
              note={`${snapshot.totals.devices} 台设备 · ${snapshotNote}`}
            />
            {snapshot.devices.length ? (
              <table className="w-full table-fixed border-collapse text-[11px]">
                <thead>
                  <tr className={t.head}>
                    <th className={cn(t.th, 'w-14')}>代号</th>
                    <th className={cn(t.th, 'w-28')}>位置</th>
                    <th className={cn(t.th, 'w-28')}>设备类型</th>
                    <th className={t.th}>产品型号</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.devices.map((dev, idx) => (
                    <tr key={`${dev.code}-${idx}`} className={t.row(idx)}>
                      <td className={cn(t.td, 'py-1 font-mono font-semibold text-doc-accent')}>
                        {dev.code}
                      </td>
                      <td className={cn(t.td, 'py-1 truncate')}>{placeOf(dev.floor, dev.room)}</td>
                      <td className={cn(t.td, 'py-1')}>
                        <span className="flex items-center gap-1.5">
                          <PointMarker type={dev.type} className="size-3.5 shrink-0" />
                          <span className="truncate">{dev.typeName}</span>
                        </span>
                      </td>
                      <td className={cn(t.td, 'py-1 truncate text-doc-muted')}>
                        {dev.product
                          ? `${dev.product}${dev.sku ? `（${dev.sku}）` : ''}`
                          : '按方案配置'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-doc border border-dashed border-doc-rule p-4 text-center text-[11px] text-doc-muted">
                点位图里还没有设备
              </p>
            )}
          </section>

          <section className="mt-6">
            <DocSectionHeading
              style={style}
              className="mb-2"
              title="三、维保记录"
              note={records.length ? `共 ${records.length} 条` : '交付后的巡检、检修与更换记录'}
            />
            <table className="w-full table-fixed border-collapse text-[11px]">
              <thead>
                <tr className={t.head}>
                  <th className={cn(t.th, 'w-20')}>日期</th>
                  <th className={cn(t.th, 'w-16')}>类型</th>
                  <th className={t.th}>内容</th>
                  <th className={cn(t.th, 'w-24')}>收费</th>
                  <th className={cn(t.th, 'w-16')}>服务人员</th>
                  <th className={cn(t.th, 'w-14 text-center')}>状态</th>
                </tr>
              </thead>
              <tbody>
                {records.length
                  ? records.map((r, idx) => (
                      <tr key={r.id} className={t.row(idx)}>
                        <td className={cn(t.td, 'py-1.5 tabular-nums')}>{r.serviceDate}</td>
                        <td className={cn(t.td, 'py-1.5')}>{serviceTypeLabel(r.type)}</td>
                        <td className={cn(t.td, 'py-1.5')}>
                          <span className="doc-strong">{r.title}</span>
                          {r.devices ? (
                            <span className="block text-doc-muted">{r.devices}</span>
                          ) : null}
                        </td>
                        <td className={cn(t.td, 'py-1.5')}>
                          {r.billing === 'paid' && r.fee !== null
                            ? yuan(r.fee)
                            : serviceBillingLabel(r.billing)}
                        </td>
                        <td className={cn(t.td, 'py-1.5 truncate')}>{r.technician || '—'}</td>
                        <td className={cn(t.td, 'py-1.5 text-center')}>
                          {serviceStatusLabel(r.status)}
                        </td>
                      </tr>
                    ))
                  : // 空白行供现场手写登记
                    Array.from({ length: 4 }, (_, idx) => (
                      <tr key={idx} className={t.row(idx)}>
                        {Array.from({ length: 6 }, (__, c) => (
                          <td key={c} className={cn(t.td, 'h-7')} />
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </section>

          <section data-pdf-block className="mt-8 break-inside-avoid">
            <DocSignatures
              parties={[{ label: '业主确认签字' }, { label: `${company.name} 售后服务` }]}
            />
            <DocFooter
              className="mt-6"
              left={address || projectName}
              center={date}
              right={company.name}
            />
          </section>
        </DocArticle>
      </DocRoot>
    </div>
  )
}
