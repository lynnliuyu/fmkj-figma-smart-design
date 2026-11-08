import { categoryOfType, deviceTypeOf } from './device-types'

/** 纯展示坐标；angle 与画布一致，使用弧度，0 指向右侧。 */
export type PointDisplayEffectSource = {
  id: string
  deviceType: string
  x: number
  y: number
  angle?: number
}

export type PointDisplayEffect = {
  id: string
  kind: 'wireless' | 'gateway' | 'motion' | 'smoke' | 'water' | 'light' | 'light-strip'
  x: number
  y: number
  angle: number
  size: number
  color: string
}

const EFFECT_COLORS: Record<PointDisplayEffect['kind'], string> = {
  wireless: categoryOfType('ap-node')!.color,
  gateway: categoryOfType('gateway')!.color,
  motion: categoryOfType('motion-sensor')!.color,
  smoke: categoryOfType('smoke-sensor')!.color,
  water: categoryOfType('water-sensor')!.color,
  light: categoryOfType('downlight')!.color,
  'light-strip': categoryOfType('light-strip')!.color,
}

function effectKind(deviceType: string): PointDisplayEffect['kind'] | null {
  switch (deviceType) {
    case 'ap-node':
    case 'ceiling-ap':
    case 'ac-router':
      return 'wireless'
    case 'gateway':
      return 'gateway'
    case 'motion-sensor':
      return 'motion'
    case 'smoke-sensor':
      return 'smoke'
    case 'water-sensor':
      return 'water'
    case 'light-strip':
      return 'light-strip'
    default:
      return deviceTypeOf(deviceType)?.category === 'lighting' ? 'light' : null
  }
}

const displaySize = (value: number) =>
  Number.isFinite(value) && value > 0 ? Math.min(512, Math.max(4, value)) : 24
const rotation = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value % (Math.PI * 2) : 0
const number = (value: number) => String(Number(value.toFixed(3)))

/** 按点位类型生成装饰；尺寸只随图标缩放，不表达实际覆盖距离或照度。 */
export function buildPointDisplayEffects(
  points: PointDisplayEffectSource[],
  markerSize = 24,
): PointDisplayEffect[] {
  const size = displaySize(markerSize)
  return points.flatMap((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return []
    const kind = effectKind(point.deviceType)
    return kind
      ? [
          {
            id: point.id,
            kind,
            x: point.x,
            y: point.y,
            angle: rotation(point.angle),
            size,
            color: EFFECT_COLORS[kind],
          },
        ]
      : []
  })
}

// Encode every code point: quotes/markup cannot enter SVG IDs, and different
// prefixes remain different even when they contain punctuation or non-Latin text.
const svgPrefix = (value: string) =>
  `point-effects-${Array.from(value, (char) => char.codePointAt(0)!.toString(16)).join('-') || '0'}`

/**
 * 返回图标下层使用的 SVG 片段，React 与 PNG 共用同一份图形。
 * idPrefix 在同一个 SVG 文档内应唯一；React 包装组件会自动补充实例 ID。
 */
export function renderPointDisplayEffectsSvg(
  effects: PointDisplayEffect[],
  idPrefix: string,
): string {
  const prefix = svgPrefix(idPrefix)
  return effects
    .map((effect, index) => {
      if (
        !Object.hasOwn(EFFECT_COLORS, effect.kind) ||
        !Number.isFinite(effect.x) ||
        !Number.isFinite(effect.y)
      )
        return ''
      const size = displaySize(effect.size)
      const color = /^#[0-9a-f]{6}$/i.test(effect.color) ? effect.color : EFFECT_COLORS[effect.kind]
      const gradientId = `${prefix}-${index}`
      const stroke = number(size * 0.035)
      const radius = (factor: number) => number(size * factor)
      const gradient = (opacity: number) =>
        `<defs><radialGradient id="${gradientId}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="0.5" stop-color="${color}" stop-opacity="${opacity * 0.6}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>`
      const glow = (rx: number, ry = rx, opacity = 0.13) =>
        `${gradient(opacity)}<ellipse cx="0" cy="0" rx="${radius(rx)}" ry="${radius(ry)}" fill="url(#${gradientId})"/>`
      const rings = (factors: number[], opacity: number, squash = 1) =>
        factors
          .map(
            (factor, i) =>
              `<ellipse cx="0" cy="0" rx="${radius(factor)}" ry="${radius(factor * squash)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-opacity="${number(opacity - i * 0.025)}"/>`,
          )
          .join('')
      let shapes: string
      switch (effect.kind) {
        case 'wireless':
          shapes = glow(3.2, 3.2, 0.1) + rings([1.35, 2.2, 3.05], 0.21)
          break
        case 'gateway':
          shapes = glow(2, 2, 0.1) + rings([1.1, 1.8], 0.18)
          break
        case 'motion': {
          const halfAngle = Math.PI / 3
          const arc = (factor: number) => {
            const r = size * factor
            const x = number(r * Math.cos(halfAngle))
            const y = number(r * Math.sin(halfAngle))
            return `M${x} -${y}A${number(r)} ${number(r)} 0 0 1 ${x} ${y}`
          }
          const r = size * 3
          const x = number(r * Math.cos(halfAngle))
          const y = number(r * Math.sin(halfAngle))
          shapes =
            gradient(0.15) +
            `<path d="M0 0L${x} -${y}A${number(r)} ${number(r)} 0 0 1 ${x} ${y}Z" fill="url(#${gradientId})" stroke="${color}" stroke-width="${stroke}" stroke-opacity="0.12"/>` +
            [1.1, 2, 2.9]
              .map(
                (factor) =>
                  `<path d="${arc(factor)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-opacity="0.2"/>`,
              )
              .join('')
          break
        }
        case 'smoke':
          shapes = glow(1.95, 1.95, 0.08) + rings([0.95, 1.4, 1.85], 0.16)
          break
        case 'water':
          shapes = glow(1.5, 0.65, 0.12) + rings([0.75, 1.1, 1.45], 0.21, 0.42)
          break
        case 'light':
          shapes = glow(2.45, 2.1, 0.2)
          break
        case 'light-strip':
          shapes =
            glow(2.3, 0.8, 0.18) +
            `<path d="M-${radius(1.8)} 0H${radius(1.8)}" fill="none" stroke="${color}" stroke-width="${radius(0.4)}" stroke-opacity="0.05" stroke-linecap="round"/>` +
            `<path d="M-${radius(1.8)} 0H${radius(1.8)}" fill="none" stroke="${color}" stroke-width="${radius(0.1)}" stroke-opacity="0.18" stroke-linecap="round"/>`
          break
      }
      return `<g transform="translate(${number(effect.x)} ${number(effect.y)}) rotate(${number((rotation(effect.angle) * 180) / Math.PI)})" pointer-events="none">${shapes}</g>`
    })
    .join('')
}
