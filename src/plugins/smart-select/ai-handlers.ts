import { getCatalog } from '@/lib/cached-data'
import { deviceTypeOf, isDeviceType } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import { parseDefaults } from '@/lib/point-map-items'
import { analyzeScene, type StoredScene } from '@/lib/point-scene'
import { refreshContextProject, type AiToolHandler } from '@/plugins/ai-copilot/tools/context'
import { autoSelectProducts, isSelectionTier } from './auto-select'

export const smartSelectHandlers: Record<string, AiToolHandler> = {
  async smart_select(args, ctx) {
    if (!ctx.projectId) return { result: { error: '没有关联项目' }, summary: '未关联项目' }
    const tier = isSelectionTier(args.tier) ? args.tier : 'standard'
    const shouldApply = args.apply !== false
    const payload = await getPayloadClient()
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { status: true, platform: true, pointMap: true, defaultProducts: true },
      })
      .catch(() => null)
    if (!project) return { result: { error: '项目不存在或没有权限' }, summary: '项目不可用' }
    const { points } = analyzeScene(project.pointMap as Partial<StoredScene> | null)
    const types = [...new Set(points.map((p) => p.deviceType))].filter(
      (t) => isDeviceType(t) && t !== 'other',
    )
    const { chosen, missing } = autoSelectProducts(await getCatalog(), types, {
      platform: project.platform,
      tier,
    })
    let applied = false
    if (shouldApply && project.status !== 'archived' && chosen.length > 0) {
      const defaults = parseDefaults(project.defaultProducts)
      for (const r of chosen) defaults[r.deviceType] = r.product.id
      await payload.update({
        collection: 'projects',
        id: ctx.projectId,
        data: { defaultProducts: defaults },
        user: ctx.user,
        overrideAccess: false,
        depth: 0,
      })
      applied = true
      ctx.mutated = true
      await refreshContextProject(ctx, ctx.projectId)
    }
    return {
      result: {
        platform: project.platform,
        tier,
        applied,
        picks: chosen.map((r) => ({
          deviceType: deviceTypeOf(r.deviceType)?.name ?? r.deviceType,
          product: r.product.name,
          brand: r.product.brand?.name,
          price: r.product.price,
          platformMatched: r.platformMatched,
        })),
        noCandidate: missing.map((t) => deviceTypeOf(t)?.name ?? t),
      },
      summary: applied
        ? `已应用 ${chosen.length} 类设备的默认型号`
        : `推荐了 ${chosen.length} 类设备的型号`,
      href: `/projects/${ctx.projectId}/point-map`,
      hrefLabel: '查看点位图',
    }
  },
}
