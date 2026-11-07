import { notFound, redirect } from 'next/navigation'

import { PointMarker } from '@/components/point-marker'
import { PrintToolbar } from '@/components/print-toolbar'
import { DocArticle, DocCheckbox, DocEmpty, DocFacts, DocFooter, DocHeader, DocRoot, DocSectionHeading, DocSignatures, DocTitle, docTable } from '@/documents/parts'
import { resolveDocSetup } from '@/documents/registry'
import { appAuth } from '@/lib/app-auth'
import { deviceTypeOf } from '@/lib/device-types'
import { featureAccess, tierBadge } from '@/lib/membership'
import { getMembershipContext } from '@/lib/membership-policy'
import { loadProjectDocs } from '@/lib/project-docs'
import { projectDisplayName } from '@/lib/project-name'
import { cn } from '@/lib/utils'

export const metadata = { title: '强弱电布线与水电交底单', robots: { index: false, follow: false } }

type WiringSpec = {
  category: 'zero-live' | 'network' | 'power-220v' | 'lighting' | 'battery'
  box: string
  cable: string
  height: string
}

export function wiringSpecOf(deviceType: string): WiringSpec {
  switch (deviceType) {
    case 'switch-1':
    case 'switch-2':
    case 'switch-3':
    case 'switch-4':
      return {
        category: 'zero-live',
        box: '86型深底盒（深≥50mm）',
        cable: '220V 零火线（必须下零线）+ 灯具控制回路线',
        height: '距地 1.3m，距门框边 15cm',
      }
    case 'touch-panel':
      return {
        category: 'zero-live',
        box: '86型深底盒（深≥50mm）',
        cable: '220V 零火线 + 超六类网线（可选）',
        height: '距地 1.4m（与开关并排或独立居中）',
      }
    case 'socket':
    case 'socket-usb':
    case 'socket-double':
      return {
        category: 'power-220v',
        box: '86型标准底盒',
        cable: '2.5mm² 零火地三线（厨房/大功率用 4mm²）',
        height: '常规距地 0.3m / 台面距地 1.1m',
      }
    case 'curtain-track':
      return {
        category: 'power-220v',
        box: '窗帘盒内 86 电源插座',
        cable: '220V 零火地电源线（窗帘盒单轨宽≥12cm，双轨≥20cm）',
        height: '窗帘盒内靠窗角一侧顶装，避开轨道滑轮',
      }
    case 'ap-node':
      return {
        category: 'network',
        box: '86型标准底盒',
        cable: '弱电箱直通超六类网线（Cat6A，PoE供电，不留强电）',
        height: '距地 0.3m（书桌/电视柜旁）',
      }
    case 'ceiling-ap':
      return {
        category: 'network',
        box: '吊顶过线盒 / 出线孔',
        cable: '弱电箱直通超六类网线（Cat6A，PoE供电）',
        height: '吊顶居中吸顶或灯槽内暗藏',
      }
    case 'network-panel':
      return {
        category: 'network',
        box: '86型标准底盒',
        cable: '弱电箱直通超六类网线（Cat6A）',
        height: '距地 0.3m（与强电插座间距≥20cm）',
      }
    case 'ac-router':
      return {
        category: 'network',
        box: '加深弱电箱（建议≥400×300mm）或弱电机柜',
        cable: '220V 三孔插座 + 入户光纤 + 全屋超六类网线汇聚',
        height: '弱电箱内，预留散热空间',
      }
    case 'gateway':
      return {
        category: 'network',
        box: '86型底盒或桌面/吊顶检修口',
        cable: '220V 供电插座 + 弱电箱直通超六类网线（LAN口接入）',
        height: '楼层居中位置，避开金属遮挡',
      }
    case 'camera':
    case 'doorbell':
      return {
        category: 'network',
        box: '顶角/门头出线暗盒',
        cable: '弱电箱直通超六类网线（PoE）或 220V 电源预留',
        height: '入户门头 1.5m / 顶角 2.6m',
      }
    case 'vrf-controller':
      return {
        category: 'power-220v',
        box: '中央空调检修口内',
        cable: '220V 零火电源 + 空调内外机 RS485 信号总线',
        height: '客厅/设备区空调回风检修口旁',
      }
    case 'speaker':
    case 'drying-rack':
      return {
        category: 'power-220v',
        box: '预留电源出线口 / 插座',
        cable: '220V 零火地电源线（晾衣机接阳台灯控或常电）',
        height: '阳台顶面居中 / 台面插座旁',
      }
    case 'downlight':
    case 'spotlight':
    case 'ceiling-light':
    case 'pendant-light':
    case 'panel-light':
    case 'track-light':
    case 'light-strip':
    case 'wall-light':
    case 'other-light':
      return {
        category: 'lighting',
        box: '顶面/墙面灯线预留（灯带含变压器检修位）',
        cable: '1.5mm² 零火灯控回路线（引自本房间智能开关底盒）',
        height: '按灯光点位图尺寸开孔（筒射灯常规开孔 φ75mm）',
      }
    default:
      return {
        category: 'battery',
        box: '免布线（无线贴装 / 门体安装）',
        cable: '内置电池供电，水电阶段无需开槽布线',
        height: '门窗框齐平 / 水浸贴地 / 烟感吸顶',
      }
  }
}

const LAYOUTS = [
  { value: 'room', label: '按房间交底' },
  { value: 'summary', label: '按底盒与线缆汇总' },
] as const

export default async function WiringSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string; layout?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/projects/${id}/wiring`)

  const [d, access] = await Promise.all([loadProjectDocs(id, user), getMembershipContext(user)])
  if (!d) notFound()
  const ownerId = d.owner?.id ?? user.id
  const setup = await resolveDocSetup('checklist', sp, ownerId)

  // 「强弱电布线表」已封存为 Beta 文档，不再受插件开关控制，会员等级沿用原插件的 Pro
  const tierOk = featureAccess(access.membership, 'pro', access.strict)
  const { style, company } = setup
  const layout = sp.layout === 'summary' ? 'summary' : 'room'
  const t = docTable(style)
  const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' })
  const base = `/print/projects/${id}/wiring`
  const href = (patch: { style?: string; layout?: string }) => {
    const q = new URLSearchParams({ layout: patch.layout ?? layout, style: patch.style ?? style.id })
    return `${base}?${q.toString()}`
  }

  const countByCat = (cat: WiringSpec['category']) => d.points.filter((p) => wiringSpecOf(p.deviceType).category === cat).length
  const zeroLiveCount = countByCat('zero-live')
  const netCableCount = countByCat('network')
  const power220Count = countByCat('power-220v')
  const lightingCount = countByCat('lighting')
  const address = [d.project.community, d.project.address].filter(Boolean).join(' ')
  const projectName = projectDisplayName(d.project.name)

  return (
    <div className="min-h-screen bg-muted/40 pb-8 print:bg-white print:pb-0">
      <PrintToolbar
        back={{ href: `/projects/${id}/archive`, label: '返回归档' }}
        exportName={`${projectName}-强弱电水电交底单`}
        locked={tierOk.allowed ? undefined : { message: `「强弱电布线表」是${tierBadge('pro')}功能，升级后可导出`, href: '/membership' }}
        note={tierOk.meets ? undefined : `${tierBadge('pro')}功能`}
        groups={[
          { label: '版式', value: layout, options: LAYOUTS.map((l) => ({ value: l.value, label: l.label, href: href({ layout: l.value }) })) },
          ...(setup.styles.length > 1
            ? [{ label: '风格', value: style.id, options: setup.styles.map((s) => ({ value: s.id, label: s.name, href: href({ style: s.id }) })) }]
            : []),
        ]}
      />

      {d.points.length === 0 ? (
        <DocEmpty projectId={id}>点位图里还没有点位。布置好设备后，这里会自动汇总强弱电水电交底单。</DocEmpty>
      ) : (
        <DocRoot style={style}>
          <DocArticle>
            <DocHeader style={style} company={company} meta={date} />
            <div className="mt-7">
              <DocTitle
                style={style}
                no={String(d.points.length).padStart(2, '0')}
                title="强弱电布线与水电交底单"
                subtitle={`${projectName} · 供水电施工与现场复核使用`}
                tag="WIRING SCHEDULE"
              />
            </div>

            <DocFacts
              className="mt-6 border-y border-doc-rule py-4"
              items={[
                ['客户', d.project.customerName],
                ['电话', d.project.customerPhone],
                ['项目', projectName],
                ['地址', address],
                ['智能平台', d.project.platform ?? '待定'],
                ['总点位数', `${d.points.length} 个（覆盖 ${d.rooms.length} 个房间）`],
              ]}
            />

            <section data-pdf-block className="mt-6 grid grid-cols-4 gap-3 break-inside-avoid">
              {[
                ['86型零火深底盒', `${zeroLiveCount} 处`, '深≥50mm · 必须预留零火线'],
                ['超六类网线（Cat6A）', `${netCableCount} 条`, '由弱电箱单根直通各点位'],
                ['220V 强电/窗帘电源', `${power220Count} 处`, '窗帘盒插座 / 空调网关 / 强电'],
                ['受控照明灯线位', `${lightingCount} 处`, '引自对应房间智能开关底盒'],
              ].map(([label, val, hint]) => (
                <div key={label} className="rounded-doc border border-doc-rule p-3">
                  <div className="text-[11px] text-doc-muted">{label}</div>
                  <div className="doc-numeral mt-1 text-[22px] leading-none text-doc-accent">{val}</div>
                  <div className="mt-1.5 text-[10px] text-doc-muted">{hint}</div>
                </div>
              ))}
            </section>

            <section data-pdf-block className="mt-5 rounded-doc bg-doc-stripe p-3.5 text-[11.5px] break-inside-avoid">
              <p className="doc-strong">水电施工核心规范：</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-doc-muted">
                <li>全屋所有智能开关、中控屏底盒必须预留<strong>零线 + 火线（220V）</strong>，严禁只下火线（单火）；选用深≥50mm 的 86 型底盒，多联并排须使用连体底盒。</li>
                <li>全屋 AP 面板、吸顶 AP、网络面板及网关点位，均由<strong>弱电箱单根直通敷设超六类非屏蔽网线（Cat6A）</strong>，中间严禁串接或分线，线头两端张贴代号标签。</li>
                <li>电动窗帘盒内靠窗角侧顶面预留 86 型三孔插座（220V 常电），双轨窗帘盒净宽≥20cm、单轨≥12cm、深≥15cm，木工打底加固。</li>
              </ol>
            </section>

            <div className="mt-6 space-y-6">
              {layout === 'room' ? (
                d.rooms.map((room) => (
                  <section key={room.areaId}>
                    <DocSectionHeading
                      style={style}
                      className="mb-2"
                      title={room.displayName}
                      note={`${room.points.length} 个点位 · ${room.typeLabel}`}
                    />
                    <table className="w-full table-fixed border-collapse text-[11.5px]">
                      <thead>
                        <tr className={t.head}>
                          <th className={cn(t.th, 'w-14')}>代号</th>
                          <th className={cn(t.th, 'w-28')}>设备类型</th>
                          <th className={cn(t.th, 'w-36')}>底盒 / 端口要求</th>
                          <th className={t.th}>线缆与供电预留</th>
                          <th className={cn(t.th, 'w-36')}>建议安装位置</th>
                          <th className={cn(t.th, 'w-12 text-center')}>复核</th>
                        </tr>
                      </thead>
                      <tbody>
                        {room.points
                          .slice()
                          .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
                          .map((pt, idx) => {
                            const spec = wiringSpecOf(pt.deviceType)
                            return (
                              <tr key={pt.id} className={t.row(idx)}>
                                <td className={cn(t.td, 'py-1.5 font-mono font-semibold text-doc-accent')}>{pt.code}</td>
                                <td className={cn(t.td, 'py-1.5')}>
                                  <span className="flex items-center gap-1.5">
                                    <PointMarker type={pt.deviceType} className="size-3.5 shrink-0" />
                                    <span className="truncate">{deviceTypeOf(pt.deviceType)?.name ?? '设备'}</span>
                                  </span>
                                </td>
                                <td className={cn(t.td, 'py-1.5')}>{spec.box}</td>
                                <td className={cn(t.td, 'py-1.5 text-doc-muted')}>{spec.cable}</td>
                                <td className={cn(t.td, 'py-1.5 text-doc-muted')}>{spec.height}</td>
                                <td className={cn(t.td, 'py-1.5 text-center')}>
                                  <DocCheckbox />
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </section>
                ))
              ) : (
                ([
                  ['zero-live', '一、86型零火深底盒（智能开关与中控屏）'],
                  ['network', '二、弱电箱超六类网线直通点位（AC/AP/网关/监控）'],
                  ['power-220v', '三、220V 强电与窗帘盒电源预留'],
                  ['lighting', '四、受控照明灯线预留'],
                  ['battery', '五、无线免布线点位（仅核对安装位置）'],
                ] as const).map(([cat, title]) => {
                  const pts = d.points
                    .filter((p) => wiringSpecOf(p.deviceType).category === cat)
                    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
                  if (!pts.length) return null
                  const areaMap = new Map(d.areas.map((a) => [a.id, a.name]))
                  return (
                    <section key={cat}>
                      <DocSectionHeading style={style} className="mb-2" title={title} note={`共 ${pts.length} 处`} />
                      <table className="w-full table-fixed border-collapse text-[11.5px]">
                        <thead>
                          <tr className={t.head}>
                            <th className={cn(t.th, 'w-14')}>代号</th>
                            <th className={cn(t.th, 'w-24')}>所在房间</th>
                            <th className={cn(t.th, 'w-28')}>设备类型</th>
                            <th className={cn(t.th, 'w-36')}>底盒要求</th>
                            <th className={t.th}>线缆与供电预留</th>
                            <th className={cn(t.th, 'w-12 text-center')}>复核</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pts.map((pt, idx) => {
                            const spec = wiringSpecOf(pt.deviceType)
                            return (
                              <tr key={pt.id} className={t.row(idx)}>
                                <td className={cn(t.td, 'py-1.5 font-mono font-semibold text-doc-accent')}>{pt.code}</td>
                                <td className={cn(t.td, 'py-1.5 truncate')}>{pt.areaId ? (areaMap.get(pt.areaId) ?? '—') : '公共区'}</td>
                                <td className={cn(t.td, 'py-1.5')}>
                                  <span className="flex items-center gap-1.5">
                                    <PointMarker type={pt.deviceType} className="size-3.5 shrink-0" />
                                    <span className="truncate">{deviceTypeOf(pt.deviceType)?.name ?? '设备'}</span>
                                  </span>
                                </td>
                                <td className={cn(t.td, 'py-1.5')}>{spec.box}</td>
                                <td className={cn(t.td, 'py-1.5 text-doc-muted')}>{spec.cable}</td>
                                <td className={cn(t.td, 'py-1.5 text-center')}>
                                  <DocCheckbox />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </section>
                  )
                })
              )}
            </div>

            <section data-pdf-block className="mt-8 break-inside-avoid">
              <DocSignatures parties={[{ label: '水电施工负责人签字' }, { label: '智能设计师复核签字' }, { label: '业主确认签字' }]} />
              <DocFooter className="mt-6" left={address || projectName} center={date} right={company.name} />
            </section>
          </DocArticle>
        </DocRoot>
      )}
    </div>
  )
}
