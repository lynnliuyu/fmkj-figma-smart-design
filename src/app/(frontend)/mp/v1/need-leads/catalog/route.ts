import { getPayloadClient } from '@/lib/payload'
import { mpPublicRoute, ok } from '@/lib/mp/http'
import {
  BUDGET_BANDS,
  CAMERA_CHOICES,
  ECOSYSTEMS,
  ECOSYSTEM_NOTES,
  HABITS,
  HOUSE_TYPES,
  LIGHTING_COLORS,
  LIGHTING_DESIGNS,
  NEED_ENTRIES,
  NEED_STEPS,
  PANEL_OPTIONS,
  SCENES,
  SCENE_CARDS,
  SENSORS,
  STAGES,
  TIERS,
} from '@/lib/need-flow'
import {
  COMMISSIONING_CONFIRMED,
  COMMISSIONING_PER_SET,
  PRICE_EXCLUSIONS,
  PRICING_ITEMS_V2,
} from '@/lib/need-pricing'

/**
 * 需求小助手：选项目录（免登录）。
 * 小程序一次拉取：六步问题 + 三入口 + 对照素材引用 + 生态库 + 当前生效单价表。
 */
export const GET = mpPublicRoute(async () => {
  const payload = await getPayloadClient()

  // 当前生效单价表：默认 plan 内 effectiveFrom <= now 的最新 active 版本
  let pricing: {
    planId: string | null
    versionId: string | null
    version: number
    items: { key: string; label: string; unit: string; unitPrice: number; calc: string }[]
    exclusions: string[]
    commissioningPerSet: number
    commissioningConfirmed: boolean
  } = {
    planId: null,
    versionId: null,
    version: 0,
    items: PRICING_ITEMS_V2.map((i) => ({ ...i })),
    exclusions: [...PRICE_EXCLUSIONS],
    commissioningPerSet: COMMISSIONING_PER_SET,
    commissioningConfirmed: COMMISSIONING_CONFIRMED,
  }
  try {
    const plan = await payload.find({
      collection: 'pricing-plans',
      where: { and: [{ isDefault: { equals: true } }, { status: { equals: 'active' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const planId = plan.docs[0]?.id ? String(plan.docs[0].id) : null
    if (planId) {
      const ver = await payload.find({
        collection: 'pricing-versions',
        where: {
          and: [
            { plan: { equals: planId } },
            { status: { equals: 'active' } },
            { effectiveFrom: { less_than_equal: new Date().toISOString() } },
          ],
        },
        sort: '-version',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const v = ver.docs[0]
      if (v) {
        pricing = {
          planId,
          versionId: String(v.id),
          version: Number(v.version ?? 0),
          items: (v.items ?? []).map((i) => ({
            key: i.key,
            label: i.label,
            unit: i.unit,
            unitPrice: i.unitPrice,
            calc: i.calc,
          })),
          exclusions: (v.exclusions ?? []).filter(Boolean) as string[],
          commissioningPerSet: Number(v.commissioningPerSet ?? COMMISSIONING_PER_SET),
          commissioningConfirmed: COMMISSIONING_CONFIRMED,
        }
      }
    }
  } catch {
    // 单价表还没建：回退代码默认表（不阻塞业主填写）
  }

  return ok({
    steps: NEED_STEPS,
    entries: NEED_ENTRIES,
    options: {
      houseTypes: HOUSE_TYPES,
      stages: STAGES,
      lightingDesigns: LIGHTING_DESIGNS,
      lightingColors: LIGHTING_COLORS,
      tiers: TIERS,
      habits: HABITS,
      cameras: CAMERA_CHOICES,
      sensors: SENSORS,
      panelOptions: PANEL_OPTIONS,
      scenes: SCENES,
      sceneCards: SCENE_CARDS,
      budgetBands: BUDGET_BANDS,
      ecosystems: ECOSYSTEMS,
      ecosystemNotes: ECOSYSTEM_NOTES,
    },
    pricing,
    defaults: {
      bedrooms: 3,
      livingRooms: 2,
      areaNote: '面积未填时按户型估算，可随时改',
    },
  })
})
