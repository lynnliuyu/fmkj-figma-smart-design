/**
 * 将场景模板中的安装位置与当前项目点位关联。
 * 设备类型只负责选位置，产品名称、型号与图片只由点位的 productId 决定。
 */
import type { CatalogProduct } from '@/lib/cached-data'
import type { DocPoint } from '@/lib/project-docs'
import type { SceneVisual } from '@/lib/scene-visuals'

export type SceneProductStatus =
  | 'ready'
  | 'missing-image'
  | 'pending'
  | 'missing-product'
  | 'type-mismatch'

export type SceneProductPoint = Pick<
  DocPoint,
  'id' | 'deviceType' | 'productId' | 'sheetId' | 'areaId' | 'code'
>
export type SceneProductAnchor = SceneVisual['anchors'][number] & {
  deviceTypes?: readonly string[]
}

export type SceneProduct = {
  id: string
  name: string
  sku: string
  imageUrl: string | null
  imageAlt: string
}

export type SceneProductGroup = {
  key: string
  deviceType: string
  productId: string | null
  sheetId: string | null
  areaId: string | null
  pointIds: string[]
  codes: string[]
  count: number
  status: SceneProductStatus
  product: SceneProduct | null
}

export type SceneProductCallout = SceneProductGroup & {
  anchor: SceneProductAnchor
  anchorIndex: number
}

export type SceneProductOptions = {
  /** 未指定的范围不做过滤；[null] 可明确选择未分区或未上图点位。 */
  sheetIds?: readonly (string | null)[]
  areaIds?: readonly (string | null)[]
  pointIds?: readonly string[]
  roomType?: string
  maxCallouts?: number
}

export type SceneProductMatch = {
  visual: SceneVisual
  groups: SceneProductGroup[]
  callouts: SceneProductCallout[]
  /** 锚点不够或无对应设备位置的产品完整保留，供页面列出其余配置。 */
  unplaced: SceneProductGroup[]
  excludedPointIds: string[]
  counts: { points: number; groups: number; callouts: number; unplacedPoints: number }
}

const statusOrder: Record<SceneProductStatus, number> = {
  ready: 0,
  'missing-image': 1,
  pending: 2,
  'missing-product': 3,
  'type-mismatch': 4,
}

function pointProduct(
  point: SceneProductPoint,
  byId: ReadonlyMap<string, CatalogProduct>,
): Pick<SceneProductGroup, 'status' | 'product'> {
  if (!point.productId) return { status: 'pending', product: null }
  const selected = byId.get(point.productId)
  if (!selected) return { status: 'missing-product', product: null }
  // 错误关联不能显示另一类设备的名称或图片，也不能从同类型目录自动借用型号。
  if (selected.deviceType !== point.deviceType) return { status: 'type-mismatch', product: null }
  const imageUrl = selected.image?.url?.trim() || null
  return {
    status: imageUrl ? 'ready' : 'missing-image',
    product: {
      id: selected.id,
      name: selected.name,
      sku: selected.sku ?? '',
      imageUrl,
      imageAlt: selected.image?.alt || selected.name,
    },
  }
}

/**
 * 一个锚点只展示一个真实型号；同一房间内同型号点位合并数量和代号。
 * 不同型号、房间或楼层保持独立，无法放入照片的配置通过 unplaced 明示。
 */
export function matchSceneProducts(
  visual: SceneVisual,
  points: readonly SceneProductPoint[],
  productById: ReadonlyMap<string, CatalogProduct>,
  options: SceneProductOptions = {},
): SceneProductMatch {
  const areas = options.areaIds ? new Set(options.areaIds) : null
  const sheets = options.sheetIds ? new Set(options.sheetIds) : null
  const ids = options.pointIds ? new Set(options.pointIds) : null
  const roomMatches =
    !options.roomType || !visual.roomTypes.length || visual.roomTypes.includes(options.roomType)
  const byGroup = new Map<string, SceneProductGroup>()
  const seen = new Set<string>()
  const excludedPointIds: string[] = []

  for (const point of points) {
    if (seen.has(point.id)) continue
    seen.add(point.id)
    const sheetId = point.sheetId ?? null
    const areaId = point.areaId ?? null
    if (
      !roomMatches ||
      (areas && !areas.has(areaId)) ||
      (sheets && !sheets.has(sheetId)) ||
      (ids && !ids.has(point.id))
    ) {
      excludedPointIds.push(point.id)
      continue
    }
    const productId = point.productId || null
    const key = JSON.stringify([sheetId, areaId, point.deviceType, productId])
    let group = byGroup.get(key)
    if (!group) {
      group = {
        key,
        deviceType: point.deviceType,
        productId,
        sheetId,
        areaId,
        pointIds: [],
        codes: [],
        count: 0,
        ...pointProduct(point, productById),
      }
      byGroup.set(key, group)
    }
    group.pointIds.push(point.id)
    if (point.code) group.codes.push(point.code)
    group.count++
  }

  const groups = [...byGroup.values()]
  const assigned = new Set<string>()
  const callouts: SceneProductCallout[] = []
  const max =
    options.maxCallouts != null && Number.isFinite(options.maxCallouts)
      ? Math.max(0, Math.floor(options.maxCallouts))
      : visual.anchors.length

  for (const [anchorIndex, anchor] of visual.anchors.entries()) {
    if (callouts.length >= max) break
    // 跨类型匹配只接受模板明确声明的范围，例如开关面板的一至四键变体。
    const types = new Set([
      anchor.deviceType,
      ...((anchor as SceneProductAnchor).deviceTypes ?? []),
    ])
    const candidates = groups.filter(
      (group) => !assigned.has(group.key) && types.has(group.deviceType),
    )
    candidates.sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        Number(b.deviceType === anchor.deviceType) - Number(a.deviceType === anchor.deviceType),
    )
    const group = candidates[0]
    if (!group) continue
    assigned.add(group.key)
    callouts.push({ ...group, anchor: { ...anchor }, anchorIndex })
  }

  const unplaced = groups.filter((group) => !assigned.has(group.key))
  return {
    visual,
    groups,
    callouts,
    unplaced,
    excludedPointIds,
    counts: {
      points: groups.reduce((sum, group) => sum + group.count, 0),
      groups: groups.length,
      callouts: callouts.length,
      unplacedPoints: unplaced.reduce((sum, group) => sum + group.count, 0),
    },
  }
}
