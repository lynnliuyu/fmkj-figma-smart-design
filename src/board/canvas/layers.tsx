'use client'

import { memo } from 'react'

import { toDeg } from '../core/geometry'
import { areaPoly } from '../core/ops'
import type { OverlayShapes } from '../core/pack'
import { LABEL_SIZE, type SymbolGeom, type SymbolLook } from '../core/symbols'
import type { AreaObj, RawEl, SheetObj, SheetStyle, SymbolObj } from '../core/types'
import { AREA_LABEL, areaLabelAnchor } from './hit'

export const SHEET_STYLE_META: Record<
  SheetStyle,
  { label: string; desc: string; paperFill: string; filterId?: string }
> = {
  cad: { label: '原始 CAD', desc: '白底黑线工程底图', paperFill: '#ffffff' },
  warm: {
    label: '暖木彩平',
    desc: '暖色木地板与功能区着色',
    paperFill: '#fbf8f3',
    filterId: 'board-sheet-warm',
  },
  modern: {
    label: '现代极简',
    desc: '冷灰石材感与雅致分区着色',
    paperFill: '#f8fafc',
    filterId: 'board-sheet-modern',
  },
  blueprint: {
    label: '工程蓝图',
    desc: '深蓝晒图质感底图',
    paperFill: '#eff6ff',
    filterId: 'board-sheet-blueprint',
  },
}

function areaStyleColors(
  areaType: string,
  style: SheetStyle = 'cad',
): { fill: string; stroke: string; labelColor: string } {
  if (style === 'cad') {
    return {
      fill: 'rgba(100,116,139,0.035)',
      stroke: '#64748b',
      labelColor: '#475569',
    }
  }
  if (style === 'warm') {
    switch (areaType) {
      case 'living':
      case 'dining':
      case 'hallway':
        return { fill: 'rgba(235, 206, 168, 0.42)', stroke: '#b58952', labelColor: '#5c3d1e' }
      case 'master_bedroom':
      case 'bedroom':
      case 'study':
      case 'cloakroom':
        return { fill: 'rgba(224, 182, 142, 0.46)', stroke: '#9c6b3e', labelColor: '#543518' }
      case 'kitchen':
      case 'bathroom':
        return { fill: 'rgba(186, 214, 226, 0.45)', stroke: '#568296', labelColor: '#234757' }
      case 'balcony':
      case 'courtyard':
        return { fill: 'rgba(182, 220, 188, 0.45)', stroke: '#4f8758', labelColor: '#254f2c' }
      default:
        return { fill: 'rgba(222, 208, 190, 0.38)', stroke: '#8a7358', labelColor: '#4a3b2a' }
    }
  }
  if (style === 'modern') {
    switch (areaType) {
      case 'living':
      case 'dining':
        return { fill: 'rgba(199, 210, 254, 0.38)', stroke: '#6366f1', labelColor: '#3730a3' }
      case 'master_bedroom':
      case 'bedroom':
      case 'study':
        return { fill: 'rgba(221, 214, 254, 0.40)', stroke: '#7c3aed', labelColor: '#4c1d95' }
      case 'kitchen':
      case 'bathroom':
        return { fill: 'rgba(186, 230, 253, 0.40)', stroke: '#0284c7', labelColor: '#075985' }
      case 'balcony':
      case 'courtyard':
        return { fill: 'rgba(167, 243, 208, 0.38)', stroke: '#059669', labelColor: '#065f46' }
      default:
        return { fill: 'rgba(226, 232, 240, 0.42)', stroke: '#64748b', labelColor: '#334155' }
    }
  }
  // blueprint
  return {
    fill: 'rgba(191, 219, 254, 0.38)',
    stroke: '#3b82f6',
    labelColor: '#1d4ed8',
  }
}

export const SheetView = memo(function SheetView({
  s,
  href,
  opacity,
  titleColor,
  sheetStyle = 'cad',
}: {
  s: SheetObj
  href: string | null
  opacity: number
  titleColor: string
  sheetStyle?: SheetStyle
}) {
  const meta = SHEET_STYLE_META[sheetStyle] ?? SHEET_STYLE_META.cad
  return (
    <g>
      <rect
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        fill={meta.paperFill}
        filter="url(#board-paper-shadow)"
      />
      {href ? (
        <image
          href={href}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          opacity={opacity}
          filter={meta.filterId ? `url(#${meta.filterId})` : undefined}
          preserveAspectRatio="none"
        />
      ) : (
        <text x={s.x + s.w / 2} y={s.y + s.h / 2} textAnchor="middle" fontSize={28} fill="#b45309">
          图纸图片已丢失，请删除后重新添加
        </text>
      )}
      <text x={s.x} y={s.y - 14} fontSize={28} fontWeight={600} fill={titleColor}>
        {s.name}
      </text>
    </g>
  )
})

/** 区域：实线轮廓（多边形或矩形）+ 最上方顶点处的区域名；选中时描边加粗并带浅色底 */
export const AreaView = memo(function AreaView({
  a,
  selected,
  sheetStyle = 'cad',
}: {
  a: AreaObj
  selected: boolean
  sheetStyle?: SheetStyle
}) {
  const label = areaLabelAnchor(a)
  const palette = areaStyleColors(a.areaType, sheetStyle)
  return (
    <g>
      <polygon
        points={areaPoly(a)
          .map((q) => `${q.x},${q.y}`)
          .join(' ')}
        fill={selected ? 'var(--board-accent-soft)' : palette.fill}
        stroke={selected ? 'var(--board-accent)' : palette.stroke}
        strokeOpacity={selected ? 1 : sheetStyle === 'cad' ? 0.85 : 0.65}
        strokeWidth={selected ? 2 : 1.4}
        strokeDasharray={sheetStyle !== 'cad' && !selected ? '5 3' : undefined}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={sheetStyle !== 'cad' && !selected ? { mixBlendMode: 'multiply' } : undefined}
      />
      <text
        x={label.x + 4}
        y={label.y + 3 + AREA_LABEL * 0.95}
        fontSize={AREA_LABEL}
        fontWeight={600}
        fill={selected ? 'var(--board-accent)' : palette.labelColor}
        stroke="#ffffff"
        strokeWidth={3}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {a.name}
      </text>
    </g>
  )
})

export const SymbolView = memo(function SymbolView({
  o,
  g,
  look,
  small,
  ghost,
}: {
  o: SymbolObj
  g: SymbolGeom
  look: SymbolLook
  small: boolean
  ghost?: boolean
}) {
  const art = look.art
  return (
    <g opacity={ghost ? 0.55 : undefined} pointerEvents="none">
      {g.marker || !art ? (
        look.marker ? (
          <image href={look.marker} x={o.x - g.w / 2} y={o.y - g.h / 2} width={g.w} height={g.h} />
        ) : null
      ) : (
        <image
          href={small ? art.srcSm : art.src}
          x={o.x - g.imgW / 2}
          y={o.y - g.imgH / 2}
          width={g.imgW}
          height={g.imgH}
          preserveAspectRatio="none"
          transform={o.angle ? `rotate(${toDeg(o.angle)} ${o.x} ${o.y})` : undefined}
        />
      )}
      {look.badge && !g.marker ? (
        <text
          x={g.aabb.x + g.aabb.w}
          y={g.aabb.y + 3}
          fontSize={8}
          fontWeight={800}
          textAnchor="middle"
          fill={look.color}
          stroke="#ffffff"
          strokeWidth={2.4}
          paintOrder="stroke"
        >
          {look.badge}
        </text>
      ) : null}
    </g>
  )
})

/** 点位代号：所有图标画完后统一画在最上层，点位密集时也不会被相邻图标盖住 */
export const SymbolLabel = memo(function SymbolLabel({
  o,
  g,
  color,
}: {
  o: SymbolObj
  g: SymbolGeom
  color: string
}) {
  return (
    <text
      x={o.x}
      y={g.labelY}
      textAnchor="middle"
      fontSize={LABEL_SIZE}
      fontWeight={700}
      fill={color}
      stroke="#ffffff"
      strokeWidth={2.2}
      paintOrder="stroke"
      strokeLinejoin="round"
      pointerEvents="none"
    >
      {o.code}
    </text>
  )
})

/**
 * 系统包的辅助图层：覆盖圈（半透明填充 + 描边，估算时用虚线）、关联连线（虚线）、提示圈。
 * 线宽不随缩放变化；文字按缩放反向放大，保证任何缩放下都清楚。
 */
export const OverlayView = memo(function OverlayView({
  shapes,
  zoom,
}: {
  shapes: OverlayShapes
  zoom: number
}) {
  const fs = 11 / zoom
  return (
    <g pointerEvents="none">
      {shapes.circles?.map((c) => (
        <g key={`c-${c.id}`}>
          <circle
            cx={c.x}
            cy={c.y}
            r={c.r}
            fill={c.color}
            fillOpacity={0.07}
            stroke={c.color}
            strokeOpacity={0.55}
            strokeWidth={1.4}
            strokeDasharray={c.estimated ? '6 5' : undefined}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={c.x}
            cy={c.y}
            r={c.r * 0.5}
            fill="none"
            stroke={c.color}
            strokeOpacity={0.25}
            strokeWidth={1}
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
          {c.label ? (
            <text
              x={c.x}
              y={c.y - c.r + fs * 1.4}
              textAnchor="middle"
              fontSize={fs}
              fontWeight={600}
              fill={c.color}
              stroke="#ffffff"
              strokeWidth={3 / zoom}
              paintOrder="stroke"
            >
              {c.label}
            </text>
          ) : null}
        </g>
      ))}
      {shapes.links?.map((l) => (
        <line
          key={`l-${l.id}`}
          x1={l.from.x}
          y1={l.from.y}
          x2={l.to.x}
          y2={l.to.y}
          stroke={l.color}
          strokeOpacity={0.6}
          strokeWidth={1.2}
          strokeDasharray="5 4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {shapes.marks?.map((m) => (
        <circle
          key={`m-${m.id}`}
          cx={m.x}
          cy={m.y}
          r={18 / Math.max(zoom, 0.4)}
          fill="none"
          stroke={m.color}
          strokeWidth={1.8}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        >
          {m.title ? <title>{m.title}</title> : null}
        </circle>
      ))}
    </g>
  )
})

const FONTS: Record<number, string> = {
  1: '"Comic Sans MS", cursive, system-ui',
  3: 'ui-monospace, monospace',
  5: '"Comic Sans MS", cursive, system-ui',
  8: '"Comic Sans MS", cursive, system-ui',
}

function arrowHead(x1: number, y1: number, x0: number, y0: number, len: number) {
  const a = Math.atan2(y1 - y0, x1 - x0)
  const s = 0.45
  return `M${x1 - len * Math.cos(a - s)} ${y1 - len * Math.sin(a - s)}L${x1} ${y1}L${x1 - len * Math.cos(a + s)} ${y1 - len * Math.sin(a + s)}`
}

/** 旧画布里引擎不认识的元素：尽量按原样画出来（形状、线、箭头、手绘、文字、图片） */
export const RawView = memo(function RawView({ el, href }: { el: RawEl; href: string | null }) {
  const w = el.width || 0
  const h = el.height || 0
  const stroke = typeof el.strokeColor === 'string' ? el.strokeColor : '#1e1e1e'
  const sw = typeof el.strokeWidth === 'number' ? el.strokeWidth : 2
  const bg =
    typeof el.backgroundColor === 'string' && el.backgroundColor !== 'transparent'
      ? el.backgroundColor
      : 'none'
  const fillOpacity = el.fillStyle === 'solid' ? 1 : 0.35
  const dash =
    el.strokeStyle === 'dashed'
      ? `${sw * 4} ${sw * 3}`
      : el.strokeStyle === 'dotted'
        ? `${sw * 0.5} ${sw * 3}`
        : undefined
  const common = {
    stroke,
    strokeWidth: sw,
    strokeDasharray: dash,
    fill: bg,
    fillOpacity,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const angle =
    typeof el.angle === 'number' && el.angle
      ? `rotate(${toDeg(el.angle)} ${el.x + w / 2} ${el.y + h / 2})`
      : undefined
  const opacity = typeof el.opacity === 'number' ? el.opacity / 100 : 1
  let body: React.ReactNode = null
  const pts = Array.isArray(el.points) ? (el.points as [number, number][]) : []
  switch (el.type) {
    case 'rectangle':
      body = (
        <rect
          x={el.x}
          y={el.y}
          width={w}
          height={h}
          rx={el.roundness ? Math.min(w, h) * 0.12 : 0}
          {...common}
        />
      )
      break
    case 'ellipse':
      body = <ellipse cx={el.x + w / 2} cy={el.y + h / 2} rx={w / 2} ry={h / 2} {...common} />
      break
    case 'diamond':
      body = (
        <polygon
          points={`${el.x + w / 2},${el.y} ${el.x + w},${el.y + h / 2} ${el.x + w / 2},${el.y + h} ${el.x},${el.y + h / 2}`}
          {...common}
        />
      )
      break
    case 'line':
    case 'arrow':
    case 'freedraw': {
      if (pts.length < 2) break
      const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${el.x + px} ${el.y + py}`).join('')
      const n = pts.length
      const heads: string[] = []
      if (el.type === 'arrow' && el.endArrowhead !== null)
        heads.push(
          arrowHead(
            el.x + pts[n - 1][0],
            el.y + pts[n - 1][1],
            el.x + pts[n - 2][0],
            el.y + pts[n - 2][1],
            6 + sw * 3,
          ),
        )
      if (el.type === 'arrow' && el.startArrowhead)
        heads.push(
          arrowHead(
            el.x + pts[0][0],
            el.y + pts[0][1],
            el.x + pts[1][0],
            el.y + pts[1][1],
            6 + sw * 3,
          ),
        )
      body = (
        <>
          <path
            d={d}
            {...common}
            fill={
              el.type === 'freedraw' ? 'none' : el.type === 'line' && bg !== 'none' ? bg : 'none'
            }
          />
          {heads.length ? (
            <path
              d={heads.join('')}
              stroke={stroke}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </>
      )
      break
    }
    case 'text': {
      const size = typeof el.fontSize === 'number' ? el.fontSize : 20
      const lh = (typeof el.lineHeight === 'number' ? el.lineHeight : 1.25) * size
      const anchor =
        el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start'
      const tx =
        el.textAlign === 'center' ? el.x + w / 2 : el.textAlign === 'right' ? el.x + w : el.x
      body = (
        <text
          fontSize={size}
          fill={stroke}
          textAnchor={anchor}
          fontFamily={FONTS[el.fontFamily as number] ?? 'system-ui, sans-serif'}
        >
          {String(el.text ?? '')
            .split('\n')
            .map((line, i) => (
              <tspan key={i} x={tx} y={el.y + i * lh + lh * 0.8}>
                {line}
              </tspan>
            ))}
        </text>
      )
      break
    }
    case 'image':
      body = href ? (
        <image href={href} x={el.x} y={el.y} width={w} height={h} preserveAspectRatio="none" />
      ) : (
        <rect x={el.x} y={el.y} width={w} height={h} fill="#f5f5f5" stroke="#d4d4d4" />
      )
      break
    default:
      body = (
        <rect
          x={el.x}
          y={el.y}
          width={w}
          height={h}
          fill="none"
          stroke="#a3a3a3"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )
  }
  return (
    <g transform={angle} opacity={opacity} pointerEvents="none">
      {body}
    </g>
  )
})
