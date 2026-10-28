import { notFound } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import type { Product, Project } from '@/payload-types'

import { canEditProjects } from '../../projects/data'
import { QuoteEditor, type ProductOption } from './quote-editor'

export const metadata = { title: '编辑报价 · FMKJ 项目管理' }

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await appAuth.getCurrentUser()
  const payload = await getPayloadClient()
  const quote = await payload.findByID({ collection: 'quotes', id, depth: 1, user, overrideAccess: false }).catch(() => null)
  if (!quote) notFound()
  const project = typeof quote.project === 'object' ? (quote.project as Project) : null

  const products = await payload.find({
    collection: 'products',
    where: { status: { equals: 'active' } },
    limit: 500,
    sort: 'name',
    depth: 0,
    user,
    overrideAccess: false,
    select: { name: true, sku: true, unit: true, price: true, cost: true },
  })
  const options: ProductOption[] = (products.docs as Product[]).map((p) => ({ id: String(p.id), name: p.name, sku: p.sku, unit: p.unit, price: p.price }))

  // 成本只给管理员和经理；产品库字段权限也会对其他角色隐藏 cost。
  let costs: Record<string, number> | null = null
  if (user?.role === 'admin' || user?.role === 'manager') {
    costs = {}
    const ids = [...new Set((quote.items ?? []).map((i) => (typeof i.product === 'object' ? i.product?.id : i.product)).filter(Boolean) as string[])]
    const linked = ids.length
      ? await payload.find({ collection: 'products', where: { id: { in: ids } }, limit: ids.length, depth: 0, user, overrideAccess: false, select: { cost: true } })
      : { docs: [] as Product[] }
    for (const p of [...(products.docs as Product[]), ...(linked.docs as Product[])]) {
      if (typeof p.cost === 'number') costs[String(p.id)] = p.cost
    }
  }

  return (
    <QuoteEditor
      quote={{
        id: String(quote.id),
        title: quote.title,
        status: quote.status,
        discount: quote.discount ?? 0,
        notes: quote.notes ?? '',
        items: (quote.items ?? []).map((i) => ({
          key: i.id ?? crypto.randomUUID(),
          product: typeof i.product === 'object' ? (i.product ? String(i.product.id) : null) : (i.product ?? null),
          name: i.name,
          sku: i.sku ?? '',
          unit: i.unit ?? '',
          price: i.price,
          quantity: i.quantity,
        })),
        fees: (quote.fees ?? []).map((f) => ({ key: f.id ?? crypto.randomUUID(), name: f.name, amount: f.amount })),
      }}
      project={project ? { id: String(project.id), name: project.name, customerName: project.customerName } : null}
      products={options}
      costs={costs}
      readOnly={!canEditProjects(user?.role)}
    />
  )
}
