import { notFound, redirect } from 'next/navigation'

import { PrintToolbar } from '@/components/print-toolbar'
import {
  DocArticle,
  DocCheckbox,
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
import { appAuth } from '@/lib/app-auth'
import { loadProjectDocs } from '@/lib/project-docs'
import { projectDisplayName } from '@/lib/project-name'
import { cn } from '@/lib/utils'

export const metadata = { title: '现场勘测确认单', robots: { index: false, follow: false } }

const GLOBAL_CHECKS = [
  [
    '强电配电箱',
    '□ 空气开关回路清晰　□ 预留总控/导轨模块空间　□ 接地正常',
    '记录箱体尺寸与总空开安数',
  ],
  [
    '入户弱电箱',
    '□ 光纤已入户　□ 箱内有 220V 三孔插座　□ 各房间网线汇聚至此',
    '建议更换 400×300mm 以上加深箱或机柜',
  ],
  [
    '全屋开关底盒',
    '□ 全部下零火线（220V）　□ 底盒深度 ≥50mm　□ 多联并排使用连体底盒',
    '严禁单火布线；石材/木饰面提前定位',
  ],
  [
    '全屋无线网络',
    '□ 承重墙位置已标注　□ 吸顶/面板 AP 预留超六类网线（Cat6A）',
    '复核跃层/地下室信号盲区',
  ],
  [
    '中央空调 / 地暖 / 新风',
    '□ 已确认品牌型号　□ VRF 网关安装于回风检修口旁并留 220V 电源',
    '核对内外机协议接口（RS485）',
  ],
  [
    '入户门（智能门锁）',
    '□ 门厚 ____mm　□ 导向片尺寸 ________　□ 左开 / 右开　□ 内开 / 外开',
    '确认天地钩与霸王锁体情况',
  ],
] as const

export default async function SiteSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/projects/${id}/survey`)

  const d = await loadProjectDocs(id, user)
  if (!d) notFound()
  const ownerId = d.owner?.id ?? user.id
  const setup = await resolveDocSetup('checklist', sp, ownerId)

  const { style, company } = setup
  const t = docTable(style)
  const date = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const base = `/print/projects/${id}/survey`
  const address = [d.project.community, d.project.address].filter(Boolean).join(' ')
  const projectName = projectDisplayName(d.project.name)

  return (
    <div className="min-h-screen bg-muted/40 pb-8 print:bg-white print:pb-0">
      <PrintToolbar
        back={{ href: `/projects/${id}/archive`, label: '返回归档' }}
        exportName={`${projectName}-现场勘测确认单`}
        groups={
          setup.styles.length > 1
            ? [
                {
                  label: '风格',
                  value: style.id,
                  options: setup.styles.map((s) => ({
                    value: s.id,
                    label: s.name,
                    href: `${base}?style=${s.id}`,
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
              no={String(d.rooms.length || 1).padStart(2, '0')}
              title="全屋智能现场勘测确认单"
              subtitle={`${projectName} · 强弱电、网络、窗帘盒与安装条件现场核查记录`}
              tag="SITE SURVEY"
            />
          </div>

          <DocFacts
            className="mt-6 border-y border-doc-rule py-4"
            items={[
              ['客户姓名', d.project.customerName],
              ['联系电话', d.project.customerPhone],
              ['项目名称', projectName],
              ['项目地址', address],
              ['勘测工程师', d.owner?.name ?? user.name],
              ['勘测日期', date],
            ]}
          />

          <section className="mt-6">
            <DocSectionHeading
              style={style}
              className="mb-2"
              title="一、全屋基础条件核查"
              note="配电箱 / 弱电箱 / 零火线 / 空调新风"
            />
            <table className="w-full table-fixed border-collapse text-[11.5px]">
              <thead>
                <tr className={t.head}>
                  <th className={cn(t.th, 'w-28')}>核查项</th>
                  <th className={t.th}>现场条件勾选</th>
                  <th className={cn(t.th, 'w-48')}>实测记录 / 整改备注</th>
                </tr>
              </thead>
              <tbody>
                {GLOBAL_CHECKS.map(([item, check, hint], idx) => (
                  <tr key={item} className={t.row(idx)}>
                    <td className={cn(t.td, 'py-2 font-medium')}>{item}</td>
                    <td className={cn(t.td, 'py-2')}>{check}</td>
                    <td className={cn(t.td, 'py-2 text-[10.5px] text-doc-muted')}>{hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6">
            <DocSectionHeading
              style={style}
              className="mb-2"
              title="二、分空间勘测与窗帘/开关复核"
              note={d.rooms.length ? `已按点位图自动带出 ${d.rooms.length} 个空间` : '现场逐间填写'}
            />
            <table className="w-full table-fixed border-collapse text-[11.5px]">
              <thead>
                <tr className={t.head}>
                  <th className={cn(t.th, 'w-28')}>空间名称</th>
                  <th className={cn(t.th, 'w-20 text-right')}>设计点位</th>
                  <th className={cn(t.th, 'w-44')}>开关底盒与零火线</th>
                  <th className={t.th}>窗帘盒尺寸 / 轨型 / 电源位置</th>
                  <th className={cn(t.th, 'w-32')}>网络 / 信号复核</th>
                </tr>
              </thead>
              <tbody>
                {(d.rooms.length
                  ? d.rooms.map((r) => ({
                      name: r.displayName,
                      count: r.points.length,
                      hasCurtain: r.points.some((p) => p.deviceType === 'curtain-track'),
                      hasAp: r.points.some(
                        (p) => p.deviceType === 'ap-node' || p.deviceType === 'ceiling-ap',
                      ),
                    }))
                  : [
                      { name: '玄关 / 入户', count: 0, hasCurtain: false, hasAp: false },
                      { name: '客厅', count: 0, hasCurtain: true, hasAp: true },
                      { name: '餐厅', count: 0, hasCurtain: false, hasAp: false },
                      { name: '主卧', count: 0, hasCurtain: true, hasAp: true },
                      { name: '次卧', count: 0, hasCurtain: true, hasAp: false },
                      { name: '厨房 / 卫生间', count: 0, hasCurtain: false, hasAp: false },
                    ]
                ).map((r, idx) => (
                  <tr key={r.name} className={t.row(idx)}>
                    <td className={cn(t.td, 'py-2 font-medium')}>{r.name}</td>
                    <td className={cn(t.td, 'py-2 text-right tabular-nums')}>
                      {r.count ? `${r.count} 处` : '—'}
                    </td>
                    <td className={cn(t.td, 'py-2 text-[11px]')}>□ 有零线　□ 深盒≥50mm</td>
                    <td className={cn(t.td, 'py-2 text-[11px] text-doc-muted')}>
                      {r.hasCurtain
                        ? '长 ____m · □ 单轨 □ 双轨 · □ 左电源 □ 右电源'
                        : '□ 无电动窗帘 / 现场确认：________'}
                    </td>
                    <td className={cn(t.td, 'py-2 text-[11px]')}>
                      {r.hasAp ? '□ 网线已通（AP点位）' : '□ 信号覆盖正常'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section
            data-pdf-block
            className="mt-6 rounded-doc border border-doc-rule p-3.5 text-[11.5px] break-inside-avoid"
          >
            <div className="doc-strong mb-2">三、现场特殊整改事项与业主约定备注</div>
            <div className="h-20 border-b border-dashed border-doc-rule" />
          </section>

          <section data-pdf-block className="mt-8 break-inside-avoid">
            <DocSignatures
              parties={[
                { label: '现场水电/项目经理签字' },
                { label: '勘测设计师签字' },
                { label: '业主确认签字' },
              ]}
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
