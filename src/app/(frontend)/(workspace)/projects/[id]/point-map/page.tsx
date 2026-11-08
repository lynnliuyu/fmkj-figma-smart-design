import { notFound } from 'next/navigation'

import { relId } from '@/lib/access'
import { getCatalog } from '@/lib/cached-data'
import { parseDefaults } from '@/lib/point-map-items'
import { isPointScope, type PointScope } from '@/lib/point-scopes'
import { normalizeScene, type StoredScene } from '@/lib/point-scene'
import { getDwgSettings } from '@/plugins/dwg-converter'
import { getPluginFlags } from '@/plugins/state'

import { getProject, getProjectDeals } from '../project-data'
import { PointMapEditor, type PointProduct } from './point-map-editor'

export default async function PointMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    quoteId?: string
    sheet?: string
    area?: string
    point?: string
    scope?: string
  }>
}) {
  const { id } = await params
  const sp = await searchParams
  const { user, payload, project, readOnly } = await getProject(id)
  // 点位图、报价列表、产品库并行读取
  const [scene, deals, catalog, flags] = await Promise.all([
    payload
      .findByID({
        collection: 'projects',
        id: project.id,
        depth: 0,
        user,
        overrideAccess: false,
        select: { pointMap: true, defaultProducts: true, updatedAt: true },
      })
      .catch(() => null),
    getProjectDeals(id),
    getCatalog(),
    getPluginFlags(relId(project.owner) || user.id),
  ])
  if (!scene) notFound()

  // 下架产品也下发，保证旧点位仍能显示名称；选择列表只列在售产品。
  const products: PointProduct[] = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price,
    unit: p.unit,
    status: p.status,
    deviceType: p.deviceType,
    brand: p.brand?.name ?? '',
    brandLogo: p.brand?.logo ?? null,
    image: p.image?.url ?? null,
  }))

  // 打开时整理场景：旧点位换成新版图标、旧户型图补上图纸信息
  const { warnings, repaired, ...initialScene } = normalizeScene(
    scene.pointMap as Partial<StoredScene> | null,
  )

  return (
    <PointMapEditor
      projectId={String(project.id)}
      projectName={project.name}
      platform={project.platform ?? null}
      initialScene={initialScene}
      serverUpdatedAt={typeof scene.updatedAt === 'string' ? scene.updatedAt : null}
      warnings={warnings}
      needsSave={repaired > 0 && !readOnly}
      products={products}
      initialDefaults={parseDefaults(scene.defaultProducts)}
      quotes={deals.quotes.map((q) => ({
        id: String(q.id),
        title: q.title,
        status: q.status,
        total: q.total ?? 0,
      }))}
      initialFocus={{
        quoteId: typeof sp.quoteId === 'string' ? sp.quoteId : null,
        sheet: typeof sp.sheet === 'string' ? sp.sheet : null,
        area: typeof sp.area === 'string' ? sp.area : null,
        point: typeof sp.point === 'string' ? sp.point : null,
        scope: isPointScope(sp.scope) ? (sp.scope as PointScope) : null,
      }}
      readOnly={readOnly}
      plugins={{
        aiImport: flags['ai-import'],
        smartSelect: flags['smart-select'],
        dwg: flags['dwg-import'] && Boolean(getDwgSettings(payload.config)),
        roomInsights: flags['room-insights'],
        proposal: flags.proposal,
      }}
    />
  )
}
