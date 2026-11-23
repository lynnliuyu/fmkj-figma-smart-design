/**
 * 把项目点位图按「楼层（图纸）→ 房间区域 → 设备型号」组织成报价明细。
 *
 * 单价、产品名称、型号、图片优先取自当前报价单里的行（用户在报价单里换过型号或改过单价会同步反映；
 * 报价单里已删除或未包含的设备类型不会出现，例如「不含灯具」的报价单不会出现灯具）。
 */
import type { PlanArea, PlanPoint } from '@/components/plan-figure'
import { areaTypeLabel } from './area-types'
import { DEVICE_TYPE_ORDER, deviceTypeOf } from './device-types'
import { parseDefaults, resolvePoint, type ResolvableProduct } from './point-map-items'
import { analyzeScene, planAreaOf, type StoredScene } from './point-scene'
import { requiresManualQuotePrice } from './quotes'

export type QuoteLineRef = {
  key?: string
  product: string | null
  deviceType: string | null
  image: string | null
  name: string
  shortName?: string | null
  sku: string
  unit: string
  price: number
  quantity: number
}

export type RoomDeviceLine = {
  /** 对应报价单里的行 key（用于在分区视图里直接点「更换型号」） */
  lineKey: string | null
  deviceType: string
  typeName: string
  productId: string | null
  name: string
  shortName: string | null
  sku: string
  unit: string
  image: string | null
  price: number
  quantity: number
  subtotal: number
  codes: string[]
}

export type QuoteRoomGroup = {
  id: string
  name: string
  typeLabel: string
  lines: RoomDeviceLine[]
  pointCount: number
  subtotal: number
}

export type QuoteFloorGroup = {
  sheetId: string
  /** 例如「一层」「二层」「三层」 */
  floorName: string
  sheetName: string
  sheetUrl: string | null
  planAreas: PlanArea[]
  planPoints: PlanPoint[]
  rooms: QuoteRoomGroup[]
  pointCount: number
  subtotal: number
}

/** 从图纸名称提取简短楼层名，例如「一层开关布置图」→「一层」 */
export function floorNameFromSheet(name: string, index: number): string {
  const m = /(地下[一二三123]层|负[一二三123]层|[一二三四五六七八九十1-9]+层|[B1-9]F)/i.exec(name)
  return m ? m[1].toUpperCase() : name || `第 ${index + 1} 层`
}

export function buildQuoteFloorGroups(
  pointMap: Partial<StoredScene> | null | undefined,
  defaultProducts: unknown,
  catalog: (ResolvableProduct & { tags?: string[] | null })[],
  quoteItems: QuoteLineRef[],
): QuoteFloorGroup[] {
  const { sheets, areas, points } = analyzeScene(pointMap)
  if (!points.length && !quoteItems.length) return []
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const defaults = parseDefaults(defaultProducts)

  // 按产品 ID 和设备类型索引报价单中的有效行，并跟踪已分配给图纸点位的数量，确保楼层房间小计之和与整单产品小计严格相等
  const activeItems = quoteItems.filter((item) => item.quantity > 0)
  if (!activeItems.length) return []
  const remainingQty = new Map<QuoteLineRef, number>(
    activeItems.map((item) => [item, item.quantity]),
  )
  const byProduct = new Map<string, QuoteLineRef[]>()
  const byType = new Map<string, QuoteLineRef[]>()
  for (const item of activeItems) {
    // 手工报价商品作为增项展示，不替代图纸上的同类点位。
    if (item.product && requiresManualQuotePrice(byId.get(item.product))) continue
    if (item.product) byProduct.set(item.product, [...(byProduct.get(item.product) ?? []), item])
    if (item.deviceType) byType.set(item.deviceType, [...(byType.get(item.deviceType) ?? []), item])
  }

  const pickItem = (productId: string | null, deviceType: string): QuoteLineRef | undefined => {
    const prodCandidates = productId ? (byProduct.get(productId) ?? []) : []
    const typeCandidates = byType.get(deviceType) ?? []
    const all = [...prodCandidates, ...typeCandidates.filter((x) => !prodCandidates.includes(x))]
    return all.find((x) => (remainingQty.get(x) ?? 0) > 0)
  }

  const areaById = new Map(areas.map((a) => [a.id, a]))
  const sheetList = sheets.length
    ? sheets
    : [
        {
          id: '__default',
          elementId: '__default',
          index: 0,
          name: '全屋',
          x: 0,
          y: 0,
          width: 1200,
          height: 800,
          fileId: null,
          url: null,
          missing: false,
        },
      ]

  const floors: QuoteFloorGroup[] = []
  for (const [idx, sheet] of sheetList.entries()) {
    const sheetPoints = sheets.length ? points.filter((p) => p.sheetId === sheet.id) : points
    if (!sheetPoints.length) continue

    // 按房间名合并同一层里的同名区域（例如 L 形厨房的两个框）
    const roomMap = new Map<
      string,
      { id: string; name: string; typeLabel: string; buckets: Map<string, RoomDeviceLine> }
    >()
    const planPoints: PlanPoint[] = []
    for (const pt of sheetPoints) {
      const resolved = resolvePoint(
        { deviceType: pt.deviceType, productId: pt.productId },
        byId,
        defaults,
      )
      const matched = pickItem(resolved.productId, pt.deviceType)
      // 报价单里没有该设备类型（例如选了「不含灯具」或已删除该行）时跳过
      if (!matched) continue
      remainingQty.set(matched, (remainingQty.get(matched) ?? 1) - 1)

      planPoints.push({
        id: pt.id,
        deviceType: pt.deviceType,
        code: pt.code,
        rx: pt.rx,
        ry: pt.ry,
        image: matched.image,
      })

      const area = pt.areaId ? areaById.get(pt.areaId) : undefined
      const roomName = area?.name ?? '其他区域'
      const rKey = roomName.replace(/\s+/g, '')
      let room = roomMap.get(rKey)
      if (!room) {
        room = {
          id: `${sheet.id}-${rKey}`,
          name: roomName,
          typeLabel: area ? areaTypeLabel(area.areaType) : '未分区',
          buckets: new Map(),
        }
        roomMap.set(rKey, room)
      }

      const bKey = `${pt.deviceType}:${matched.key ?? matched.product ?? matched.name}`
      let line = room.buckets.get(bKey)
      if (!line) {
        line = {
          lineKey: matched.key ?? null,
          deviceType: pt.deviceType,
          typeName: deviceTypeOf(pt.deviceType)?.name ?? '设备',
          productId: matched.product,
          name: matched.name,
          shortName: matched.shortName ?? null,
          sku: matched.sku,
          unit: matched.unit,
          image: matched.image,
          price: matched.price,
          quantity: 0,
          subtotal: 0,
          codes: [],
        }
        room.buckets.set(bKey, line)
      }
      line.quantity++
      line.subtotal = Math.round(line.price * line.quantity * 100) / 100
      if (pt.code) line.codes.push(pt.code)
    }

    const rooms: QuoteRoomGroup[] = [...roomMap.values()]
      .map((r) => {
        const lines = [...r.buckets.values()].sort(
          (a, b) =>
            DEVICE_TYPE_ORDER.indexOf(a.deviceType) - DEVICE_TYPE_ORDER.indexOf(b.deviceType),
        )
        for (const l of lines) l.codes.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        const pointCount = lines.reduce((s, l) => s + l.quantity, 0)
        const subtotal = Math.round(lines.reduce((s, l) => s + l.subtotal, 0) * 100) / 100
        return { id: r.id, name: r.name, typeLabel: r.typeLabel, lines, pointCount, subtotal }
      })
      .filter((r) => r.lines.length > 0)

    if (!rooms.length) continue
    const planAreas: PlanArea[] = areas
      .filter((a) => a.sheetId === sheet.id)
      .map((a) => planAreaOf(a, sheet))
    floors.push({
      sheetId: sheet.id,
      floorName: floorNameFromSheet(sheet.name, idx),
      sheetName: sheet.name,
      sheetUrl: sheet.url,
      planAreas,
      planPoints,
      rooms,
      pointCount: rooms.reduce((s, r) => s + r.pointCount, 0),
      subtotal: Math.round(rooms.reduce((s, r) => s + r.subtotal, 0) * 100) / 100,
    })
  }

  // 将报价单中手动新增或超出点位图数量的剩余明细行归入「全屋增项与补充配置」，确保楼层小计之和 === 整单产品小计
  const leftoverLines: RoomDeviceLine[] = []
  for (const item of activeItems) {
    const rem = remainingQty.get(item) ?? 0
    if (rem <= 0) continue
    const dt = item.deviceType || 'other'
    leftoverLines.push({
      lineKey: item.key ?? null,
      deviceType: dt,
      typeName: deviceTypeOf(dt)?.name ?? '增项设备',
      productId: item.product,
      name: item.name,
      shortName: item.shortName ?? null,
      sku: item.sku,
      unit: item.unit,
      image: item.image,
      price: item.price,
      quantity: rem,
      subtotal: Math.round(item.price * rem * 100) / 100,
      codes: [],
    })
  }
  if (leftoverLines.length > 0 && floors.length > 0) {
    const extraSubtotal = Math.round(leftoverLines.reduce((s, l) => s + l.subtotal, 0) * 100) / 100
    const extraCount = leftoverLines.reduce((s, l) => s + l.quantity, 0)
    const targetFloor = floors[floors.length - 1]
    targetFloor.rooms.push({
      id: `${targetFloor.sheetId}-extra`,
      name: '全屋增项与补充配置',
      typeLabel: '未分区',
      lines: leftoverLines,
      pointCount: extraCount,
      subtotal: extraSubtotal,
    })
    targetFloor.pointCount += extraCount
    targetFloor.subtotal = Math.round((targetFloor.subtotal + extraSubtotal) * 100) / 100
  }
  return floors
}
