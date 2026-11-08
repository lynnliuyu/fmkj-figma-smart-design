/** 按楼层展示网络与检测点位，用既有信号波和感应范围叠加在实际平面上。 */
import { PointMarker } from '@/components/point-marker'
import { categoryOfType, deviceTypeOf } from '@/lib/device-types'
import { cn } from '@/lib/utils'

import { codeRange, type DeckPoint } from '../model'
import type { NetworkCameraModel, NetworkCameraSheet } from '../network-camera'
import {
  Chapter,
  contentCrop,
  PlanCard,
  PlanView,
  SectionTitle,
  Slide,
  type DeckCtx,
} from '../parts'

const NETWORK_TYPES = new Set(['ac-router', 'ap-node', 'ceiling-ap', 'network-panel'])
const WAVE_TYPES = new Set([
  'ac-router',
  'ap-node',
  'ceiling-ap',
  'motion-sensor',
  'smoke-sensor',
  'water-sensor',
])
const hasPosition = (p: DeckPoint) => Number.isFinite(p.rx) && Number.isFinite(p.ry)

function CoverageLegend({ points }: { points: DeckPoint[] }) {
  const types = new Set(points.map((p) => p.deviceType))
  const wireless = ['ap-node', 'ceiling-ap', 'ac-router'].some((type) => types.has(type))
  const entries = [
    ...(wireless ? [{ key: 'wireless', type: 'ap-node', name: 'Wi-Fi 信号波' }] : []),
    ...(types.has('motion-sensor')
      ? [{ key: 'motion', type: 'motion-sensor', name: '人体感应扇区' }]
      : []),
    ...(types.has('smoke-sensor')
      ? [{ key: 'smoke', type: 'smoke-sensor', name: '烟感范围波' }]
      : []),
    ...(types.has('water-sensor')
      ? [{ key: 'water', type: 'water-sensor', name: '水浸范围波' }]
      : []),
  ]
  return (
    <div className="doc-body flex min-h-[24px] flex-wrap items-center gap-x-[22px] gap-y-[6px] text-[12px] text-doc-muted">
      {entries.map((entry) => (
        <span key={entry.key} className="inline-flex items-center gap-[7px]">
          <svg
            width="27"
            height="22"
            viewBox="0 0 27 22"
            aria-hidden
            style={{ color: categoryOfType(entry.type)?.color }}
          >
            {entry.key === 'motion' ? (
              <path
                d="M3 11L22 2A21 21 0 0 1 22 20Z"
                fill="currentColor"
                fillOpacity="0.1"
                stroke="currentColor"
                strokeOpacity="0.65"
              />
            ) : (
              <>
                <ellipse
                  cx="13.5"
                  cy="11"
                  rx="11"
                  ry={entry.key === 'water' ? 4.5 : 9}
                  fill="currentColor"
                  fillOpacity="0.08"
                  stroke="currentColor"
                  strokeOpacity="0.55"
                />
                <ellipse
                  cx="13.5"
                  cy="11"
                  rx="6"
                  ry={entry.key === 'water' ? 2.5 : 5}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.4"
                />
              </>
            )}
          </svg>
          {entry.name}
        </span>
      ))}
      {!entries.length ? <span>图上图标对应右侧实际配置点位。</span> : null}
    </div>
  )
}

export function NetworkCameraPage({
  ctx,
  no,
  total,
  network,
  s = null,
}: {
  ctx: DeckCtx
  no: number
  total: number
  network: NetworkCameraModel
  s?: NetworkCameraSheet | null
}) {
  const points = s?.points ?? network.unmappedPoints
  const plotted = points.filter(hasPosition)
  const networkPoints = points.filter((p) => NETWORK_TYPES.has(p.deviceType))
  const sensorPoints = points.filter((p) => categoryOfType(p.deviceType)?.slug === 'sensor')
  const cameraPoints = points.filter((p) => p.deviceType === 'camera')
  const floor = s?.floorName ?? '待定位点位'
  const title = networkPoints.length
    ? `${floor} · Wi-Fi${sensorPoints.length ? '与检测' : ''}覆盖展示`
    : `${floor} · ${sensorPoints.length ? '检测设备覆盖展示' : '监控点位展示'}`
  const groups = [...new Set(points.map((p) => p.deviceType))].map((type) => ({
    type,
    points: points.filter((p) => p.deviceType === type),
  }))
  const shown = groups.slice(0, groups.length > 5 ? 4 : 5)
  const hidden = groups.slice(shown.length)
  const stats = [
    ...(networkPoints.length ? [{ label: '网络设备', count: networkPoints.length }] : []),
    ...(sensorPoints.length ? [{ label: '检测设备', count: sensorPoints.length }] : []),
    ...(cameraPoints.length ? [{ label: '摄像头', count: cameraPoints.length }] : []),
  ]
  const hasPlan = Boolean(s?.sheet.url)
  const hasWaves = hasPlan && plotted.some((p) => WAVE_TYPES.has(p.deviceType))
  const notPlotted = points.length - plotted.length
  return (
    <Slide ctx={ctx} no={no} total={total} name={`全屋网络与检测覆盖 · ${floor}`}>
      <Chapter
        ctx={ctx}
        no={no}
        title={title}
        subtitle={
          hasWaves
            ? '实际设备点位与楼层平面 / 叠加信号波与检测范围'
            : '实际设备点位与楼层平面 / 按本项目配置展示'
        }
        tag="COVERAGE PLAN"
      />
      <div className="flex min-h-0 w-full flex-1 items-start gap-[24px] overflow-hidden">
        <div className="flex w-[976px] shrink-0 flex-col gap-[10px]">
          <PlanCard
            left={<span className="doc-strong text-[18px]">{floor} · 覆盖点位图</span>}
            right={hasPlan ? `${plotted.length} 个上图点位` : '安装位置待确认'}
            className="w-[976px]"
          >
            <div className="flex h-[616px] items-center justify-center pt-[44px] pb-[12px]">
              {hasPlan && s ? (
                <PlanView
                  ctx={ctx}
                  sheet={s.sheet}
                  points={plotted}
                  areas={s.areas}
                  width={928}
                  height={560}
                  crop={contentCrop(s.sheet, s.areas, plotted)}
                  coverage
                />
              ) : (
                <div className="doc-body flex max-w-[660px] flex-col items-center gap-[18px] px-[36px] text-center text-[#787771]">
                  <div className="flex flex-wrap justify-center gap-[14px]">
                    {groups.map((g) => (
                      <PointMarker key={g.type} type={g.type} className="size-[40px]" />
                    ))}
                  </div>
                  <p className="doc-display text-[26px] text-[#373a37]">
                    {s ? '这层的点位底图还未上传' : '这些点位还未关联楼层图'}
                  </p>
                  <p className="text-[16px] leading-relaxed">
                    已保留实际设备清单，补齐图纸与位置后显示对应覆盖效果。
                  </p>
                </div>
              )}
            </div>
          </PlanCard>
          <CoverageLegend points={hasPlan ? plotted : []} />
          <p className="doc-body text-[12px] leading-[1.5] text-doc-muted">
            {hasWaves ? '波形按设备类型生成，作为覆盖展示示意。' : '点位与本次实际设备配置对应。'}
            {notPlotted && s ? `本层另有 ${notPlotted} 个点位待定位，已计入右侧配置。` : ''}
          </p>
        </div>
        <div className="flex w-[328px] shrink-0 flex-col gap-[16px] overflow-hidden">
          <SectionTitle title={s ? '本层配置' : '待定位配置'} note={`${points.length} 点`} />
          <div
            className={cn(
              'grid rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-diagram)',
              stats.length === 3
                ? 'grid-cols-3'
                : stats.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-1',
            )}
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={cn('px-[15px] py-[14px]', i > 0 && 'border-l border-doc-rule')}
              >
                <p className="doc-body text-[12px] text-doc-muted">{stat.label}</p>
                <p className="doc-latin mt-[5px] text-[30px] leading-none text-doc-accent">
                  {stat.count}
                </p>
              </div>
            ))}
          </div>
          <div>
            {shown.map((group) => {
              const refs = [...new Set(group.points.map((p) => p.ref).filter(Boolean))]
              return (
                <div
                  key={group.type}
                  className="flex min-h-[64px] items-center gap-[12px] border-b border-doc-rule py-[9px]"
                >
                  <PointMarker type={group.type} className="size-[30px] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="doc-strong flex items-center justify-between gap-[10px] text-[16px]">
                      <span>{deviceTypeOf(group.type)?.name ?? '设备'}</span>
                      <span className="doc-latin shrink-0 text-doc-accent">
                        ×{group.points.length}
                      </span>
                    </p>
                    <p
                      className="doc-body mt-[5px] truncate text-[11px] text-doc-muted"
                      title={group.points.map((p) => p.code).join('、')}
                    >
                      {codeRange(group.points.map((p) => p.code)) || '待编号'}
                      {refs.length ? ` · ${refs.join(' / ')}` : ''}
                    </p>
                  </div>
                </div>
              )
            })}
            {hidden.length ? (
              <p className="doc-body border-b border-doc-rule py-[10px] text-[12px] text-doc-muted">
                另 {hidden.length} 类 / {hidden.reduce((n, g) => n + g.points.length, 0)}{' '}
                个点位，见完整平面与报价。
              </p>
            ) : null}
          </div>
          <div className="doc-body rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-box) px-[17px] py-[15px] text-[12px] leading-[1.7] text-doc-muted">
            <p>图上编号对应本页配置；完整型号与数量可继续对照报价明细。</p>
          </div>
        </div>
      </div>
    </Slide>
  )
}
