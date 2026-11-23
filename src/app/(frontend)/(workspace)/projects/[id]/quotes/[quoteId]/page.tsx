import { notFound, redirect } from 'next/navigation'

import { relId } from '@/lib/access'
import { getCatalog, resolveMediaUrl } from '@/lib/cached-data'
import type { StoredScene } from '@/lib/point-scene'
import { loadCostSettings } from '@/lib/services/cost-settings-service'
import type { Media, Project } from '@/payload-types'

import { getProject, getProjectDeals } from '../../project-data'
import { QuoteEditor, type ProductOption } from './quote-editor'

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; quoteId: string }>
  searchParams: Promise<{ pending?: string }>
}) {
  const { id, quoteId } = await params
  const { pending } = await searchParams
  const { user, payload, project, archived, role } = await getProject(id)
  const [quote, deals, catalog, costSettings] = await Promise.all([
    payload
      .findByID({
        collection: 'quotes',
        id: quoteId,
        depth: 1,
        user,
        overrideAccess: false,
        populate: { projects: { pointMap: true, defaultProducts: true }, products: { name: true } },
      })
      .catch(() => null),
    getProjectDeals(id),
    getCatalog(),
    // 成本按当前查看者自己的拿货折扣核算（仅本人可见）
    loadCostSettings(user),
  ])
  if (!quote) notFound()
  // 报价不属于这个项目（例如旧链接）时跳到它所在的项目
  const quoteProjectId = relId(quote.project)
  if (quoteProjectId !== String(project.id))
    redirect(quoteProjectId ? `/projects/${quoteProjectId}/quotes/${quoteId}` : '/projects')

  const populated = typeof quote.project === 'object' ? (quote.project as Project) : null
  const rawScene = (populated?.pointMap ?? null) as Partial<StoredScene> | null
  const projectScene = rawScene?.elements
    ? { elements: rawScene.elements, files: rawScene.files ?? {} }
    : null
  const byId = new Map(catalog.map((p) => [p.id, p]))

  // 在售产品可选；下架产品也下发基础信息，用于已有行显示与对比
  const options: ProductOption[] = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName?.trim() ?? '',
    sku: p.sku,
    unit: p.unit,
    price: p.price,
    status: p.status,
    tags: p.tags,
    deviceType: p.deviceType,
    brand: p.brand ? { slug: p.brand.slug, name: p.brand.name, logo: p.brand.logo } : null,
    platforms: p.platforms,
    image: p.image?.url ?? null,
  }))
  const costs: Record<string, number> = {}
  for (const p of catalog) if (p.cost !== null) costs[p.id] = p.cost

  const contract = deals.contract
  const usesThisQuote = relId(contract?.quote) === String(quote.id)
  const lockReason = archived
    ? '项目已归档，报价只读。需要修改时请在「归档」里恢复项目。'
    : role === 'read'
      ? '你对该项目仅有查看权限，报价处于只读模式。'
      : usesThisQuote && contract?.status === 'signed'
        ? `这份报价已用于已签订的合同 ${contract.number}，内容已锁定。需要修改时请先在「合同」里撤销签订。`
        : null
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
          const productId = relId(i.product)
          const snapshot =
            i.image && typeof i.image === 'object' ? resolveMediaUrl(i.image as Media) : null
          const live = productId ? byId.get(productId) : undefined
          return {
            key: i.id ?? crypto.randomUUID(),
            id: i.id ?? null,
            product: productId,
            deviceType: i.deviceType ?? live?.deviceType ?? null,
            image: snapshot ?? live?.image?.url ?? null,
            name: i.name,
            // 老报价没有短名快照时不回填：列表按「无短名 → 显示完整名称」处理
            shortName: i.shortName?.trim() ?? '',
            sku: i.sku ?? '',
            unit: i.unit ?? '',
            price: i.price,
            quantity: i.quantity,
          }
        }),
        fees: (quote.fees ?? []).map((f) => ({
          key: f.id ?? crypto.randomUUID(),
          name: f.name,
          amount: f.amount,
        })),
      }}
      project={{
        id: String(project.id),
        name: project.name,
        customerName: project.customerName ?? '',
      }}
      projectQuotes={deals.quotes.map((q) => ({
        id: String(q.id),
        title: q.title,
        total: q.total ?? 0,
      }))}
      projectScene={projectScene}
      projectDefaults={populated?.defaultProducts ?? null}
      products={options}
      costs={costs}
      costSettings={costSettings}
      readOnly={Boolean(lockReason)}
      lockReason={lockReason}
      contract={
        contract ? { number: contract.number, status: contract.status, usesThisQuote } : null
      }
      pendingPoints={Number.isInteger(pendingCount) && pendingCount > 0 ? pendingCount : 0}
    />
  )
}
