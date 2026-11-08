import { relId } from '@/lib/access'
import { getCatalog } from '@/lib/cached-data'
import { deviceTypeOf, isDeviceType } from '@/lib/device-types'
import { fail, mpRoute, ok, readJson } from '@/lib/mp/http'
import { getPayloadClient } from '@/lib/payload'
import { parseDefaults } from '@/lib/point-map-items'
import { analyzeScene, type StoredScene } from '@/lib/point-scene'
import { autoSelectProducts, isSelectionTier } from '@/plugins/smart-select/auto-select'
import { getPluginFlags } from '@/plugins/state'

/** 智能选型（插件）：按项目主平台和档次给点位图里用到的设备类型设置默认型号。{ tier: economy|standard|premium } */
export const POST = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const body = await readJson(request)
  const tier = isSelectionTier(body.tier) ? body.tier : 'standard'
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id: params.id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { owner: true, status: true, platform: true, pointMap: true, defaultProducts: true },
    })
    .catch(() => null)
  if (!project) return fail(404, '项目不存在或已被删除')
  if (!(await getPluginFlags(relId(project.owner) || user.id))['smart-select'])
    return fail(404, '「智能选型」插件已关闭')
  if (project.status === 'archived') return fail(403, '项目已归档，恢复项目后才能修改')
  const { points } = analyzeScene(project.pointMap as Partial<StoredScene> | null)
  const types = [...new Set(points.map((p) => p.deviceType))].filter(
    (t) => isDeviceType(t) && t !== 'other',
  )
  if (!types.length) return fail(400, '点位图里还没有点位')
  const { chosen, missing } = autoSelectProducts(await getCatalog(), types, {
    platform: project.platform,
    tier,
  })
  const defaults = parseDefaults(project.defaultProducts)
  for (const r of chosen) defaults[r.deviceType] = r.product.id
  await payload.update({
    collection: 'projects',
    id: params.id,
    data: { defaultProducts: defaults },
    user,
    overrideAccess: false,
    depth: 0,
    select: { updatedAt: true },
  })
  return ok({
    applied: chosen.length,
    picks: chosen.map((r) => ({
      type: deviceTypeOf(r.deviceType)?.name ?? r.deviceType,
      product: r.product.name,
      brand: r.product.brand?.name ?? null,
      price: r.product.price,
      platformMatched: r.platformMatched,
    })),
    noCandidate: missing.map((t) => deviceTypeOf(t)?.name ?? t),
  })
})
