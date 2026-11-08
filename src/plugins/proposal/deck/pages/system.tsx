/** 开关与灯光独立页：只展示本项目的开关、灯具及本地控制设备，网络与监控另页展开。 */
import { PointMarker } from '@/components/point-marker'
import { categoryOfType } from '@/lib/device-types'

import { codeRange, type DeckModel, type DeckPoint } from '../model'
import { Chapter, DeckTable, Panel, SectionTitle, Slide, type DeckCtx } from '../parts'

const LOCAL_CONTROLS = new Set(['gateway', 'touch-panel', 'speaker', 'motion-sensor'])
const isSwitchLightingType = (type: string) =>
  ['switch', 'lighting'].includes(categoryOfType(type)?.slug ?? '') || LOCAL_CONTROLS.has(type)
export const hasSwitchLightingPoints = (m: DeckModel) =>
  m.d.points.some((p) => isSwitchLightingType(p.deviceType))

function ControlGroup({
  title,
  points,
  description,
}: {
  title: string
  points: DeckPoint[]
  description: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[8px] rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-panel) px-[20px] py-[14px]">
      <div className="flex items-center justify-between gap-[12px]">
        <PointMarker type={points[0].deviceType} className="size-[36px]" />
        <p className="doc-latin text-[32px] leading-none text-doc-accent">
          {points.length}
          <span className="doc-body ml-[6px] text-[12px] text-doc-muted">点</span>
        </p>
      </div>
      <p className="doc-display text-[20px] leading-normal">{title}</p>
      <p className="doc-body text-[13px] leading-[1.5] text-doc-muted">{description}</p>
      <p
        className="doc-latin truncate border-t border-doc-rule pt-[8px] text-[12px] text-doc-accent"
        title={points.map((p) => p.code).join('、')}
      >
        {codeRange(points.map((p) => p.code)) || '点位待编号'}
      </p>
    </div>
  )
}

export function SystemPage({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const { m } = ctx
  const points = m.d.points.filter((p) => isSwitchLightingType(p.deviceType)).map(m.deckPoint)
  const switches = points.filter((p) => categoryOfType(p.deviceType)?.slug === 'switch')
  const lights = points.filter((p) => categoryOfType(p.deviceType)?.slug === 'lighting')
  const controls = points.filter((p) => LOCAL_CONTROLS.has(p.deviceType))
  const refs = new Set(points.map((p) => p.ref).filter(Boolean))
  const items = m.items.filter(
    (item) => refs.has(item.ref) && isSwitchLightingType(item.deviceType),
  )
  const rooms = new Set(points.map((p) => JSON.stringify([p.sheetId, p.areaId])))
  const groups = [
    {
      title: '墙壁开关',
      points: switches,
      description: '按房间布置常用开关，回路与按键功能在交付时确认。',
    },
    {
      title: '灯具与灯带',
      points: lights,
      description: '保留项目实际灯具选型，灯光分组与场景按需设置。',
    },
    {
      title: '中控与本地联动',
      points: controls,
      description: '本次配置的网关、中控屏、音箱与人体传感器。',
    },
  ].filter((group) => group.points.length)
  const perItem = items.length <= 7
  const rows = perItem
    ? items.map((item) => [
        <span key="r" className="doc-latin text-doc-accent">
          {item.ref}
        </span>,
        <span key="n" className="doc-body">
          {item.typeName} ×{item.count}
          {item.unit}
        </span>,
        <span key="s" className="doc-body" title={item.name}>
          {item.pending ? '待选型' : item.name || item.sku}
        </span>,
        <span key="l" className="doc-body" title={item.rooms.join('、')}>
          {item.rooms.slice(0, 2).join('、') || '见点位图'}
        </span>,
      ])
    : [...new Set(items.map((item) => categoryOfType(item.deviceType)?.slug))].map((slug) => {
        const list = items.filter((item) => categoryOfType(item.deviceType)?.slug === slug)
        const locations = [...new Set(list.flatMap((item) => item.rooms))]
        const category = categoryOfType(list[0].deviceType)
        return [
          <span key="r" className="doc-latin text-doc-accent">
            {list.length}项
          </span>,
          <span key="n" className="doc-body">
            {category?.name ?? '控制设备'} ×{list.reduce((sum, item) => sum + item.count, 0)}
          </span>,
          <span key="s" className="doc-body">
            {list.length}款型号 · 完整清单见投资明细
          </span>,
          <span key="l" className="doc-body" title={locations.join('、')}>
            {locations.slice(0, 2).join('、') || '见点位图'}
          </span>,
        ]
      })
  const unlinked = points.filter((p) => !p.ref).length
  const stats: [string, number][] = [
    ['开关点位', switches.length],
    ['灯光点位', lights.length],
    ['控制点位', controls.length],
    ['涉及区域', rooms.size],
  ]
  return (
    <Slide ctx={ctx} no={no} total={total} name="开关与灯光方案">
      <Chapter
        ctx={ctx}
        no={no}
        title="开关与灯光，照着生活来配置。"
        subtitle="开关回路、灯具分组与本地控制 / 配置对应本项目实际点位"
        tag="SWITCHES & LIGHTING"
      />
      <div className="flex min-h-0 w-full flex-1 flex-col gap-[20px] overflow-hidden">
        <div className="grid shrink-0 grid-cols-4 rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-diagram)">
          {stats.map(([label, count], i) => (
            <div
              key={label}
              className={`flex items-baseline justify-between gap-[12px] px-[24px] py-[16px] ${i ? 'border-l border-doc-rule' : ''}`}
            >
              <p className="doc-body text-[15px] text-doc-muted">{label}</p>
              <p className="doc-latin text-[34px] leading-none text-doc-accent">{count}</p>
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[604px_700px] items-start gap-[24px]">
          <div className="flex min-w-0 flex-col gap-[16px]">
            <SectionTitle title="本次控制与灯光配置" note={`${points.length} 个实际点位`} />
            <div className="grid grid-cols-2 gap-[14px]">
              {groups.map((group) => (
                <ControlGroup key={group.title} {...group} />
              ))}
            </div>
            <Panel title="本地操作与场景联动">
              {switches.length
                ? '保留墙壁按键的日常操作，开关回路与灯光分组逐项确认。'
                : '控制入口按本次中控、语音或感应设备配置确认。'}{' '}
              本地场景以设备与规则支持为准，交付时实测；远程控制与推送按网络条件确认。
            </Panel>
          </div>
          <div className="flex min-w-0 flex-col gap-[14px]">
            <SectionTitle
              title="开关灯光设备清单"
              note={perItem ? `${items.length} 项报价条目` : '按类别汇总'}
            />
            {rows.length ? (
              <DeckTable
                ctx={ctx}
                rowClassName="h-[44px] text-[13px]"
                columns={[
                  { label: '条目', className: 'w-[70px]' },
                  { label: '设备 / 数量', className: 'w-[150px]' },
                  { label: '本次产品', className: 'w-[310px]' },
                  { label: '安装位置', className: 'w-[170px]' },
                ]}
                rows={rows}
              />
            ) : (
              <Panel>本页点位尚未关联报价条目，具体型号以点位选型及后续报价确认为准。</Panel>
            )}
            {unlinked ? (
              <p className="doc-body text-[12px] leading-normal text-doc-muted">
                {unlinked} 个点位未关联报价条目；完整位置见住宅平面。
              </p>
            ) : null}
            <p className="doc-display text-[18px] leading-normal">安装与交付，确认三件事</p>
            <ol className="doc-body flex flex-col gap-[9px] text-[13px] leading-[1.6] text-doc-muted">
              <li>① 开关底盒、零火线与灯具回路对照现场核验。</li>
              <li>② 开关不默认支持调光调色；灯具能力按实际选型确认。</li>
              <li>③ 常用按键、灯光分组与本地场景逐项联调后交付。</li>
            </ol>
          </div>
        </div>
      </div>
    </Slide>
  )
}
