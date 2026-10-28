import Link from 'next/link'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import type { Brand, Category, Media, Product } from '@/payload-types'
import type { Where } from 'payload'

export const metadata = { title: '产品库 · 繁梦空间' }

const yuan = (value: number | null | undefined) =>
  typeof value === 'number' ? `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : '—'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; brand?: string }>
}) {
  const user = await appAuth.getCurrentUser()
  const { q = '', category = '', brand = '' } = await searchParams
  const payload = await getPayloadClient()

  const where: Where = { and: [{ status: { equals: 'active' } }] }
  if (q.trim()) where.and!.push({ or: [{ name: { like: q.trim() } }, { sku: { like: q.trim() } }] })
  if (category) where.and!.push({ 'category.slug': { equals: category } })
  if (brand) where.and!.push({ 'brand.slug': { equals: brand } })

  const [products, categories, brands] = await Promise.all([
    payload.find({ collection: 'products', where, depth: 1, limit: 200, user, overrideAccess: false }),
    payload.find({ collection: 'categories', limit: 100, user, overrideAccess: false }),
    payload.find({ collection: 'brands', limit: 100, sort: 'name', user, overrideAccess: false }),
  ])
  const showCost = user?.role === 'admin' || user?.role === 'manager'

  const filterHref = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, category, brand, ...patch })
    for (const [key, value] of [...params]) if (!value) params.delete(key)
    const query = params.toString()
    return query ? `/products?${query}` : '/products'
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">产品库</h1>
          <p className="mt-1 text-sm text-zinc-500">共 {products.totalDocs} 个在售产品{showCost ? '，成本仅管理员与经理可见' : ''}</p>
        </div>
        <form className="flex gap-2" action="/products">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {brand ? <input type="hidden" name="brand" value={brand} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索名称或型号"
            className="h-10 w-64 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-900"
          />
          <button className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800">搜索</button>
        </form>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 text-xs text-zinc-500">分类</span>
          <Link href={filterHref({ category: '' })} className={chip(!category)}>全部</Link>
          {(categories.docs as Category[]).map((c) => (
            <Link key={c.id} href={filterHref({ category: c.slug })} className={chip(category === c.slug)}>{c.name}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 text-xs text-zinc-500">品牌</span>
          <Link href={filterHref({ brand: '' })} className={chip(!brand)}>全部</Link>
          {(brands.docs as Brand[]).map((b) => (
            <Link key={b.id} href={filterHref({ brand: b.slug })} className={chip(brand === b.slug)}>{b.name}</Link>
          ))}
        </div>
      </div>

      {products.docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">没有找到符合条件的产品</p>
          <p className="mt-1 text-sm text-zinc-500">换个关键词或筛选条件试试；管理员可在后台添加产品。</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(products.docs as Product[]).map((p) => {
            const image = typeof p.image === 'object' ? (p.image as Media | null) : null
            const b = typeof p.brand === 'object' ? (p.brand as Brand) : null
            const c = typeof p.category === 'object' ? (p.category as Category) : null
            return (
              <li key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100">
                  {image?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={image.alt ?? p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-semibold text-zinc-300">{(c?.name ?? p.name).slice(0, 2)}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{b?.name ?? '未知品牌'}</span>
                    <span>·</span>
                    <span>{c?.name ?? '未分类'}</span>
                  </div>
                  <p className="leading-snug font-medium">{p.name}</p>
                  <p className="font-mono text-xs text-zinc-500">{p.sku}</p>
                  {p.description ? <p className="line-clamp-2 text-sm text-zinc-600">{p.description}</p> : null}
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    {(p.platforms ?? []).map((platform) => (
                      <span key={platform} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{platform}</span>
                    ))}
                  </div>
                  <div className="flex items-end justify-between border-t border-zinc-100 pt-3">
                    <p className="text-lg font-semibold">
                      {yuan(p.price)}
                      <span className="ml-1 text-xs font-normal text-zinc-500">/ {p.unit}</span>
                    </p>
                    {showCost ? <p className="text-xs text-zinc-500">成本 {yuan(p.cost)}</p> : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
