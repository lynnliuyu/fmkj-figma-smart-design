/* eslint-disable @next/next/no-img-element -- 方案页导出 PDF / 图片时，图片须是同源普通 <img> 才能被完整内嵌 */
/**
 * 8 章提案的公共部件（尺寸来自 Figma 设计稿 1440 × 960 画布，节点 8:6729 等）。
 * 颜色字体来自风格变量（bg-doc-* / doc-display / --deck-*），版式差异由主题的 cover / chapter / table 字段决定。
 */
import { PointDisplayEffects } from '@/components/point-display-effects'
import { MiniAppCode } from '@/components/mini-app-code'
import { brandLatin } from '@/documents/parts'
import { brandInitials } from '@/lib/brand'
import { markerSrc } from '@/lib/point-marker-data'
import { buildPointDisplayEffects, type PointDisplayEffect } from '@/lib/point-display-effects'
import { areaLabelAnchor, areaOutline, type AreaInfo, type SheetInfo } from '@/lib/point-scene'
import { MARKER } from '@/lib/sheet-spec'
import { cn } from '@/lib/utils'

import type { ProposalMarkers } from '../templates'
import { pad, type DeckModel, type DeckPoint } from './model'
import type { DeckTheme } from './themes'

/** lazy：缩略图与模板库里图片延迟加载（打印 / 导出时必须立即加载，默认 false） */
export type DeckCtx = { m: DeckModel; theme: DeckTheme; markers: ProposalMarkers; lazy?: boolean }

/** 方案图片的加载方式：导出需要同步加载；缩略图延迟加载，避免一次拉取多张大图 */
export const imgLoading = (ctx: DeckCtx) =>
  ctx.lazy
    ? ({ loading: 'lazy', decoding: 'async' } as const)
    : ({ loading: 'eager', decoding: 'sync' } as const)

/** 金额数字：栖序用 Inter，衬线风格用衬线数字 */
export const amountFont = (ctx: DeckCtx) =>
  ctx.theme.amount === 'latin' ? 'doc-latin' : 'doc-numeral'

/** 1440 × 960 方案页：页眉、内容、页脚（封面自己排版） */
export function Slide({
  ctx,
  no,
  total,
  name,
  cover = false,
  children,
}: {
  ctx: DeckCtx
  no: number
  total: number
  name: string
  cover?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      data-export-page
      data-figma-frame={name}
      className={cn(
        'relative mx-auto flex h-[960px] w-[1440px] shrink-0 flex-col overflow-hidden bg-doc-paper text-doc-ink shadow-sm print:shadow-none print:[zoom:0.7795]',
        no >= total ? 'break-after-auto' : 'break-after-page',
        !cover && 'gap-[24px] px-[56px] pt-[36px] pb-[72px]',
      )}
    >
      {cover ? (
        children
      ) : (
        <>
          <DeckHeader ctx={ctx} />
          {children}
          <DeckFooter ctx={ctx} no={no} total={total} />
        </>
      )}
    </section>
  )
}

/** 服务商品牌：有 Logo 用 Logo，否则用公司名称缩写。 */
export function Brand({
  ctx,
  large = false,
  className,
}: {
  ctx: DeckCtx
  large?: boolean
  className?: string
}) {
  const c = ctx.m.d.company
  return (
    <div className={cn('flex shrink-0 items-center gap-[10px] overflow-hidden', className)}>
      {c.logo ? (
        <img
          src={c.logo.url}
          alt={c.logo.alt || c.name}
          className={cn('w-auto object-contain', large ? 'h-[28px]' : 'h-[22px]')}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-sm border border-doc-rule text-[10px] font-semibold text-doc-accent',
            large ? 'size-[26px]' : 'size-[22px]',
          )}
        >
          {brandInitials(c.name)}
        </span>
      )}
      <p
        className={cn(
          'doc-display leading-normal whitespace-nowrap',
          large ? 'text-[21px]' : 'text-[17px]',
        )}
      >
        {c.name}
      </p>
      <MiniAppCode companyName={c.name} size={large ? 32 : 28} dark={ctx.theme.mood === 'dark'} />
    </div>
  )
}

export const headerTagline = (ctx: DeckCtx, tagline = ctx.theme.tagline) =>
  [brandLatin(ctx.m.d.company.name), tagline].filter(Boolean).join('  /  ')

/** 页眉（节点 8:6730）：品牌 + 英文副标 */
export function DeckHeader({ ctx }: { ctx: DeckCtx }) {
  return (
    <div className="flex h-[32px] w-full shrink-0 items-center justify-between overflow-hidden">
      <Brand ctx={ctx} />
      <p
        className={cn(
          'doc-latin text-[11px] leading-normal whitespace-pre text-doc-muted',
          ctx.theme.trackedTagline && 'tracking-[0.18em]',
        )}
      >
        {headerTagline(ctx)}
      </p>
    </div>
  )
}

/** 页码保持简洁，小程序入口统一位于左上品牌旁。 */
export function PageNumber({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  return (
    <div
      data-page-number
      className="doc-latin flex shrink-0 items-center gap-[8px] text-[12px] whitespace-nowrap text-doc-ink"
    >
      <span>{`${pad(no)} / ${pad(total)}`}</span>
    </div>
  )
}

/** 页脚：分隔线 + 项目 / 客户 · 方案类型 | 日期 | 页码 */
export function DeckFooter({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const { m } = ctx
  const left = `${m.place} / ${m.customer}　 ·　 ${m.platform ? `${m.platform} · ` : ''}${m.scopeText}`
  return (
    <div
      data-deck-footer
      className="absolute inset-x-[56px] top-[906px] flex flex-col gap-[4px] overflow-hidden"
    >
      <div className="h-px w-full bg-doc-rule" />
      <div className="flex h-[42px] w-full items-center justify-between gap-6 leading-normal">
        <p className="doc-body max-w-[640px] overflow-hidden text-[11px] text-ellipsis whitespace-pre text-doc-muted">
          {left}
        </p>
        <p className="doc-latin text-[11px] whitespace-pre text-doc-muted">{m.date}</p>
        <PageNumber ctx={ctx} no={no} total={total} />
      </div>
    </div>
  )
}

/** 章节标题（节点 8:6735）：栖序 = 细体大编号；墨金 = 金色眉标 + 淡金大编号；原木 = 圆形编号徽章 */
export function Chapter({
  ctx,
  no,
  title,
  subtitle,
  tag,
}: {
  ctx: DeckCtx
  no: number
  title: string
  subtitle?: string
  tag: string
}) {
  const style = ctx.theme.chapter
  if (style === 'eyebrow') {
    return (
      <div className="flex h-[92px] w-full shrink-0 items-end gap-[24px] overflow-hidden">
        <div className="flex min-w-px flex-1 flex-col gap-[4px] overflow-hidden">
          <p className="doc-latin text-[11px] leading-normal tracking-[0.32em] whitespace-nowrap text-doc-accent">{`CHAPTER ${pad(no)}  ·  ${tag}`}</p>
          <p className="doc-display w-full truncate text-[36px] leading-[1.3]">{title}</p>
          {subtitle ? (
            <p className="doc-body w-full truncate text-[14px] leading-normal text-doc-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        <p className="doc-numeral text-[96px] leading-[0.8] whitespace-nowrap text-doc-accent/25">
          {pad(no)}
        </p>
      </div>
    )
  }
  if (style === 'badge') {
    return (
      <div className="flex h-[92px] w-full shrink-0 items-end gap-[22px] overflow-hidden">
        <span className="doc-numeral mb-[2px] flex size-[72px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-doc-accent text-[28px] text-doc-accent">
          {pad(no)}
        </span>
        <div className="flex min-w-px flex-1 flex-col gap-[6px] overflow-hidden">
          <p className="doc-display w-full truncate text-[38px] leading-[1.25]">{title}</p>
          {subtitle ? (
            <p className="doc-body w-full truncate text-[14px] leading-normal text-doc-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        <p className="doc-latin text-[11px] leading-normal tracking-[0.22em] whitespace-nowrap text-doc-accent">
          {tag}
        </p>
      </div>
    )
  }
  return (
    <div className="flex h-[92px] w-full shrink-0 items-end gap-[24px] overflow-hidden">
      <p className="doc-numeral text-[68px] leading-normal whitespace-nowrap text-doc-accent">
        {pad(no)}
      </p>
      <div className="flex min-w-px flex-1 flex-col gap-[6px] overflow-hidden">
        <p className="doc-display w-full truncate text-[40px] leading-[1.25]">{title}</p>
        {subtitle ? (
          <p className="doc-body w-full truncate text-[14px] leading-normal text-doc-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      <p className="doc-latin text-[11px] leading-normal whitespace-nowrap text-doc-muted">{tag}</p>
    </div>
  )
}

/** 分节标题（节点 8:6764）：23px 标题 + 13px 强调色旁注 */
export function SectionTitle({
  title,
  note,
  className,
}: {
  title: React.ReactNode
  note?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 items-center justify-between gap-4 overflow-hidden leading-normal whitespace-nowrap',
        className,
      )}
    >
      <p className="doc-display truncate text-[23px]">{title}</p>
      {note ? <p className="doc-body shrink-0 text-[13px] text-doc-accent">{note}</p> : null}
    </div>
  )
}

export type DeckColumn = { label: string; className: string }

/** 明细表（节点 8:6783）：栖序 = 深灰表头 + 斑马纹；墨金 = 金线表头；原木 = 圆角浅绿表头 */
export function DeckTable({
  ctx,
  columns,
  rows,
  rowClassName = 'h-[48px] text-[13.5px]',
  tinted,
}: {
  ctx: DeckCtx
  columns: DeckColumn[]
  rows: React.ReactNode[][]
  rowClassName?: string
  tinted?: boolean[]
}) {
  const t = ctx.theme.table
  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-col overflow-hidden',
        t === 'soft' && 'rounded-(--deck-radius-sm) border border-doc-rule',
      )}
    >
      <div
        className={cn(
          'doc-strong flex h-[38px] w-full shrink-0 items-center text-[12px] leading-normal',
          t === 'gold'
            ? 'border-b border-doc-accent/60 tracking-[0.12em] text-doc-accent'
            : 'bg-doc-head text-doc-head-fg',
        )}
      >
        {columns.map((c) => (
          <p key={c.label} className={cn('shrink-0 truncate pl-[12px]', c.className)}>
            {c.label}
          </p>
        ))}
      </div>
      {rows.map((cells, i) => (
        <div
          key={i}
          className={cn(
            'flex w-full shrink-0 items-center overflow-hidden border-b border-doc-rule leading-[1.4]',
            rowClassName,
            tinted?.[i]
              ? 'bg-(--deck-service-row)'
              : t === 'dark' && i % 2
                ? 'bg-doc-stripe'
                : t === 'soft'
                  ? 'bg-(--deck-card)'
                  : '',
            t === 'soft' && i === rows.length - 1 && 'border-b-0',
          )}
        >
          {cells.map((cell, j) => (
            <div
              key={j}
              className={cn('min-w-0 shrink-0 truncate pl-[12px]', columns[j].className)}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 说明卡（设计稿里的浅紫提示框）：标题 + 正文 */
export function Panel({
  title,
  children,
  className,
}: {
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-col gap-[6px] overflow-hidden rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-(--deck-panel) px-[18px] py-[16px]',
        className,
      )}
    >
      {title ? <p className="doc-display text-[15px] leading-[1.6]">{title}</p> : null}
      <div className="doc-body text-[13px] leading-[1.75] text-doc-muted">{children}</div>
    </div>
  )
}

/** 编号徽章（点位索引左侧的小圆） */
export function NoBadge({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <span
      className={cn(
        'doc-latin flex h-[22px] shrink-0 items-center justify-center rounded-full bg-(--deck-badge) text-[11px] text-doc-accent',
        wide ? 'min-w-[46px] px-[8px]' : 'w-[22px]',
      )}
    >
      {children}
    </span>
  )
}

/** 照片上的点位标注位置（相对照片宽高）：标签位置 + 引线终点。照片是氛围意向图，标注只示意点位关系 */
const CALLOUT_SLOTS = [
  { x: 0.34, y: 0.21, tx: 0.52, ty: 0.12 },
  { x: 0.7, y: 0.79, tx: 0.62, ty: 0.66 },
]

/** 氛围照片 + 点位标注 */
export function Photo({
  src,
  width,
  height,
  note,
  callouts = [],
}: {
  src: string
  width: number
  height: number
  note?: string
  callouts?: { no: number; code: string; deviceType?: string }[]
}) {
  const chipW = 112
  const chipH = 32
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-(--deck-radius) bg-doc-stripe"
      style={{ width, height }}
    >
      <img
        src={src}
        alt=""
        loading="eager"
        decoding="sync"
        className="absolute inset-0 size-full object-cover"
      />
      {note ? (
        <span className="doc-body absolute top-[18px] left-[18px] rounded-[calc(var(--deck-radius-sm)/2)] bg-(--deck-chip) px-[10px] py-[4px] text-[11px] text-(--deck-chip-ink)">
          {note}
        </span>
      ) : null}
      {callouts.length ? (
        <svg className="absolute inset-0" width={width} height={height} aria-hidden>
          {callouts.slice(0, 2).map((c, i) => {
            const s = CALLOUT_SLOTS[i]
            const x = s.x * width + chipW
            const y = s.y * height + chipH / 2
            const tx = s.tx * width
            const ty = s.ty * height
            return (
              <g
                key={c.code + i}
                style={{ stroke: 'var(--deck-marker)' }}
                fill="none"
                strokeWidth={1.4}
              >
                <path d={`M${x} ${y} H${tx} V${ty}`} />
                <circle cx={tx} cy={ty} r={3} style={{ fill: 'var(--deck-marker)' }} />
              </g>
            )
          })}
        </svg>
      ) : null}
      {callouts.slice(0, 2).map((c, i) => (
        <span
          key={c.code + i}
          className="doc-latin absolute flex items-center gap-[8px] rounded-[calc(var(--deck-radius-sm)/2)] bg-(--deck-chip) px-[8px] text-[12px] text-(--deck-chip-fg)"
          style={{
            left: CALLOUT_SLOTS[i].x * width,
            top: CALLOUT_SLOTS[i].y * height,
            width: chipW,
            height: chipH,
          }}
        >
          <img src={markerSrc(c.deviceType ?? 'other')} alt="" className="size-[20px] shrink-0" />
          <span className="truncate font-semibold">{c.code}</span>
        </span>
      ))}
    </div>
  )
}

/** 标准图纸的场景单位（见 sheet-spec：1200 × 800） */
const SW = 1200
const SH = 800
const COVERAGE_SCALE: Partial<Record<PointDisplayEffect['kind'], number>> = {
  wireless: 2.5,
  motion: 1.8,
  smoke: 1.4,
  water: 1.1,
}
export type Crop = { x: number; y: number; w: number; h: number }

/** 房间在图纸上的范围（场景单位），四周留一点边，用于房间小平面 */
export function roomCrop(sheet: SheetInfo, areas: AreaInfo[]): Crop | null {
  if (!areas.length) return null
  const fx = (v: number) => ((v - sheet.x) / sheet.width) * SW
  const fy = (v: number) => ((v - sheet.y) / sheet.height) * SH
  const x0 = Math.min(...areas.map((a) => fx(a.x)))
  const y0 = Math.min(...areas.map((a) => fy(a.y)))
  const x1 = Math.max(...areas.map((a) => fx(a.x + a.width)))
  const y1 = Math.max(...areas.map((a) => fy(a.y + a.height)))
  const m = Math.max(x1 - x0, y1 - y0) * 0.1 + 12
  return clampCrop({ x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m })
}

/** 显示范围平移回图纸内（不超出图纸边缘，避免出现空白） */
function clampCrop(c: Crop): Crop {
  const w = Math.min(c.w, SW)
  const h = Math.min(c.h, SH)
  return { x: Math.min(Math.max(0, c.x), SW - w), y: Math.min(Math.max(0, c.y), SH - h), w, h }
}

/** 整层平面的显示范围：图纸四周留白较多时，放大到房间与点位所在的范围 */
export function contentCrop(sheet: SheetInfo, areas: AreaInfo[], points: DeckPoint[]): Crop | null {
  const xs: number[] = []
  const ys: number[] = []
  for (const a of areas) {
    xs.push(((a.x - sheet.x) / sheet.width) * SW, ((a.x + a.width - sheet.x) / sheet.width) * SW)
    ys.push(((a.y - sheet.y) / sheet.height) * SH, ((a.y + a.height - sheet.y) / sheet.height) * SH)
  }
  for (const p of points) {
    if (p.rx == null || p.ry == null) continue
    xs.push(p.rx * SW)
    ys.push(p.ry * SH)
  }
  if (xs.length < 2) return null
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  // 已经占满大半张图纸时不裁切
  if ((x1 - x0) * (y1 - y0) > SW * SH * 0.62) return null
  const m = 48
  return clampCrop({ x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m })
}

/**
 * 户型平面 + 点位：底图用 <img>，点位用 SVG（编号圆点 + 代号，或设备图标 + 编号）。
 * crop 为场景单位的显示范围（房间小平面）；不传则显示整张图纸。点位很多时只显示编号。
 */
export function PlanView({
  ctx,
  sheet,
  points,
  areas = [],
  width,
  height,
  crop,
  coverage = false,
}: {
  ctx: DeckCtx
  sheet: SheetInfo
  points: DeckPoint[]
  areas?: AreaInfo[]
  width: number
  height: number
  crop?: Crop | null
  /** 覆盖展示页放大信号与感应波形，沿用点位图的类型化效果。 */
  coverage?: boolean
}) {
  const box = crop ?? { x: 0, y: 0, w: SW, h: SH }
  const k = Math.min(width / box.w, height / box.h)
  const vw = width / k
  const vh = height / k
  // 显示框比裁切范围宽（或高）时，多出的部分尽量落在图纸内；比整张图纸还大时居中
  const fit = (c: number, len: number, view: number, full: number) =>
    view >= full ? (full - view) / 2 : Math.min(Math.max(0, c + len / 2 - view / 2), full - view)
  const vx = fit(box.x, box.w, vw, SW)
  const vy = fit(box.y, box.h, vh, SH)
  const u = (px: number) => px / k
  const dense = points.length > 48
  const displayEffects = buildPointDisplayEffects(
    points.flatMap((p) =>
      p.rx == null || p.ry == null
        ? []
        : [{ id: p.id, deviceType: p.deviceType, x: p.rx * SW, y: p.ry * SH, angle: p.angle }],
    ),
    MARKER.size,
  ).map((effect) =>
    coverage
      ? {
          ...effect,
          size: effect.size * (COVERAGE_SCALE[effect.kind] ?? 1),
        }
      : effect,
  )
  return (
    <div className="relative shrink-0 overflow-hidden" style={{ width, height }}>
      {sheet.url ? (
        <img
          src={sheet.url}
          alt=""
          loading="eager"
          decoding="sync"
          className="absolute max-w-none select-none"
          style={{
            left: -vx * k,
            top: -vy * k,
            width: SW * k,
            height: SH * k,
            opacity: ctx.theme.mood === 'dark' ? 0.8 : 0.62,
          }}
        />
      ) : null}
      <svg
        className="absolute inset-0"
        width={width}
        height={height}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        aria-hidden
      >
        <PointDisplayEffects effects={displayEffects} idPrefix="proposal-plan" />
        {areas.map((a) => {
          const px = (x: number) => ((x - sheet.x) / sheet.width) * SW
          const py = (y: number) => ((y - sheet.y) / sheet.height) * SH
          const [lx, ly] = areaLabelAnchor(a)
          return (
            <g key={a.id}>
              <polygon
                points={areaOutline(a)
                  .map(([x, y]) => `${px(x)},${py(y)}`)
                  .join(' ')}
                fill="none"
                style={{ stroke: 'var(--deck-plan-code)' }}
                strokeOpacity={0.4}
                strokeWidth={u(1.1)}
                strokeLinejoin="round"
              />
              <text
                x={px(lx) + u(6)}
                y={py(ly) + u(15)}
                fontSize={u(11)}
                style={{ fill: 'var(--deck-plan-code)', fontFamily: 'var(--doc-font-body)' }}
                fillOpacity={0.85}
                stroke="#ffffff"
                strokeWidth={u(3)}
                paintOrder="stroke"
              >
                {a.name}
              </text>
            </g>
          )
        })}
        {points.map((p) => {
          if (p.rx == null || p.ry == null) return null
          const cx = p.rx * SW
          const cy = p.ry * SH
          const s = u(dense ? 20 : 24)
          return (
            <g key={p.id}>
              <image
                href={markerSrc(p.deviceType)}
                x={cx - s / 2}
                y={cy - s / 2}
                width={s}
                height={s}
              />
              {coverage && p.code ? (
                <text
                  x={cx}
                  y={cy + s / 2 + u(12)}
                  textAnchor="middle"
                  fontSize={u(10)}
                  fill="#334155"
                  stroke="#ffffff"
                  strokeWidth={u(3)}
                  paintOrder="stroke"
                >
                  {p.code}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** 平面卡片（白底，墨金为象牙色），内含左右两个小标签 */
export function PlanCard({
  left,
  right,
  children,
  className,
}: {
  left?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden rounded-(--deck-radius) border border-(--deck-card-border) bg-(--deck-card) text-[#252523]',
        className,
      )}
    >
      {left || right ? (
        <div className="doc-body absolute inset-x-[24px] top-[14px] z-10 flex justify-between text-[12px] text-[#787771]">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      ) : null}
      {children}
    </div>
  )
}
