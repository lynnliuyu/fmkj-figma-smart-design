/**
 * 02 住宅平面：首页带需求色带；平面图上的编号与右侧点位索引、报价条目一一对应。
 * 点位少时逐点列出（设计稿样式），点位多时按房间列出编号区间与设备构成，保证一页放下。
 */
import { deviceTypeOf } from '@/lib/device-types'
import { cn } from '@/lib/utils'

import { type DeckSheet } from '../model'
import { PlanLegend } from '@/components/plan-legend'
import { PointMarker } from '@/components/point-marker'
import { resolveDisplayProfile } from '@/lib/display-profile'

import {
  Chapter,
  contentCrop,
  PlanCard,
  PlanView,
  SectionTitle,
  Slide,
  type DeckCtx,
} from '../parts'

/** 需求色带（4 栏渐变） */
function NeedsBand({ ctx }: { ctx: DeckCtx }) {
  return (
    <div className="grid min-h-[48px] w-full shrink-0 grid-cols-4 overflow-hidden rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-linear-to-r from-doc-soft to-doc-soft-to">
      {ctx.m.needs.map((n) => (
        <div key={n.label} className="flex min-w-0 items-center gap-[14px] px-[18px] py-[10px]">
          <p className="doc-body shrink-0 text-[13px] leading-normal text-doc-muted">{n.label}</p>
          <p className="doc-strong min-w-0 text-[17px] leading-[1.35] wrap-anywhere">{n.value}</p>
        </div>
      ))}
    </div>
  )
}

const ROW = 62

export function PlanPage({
  ctx,
  no,
  total,
  s,
  first,
}: {
  ctx: DeckCtx
  no: number
  total: number
  s: DeckSheet
  first: boolean
}) {
  const { m } = ctx
  // 项目级显示方案：决定这页点位图怎么画（网格 / 覆盖圈 / 光晕 / 底图淡化）
  const profile = resolveDisplayProfile(
    (m.d.project as unknown as { displayProfile?: string | null }).displayProfile,
  )
  const multi = m.sheets.length > 1
  const title = first ? '从生活出发，把智能放对位置。' : `${s.floorName}，逐点落位。`
  const subtitle = first
    ? `项目需求与全屋点位总览 / ${m.layoutText} · ${m.d.points.length}台/只设备${multi ? ` · ${m.sheets.length}张图纸` : ''}`
    : `${s.sheet.name} / ${s.points.length}个点位 · ${s.groups.length}个空间 · ${s.types}类设备`
  const avail = first ? 480 : 550
  const perPoint = s.points.length * ROW <= avail
  const groupRow = Math.max(54, Math.min(68, Math.floor(avail / Math.max(1, s.groups.length))))
  const maxGroups = Math.floor(avail / groupRow)
  const groups = s.groups.length > maxGroups ? s.groups.slice(0, maxGroups - 1) : s.groups
  const hidden = s.groups.length - groups.length
  const legend = true
  const planH = first ? 514 : 586
  return (
    <Slide ctx={ctx} no={no} total={total} name={`02 住宅平面 · ${s.sheet.name}`}>
      <Chapter ctx={ctx} no={no} title={title} subtitle={subtitle} tag="THE HOME PLAN" />
      {first ? <NeedsBand ctx={ctx} /> : null}
      <div className="flex min-h-0 w-full flex-1 items-start gap-[24px] overflow-hidden">
        <div className="flex w-[936px] shrink-0 flex-col gap-[8px]">
          <PlanCard
            left={
              <span className="doc-strong text-[18px] text-doc-ink">{`${multi ? s.floorName : '住宅平面'} · ${s.groups.length ? `${s.points.length}点` : '暂无点位'}`}</span>
            }
            right={<span className="text-[13px]">示意平面 · 不按比例</span>}
            className="w-[936px]"
          >
            <div
              className="flex items-center justify-center pt-[34px] pb-[12px]"
              style={{ height: planH }}
            >
              {/*
                按项目选定的「显示方案」渲染点位图。
                覆盖圈 / 光晕 / 网格都来自这里——同一份点位数据，
                打印给工长和发给客户看到的不是同一种图。
              */}
              <PlanView
                ctx={ctx}
                sheet={s.sheet}
                points={s.points}
                areas={s.areas}
                width={888}
                height={planH - 46}
                crop={contentCrop(s.sheet, s.areas, s.points)}
                coverage={profile.coverage}
                displayEffects={profile.displayEffects}
                grid={profile.grid}
                sheetOpacity={profile.sheetOpacity}
              />
            </div>
          </PlanCard>
          {legend ? (
            <PlanLegend
              points={s.points}
              variant="inline"
              className="doc-body max-h-[40px] overflow-hidden text-doc-ink"
            />
          ) : null}
          <p className="doc-body text-[13px] leading-[1.4] text-doc-muted">
            设备图标与右侧清单、报价条目对应。示意图不表示布线路由、准确尺寸或电气回路；尺寸与安装条件以现场复核为准。
          </p>
        </div>
        <div className="flex w-[368px] shrink-0 flex-col gap-[12px] overflow-hidden">
          <SectionTitle title="点位索引" note={`${s.points.length}点 / ${s.types}类设备`} />
          <div className="flex flex-col">
            {perPoint
              ? s.points.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-[12px] border-b border-doc-rule"
                    style={{ height: ROW }}
                  >
                    <PointMarker type={p.deviceType} className="size-[24px] shrink-0" />
                    <div className="min-w-0 flex-1 leading-[1.35]">
                      <p className="doc-body line-clamp-2 text-[16px] leading-[1.4] wrap-anywhere">
                        {p.room} · {p.typeName}
                      </p>
                    </div>
                    <p className="doc-latin max-w-[116px] shrink-0 text-right text-[12px] leading-[1.35] text-doc-muted wrap-anywhere">
                      {p.ref ?? (p.productId ? '未纳入本次报价' : '待选型')} / 1
                      {m.itemOf.get(p.ref ?? '')?.unit ?? '个'}
                    </p>
                  </div>
                ))
              : groups.map((g) => {
                  const types = [...new Set(g.points.map((p) => p.deviceType))]
                  const refs = [
                    ...new Set(g.points.map((p) => p.ref).filter((r): r is string => !!r)),
                  ]
                  return (
                    <div
                      key={g.key}
                      className="flex items-center gap-[10px] border-b border-doc-rule"
                      style={{ height: groupRow }}
                    >
                      <span className="flex min-w-[42px] shrink-0 items-center -space-x-1">
                        {types.slice(0, 3).map((t) => (
                          <PointMarker
                            key={t}
                            type={t}
                            className="size-[20px] rounded-full ring-1 ring-white"
                          />
                        ))}
                      </span>
                      <div className="min-w-0 flex-1 leading-[1.35]">
                        <p className="doc-body line-clamp-2 text-[16px] leading-[1.3] wrap-anywhere">
                          {g.name} · {g.points.length}点
                        </p>
                        <p
                          className={cn(
                            'doc-body line-clamp-2 leading-[1.35] text-doc-muted wrap-anywhere',
                            groupRow < 60 ? 'text-[12px]' : 'text-[13px]',
                          )}
                        >
                          {types
                            .map(
                              (t) =>
                                `${deviceTypeOf(t)?.name ?? '设备'}×${g.points.filter((p) => p.deviceType === t).length}`,
                            )
                            .join('  ')}
                        </p>
                      </div>
                      <p className="doc-latin max-w-[78px] shrink-0 text-right text-[12px] leading-[1.4] text-doc-muted wrap-anywhere">
                        {refs.slice(0, 3).join(' ')}
                        {refs.length > 3 ? ' …' : ''}
                      </p>
                    </div>
                  )
                })}
            {!perPoint && hidden > 0 ? (
              <p
                className="doc-body flex items-center border-b border-doc-rule text-[13px] text-doc-muted"
                style={{ height: groupRow }}
              >
                另有 {hidden} 个空间，详见各空间章节与报价明细
              </p>
            ) : null}
          </div>
          <p className="doc-body text-[13px] leading-[1.65] text-doc-muted">{m.indexNote}</p>
        </div>
      </div>
    </Slide>
  )
}
