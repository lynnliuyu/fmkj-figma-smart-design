/**
 * 点位范围（点位图、选型统计、生成报价、生成方案共用）。
 *
 * - all：全部点位
 * - no-light：不含灯具（纯开关 + 中控/网关/音箱/AP/窗帘/传感器/其他设备，去掉所有灯具）
 * - switch：仅开关面板（单开/双开/三开/四开 + 中控屏）
 * - switch-light：开关 + 灯光
 */
import { categoryOfType } from './device-types'

export const POINT_SCOPES = [
  { value: 'all', label: '全部', fullLabel: '全部点位' },
  { value: 'no-light', label: '不含灯具', fullLabel: '开关+其他设备（不含灯具）' },
  { value: 'switch', label: '仅开关', fullLabel: '仅开关面板' },
  { value: 'switch-light', label: '开关+灯光', fullLabel: '开关+灯光' },
] as const

export type PointScope = (typeof POINT_SCOPES)[number]['value']

export const isPointScope = (v: unknown): v is PointScope => POINT_SCOPES.some((s) => s.value === v)
export const pointScopeLabel = (s: PointScope) =>
  POINT_SCOPES.find((x) => x.value === s)?.fullLabel ?? '全部点位'

export function inferScopeFromTitle(title: string | null | undefined): PointScope {
  if (!title) return 'all'
  if (title.includes('不含灯具')) return 'no-light'
  if (title.includes('仅开关')) return 'switch'
  if (title.includes('开关+灯光')) return 'switch-light'
  return 'all'
}

export function inPointScope(deviceType: string | null | undefined, scope: PointScope): boolean {
  if (!deviceType || scope === 'all') return true
  const cat = categoryOfType(deviceType)?.slug ?? 'other'
  if (scope === 'no-light') return cat !== 'lighting'
  if (scope === 'switch') return cat === 'switch' || deviceType === 'touch-panel'
  if (scope === 'switch-light')
    return cat === 'switch' || cat === 'lighting' || deviceType === 'touch-panel'
  return true
}
