/**
 * 智能家居点位系统包：符号库（点位 + 灯光设计）、图层、检查规则、图例、导出模板。
 * 平面符号素材来自 fmkj-board-system（Procreate 工具箱原图优化），仅限内部使用；
 * 对外发布 / 交付客户前需确认扩展授权或换成自绘符号（scripts/build-board-symbols.mjs 换素材重跑即可）。
 *
 * 以后的专业（平面家居、暖通、照明、给排水）按同一个 SystemPack 接口各写一个包。
 */
import type { CheckIssue, LegendRow, SystemPack } from '@/board/core/pack'
import { sheetAt, symbolsOf } from '@/board/core/ops'
import type { BoardDoc } from '@/board/core/types'
import { DEVICE_TYPE_ORDER, deviceTypeOf } from '@/lib/device-types'

import { analyzeDoc } from './codec'
import { lightingVariant, lookOf } from './look'
import { SMART_HOME_OVERLAYS, unswitchedLights } from './overlays'

function check(doc: BoardDoc): CheckIssue[] {
  const issues: CheckIssue[] = []
  const { areas, points } = analyzeDoc(doc)
  const byCode = new Map<string, string[]>()
  for (const p of points) if (p.code) byCode.set(p.code, [...(byCode.get(p.code) ?? []), p.id])
  const dups = [...byCode].filter(([, ids]) => ids.length > 1)
  if (dups.length)
    issues.push({
      id: 'dup-code',
      level: 'error',
      title: `${dups.length} 个代号重复`,
      detail: dups
        .slice(0, 6)
        .map(([c, ids]) => `${c} ×${ids.length}`)
        .join('、'),
      targets: dups.flatMap(([, ids]) => ids),
    })
  const syms = symbolsOf(doc)
  const overlap = new Set<string>()
  for (let i = 0; i < syms.length; i++)
    for (let j = i + 1; j < syms.length; j++) {
      const a = syms[i]
      const b = syms[j]
      if (
        a.data.deviceType === b.data.deviceType &&
        Math.abs(a.x - b.x) < 3 &&
        Math.abs(a.y - b.y) < 3
      )
        overlap.add(a.id).add(b.id)
    }
  if (overlap.size)
    issues.push({
      id: 'overlap',
      level: 'warning',
      title: `${overlap.size} 个点位重叠`,
      detail: '同类型点位放在了同一位置，可能重复放置',
      targets: [...overlap],
    })
  const off = points.filter((p) => !p.sheetId)
  if (off.length)
    issues.push({
      id: 'off-sheet',
      level: 'warning',
      title: `${off.length} 个点位不在图纸上`,
      targets: off.map((p) => p.id),
    })
  if (areas.length) {
    const un = points.filter((p) => p.sheetId && !p.areaId)
    if (un.length)
      issues.push({
        id: 'no-area',
        level: 'warning',
        title: `${un.length} 个点位不在任何区域内`,
        detail: '不在区域内的点位不会按房间统计',
        targets: un.map((p) => p.id),
      })
    const empty = areas.filter((a) => !points.some((p) => p.areaId === a.id))
    if (empty.length)
      issues.push({
        id: 'empty-area',
        level: 'info',
        title: `${empty.length} 个区域还没有点位`,
        detail: empty
          .slice(0, 6)
          .map((a) => a.name)
          .join('、'),
        targets: empty.map((a) => a.id),
      })
    // 有灯具却没有开关、门外附近也没有开关（也没有人体传感器 / 中控屏）的房间：灯装上了却没法控制
    const dark = new Map<string, { name: string; lights: string[] }>()
    for (const { light, area } of unswitchedLights(doc)) {
      const key = area?.id ?? '__none'
      const g = dark.get(key) ?? { name: area?.name ?? '区域外', lights: [] }
      g.lights.push(light.id)
      dark.set(key, g)
    }
    if (dark.size) {
      issues.push({
        id: 'no-switch',
        level: 'warning',
        title: `${dark.size} 个房间的灯具没有开关控制`,
        detail: `${[...dark.values()]
          .slice(0, 6)
          .map((g) => g.name)
          .join('、')}：补开关或人体传感器；打开「开关控灯关联」可在图上查看`,
        targets: [...dark.values()].flatMap((g) => g.lights),
      })
    }
  }
  const uncal = syms.filter((s) => s.real && s.sizeCm && !sheetAt(doc, s.x, s.y)?.mmPerUnit)
  if (uncal.length)
    issues.push({
      id: 'uncalibrated',
      level: 'warning',
      title: `${uncal.length} 个按比例的灯具所在图纸未标定`,
      detail: '标定图纸比例后才按真实尺寸显示，现在按固定大小示意',
      targets: uncal.map((s) => s.id),
    })
  return issues
}

function legend(doc: BoardDoc): LegendRow[] {
  const rows = new Map<string, LegendRow>()
  for (const s of symbolsOf(doc)) {
    const look = lookOf(s)
    const row = rows.get(look.key)
    if (row) row.count++
    else {
      const v = lightingVariant(s.symbolId)
      rows.set(look.key, {
        key: look.key,
        label:
          v && look.key.includes(':') ? v.family.name : (deviceTypeOf(look.key)?.name ?? look.name),
        count: 1,
        look,
      })
    }
  }
  const order = (k: string) => DEVICE_TYPE_ORDER.indexOf(k.split(':')[0])
  return [...rows.values()].sort(
    (a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label, 'zh'),
  )
}

export const smartHomePack: SystemPack = {
  id: 'smart-home',
  name: '智能家居点位',
  paper: 'A3',
  scale: 50,
  layers: [
    { id: 'sheet', name: '图纸' },
    { id: 'area', name: '房间区域' },
    { id: 'shape', name: '标注' },
    { id: 'symbol', name: '点位' },
  ],
  look: lookOf,
  check,
  legend,
  export: { title: '智能家居点位图', note: '平面符号素材仅限内部使用，对外交付前请确认授权' },
  overlays: SMART_HOME_OVERLAYS,
}
