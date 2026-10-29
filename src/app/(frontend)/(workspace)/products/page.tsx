import Form from 'next/form'
import Link from 'next/link'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ImageIcon, PackageSearch, Search, SlidersHorizontal, X } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { DeviceSymbol } from '@/components/device-symbol'
import { LinkPending } from '@/components/link-pending'
import { FilterTabs } from '@/components/filter-tabs'
import { SearchSubmit } from '@/components/search-submit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PRODUCT_PLATFORMS } from '@/collections/Products'
import { appAuth } from '@/lib/app-auth'
import { getBrands, getCatalog } from '@/lib/cached-data'
import { categoryOf, DEVICE_GROUPS, deviceTypeLabel, deviceTypeOf } from '@/lib/device-types'
import { cn } from '@/lib/utils'

export const metadata = { title: '产品库 · FMKJ 项目管理' }

const yuan = (value: number | null | undefined) =>
  typeof value === 'number' ? `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : '—'

const SORTS = [
  { value: '', label: '名称' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'price-desc', label: '价格从高到低' },
  { value: 'updated', label: '最近更新' },
] as const

const STATUSES = [
  { value: '', label: '在售' },
  { value: 'inactive', label: '下架' },
  { value: 'all', label: '全部' },
] as const

type Params = {
  q?: string
  cat?: string
  type?: string
  brand?: string
  platform?: string
  min?: string
  max?: string
  status?: string
  img?: string
  sort?: string
  page?: string
}
const KEYS = ['q', 'cat', 'type', 'brand', 'platform', 'min', 'max', 'status', 'img', 'sort', 'page'] as const

const toNumber = (v: string) => (v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await appAuth.getCurrentUser()
  const sp = await searchParams
  const f = Object.fromEntries(KEYS.map((k) => [k, typeof sp[k] === 'string' ? sp[k]!.trim() : ''])) as Record<(typeof KEYS)[number], string>
  const brandSet = new Set(f.brand ? f.brand.split(',').filter(Boolean) : [])
  const min = toNumber(f.min)
  const max = toNumber(f.max)
  const [catalog, brands] = await Promise.all([getCatalog(), getBrands()])
  const showCost = user?.role === 'admin' || user?.role === 'manager'

  // 状态之外的条件先算一遍，用于给各筛选项计数
  const byStatus = catalog.filter((p) => (f.status === 'all' ? true : f.status === 'inactive' ? p.status === 'inactive' : p.status === 'active'))
  const keyword = f.q.toLowerCase()
  const match = (p: (typeof catalog)[number], skip?: 'cat' | 'type' | 'brand' | 'platform') =>
    (!keyword || `${p.name} ${p.sku} ${p.brand?.name ?? ''} ${p.description ?? ''}`.toLowerCase().includes(keyword)) &&
    (skip === 'cat' || skip === 'type' || !f.cat || deviceTypeOf(p.deviceType)?.category === f.cat) &&
    (skip === 'type' || !f.type || p.deviceType === f.type) &&
    (skip === 'brand' || brandSet.size === 0 || (p.brand && brandSet.has(p.brand.slug))) &&
    (skip === 'platform' || !f.platform || p.platforms.includes(f.platform)) &&
    (min === null || p.price >= min) &&
    (max === null || p.price <= max) &&
    (f.img !== 'yes' || Boolean(p.image)) &&
    (f.img !== 'no' || !p.image)

  const products = byStatus.filter((p) => match(p))
  products.sort((a, b) =>
    f.sort === 'price-asc' ? a.price - b.price : f.sort === 'price-desc' ? b.price - a.price : f.sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name, 'zh-CN'),
  )

  const count = (skip: 'cat' | 'type' | 'brand' | 'platform', test: (p: (typeof catalog)[number]) => boolean) =>
    byStatus.filter((p) => match(p, skip) && test(p)).length
  const brandCounts = new Map(brands.map((b) => [b.slug, count('brand', (p) => p.brand?.slug === b.slug)]))
  const visibleBrands = brands.filter((b) => (brandCounts.get(b.slug) ?? 0) > 0 || brandSet.has(b.slug))
  const activeGroup = DEVICE_GROUPS.find((g) => g.category.slug === f.cat)

  const href = (patch: Partial<Record<(typeof KEYS)[number], string>>) => {
    const params = new URLSearchParams()
    for (const k of KEYS) {
      const v = k in patch ? patch[k]! : k === 'page' ? '' : f[k]
      if (v) params.set(k, v)
    }
    const query = params.toString()
    return query ? `/products?${query}` : '/products'
  }
  const toggleBrand = (slug: string) => {
    const next = new Set(brandSet)
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    return href({ brand: [...next].join(',') })
  }
  const activeCount = KEYS.filter((k) => k !== 'sort' && k !== 'page' && f[k]).length
  const PAGE = 48
  const pages = Math.max(1, Math.ceil(products.length / PAGE))
  const page = Math.min(pages, Math.max(1, Number(f.page) || 1))
  const shown = products.slice((page - 1) * PAGE, page * PAGE)
  const pageHref = (n: number) => { const h = href({}); const q = n > 1 ? `page=${n}` : ''; return q ? (h.includes('?') ? `${h}&${q}` : `${h}?${q}`) : h }

  const n = (v: number) => <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{v}</span>
  const navItem = (label: React.ReactNode, active: boolean, to: string, extra?: React.ReactNode, key?: string) => (
    <Link
      key={key}
      href={to}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-accent',
        active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      <LinkPending />
      {label}
      {extra}
    </Link>
  )
  const seg = (items: readonly { value: string; label: string }[], current: string, key: 'status' | 'img' | 'sort', label: string) => (
    <FilterTabs label={label} items={items.map((it) => ({ key: it.label, label: it.label, href: href({ [key]: it.value }), active: current === it.value }))} />
  )
  const section = (title: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <h3 className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80">{title}</h3>
      {children}
    </div>
  )
  const PRIMARY_BRANDS = 10
  const sortedBrands = [...visibleBrands].sort((a, b) => (brandCounts.get(b.slug) ?? 0) - (brandCounts.get(a.slug) ?? 0))
  const restBrands = sortedBrands.slice(PRIMARY_BRANDS)
  const brandItem = (b: (typeof sortedBrands)[number]) => {
    const active = brandSet.has(b.slug)
    return navItem(
      <>
        <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-sm border', active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background')}>
          {active ? <Check className="size-3" /> : null}
        </span>
        <span className="truncate">{b.name}</span>
      </>,
      active,
      toggleBrand(b.slug),
      n(brandCounts.get(b.slug) ?? 0),
      b.id,
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">产品库</h1>
          <p className="text-sm text-muted-foreground">
            共 <span className="font-medium text-foreground tabular-nums">{products.length}</span> 个产品
            {showCost ? ' · 成本仅管理员与经理可见' : ''}
          </p>
        </div>
        <Form action="/products" className="flex flex-wrap items-center gap-2">
          {KEYS.filter((k) => !['q', 'min', 'max', 'page'].includes(k) && f[k]).map((k) => <input key={k} type="hidden" name={k} value={f[k]} />)}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={f.q} placeholder="搜索名称、SKU、型号、品牌" aria-label="搜索产品" className="pl-9" />
          </div>
          <div className="flex items-center gap-1">
            <Input name="min" defaultValue={f.min} inputMode="decimal" placeholder="¥ 最低" aria-label="最低价" className="w-20" />
            <span className="text-muted-foreground">–</span>
            <Input name="max" defaultValue={f.max} inputMode="decimal" placeholder="¥ 最高" aria-label="最高价" className="w-20" />
          </div>
          <SearchSubmit variant="default" />
        </Form>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        {/* 窄屏下筛选栏默认收起（纯 CSS 开关，无需客户端脚本），避免类别和品牌列表占满首屏 */}
        <input type="checkbox" id="product-filters" className="peer sr-only" />
        <label
          htmlFor="product-filters"
          className="flex h-9 cursor-pointer items-center justify-between rounded-lg border bg-background px-3 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring lg:hidden"
        >
          <span className="flex items-center gap-2"><SlidersHorizontal className="size-4" />筛选{activeCount ? <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground tabular-nums">{activeCount}</span> : null}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </label>
        <aside className="hidden flex-col gap-5 peer-checked:flex lg:sticky lg:flex lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {section(
            '类别',
            <>
              {navItem('全部类别', !f.cat, href({ cat: '', type: '' }), n(count('cat', () => true)))}
              {DEVICE_GROUPS.map(({ category, types }) => {
                const active = f.cat === category.slug
                return (
                  <div key={category.slug}>
                    {navItem(
                      <>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: category.color }} />
                        {category.name}
                      </>,
                      active,
                      href({ cat: active ? '' : category.slug, type: '' }),
                      n(count('cat', (p) => deviceTypeOf(p.deviceType)?.category === category.slug)),
                    )}
                    {active ? (
                      <div className="my-0.5 ml-3 flex flex-col gap-0.5 border-l pl-2">
                        {types.map((t) => {
                          const c = count('type', (p) => p.deviceType === t.value)
                          if (!c && f.type !== t.value) return null
                          return navItem(
                            <>
                              <span className="size-4 shrink-0"><DeviceSymbol type={t.value} /></span>
                              {t.name}
                            </>,
                            f.type === t.value,
                            href({ type: f.type === t.value ? '' : t.value }),
                            n(c),
                            t.value,
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </>,
          )}
          {section(
            '品牌',
            sortedBrands.length ? (
              <>
                {sortedBrands.slice(0, PRIMARY_BRANDS).map(brandItem)}
                {restBrands.length ? (
                  <details open={restBrands.some((b) => brandSet.has(b.slug))} className="group">
                    <summary className="flex h-8 cursor-pointer list-none items-center px-2 text-xs text-primary hover:underline">
                      <span className="group-open:hidden">展开其余 {restBrands.length} 个品牌</span>
                      <span className="hidden group-open:inline">收起</span>
                    </summary>
                    <div className="flex flex-col gap-0.5">{restBrands.map(brandItem)}</div>
                  </details>
                ) : null}
              </>
            ) : (
              <span className="px-2 text-xs text-muted-foreground">当前条件下没有品牌</span>
            ),
          )}
          {section(
            '平台',
            <>
              {navItem('全部平台', !f.platform, href({ platform: '' }))}
              {PRODUCT_PLATFORMS.map((pl) => {
                const c = count('platform', (p) => p.platforms.includes(pl))
                return c || f.platform === pl ? navItem(pl, f.platform === pl, href({ platform: f.platform === pl ? '' : pl }), n(c), pl) : null
              })}
            </>,
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {seg(STATUSES, f.status, 'status', '销售状态')}
            {seg([{ value: '', label: '全部图片' }, { value: 'yes', label: '有图' }, { value: 'no', label: '缺图' }], f.img, 'img', '图片')}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {activeCount ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={f.sort ? `/products?sort=${f.sort}` : '/products'}><X className="size-4" />清除 {activeCount} 个筛选</Link>
                </Button>
              ) : null}
              {seg(SORTS, f.sort, 'sort', '排序')}
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
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {shown.map((p) => {
                const t = deviceTypeOf(p.deviceType)
                const color = categoryOf(t?.category)?.color ?? '#525252'
                const model = p.description?.split('\n').find((l) => l.startsWith('型号：'))?.slice(3)
                return (
                  <li key={p.id} className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="relative flex aspect-square w-full items-center justify-center bg-white p-5">
                      {p.image?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image.url} alt={p.image.alt ?? p.name} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      ) : (
                        <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden="true" />
                      )}
                      <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium shadow-sm ring-1 ring-black/5" style={{ color }}>
                        <span className="size-3.5"><DeviceSymbol type={p.deviceType} /></span>
                        {deviceTypeLabel(p.deviceType)}
                      </span>
                      {p.status === 'inactive' ? <Badge variant="secondary" className="absolute top-2 right-2">已下架</Badge> : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 border-t p-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {p.brand?.logo ? <BrandLogo name={p.brand.name} logo={p.brand.logo} className="h-3.5" /> : null}
                        <span className="truncate">{p.brand?.name ?? '未知品牌'}</span>
                        {p.platforms.length ? <span className="ml-auto shrink-0 truncate text-[11px]">{p.platforms.join(' · ')}</span> : null}
                      </div>
                      <h2 className="line-clamp-2 text-sm leading-snug font-medium" title={p.name}>{p.name}</h2>
                      <p className="truncate font-mono text-[11px] text-muted-foreground" title={model ?? p.sku}>{model ?? p.sku}</p>
                      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                        <div className="leading-tight">
                          <span className="text-base font-semibold tabular-nums">{yuan(p.price)}</span>
                          <span className="ml-0.5 text-xs text-muted-foreground">/{p.unit}</span>
                          {showCost ? <p className="text-[11px] text-muted-foreground tabular-nums">成本 {yuan(p.cost)}</p> : null}
                        </div>
                        {p.stock !== null ? <span className="text-[11px] text-muted-foreground tabular-nums">{p.stock > 0 ? `库存 ${p.stock}` : '无库存'}</span> : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {pages > 1 ? (
            <nav className="flex items-center justify-center gap-2 pt-2" aria-label="分页">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}><ChevronLeft className="size-4" />上一页</Link></Button>
              ) : (
                <Button variant="outline" size="sm" disabled><ChevronLeft className="size-4" />上一页</Button>
              )}
              <span className="px-2 text-sm text-muted-foreground tabular-nums">{page} / {pages}</span>
              {page < pages ? (
                <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>下一页<ChevronRight className="size-4" /></Link></Button>
              ) : (
                <Button variant="outline" size="sm" disabled>下一页<ChevronRight className="size-4" /></Button>
              )}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  )
}
