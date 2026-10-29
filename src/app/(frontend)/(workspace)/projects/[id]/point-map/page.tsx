import { notFound } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getCatalog } from '@/lib/cached-data'
import { parseDefaults } from '@/lib/point-map-items'
import { getDwgSettings } from '@/plugins/dwg-converter'

import { canEditProjects } from '../../data'
import { PointMapEditor, type PointProduct } from './point-map-editor'

export const metadata = { title: '点位图 · FMKJ 项目管理' }

export default async function PointMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await appAuth.getCurrentUser()
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({ collection: 'projects', id, depth: 0, user, overrideAccess: false, select: { name: true, pointMap: true, defaultProducts: true } })
    .catch(() => null)
  if (!project) notFound()

  // 下架产品也下发，保证旧点位仍能显示名称；选择列表只列在售产品。
  const products: PointProduct[] = (await getCatalog()).map((p) => ({
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

  return (
    <PointMapEditor
      projectId={String(project.id)}
      projectName={project.name}
      initialScene={(project.pointMap as object | null) ?? null}
      products={products}
      initialDefaults={parseDefaults(project.defaultProducts)}
      readOnly={!canEditProjects(user?.role)}
      dwgEnabled={Boolean(getDwgSettings(payload.config))}
    />
  )
}
