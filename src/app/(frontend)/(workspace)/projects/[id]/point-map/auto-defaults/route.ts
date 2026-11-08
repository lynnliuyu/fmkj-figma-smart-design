import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { autoSelectProducts, isSelectionTier } from '@/plugins/smart-select/auto-select'
import { getPluginFlags } from '@/plugins/state'
import { getCatalog } from '@/lib/cached-data'
import { isDeviceType } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import { parseDefaults } from '@/lib/point-map-items'
import { analyzeScene, type StoredScene } from '@/lib/point-scene'
import { inPointScope, isPointScope } from '@/lib/point-scopes'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/**
 * 智能选型：{ tier: economy | standard | premium, overwrite?: boolean }
 * 为点位图里用到的设备类型设置默认型号；overwrite=false 时只补全还没设置的类型。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')
  const body = (await request.json().catch(() => null)) as {
    tier?: unknown
    overwrite?: unknown
    scope?: unknown
  } | null
  if (!body || !isSelectionTier(body.tier)) return fail(400, '请选择档次')
  const scope = isPointScope(body.scope) ? body.scope : 'all'

  const { id } = await params
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { owner: true, platform: true, pointMap: true, defaultProducts: true },
    })
    .catch(() => null)
  if (!project) return fail(404, '项目不存在或已被删除')
  if (!(await getPluginFlags(relId(project.owner) || user.id))['smart-select'])
    return fail(404, '「智能选型」插件已关闭')

  const catalog = await getCatalog()
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const defaults = parseDefaults(project.defaultProducts)
  const { points } = analyzeScene(project.pointMap as Partial<StoredScene> | null)
  // 「其他设备」范围太宽，不自动选型，由设计师指定
  const inUse = [
    ...new Set(points.filter((p) => inPointScope(p.deviceType, scope)).map((p) => p.deviceType)),
  ].filter((t) => isDeviceType(t) && t !== 'other')
  // 已设置且仍在售的默认型号保留（除非要求全部重选）
  const targets = inUse.filter(
    (t) => body.overwrite === true || !(defaults[t] && byId.get(defaults[t])?.status === 'active'),
  )
  if (!targets.length) return Response.json({ ok: true, defaults, changed: [], missing: [] })

  const { chosen, missing } = autoSelectProducts(catalog, targets, {
    platform: project.platform,
    tier: body.tier,
  })
  for (const r of chosen) defaults[r.deviceType] = r.product.id
  try {
    await payload.update({
      collection: 'projects',
      id,
      data: { defaultProducts: defaults },
      user,
      overrideAccess: false,
      depth: 0,
      select: { updatedAt: true },
    })
  } catch (error) {
    if ((error as { status?: number })?.status === 403) return fail(403, '没有权限修改该项目')
    console.error('[auto-defaults] save failed', error)
    return fail(500, '保存失败，请稍后重试')
  }
  return Response.json({
    ok: true,
    defaults,
    changed: chosen.map((r) => ({
      deviceType: r.deviceType,
      productId: r.product.id,
      name: r.product.name,
      platformMatched: r.platformMatched,
    })),
    missing,
  })
}
