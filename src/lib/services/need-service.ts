import type { PayloadRequest } from 'payload'

import { deviceTypeOf } from '@/lib/device-types'
import {
  CAMERA_CHOICES,
  LIGHTING_DESIGNS,
  SCENE_CARDS,
  SENSORS,
  STAGES,
  TIERS,
  type NeedCamera,
  type NeedLightingDesign,
  type NeedTier,
} from '@/lib/need-flow'
import {
  computeDefaults,
  estimateArea,
  type DeviceDefault,
  type NeedHouse,
} from '@/lib/need-defaults'
import { computePricing, QUANTITY_FACTORS, type PricingResult } from '@/lib/need-pricing'
import { getPayloadClient } from '@/lib/payload'
import { autoSelectProducts } from '@/plugins/smart-select/auto-select'

/**
 * 需求单归一化（issue #194）：answers → 默认值 + 清单 + 计价。
 *
 * `structure`（预览）与 `submit`（生成草稿）**必须走同一个函数**，
 * 否则两处各算一遍会出现「预览价 ≠ 提交价」的漂移（已实测踩到）。
 */
type NeedDevice = DeviceDefault & {
  name: string
  recommendation: { brand: string; name: string; sku: string } | null
}

const SCENE_CONFIRMATION = {
  security: '请补充监控范围。已选的传感器会列入清单，摄像头仅在你明确选择监控后加入。',
  hvac: '请确认空调或地暖类型及现有设备，再确定控制器和数量。',
  av: '请确认要联动的影音设备与控制方式，再确定是否需要增配。',
  lock: '请确认门锁数量、门体与锁体规格，再确定型号。',
} as const

const SELECTION_PLATFORM = {
  mijia: { project: '米家', catalog: '米家' },
  apple: { project: 'Apple Home', catalog: 'Apple Home' },
  harmony: { project: '华为鸿蒙智家', catalog: '华为' },
  knx: { project: 'KNX', catalog: 'KNX' },
} as const

export const deviceName = (type: string) =>
  type === 'switch-2'
    ? '双键开关'
    : type === 'gas-sensor'
      ? '燃气传感器'
      : (deviceTypeOf(type)?.name ?? '待确认设备')

export type NeedBuildResult = {
  structured: {
    house: NeedHouse & { areaEstimated: boolean }
    lighting: NeedLightingDesign
    tier: NeedTier
    security: { camera: NeedCamera; sensors: string[] }
    sceneCards: string[]
    rooms: ReturnType<typeof computeDefaults>['rooms']
    devices: NeedDevice[]
    pendingScenes: { key: keyof typeof SCENE_CONFIRMATION; label: string; hint: string }[]
    hints: string[]
    estimate: { min: number; max: number; basis: 'market' }
  }
  pricing: PricingResult
}

async function readNeedCatalog(req?: Partial<PayloadRequest>) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'products',
    where: { status: { equals: 'active' } },
    limit: 2000,
    depth: 1,
    overrideAccess: true,
    select: {
      name: true,
      sku: true,
      status: true,
      deviceType: true,
      brand: true,
      platforms: true,
      price: true,
      stock: true,
      image: true,
      marketPrice: true,
      priceSource: true,
    },
    populate: { brands: { name: true }, media: { filename: true } },
    req,
  })
  return docs
}

/** 从在售目录取每类设备的京东日常价中位数。 */
function marketPriceByDeviceType(catalog: Awaited<ReturnType<typeof readNeedCatalog>>) {
  const byType = new Map<string, { prices: number[]; name: string; source: string | null }>()
  for (const p of catalog) {
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
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string'))].slice(0, 8)
    : []
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
  const security = answers.security as
    | { camera?: unknown; cameraConfirmed?: unknown; sensors?: unknown }
    | undefined
  const cameraChoice = CAMERA_CHOICES.find((option) => option.value === security?.camera)
  const ecosystem = (answers.ecosystem as { primary?: unknown } | undefined)?.primary
  const platform =
    typeof ecosystem === 'string' && Object.hasOwn(SELECTION_PLATFORM, ecosystem)
      ? SELECTION_PLATFORM[ecosystem as keyof typeof SELECTION_PLATFORM]
      : undefined
  return {
    house,
    lighting: ((answers.lighting as { design?: string })?.design ?? 'main') as NeedLightingDesign,
    tier: ((answers.level as { tier?: string })?.tier ?? 'light') as NeedTier,
    sensors: choices(security?.sensors).filter((value) =>
      SENSORS.some((option) => option.value === value),
    ),
    camera: cameraChoice?.value ?? 'none',
    // 只有用户真的点过监控选项才算确认。页面初始值 `camera:'none'` 是「还没问过」，
    // 不能当成「明确不需要」，否则安防待确认永远不出现。
    cameraConfirmed: security?.cameraConfirmed === true,
    sceneCards: choices(answers.sceneCards).filter((value) =>
      SCENE_CARDS.some((option) => option.value === value),
    ),
    lockRequested: (answers.panels as { lock?: unknown } | undefined)?.lock === true,
    platform,
    edits: (answers.deviceEdits ?? {}) as Record<string, number>,
  }
}

export async function buildNeedResult(
  answers: Record<string, unknown>,
  req?: Partial<PayloadRequest>,
): Promise<NeedBuildResult> {
  const {
    house,
    lighting,
    tier,
    sensors,
    camera,
    cameraConfirmed,
    sceneCards,
    lockRequested,
    platform,
    edits,
  } = parseAnswers(answers)
  const wantsCurtain = sceneCards.includes('curtain')

  const defaults = computeDefaults({
    house,
    lighting,
    tier,
    sensors,
    camera: cameraConfirmed ? camera : 'none',
    wantsCurtain,
  })
  const devices = defaults.devices.map((d) => ({
    deviceType: d.deviceType,
    qty:
      d.editable && Number.isFinite(edits[d.deviceType])
        ? Math.max(0, Number(edits[d.deviceType]))
        : d.qty,
  }))

  const catalog = await readNeedCatalog(req)
  const marketPriceByType = marketPriceByDeviceType(catalog)
  const quantities = new Map(devices.map((device) => [device.deviceType, device.qty]))
  // 公共清单只推荐有明确兼容标注、库存可覆盖建议数量的型号。监控安装位置和人体传感方式需要细核。
  const selectable = platform
    ? catalog.flatMap((p) => {
        const qty = quantities.get(p.deviceType ?? '') ?? 0
        const brand = typeof p.brand === 'object' && p.brand?.name.trim() ? p.brand : null
        if (
          p.status !== 'active' ||
          !brand ||
          !p.sku.trim() ||
          qty <= 0 ||
          (p.stock ?? 0) < qty ||
          !p.platforms?.includes(platform.catalog) ||
          p.deviceType === 'camera' ||
          p.deviceType === 'motion-sensor'
        )
          return []
        return [
          {
            ...p,
            brand,
            platforms: p.platforms,
            deviceType: p.deviceType ?? null,
            image: p.image ?? null,
          },
        ]
      })
    : []
  const { chosen } = autoSelectProducts(selectable, [...quantities.keys()], {
    platform: platform?.project,
    tier: tier === 'light' ? 'economy' : 'standard',
  })
  const available = new Map(selectable.map((product) => [product.id, product]))
  const recommendations = new Map(
    chosen.map(({ deviceType, product }) => [deviceType, available.get(product.id)!]),
  )
  const pendingScenes = SCENE_CARDS.flatMap(({ value, label }) => {
    if (!Object.hasOwn(SCENE_CONFIRMATION, value)) return []
    const key = value as keyof typeof SCENE_CONFIRMATION
    if (
      key === 'security'
        ? sceneCards.includes(key) && !cameraConfirmed
        : sceneCards.includes(key) || (key === 'lock' && lockRequested)
    ) {
      return [{ key, label, hint: SCENE_CONFIRMATION[key] }]
    }
    return []
  })
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
      devices: defaults.devices.map((d, i) => {
        const product = recommendations.get(d.deviceType)
        return {
          ...d,
          qty: devices[i]!.qty,
          name: deviceName(d.deviceType),
          recommendation: product
            ? { brand: product.brand.name, name: product.name, sku: product.sku }
            : null,
        }
      }),
      pendingScenes,
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
// 销售备注给人工阅读，不能出现 rough / switch-2 这类内部代号。
const STAGE_LABEL = Object.fromEntries(STAGES.map((o) => [o.value, o.label])) as Record<
  string,
  string
>
const LIGHTING_LABEL = Object.fromEntries(
  LIGHTING_DESIGNS.map((o) => [o.value, o.label]),
) as Record<string, string>
const TIER_LABEL = Object.fromEntries(TIERS.map((o) => [o.value, o.label])) as Record<
  string,
  string
>
const SCENE_LABEL = Object.fromEntries(SCENE_CARDS.map((o) => [o.value, o.label])) as Record<
  string,
  string
>
const HOUSE_LABEL = { flat: '平层', duplex: '复式', villa: '别墅' } as Record<string, string>

export function needSummary(result: NeedBuildResult) {
  const { structured, pricing } = result
  const { house } = structured
  const houseLabel = HOUSE_LABEL[house.type] ?? '平层'
  const stage = STAGE_LABEL[house.stage] ?? house.stage
  const lighting = LIGHTING_LABEL[structured.lighting] ?? structured.lighting
  const tier = TIER_LABEL[structured.tier] ?? structured.tier
  const scenes = structured.sceneCards.map((v) => SCENE_LABEL[v] ?? v)
  return [
    '【来自业主需求单 · 待销售接管】',
    `【业主需求单】${houseLabel} ${house.bedrooms}室${house.livingRooms}厅`,
    `面积：${house.area}㎡${house.areaEstimated ? '（估算，可改）' : ''}｜装修阶段：${stage}`,
    `灯光：${lighting}｜档次：${tier}`,
    `场景：${scenes.join('、') || '未选'}`,
    `设备：${structured.devices.map((d) => `${d.name}×${d.qty}${d.recommendation ? `（推荐 ${d.recommendation.brand} ${d.recommendation.sku}）` : '（待选型）'}`).join('、')}`,
    ...structured.pendingScenes.map((scene) => `${scene.label}待确认：${scene.hint}`),
    `估算：设备 ¥${pricing.totals.equipment} + 安装 ¥${pricing.totals.install} = ¥${pricing.totals.total}`,
    `不含：${pricing.exclusions.join('、')}`,
    ...(pricing.pendingPrice.length
      ? [`待查价：${pricing.pendingPrice.map((p) => deviceName(p.deviceType)).join('、')}`]
      : []),
    ...(pricing.commissioning.confirmed ? [] : ['调试费待确认，未计入合计']),
  ].join('\n')
}
