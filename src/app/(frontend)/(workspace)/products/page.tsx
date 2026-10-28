import Form from 'next/form'
import Link from 'next/link'
import { Check, ImageIcon, PackageSearch, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { LinkPending } from '@/components/link-pending'
import { SearchSubmit } from '@/components/search-submit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import { appAuth } from '@/lib/app-auth'
import { getBrands, getCatalog, getCategories } from '@/lib/cached-data'

export const metadata = { title: '产品库 · FMKJ 项目管理' }

const yuan = (value: number | null | undefined) =>
  typeof value === 'number' ? `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : '—'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; brand?: string }>
}) {
  const user = await appAuth.getCurrentUser()
  const { q = '', category = '', brand = '' } = await searchParams
  const [catalog, categories, brands] = await Promise.all([getCatalog(), getCategories(), getBrands()])
  const keyword = q.trim().toLowerCase()
  const products = catalog.filter(
    (p) =>
      p.status === 'active' &&
      (!keyword || p.name.toLowerCase().includes(keyword) || p.sku.toLowerCase().includes(keyword)) &&
      (!category || p.category?.slug === category) &&
      (!brand || p.brand?.slug === brand),
  )
  const showCost = user?.role === 'admin' || user?.role === 'manager'

  const filterHref = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, category, brand, ...patch })
    for (const [key, value] of [...params]) if (!value) params.delete(key)
    const query = params.toString()
    return query ? `/products?${query}` : '/products'
  }

  const facet = (label: string, active: string, key: 'category' | 'brand', items: { id: number | string; slug: string; name: string }[]) => (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant={!active ? 'default' : 'outline'}>
          <Link href={filterHref({ [key]: '' })} aria-current={!active ? 'true' : undefined}>
            {!active && <Check className="size-3.5" />}<LinkPending />全部
          </Link>
        </Button>
        {items.map((item) => {
          const isActive = active === item.slug
          return (
            <Button key={item.id} asChild size="sm" variant={isActive ? 'default' : 'outline'}>
              <Link href={filterHref({ [key]: isActive ? '' : item.slug })} aria-current={isActive ? 'true' : undefined}>
                {isActive && <Check className="size-3.5" />}<LinkPending />
                {item.name}
              </Link>
            </Button>
          )
        })}
      </div>
    </div>
  )

  return (
    <section className="flex flex-col gap-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">产品库</h1>
        <p className="text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground tabular-nums">{products.length}</span> 个在售产品
          {showCost ? '，成本仅管理员与经理可见' : ''}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Form action="/products" className="flex flex-wrap items-center gap-2">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {brand ? <input type="hidden" name="brand" value={brand} /> : null}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="搜索名称或型号" aria-label="搜索产品" className="pl-9" />
          </div>
          <SearchSubmit variant="default" />
        </Form>
        <div className="flex flex-col gap-4 rounded-xl bg-muted/60 p-4">
          {facet('分类', category, 'category', categories)}
          {facet('品牌', brand, 'brand', brands)}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <PackageSearch className="size-8 text-muted-foreground" />
          <p className="font-medium">没有找到符合条件的产品</p>
          <p className="text-sm text-muted-foreground">换个关键词或筛选条件试试；管理员可在后台添加产品。</p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href="/products">清除筛选</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {products.map((p) => {
            const image = p.image
            const b = p.brand
            const c = p.category
            const stock = p.stock
            return (
              <li key={p.id}>
                <Card className="h-full gap-0 overflow-hidden p-0 transition-colors hover:border-primary/50">
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted">
                    {image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.url} alt={image.alt ?? p.name} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 text-sm leading-snug font-semibold">{p.name}</h2>
                      {c ? <Badge variant="secondary" className="shrink-0">{c.name}</Badge> : null}
                    </div>
                    <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                      <span>{b?.name ?? '未知品牌'}</span>
                      <span aria-hidden="true" className="text-muted-foreground/60">/</span>
                      <span className="break-all">{p.sku}</span>
                    </p>
                    {p.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p> : null}
                    {p.platforms?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {p.platforms.map((platform) => (
                          <Badge key={platform} variant="outline">{platform}</Badge>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                      <div>
                        <span className="text-lg font-bold tabular-nums">{yuan(p.price)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">/ {p.unit}</span>
                        {showCost ? <p className="text-xs text-muted-foreground tabular-nums">成本 {yuan(p.cost)}</p> : null}
                      </div>
                      {stock !== null ? (
                        <Badge variant={stock > 0 ? 'secondary' : 'destructive'} className="tabular-nums">
                          {stock > 0 ? `库存 ${stock}` : '缺货'}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
