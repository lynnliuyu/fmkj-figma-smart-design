import { notFound, redirect } from 'next/navigation'

import { PointMarker } from '@/components/point-marker'
import { PrintToolbar } from '@/components/print-toolbar'
import {
  DocArticle,
  DocCheckbox,
  DocEmpty,
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
import { deviceTypeOf } from '@/lib/device-types'
import { acceptanceChecks, loadProjectDocs } from '@/lib/project-docs'
import { projectDisplayName } from '@/lib/project-name'
import { cn } from '@/lib/utils'
import { roomScenes } from '@/plugins/proposal/deck/model'

export const metadata = { title: '场景与账号交付移交单', robots: { index: false, follow: false } }

export default async function SceneHandoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/projects/${id}/handover`)

  const d = await loadProjectDocs(id, user)
  if (!d) notFound()
  const ownerId = d.owner?.id ?? user.id
  const setup = await resolveDocSetup('checklist', sp, ownerId)

  // 「场景与账号移交」已封存为 Beta 文档，不再受插件开关控制
  const { style, company } = setup
  const t = docTable(style)
  const date = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const base = `/print/projects/${id}/handover`
  const address = [d.project.community, d.project.address].filter(Boolean).join(' ')
  const projectName = projectDisplayName(d.project.name)

  const scenes = roomScenes(d.rooms)
  const coreDevices = d.points.filter((p) =>
    [
      'ac-router',
      'ap-node',
      'ceiling-ap',
      'gateway',
      'touch-panel',
      'smart-lock',
      'camera',
      'vrf-controller',
    ].includes(p.deviceType),
  )
  const areaMap = new Map(d.areas.map((a) => [a.id, a.name]))
  const checks = acceptanceChecks(d)

  return (
    <div className="min-h-screen bg-muted/40 pb-8 print:bg-white print:pb-0">
      <PrintToolbar
        back={{ href: `/projects/${id}/archive`, label: '返回归档' }}
        exportName={`${projectName}-场景与账号交付移交单`}
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

      {d.points.length === 0 ? (
        <DocEmpty projectId={id}>
          点位图里还没有点位。布置好设备后，这里会自动生成全屋场景说明卡与账号移交单。
        </DocEmpty>
      ) : (
        <DocRoot style={style}>
          <DocArticle>
            <DocHeader style={style} company={company} meta={date} />
            <div className="mt-7">
              <DocTitle
                style={style}
                no={String(scenes.length || d.rooms.length).padStart(2, '0')}
                title="全屋智能场景卡与账号移交单"
                subtitle={`${projectName} · 业主日常使用指南、网络/主控账号交接与竣工验收记录`}
                tag="HANDOVER & SCENES"
              />
            </div>

            <DocFacts
              className="mt-6 border-y border-doc-rule py-4"
              items={[
                ['业主姓名', d.project.customerName],
                ['联系电话', d.project.customerPhone],
                ['项目地址', address || projectName],
                ['智能生态平台', d.project.platform ?? '全屋智能'],
                ['交付设备总数', `${d.points.length} 台/只（${d.rooms.length} 个空间）`],
                ['服务团队电话', d.owner?.phone || company.phone || '—'],
              ]}
            />

            <section className="mt-6">
              <DocSectionHeading
                style={style}
                className="mb-2"
                title="一、账号与全屋网络交接记录"
                note="移交业主主账号并邀请家庭成员共享"
              />
              <table className="w-full table-fixed border-collapse text-[11.5px]">
                <thead>
                  <tr className={t.head}>
                    <th className={cn(t.th, 'w-36')}>系统 / 账号项</th>
                    <th className={t.th}>绑定账号 / 名称记录</th>
                    <th className={cn(t.th, 'w-48')}>管理说明与备注</th>
                    <th className={cn(t.th, 'w-16 text-center')}>已移交</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      `${d.project.platform || '智能家居'} App 主账号`,
                      '绑定手机号：____________________',
                      '拥有家庭最高管理权限，可添加家人共享',
                    ],
                    [
                      '全屋 Wi-Fi（SSID）',
                      'Wi-Fi 名称：____________________',
                      '双频合一漫游，AC 控制器自动优选信号',
                    ],
                    [
                      '路由器 / AC 管理后台',
                      '管理地址：192.168.___.___',
                      '安装在入户弱电箱内，请勿随意长按 Reset',
                    ],
                    [
                      '智能门锁 / 安防管理员',
                      '管理员指纹/密码已由业主本人录入',
                      '工程临时测试密码已现场清除',
                    ],
                  ].map(([k, v, note], idx) => (
                    <tr key={k} className={t.row(idx)}>
                      <td className={cn(t.td, 'py-2 font-medium')}>{k}</td>
                      <td className={cn(t.td, 'py-2')}>{v}</td>
                      <td className={cn(t.td, 'py-2 text-[10.5px] text-doc-muted')}>{note}</td>
                      <td className={cn(t.td, 'py-2 text-center')}>
                        <DocCheckbox />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {coreDevices.length > 0 ? (
              <section className="mt-6">
                <DocSectionHeading
                  style={style}
                  className="mb-2"
                  title="二、核心网关与网络主控节点位置"
                  note="日常断电重启或维护时参考"
                />
                <table className="w-full table-fixed border-collapse text-[11.5px]">
                  <thead>
                    <tr className={t.head}>
                      <th className={cn(t.th, 'w-16')}>代号</th>
                      <th className={cn(t.th, 'w-28')}>所在位置</th>
                      <th className={cn(t.th, 'w-32')}>设备类型</th>
                      <th className={t.th}>产品型号</th>
                      <th className={cn(t.th, 'w-16 text-center')}>在线</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coreDevices.map((pt, idx) => {
                      const prod = pt.productId ? d.productById.get(pt.productId) : null
                      return (
                        <tr key={pt.id} className={t.row(idx)}>
                          <td
                            className={cn(t.td, 'py-1.5 font-mono font-semibold text-doc-accent')}
                          >
                            {pt.code}
                          </td>
                          <td className={cn(t.td, 'py-1.5 truncate')}>
                            {pt.areaId ? (areaMap.get(pt.areaId) ?? '—') : '弱电箱/公共区'}
                          </td>
                          <td className={cn(t.td, 'py-1.5')}>
                            <span className="flex items-center gap-1.5">
                              <PointMarker type={pt.deviceType} className="size-3.5 shrink-0" />
                              <span className="truncate">{deviceTypeOf(pt.deviceType)?.name}</span>
                            </span>
                          </td>
                          <td className={cn(t.td, 'py-1.5 truncate text-doc-muted')}>
                            {prod ? `${prod.name}（${prod.sku}）` : '已安装'}
                          </td>
                          <td className={cn(t.td, 'py-1.5 text-center')}>
                            <DocCheckbox />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            ) : null}

            {scenes.length > 0 ? (
              <section className="mt-6">
                <DocSectionHeading
                  style={style}
                  className="mb-2"
                  title="三、全屋智能联动场景说明卡"
                  note={`共配置 ${scenes.length} 个常用生活场景`}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  {scenes.map((s, idx) => (
                    <div
                      key={s.name}
                      className="rounded-doc border border-doc-rule p-3 text-[11.5px] break-inside-avoid"
                    >
                      <div className="flex items-center justify-between border-b border-doc-rule/60 pb-1.5">
                        <span className="doc-strong">
                          {String(idx + 1).padStart(2, '0')} · {s.name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-doc-muted">
                          <DocCheckbox />
                          已联调确认
                        </span>
                      </div>
                      <p className="mt-1.5 leading-relaxed text-doc-muted">{s.action}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section data-pdf-block className="mt-6 break-inside-avoid">
              <DocSectionHeading
                style={style}
                className="mb-2"
                title="四、现场共同验收确认项"
                note="逐项测试打勾后完成交付"
              />
              <div className="grid grid-cols-2 gap-2 rounded-doc border border-doc-rule p-3.5 text-[11.5px]">
                {checks.map((line) => (
                  <div key={line} className="flex items-start gap-2">
                    <DocCheckbox className="mt-0.5 text-doc-accent" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </section>

            <section data-pdf-block className="mt-8 break-inside-avoid">
              <DocSignatures
                parties={[
                  { label: '业主验收确认签字' },
                  { label: `${company.name} 交付工程师签字` },
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
      )}
    </div>
  )
}
