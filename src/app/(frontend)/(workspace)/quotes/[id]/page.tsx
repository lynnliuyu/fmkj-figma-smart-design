import { notFound } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getCatalog } from '@/lib/cached-data'
import type { Media, Project } from '@/payload-types'

import { canEditProjects } from '../../projects/data'
import { QuoteEditor, type ProductOption } from './quote-editor'

export const metadata = { title: '编辑报价 · FMKJ 项目管理' }

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pending?: string }> }) {
  const { id } = await params
  const { pending } = await searchParams
  const user = await appAuth.getCurrentUser()
  const payload = await getPayloadClient()
  const quote = await payload
    .findByID({ collection: 'quotes', id, depth: 1, user, overrideAccess: false, populate: { projects: { name: true, customerName: true }, products: { name: true }, media: { url: true } } })
    .catch(() => null)
  if (!quote) notFound()
  const project = typeof quote.project === 'object' ? (quote.project as Project) : null

  const catalog = await getCatalog()
  const byId = new Map(catalog.map((p) => [p.id, p]))
  // 在售产品可选；下架产品也下发基础信息，用于已有行显示与对比
  const options: ProductOption[] = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
    price: p.price,
    status: p.status,
    deviceType: p.deviceType,
    brand: p.brand ? { slug: p.brand.slug, name: p.brand.name, logo: p.brand.logo } : null,
    platforms: p.platforms,
    image: p.image?.url ?? null,
  }))

  // 成本只下发给管理员和经理。
  let costs: Record<string, number> | null = null
  if (user?.role === 'admin' || user?.role === 'manager') {
    costs = {}
    for (const p of catalog) if (p.cost !== null) costs[p.id] = p.cost
  }

  const pendingCount = Number(pending)

  return (
    <QuoteEditor
      quote={{
        id: String(quote.id),
        title: quote.title,
        status: quote.status,
        discount: quote.discount ?? 0,
        notes: quote.notes ?? '',
        items: (quote.items ?? []).map((i) => {
          const productId = typeof i.product === 'object' ? (i.product ? String(i.product.id) : null) : (i.product ?? null)
          const snapshot = i.image && typeof i.image === 'object' ? (i.image as Media).url ?? null : null
          const live = productId ? byId.get(productId) : undefined
          return {
            key: i.id ?? crypto.randomUUID(),
            id: i.id ?? null,
            product: productId,
            deviceType: i.deviceType ?? live?.deviceType ?? null,
            image: snapshot ?? live?.image?.url ?? null,
            name: i.name,
            sku: i.sku ?? '',
            unit: i.unit ?? '',
            price: i.price,
            quantity: i.quantity,
          }
        }),
        fees: (quote.fees ?? []).map((f) => ({ key: f.id ?? crypto.randomUUID(), name: f.name, amount: f.amount })),
      }}
      project={project ? { id: String(project.id), name: project.name, customerName: project.customerName } : null}
      products={options}
      costs={costs}
      readOnly={!canEditProjects(user?.role)}
      pendingPoints={Number.isInteger(pendingCount) && pendingCount > 0 ? pendingCount : 0}
    />
  )
}
