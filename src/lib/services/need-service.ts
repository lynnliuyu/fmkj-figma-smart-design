import type { PayloadRequest } from 'payload'

import { getPayloadClient } from '@/lib/payload'
import { computeDefaults, estimateArea, type NeedHouse } from '@/lib/need-defaults'
import { computePricing, QUANTITY_FACTORS, type PricingResult } from '@/lib/need-pricing'
import type { NeedCamera, NeedLightingDesign, NeedTier } from '@/lib/need-flow'

/**
 * 需求单归一化（issue #194）：answers → 默认值 + 清单 + 计价。
 *
 * `structure`（预览）与 `submit`（生成草稿）**必须走同一个函数**，
 * 否则两处各算一遍会出现「预览价 ≠ 提交价」的漂移（已实测踩到）。
 */
export type NeedBuildResult = {
  structured: {
    house: NeedHouse & { areaEstimated: boolean }
    lighting: NeedLightingDesign
    tier: NeedTier
    security: { camera: NeedCamera; sensors: string[] }
    sceneCards: string[]
    rooms: ReturnType<typeof computeDefaults>['rooms']
    devices: ReturnType<typeof computeDefaults>['devices']
    hints: string[]
    estimate: { min: number; max: number; basis: 'market' }
  }
  pricing: PricingResult
}

/** 从在售产品取每类设备的京东日常价中位数（缺失即待查，不猜） */
export async function marketPriceByDeviceType(req?: Partial<PayloadRequest>) {
  const payload = await getPayloadClient()
  const catalog = await payload.find({
    collection: 'products',
    where: { status: { equals: 'active' } },
    limit: 2000,
    depth: 0,
    overrideAccess: true,
    select: { name: true, deviceType: true, marketPrice: true, priceSource: true },
    req,
  })
  const byType = new Map<string, { prices: number[]; name: string; source: string | null }>()
  for (const p of catalog.docs as unknown as Record<string, unknown>[]) {
    const t = String(p.deviceType ?? '')
    if (!t) continue
    const mp = typeof p.marketPrice === 'number' ? p.marketPrice : null
    const cur = byType.get(t) ?? { prices: [], name: String(p.name ?? t), source: null }
    if (mp && mp > 0) cur.prices.push(mp)
    if (!cur.source && typeof p.priceSource === 'string') cur.source = p.priceSource
    byType.set(t, cur)
  }
  const out: Record<string, { price: number | null; name: string; source: string | null }> = {}
  for (const [t, v] of byType) {
    const sorted = v.prices.slice().sort((a, b) => a - b)
    out[t] = {
      price: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null,
      name: v.name,
      source: v.source,
    }
  }
  return out
}

function roomCount(value: unknown, fallback: number) {
  const count = Number(value ?? fallback)
  // A draft can also come from the anonymous API. Keep room generation bounded.
  return Number.isFinite(count) ? Math.min(100, Math.max(0, Math.trunc(count))) : fallback
}

function choices(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 8) : []
}

export function parseAnswers(answers: Record<string, unknown>) {
  const houseRaw = (answers.house ?? {}) as Partial<NeedHouse>
  const area = Number(houseRaw.area)
  const house: NeedHouse = {
    type: (houseRaw.type as NeedHouse['type']) ?? 'flat',
    bedrooms: roomCount(houseRaw.bedrooms, 3),
    livingRooms: roomCount(houseRaw.livingRooms, 2),
    area: Number.isFinite(area) && area > 0 ? area : null,
    stage: (houseRaw.stage as NeedHouse['stage']) ?? 'rough',
  }
  return {
    house,
    lighting: ((answers.lighting as { design?: string })?.design ?? 'main') as NeedLightingDesign,
    tier: ((answers.level as { tier?: string })?.tier ?? 'light') as NeedTier,
    sensors: choices((answers.security as { sensors?: unknown })?.sensors),
    camera: ((answers.security as { camera?: string })?.camera ?? 'none') as NeedCamera,
    sceneCards: choices(answers.sceneCards),
    edits: (answers.deviceEdits ?? {}) as Record<string, number>,
  }
}

export async function buildNeedResult(
  answers: Record<string, unknown>,
  req?: Partial<PayloadRequest>,
): Promise<NeedBuildResult> {
  const { house, lighting, tier, sensors, camera, sceneCards, edits } = parseAnswers(answers)
  const wantsCurtain = sceneCards.includes('curtain')

  const defaults = computeDefaults({ house, lighting, tier, sensors, camera, wantsCurtain })
  const devices = defaults.devices.map((d) => ({
    deviceType: d.deviceType,
    qty:
      d.editable && Number.isFinite(edits[d.deviceType])
        ? Math.max(0, Number(edits[d.deviceType]))
        : d.qty,
  }))

  const marketPriceByType = await marketPriceByDeviceType(req)
  const area = house.area ?? estimateArea(house)

  // 型材（按米）：与默认值同一套系数，避免预览/提交两处漂移
  const windowRooms = defaults.rooms.filter((r) => r.hasWindow).length
  const profile = {
    curtainTrackMeters: wantsCurtain
      ? Math.round(windowRooms * 3 * QUANTITY_FACTORS.curtainTrackPerWindow * 10) / 10
      : 0,
    lightStripMeters:
      lighting === 'none'
        ? Math.round(Math.sqrt(area) * 4 * QUANTITY_FACTORS.lightStripRatio * 10) / 10
        : 0,
    magneticTrackMeters:
      lighting === 'none'
        ? Math.round((area / QUANTITY_FACTORS.magneticTrackDivisor) * 10) / 10
        : 0,
  }

  const pricing = computePricing({ devices, marketPriceByType, profile, area })

  return {
    structured: {
      house: { ...house, area, areaEstimated: house.area === null },
      lighting,
      tier,
      security: { camera, sensors },
      sceneCards,
      rooms: defaults.rooms,
      // 对外展示的数量 = 用户改过的数量（否则「改了数量但清单不变」）
      devices: defaults.devices.map((d, i) => ({ ...d, qty: devices[i]!.qty })),
      hints: defaults.hints,
      estimate: {
        min: pricing.totals.total,
        max: pricing.totals.total,
        basis: 'market' as const,
      },
    },
    pricing,
  }
}

/** 生成给销售看的项目备注（人类可读） */
export function needSummary(result: NeedBuildResult) {
  const { structured, pricing } = result
  const { house } = structured
  const houseLabel = house.type === 'villa' ? '别墅' : house.type === 'duplex' ? '复式' : '平层'
  return [
    '【来自业主需求单 · 待销售接管】',
    `【业主需求单】${houseLabel} ${house.bedrooms}室${house.livingRooms}厅`,
    `面积：${house.area}㎡${house.areaEstimated ? '（估算，可改）' : ''}｜装修阶段：${house.stage}`,
    `灯光：${structured.lighting}｜档次：${structured.tier}`,
    `场景：${structured.sceneCards.join('、') || '未选'}`,
    `设备：${structured.devices.map((d) => `${d.deviceType}×${d.qty}`).join('、')}`,
    `估算：设备 ¥${pricing.totals.equipment} + 安装 ¥${pricing.totals.install} = ¥${pricing.totals.total}`,
    `不含：${pricing.exclusions.join('、')}`,
    ...(pricing.pendingPrice.length
      ? [`待查价：${pricing.pendingPrice.map((p) => p.deviceType).join('、')}`]
      : []),
    ...(pricing.commissioning.confirmed ? [] : ['调试费待确认，未计入合计']),
  ].join('\n')
}
