/* eslint-disable @next/next/no-img-element -- 内置场景原图按校准比例完整嵌入，CMS 产品图沿用项目图片组件。 */
/** 场景原图上的可更新产品图叠层：设备位置来自模板，型号与图片来自当前点位。 */
import Image from 'next/image'

import { deviceTypeOf } from '@/lib/device-types'
import type { SceneVisual } from '@/lib/scene-visuals'
import { cn } from '@/lib/utils'

import type { SceneProductCallout } from './scene-products'

type Rect = { x: number; y: number; w: number; h: number }
type Target = { x: number; y: number }
type Placement = Rect & { callout: SceneProductCallout; target: Target }

const OVERLAY_TEXT = 'text-white [text-shadow:0_1px_3px_#000,0_0_7px_#0008]'

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), Math.max(min, max))
const overlap = (a: Rect, b: Rect, gap = 0) =>
  Math.max(0, Math.min(a.x + a.w + gap, b.x + b.w) - Math.max(a.x - gap, b.x)) *
  Math.max(0, Math.min(a.y + a.h + gap, b.y + b.h) - Math.max(a.y - gap, b.y))
const contains = (r: Rect, p: Target, gap = 0) =>
  p.x >= r.x - gap && p.x <= r.x + r.w + gap && p.y >= r.y - gap && p.y <= r.y + r.h + gap

/** 全部坐标先映射到同一张完整原图，再安排产品卡；缩略框不裁切设备。 */
function placeCallouts(
  visual: SceneVisual,
  callouts: SceneProductCallout[],
  width: number,
  height: number,
  cardW: number,
  cardH: number,
  hasRemainder: boolean,
): Placement[] {
  const scale = Math.min(width / visual.width, height / visual.height)
  const imageW = visual.width * scale
  const imageH = visual.height * scale
  const left = (width - imageW) / 2
  const top = (height - imageH) / 2
  const targets = callouts.map((c) => ({
    x: left + c.anchor.x * imageW,
    y: top + c.anchor.y * imageH,
  }))
  const placed: Placement[] = []
  const margin = 8
  const caption: Rect = { x: 10, y: 10, w: Math.min(258, width * 0.43), h: 23 }
  const remainder: Rect = { x: width - 172, y: height - 31, w: 162, h: 21 }

  for (const [index, callout] of callouts.entries()) {
    const preferred = {
      x: left + callout.anchor.labelX * imageW - cardW / 2,
      y: top + callout.anchor.labelY * imageH - cardH / 2,
    }
    const candidates: Rect[] = []
    const add = (x: number, y: number) =>
      candidates.push({
        x: clamp(x, margin, width - cardW - margin),
        y: clamp(y, margin, height - cardH - margin),
        w: cardW,
        h: cardH,
      })
    // 优先保留原标注位置，必要时移到附近空位，避免更大的产品图卡相互盖住。
    for (const dy of [0, -(cardH + 8), cardH + 8, -2 * (cardH + 8), 2 * (cardH + 8)]) {
      for (const dx of [0, -(cardW + 8), cardW + 8]) add(preferred.x + dx, preferred.y + dy)
    }
    // 高密度场景的兜底位置仍在同一画框内，所有产品卡保持完整。
    const cols = Math.max(1, Math.floor((width - margin * 2) / (cardW + 8)))
    const rows = Math.max(1, Math.floor((height - margin * 2) / (cardH + 8)))
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        add(
          margin + (col * (width - margin * 2 - cardW)) / Math.max(1, cols - 1),
          margin + (row * (height - margin * 2 - cardH)) / Math.max(1, rows - 1),
        )
      }
    }
    const cost = (r: Rect) =>
      placed.reduce((sum, prev) => sum + overlap(r, prev, 7), 0) * 1000 +
      overlap(r, caption, 4) * 1000 +
      (hasRemainder ? overlap(r, remainder, 4) * 1000 : 0) +
      targets.filter((point) => contains(r, point, 7)).length * 100_000 +
      Math.hypot(r.x - preferred.x, r.y - preferred.y)
    const position = candidates.reduce(
      (best, candidate) => (cost(candidate) < cost(best) ? candidate : best),
      candidates[0]!,
    )
    placed.push({ ...position, target: targets[index]!, callout })
  }
  return placed
}

const stateLabel = (callout: SceneProductCallout) => {
  if (callout.status === 'pending') return '待选型'
  if (callout.status === 'missing-image') return '待补产品图'
  return '型号待核对'
}

/** 产品图、名称与 SKU 来自同一个真实产品关联，不以设备类别借用其他型号图片。 */
export function SceneProductFigure({
  visual,
  callouts,
  width,
  height,
  maxCallouts,
  lazy = false,
  className,
  note = '场景意向 · 产品位置示意',
}: {
  visual: SceneVisual
  callouts: SceneProductCallout[]
  width: number
  height: number
  maxCallouts?: number
  lazy?: boolean
  className?: string
  note?: string
}) {
  const compact = width < 760
  const imageSize = compact ? 40 : 48
  const cardW = Math.min(compact ? 166 : 194, width - 16)
  const cardH = compact ? 60 : 70
  const limit =
    maxCallouts == null ? (compact ? 3 : 6) : Math.max(0, Math.min(6, Math.floor(maxCallouts)))
  const shown = callouts.slice(0, limit)
  const hidden = callouts.length - shown.length
  const placements = placeCallouts(visual, shown, width, height, cardW, cardH, hidden > 0)

  return (
    <figure
      aria-label={`${visual.label} · 产品点位示意`}
      data-scene-product-figure={visual.key}
      className={cn(
        'relative m-0 shrink-0 overflow-hidden rounded-(--deck-radius) bg-doc-stripe',
        className,
      )}
      style={{ width, height }}
    >
      <img
        src={visual.url}
        alt={`${visual.label}场景意向图`}
        width={visual.width}
        height={visual.height}
        loading={lazy ? 'lazy' : 'eager'}
        decoding={lazy ? 'async' : 'sync'}
        className="absolute inset-0 size-full object-contain"
      />
      <svg
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
      >
        {placements.map((p) => {
          const imageX = p.target.x > p.x + p.w / 2 ? p.x + p.w - imageSize : p.x
          const imageY = p.y + (p.h - imageSize) / 2
          const endX = clamp(p.target.x, imageX, imageX + imageSize)
          const endY = clamp(p.target.y, imageY, imageY + imageSize)
          return (
            <g key={p.callout.key}>
              <path
                d={`M${p.target.x} ${p.target.y} L${endX} ${endY}`}
                fill="none"
                stroke="white"
                strokeOpacity={0.7}
                strokeWidth={2.8}
              />
              <path
                d={`M${p.target.x} ${p.target.y} L${endX} ${endY}`}
                fill="none"
                stroke="var(--deck-marker)"
                strokeWidth={1.1}
              />
              <circle
                data-scene-product-target={p.callout.key}
                cx={p.target.x}
                cy={p.target.y}
                r={3}
                fill="var(--deck-marker)"
                stroke="white"
                strokeWidth={1.5}
              />
            </g>
          )
        })}
      </svg>
      {note ? (
        <figcaption
          className={cn(
            'doc-body absolute top-[10px] left-[10px] max-w-[calc(100%-20px)] text-[10px] leading-[1.4]',
            OVERLAY_TEXT,
          )}
        >
          {note}
        </figcaption>
      ) : null}
      {placements.map(({ callout, target, x, y, w, h }) => {
        const typeName = deviceTypeOf(callout.deviceType)?.name ?? callout.anchor.label
        const title = callout.product?.name || `${typeName} · ${stateLabel(callout)}`
        const image = callout.status === 'ready' ? callout.product?.imageUrl : null
        const codes = callout.codes.join(' / ') || '待编号'
        const imageOnRight = target.x > x + w / 2
        return (
          <div
            key={callout.key}
            data-scene-product-card={callout.key}
            data-product-id={callout.productId ?? undefined}
            data-product-state={callout.status}
            title={[title, callout.product?.sku, codes, `${callout.count}个点位`]
              .filter(Boolean)
              .join(' · ')}
            className={cn(
              'absolute flex items-center gap-[8px] rounded-[8px] bg-black/42 px-[6px] py-[4px] ring-1 ring-white/15 backdrop-blur-[2px]',
              imageOnRight && 'flex-row-reverse',
              OVERLAY_TEXT,
            )}
            style={{ left: x, top: y, width: w, height: h }}
          >
            <span
              data-scene-product-image
              className={cn(
                'flex shrink-0 items-center justify-center rounded-[5px] bg-white/92 p-[2px]',
                compact ? 'size-[40px]' : 'size-[48px]',
              )}
            >
              {image ? (
                <Image
                  src={image}
                  alt={callout.product?.imageAlt || title}
                  width={96}
                  height={96}
                  loading={lazy ? 'lazy' : 'eager'}
                  className="size-full object-contain drop-shadow-[0_2px_4px_#0006]"
                />
              ) : (
                <span className="doc-body text-center text-[9px] leading-[1.35] text-neutral-700 [text-shadow:none]">
                  {stateLabel(callout)}
                </span>
              )}
            </span>
            <div
              className={cn('flex min-w-0 flex-1 flex-col gap-[2px]', imageOnRight && 'text-right')}
            >
              <p className="doc-body flex items-center justify-between gap-[4px] text-[10px] leading-[1.25]">
                <span className="truncate">{codes}</span>
                <span className="shrink-0">×{callout.count}</span>
              </p>
              <p
                className={cn(
                  'doc-strong truncate leading-[1.3]',
                  compact ? 'text-[11px]' : 'text-[12px]',
                )}
              >
                {title}
              </p>
              <p className="doc-latin truncate text-[9px] leading-[1.3] opacity-85">
                {callout.product?.sku || typeName}
              </p>
            </div>
          </div>
        )
      })}
      {hidden ? (
        <p className={cn('doc-body absolute right-[10px] bottom-[10px] text-[10px]', OVERLAY_TEXT)}>
          另 {hidden} 组配置，见清单
        </p>
      ) : null}
    </figure>
  )
}
