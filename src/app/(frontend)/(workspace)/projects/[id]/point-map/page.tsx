import { notFound } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import type { Brand, Category, Product } from '@/payload-types'

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

  const result = await payload.find({
    collection: 'products',
    where: { status: { equals: 'active' } },
    depth: 1,
    limit: 500,
    sort: 'name',
    user,
    overrideAccess: false,
    select: { name: true, sku: true, price: true, unit: true, brand: true, category: true },
  })
  const products: PointProduct[] = (result.docs as Product[]).map((p) => {
    const c = typeof p.category === 'object' ? (p.category as Category) : null
    const b = typeof p.brand === 'object' ? (p.brand as Brand) : null
    return {
      id: String(p.id),
      name: p.name,
      sku: p.sku,
      price: p.price,
      unit: p.unit,
      brand: b?.name ?? '',
      categorySlug: c?.slug ?? 'other',
      categoryName: c?.name ?? '其他',
    }
  })

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
