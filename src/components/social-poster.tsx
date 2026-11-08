import { PlanFigure } from '@/components/plan-figure'
import { PointMarker } from '@/components/point-marker'
import { CodeImage } from '@/components/mini-app-code'
import {
  socialBudgetBand,
  socialPosterSheets,
  type SocialPosterData,
  type SocialPosterPage,
} from '@/lib/social-poster'
import { cn } from '@/lib/utils'

export type SocialPosterTheme = 'qixu' | 'noir'

/** 固定360×480，预览缩放、3倍导出为1080×1440。 */
export function SocialPoster({
  data,
  page,
  pageNumber,
  totalPages,
  theme,
  hideExactPrice,
  showQr,
}: {
  data: SocialPosterData
  page: SocialPosterPage
  pageNumber: number
  totalPages: number
  theme: SocialPosterTheme
  hideExactPrice: boolean
  showQr: boolean
}) {
  const dark = theme === 'noir'
  const accent = dark ? 'text-[#E0CA99]' : 'text-[#76668D]'
  const muted = dark ? 'text-[#B9B3AB]' : 'text-[#8A8190]'
  const panel = dark ? 'border-white/10 bg-white/5' : 'border-[#E6E0E9] bg-white/75'
  const line = dark ? 'border-white/15' : 'border-[#DED8E3]'
  const first = socialPosterSheets(data)[0]
  const price = socialBudgetBand(data.totalAmount, hideExactPrice)
  const qrUrl = data.miniAppCodeUrl ?? data.qrCodeUrl
  const heading = (eyebrow: string, title: string, note?: string) => (
    <div className="space-y-2">
      <p className={cn('text-[9px] font-medium tracking-[0.2em]', accent)}>{eyebrow}</p>
      <h3 className="text-[26px] leading-[1.18] font-semibold tracking-tight">{title}</h3>
      {note ? <p className={cn('text-[10px] leading-[1.6]', muted)}>{note}</p> : null}
    </div>
  )
  const metrics = [
    ['设备点位', `${data.pointCount}`],
    ...(data.roomCount ? [['配置空间', `${data.roomCount}`]] : []),
    ...(data.floorCount ? [['楼层图纸', `${data.floorCount}`]] : []),
  ]
  return (
    <article
      data-social-poster={page.key}
      className={cn(
        'relative flex h-[480px] w-[360px] shrink-0 flex-col overflow-hidden px-6 py-5',
        dark ? 'bg-[#18171B] text-[#F5F1E9]' : 'bg-[#F6F3F8] text-[#302936]',
      )}
    >
      <div
        className={cn(
          'mb-4 flex items-center justify-between gap-3 border-b pb-2 text-[8px] tracking-[0.13em]',
          line,
          muted,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">{data.companyName}</span>
          {page.kind === 'closing' && showQr && qrUrl ? (
            <CodeImage src={qrUrl} size={20} dark={dark} className="shrink-0" />
          ) : null}
        </div>
        <span className="shrink-0">SMART HOME / {String(pageNumber).padStart(2, '0')}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {page.kind === 'cover' ? (
          <>
            <p className={cn('mb-2 text-[10px]', accent)}>
              {data.platform || '全屋智能'} · 方案案例
            </p>
            <h3 className="line-clamp-2 text-[30px] leading-[1.22] font-semibold tracking-tight">
              {data.title}
              <br />
              把智能放进生活。
            </h3>
            <div
              className={cn(
                'my-5 flex min-h-0 flex-1 items-center overflow-hidden border bg-white p-2',
                line,
              )}
            >
              {first ? (
                <PlanFigure
                  sheetUrl={first.url}
                  points={first.points}
                  areas={first.areas}
                  effects
                  dim={0.65}
                  className="w-full"
                />
              ) : (
                <div className="flex w-full flex-col gap-3 px-3 py-5">
                  {data.topTypes.slice(0, 4).map((type) => (
                    <div
                      key={type.type}
                      className="flex items-center gap-3 text-xs text-neutral-700"
                    >
                      <PointMarker type={type.type} className="size-7" />
                      {type.name} × {type.count}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-between gap-3">
              {metrics.map(([label, value]) => (
                <div key={label}>
                  <p className={cn('text-[25px] leading-none font-medium tabular-nums', accent)}>
                    {value}
                    <span className="ml-1 text-[10px] font-normal">
                      {label === '设备点位' ? '点' : label === '楼层图纸' ? '张' : '间'}
                    </span>
                  </p>
                  <p className={cn('mt-1.5 text-[9px]', muted)}>{label}</p>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {page.kind === 'plan' ? (
          <>
            {heading(
              'FLOOR PLAN',
              page.sheet.name,
              `${page.sheet.points.length} 个点位 · 按真实配置落图`,
            )}
            <div
              className={cn(
                'my-4 flex min-h-0 flex-1 items-center overflow-hidden border bg-white p-1.5',
                line,
              )}
            >
              <PlanFigure
                sheetUrl={page.sheet.url}
                points={page.sheet.points}
                areas={page.sheet.areas}
                effects
                dim={0.7}
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-2">
              {data.topTypes
                .filter((type) => page.sheet.points.some((p) => p.deviceType === type.type))
                .slice(0, 6)
                .map((type) => (
                  <div key={type.type} className="flex items-center gap-1.5">
                    <PointMarker type={type.type} className="size-4" />
                    <span className={cn('truncate text-[9px]', muted)}>
                      {type.name} ×{' '}
                      {page.sheet.points.filter((p) => p.deviceType === type.type).length}
                    </span>
                  </div>
                ))}
            </div>
          </>
        ) : null}
        {page.kind === 'equipment' ? (
          <>
            {heading(
              'DEVICE CONFIGURATION',
              '这次，配了什么。',
              `${data.topTypes.length} 类设备配置${page.parts > 1 ? ` · 第 ${page.part}/${page.parts} 张` : ''}`,
            )}
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-1.5">
              {page.types.map((type) => (
                <div
                  key={type.type}
                  className={cn(
                    'flex min-h-[34px] items-center gap-3 rounded-lg border px-3 py-1.5',
                    panel,
                  )}
                >
                  <PointMarker type={type.type} className="size-6" />
                  <span className="min-w-0 flex-1 text-[12px]">{type.name}</span>
                  <span className={cn('text-[18px] leading-none tabular-nums', accent)}>
                    {type.count}
                    <span className="ml-1 text-[9px]">点</span>
                  </span>
                </div>
              ))}
            </div>
            <p className={cn('mt-2 text-[9px]', muted)}>
              按项目设备点位统计；具体品牌型号以确认清单为准。
            </p>
          </>
        ) : null}
        {page.kind === 'budget' ? (
          <>
            {heading('BUDGET OVERVIEW', '把预算，讲清楚。', data.budgetLabel || '方案预算参考')}
            <div className={cn('my-4 rounded-xl border px-4 py-5', panel)}>
              <p className={cn('text-[10px]', muted)}>{hideExactPrice ? '预算区间' : '方案金额'}</p>
              <p
                className={cn(
                  'mt-3 break-words text-[42px] leading-none font-medium tracking-tight tabular-nums',
                  accent,
                )}
              >
                {price}
              </p>
              <p className={cn('mt-3 text-[9px]', muted)}>
                {hideExactPrice
                  ? '具体金额已隐藏，按区间分享。'
                  : '仅展示本次方案金额，不代表其他项目报价。'}
              </p>
            </div>
            <div className="space-y-3">
              {[
                ['设备配置', `${data.pointCount} 个点位 / ${data.topTypes.length} 类设备`],
                ...(data.floorCount ? [['图纸范围', `${data.floorCount} 张楼层图纸`]] : []),
                ...(data.roomCount ? [['空间范围', `${data.roomCount} 个配置空间`]] : []),
              ].map(([label, value]) => (
                <div
                  key={label}
                  className={cn(
                    'flex items-center justify-between gap-2 border-b pb-2 text-[11px]',
                    line,
                  )}
                >
                  <span className={muted}>{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
            <p className={cn('mt-auto pt-3 text-[9px] leading-[1.6]', muted)}>
              品牌、型号、安装条件和费用范围需逐项确认，再确定最终交付清单。
            </p>
          </>
        ) : null}
        {page.kind === 'scene' ? (
          <>
            {heading('LIVING SCENARIO', page.scene.title, page.scene.description)}
            <div className="relative my-4 min-h-0 flex-1 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.scene.url}
                alt={page.scene.alt}
                className="absolute inset-0 size-full object-cover"
                loading="eager"
                decoding="sync"
              />
            </div>
            <p className={cn('text-[9px] leading-[1.6]', muted)}>
              场景氛围意向图，非项目实景；具体联动与设备支持范围另行确认。
            </p>
          </>
        ) : null}
        {page.kind === 'closing' ? (
          <>
            {heading('PLAN CONFIRMATION', '下一步，一起确认。', '让点位、配置与日常习惯对齐。')}
            <div className="my-4 space-y-3">
              {[
                ['01', '点位放在哪里', '逐个房间确认设备位置与安装条件。'],
                ['02', '平时怎么使用', '确认开关、感应、语音和场景的控制方式。'],
                ['03', '怎样完成交付', '按确认清单核对型号、费用和验收内容。'],
              ].map(([no, title, detail]) => (
                <div key={no} className="flex gap-3">
                  <span className={cn('text-[20px] font-medium', accent)}>{no}</span>
                  <div>
                    <p className="text-[13px] font-medium">{title}</p>
                    <p className={cn('mt-1 text-[10px] leading-[1.6]', muted)}>{detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div
              className={cn('mt-auto flex items-center justify-between gap-3 border-t pt-3', line)}
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{data.companyName}</p>
                <p className={cn('mt-1 text-[9px]', muted)}>全屋智能 · 从点位设计到方案确认</p>
              </div>
            </div>
          </>
        ) : null}
      </div>
      <div
        className={cn(
          'mt-4 flex shrink-0 items-center justify-between gap-2 border-t pt-2 text-[8px]',
          line,
          muted,
        )}
      >
        <span className="min-w-0 truncate">
          {data.title} · {page.label}
        </span>
        <span className="shrink-0 tabular-nums">
          {String(pageNumber).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
        </span>
      </div>
    </article>
  )
}
