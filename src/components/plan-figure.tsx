import { useId } from 'react'

import { PointDisplayEffects } from '@/components/point-display-effects'
import { categoryOfType, deviceTypeOf } from '@/lib/device-types'
import { buildPointDisplayEffects } from '@/lib/point-display-effects'
import { markerSrc } from '@/lib/point-marker-data'
import type { PlanAreaShape } from '@/lib/point-scene'
import { MARKER, SHEET } from '@/lib/sheet-spec'
import { cn } from '@/lib/utils'

export type PlanPoint = {
  id: string
  deviceType: string
  code: string
  rx: number | null
  ry: number | null
  image?: string | null
  angle?: number
}
/** 区域：比例坐标的外接框，多边形区域带 poly 轮廓（用 planAreaOf 生成） */
export type PlanArea = PlanAreaShape

/** 区域轮廓（比例坐标）与区域名位置：最上方（同高取最左）的顶点 */
export function planAreaOutline(a: PlanArea): [number, number][] {
  return (
    a.poly ?? [
      [a.x0, a.y0],
      [a.x1, a.y0],
      [a.x1, a.y1],
      [a.x0, a.y1],
    ]
  )
}
export const planAreaLabelAt = (a: PlanArea): [number, number] =>
  planAreaOutline(a).reduce((best, q) =>
    q[1] < best[1] - 1e-4 || (Math.abs(q[1] - best[1]) <= 1e-4 && q[0] < best[0]) ? q : best,
  )

/**
 * 方案图：标准图纸 + 点位（矢量，打印清晰）。
 * - symbol：平台设备图标；
 * - product：产品图（统一规格：白底圆框、类别色描边、图片等比居中），没有产品图时回退到图标。
 * 默认仅显示图标，需要设备类别名称时显式开启 showCodes。
 * 底图、设备图标与产品缩略图共用 SVG 坐标系，受打印高度限制时仍等比对齐。
 * 图标使用内嵌 SVG DataURL，导出 PDF / PNG 时不会因外链子资源被浏览器拦截而漏图。
 */
export function PlanFigure({
  sheetUrl,
  points,
  areas = [],
  mode = 'symbol',
  showCodes = false,
  showAreas = true,
  effects = false,
  dim = 0.55,
  className,
}: {
  sheetUrl: string | null
  points: PlanPoint[]
  areas?: PlanArea[]
  mode?: 'symbol' | 'product'
  showCodes?: boolean
  showAreas?: boolean
  /** 仅按设备类型叠加范围波纹与灯光氛围，不影响点位、选型或金额。 */
  effects?: boolean
  dim?: number
  className?: string
}) {
  const W = SHEET.pixelWidth
  const H = SHEET.pixelHeight
  const S = mode === 'product' ? 78 : 64
  const productClipPrefix = useId().replace(/:/g, '')
  const placed = points.filter((p) => p.rx !== null && p.ry !== null)
  const displayEffects = effects
    ? buildPointDisplayEffects(
        placed.map((p) => ({
          id: p.id,
          deviceType: p.deviceType,
          x: p.rx! * W,
          y: p.ry! * H,
          angle: p.angle,
        })),
        (MARKER.size * W) / SHEET.width,
      )
    : []
  return (
    <div className={cn('relative aspect-[3/2] overflow-hidden bg-white', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="pointer-events-none absolute inset-0 size-full"
        role="img"
        aria-label="点位方案图"
      >
        {sheetUrl ? (
          <image
            href={sheetUrl}
            x={0}
            y={0}
            width={W}
            height={H}
            opacity={dim}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null}
        {effects ? <PointDisplayEffects effects={displayEffects} idPrefix="plan-figure" /> : null}
        {showAreas
          ? areas.map((a) => {
              const [lx, ly] = planAreaLabelAt(a)
              return (
                <g key={a.id}>
                  <polygon
                    points={planAreaOutline(a)
                      .map(([x, y]) => `${x * W},${y * H}`)
                      .join(' ')}
                    fill="#0f172a"
                    fillOpacity={0.025}
                    stroke="#64748b"
                    strokeWidth={2.4}
                    strokeLinejoin="round"
                  />
                  <text
                    x={lx * W + 12}
                    y={ly * H + 34}
                    fontSize={26}
                    fontWeight={600}
                    fill="#475569"
                    stroke="#fff"
                    strokeWidth={6}
                    paintOrder="stroke"
                  >
                    {a.name}
                  </text>
                </g>
              )
            })
          : null}
        {placed.map((p, index) => {
          const cx = p.rx! * W
          const cy = p.ry! * H
          const color = categoryOfType(p.deviceType)?.color ?? '#525252'
          const isProd = mode === 'product' && Boolean(p.image)
          const typeLabel = deviceTypeOf(p.deviceType)?.name ?? '设备'
          return (
            <g key={p.id}>
              {isProd ? (
                <>
                  <circle cx={cx} cy={cy} r={S / 2} fill="#f1f1f1" stroke={color} strokeWidth={5} />
                  <defs>
                    <clipPath id={`${productClipPrefix}-${index}`}>
                      <circle cx={cx} cy={cy} r={(S - 14) / 2} />
                    </clipPath>
                  </defs>
                  <image
                    href={p.image!}
                    x={cx - (S - 14) / 2}
                    y={cy - (S - 14) / 2}
                    width={S - 14}
                    height={S - 14}
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#${productClipPrefix}-${index})`}
                  />
                </>
              ) : (
                <image
                  href={markerSrc(p.deviceType)}
                  x={cx - S / 2}
                  y={cy - S / 2}
                  width={S}
                  height={S}
                />
              )}
              {showCodes && typeLabel ? (
                <text
                  x={cx}
                  y={cy + S / 2 + 24}
                  textAnchor="middle"
                  fontSize={22}
                  fontWeight={700}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={6}
                  paintOrder="stroke"
                >
                  {typeLabel}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
