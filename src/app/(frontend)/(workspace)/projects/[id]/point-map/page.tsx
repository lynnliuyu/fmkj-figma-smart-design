import { notFound } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getCatalog } from '@/lib/cached-data'

import { canEditProjects } from '../../data'
import { PointMapEditor, type PointProduct } from './point-map-editor'

export const metadata = { title: '点位图 · FMKJ 项目管理' }

export default async function PointMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await appAuth.getCurrentUser()
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({ collection: 'projects', id, depth: 0, user, overrideAccess: false, select: { name: true, pointMap: true } })
    .catch(() => null)
  if (!project) notFound()

  const products: PointProduct[] = (await getCatalog())
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
      unit: p.unit,
      brand: p.brand?.name ?? '',
      categorySlug: p.category?.slug ?? 'other',
      categoryName: p.category?.name ?? '其他',
    }))

  return (
    <PointMapEditor
      projectId={String(project.id)}
      projectName={project.name}
      initialScene={(project.pointMap as object | null) ?? null}
      products={products}
      readOnly={!canEditProjects(user?.role)}
    />
  )
}
