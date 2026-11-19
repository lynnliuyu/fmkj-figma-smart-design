import { EmptyState } from '@/components/empty-state'
import Form from 'next/form'
import Image from 'next/image'
import Link from 'next/link'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  PackageSearch,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import { DeviceSymbol } from '@/components/device-symbol'
import { LinkPending } from '@/components/link-pending'
import { FilterTabs } from '@/components/filter-tabs'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { SearchField } from '@/components/search-field'
import { SearchSubmit } from '@/components/search-submit'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { getBrands, getCatalog } from '@/lib/cached-data'
import { categoryOf, DEVICE_GROUPS, deviceTypeOf } from '@/lib/device-types'
import { cn } from '@/lib/utils'
import { redirectToLogin } from '@/lib/login-redirect'

import { ProductsResizableLayout } from './resizable-filter-layout'
import { SortToggle } from './sort-toggle'

export const metadata = { title: pageTitle('产品库') }

const yuan = (value: number | null | undefined) =>
  typeof value === 'number'
    ? `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
    : '—'

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
// 只保留**有 UI** 的筛选参数（issue #199）：type/min/max/img 曾只有过滤分支、
// 侧栏没有任何输入控件，只能靠手改 URL 触发，属死参数，已删除。
const KEYS = ['q', 'cat', 'brand', 'platform', 'status', 'sort', 'page'] as const

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const sp = await searchParams
  const f = Object.fromEntries(
    KEYS.map((k) => [k, typeof sp[k] === 'string' ? sp[k]!.trim() : '']),
  ) as Record<(typeof KEYS)[number], string>
  const brandSet = new Set(f.brand ? f.brand.split(',').filter(Boolean) : [])
  const [catalog, brands] = await Promise.all([getCatalog(), getBrands()])

  // 状态之外的条件先算一遍，用于给各筛选项计数
  const byStatus = catalog.filter((p) =>
    f.status === 'all'
      ? true
      : f.status === 'inactive'
        ? p.status === 'inactive'
        : p.status === 'active',
  )
  const keyword = f.q.toLowerCase()
  const match = (p: (typeof catalog)[number], skip?: 'cat' | 'brand' | 'platform') =>
    (!keyword ||
      (
        p.searchText ??
        `${p.name} ${p.sku} ${p.brand?.name ?? ''} ${p.description ?? ''}`.toLowerCase()
      ).includes(keyword)) &&
    (skip === 'cat' ||
      !f.cat ||
      (p.categorySlug ?? deviceTypeOf(p.deviceType)?.category) === f.cat) &&
    (skip === 'brand' || brandSet.size === 0 || (p.brand && brandSet.has(p.brand.slug))) &&
    (skip === 'platform' || !f.platform || p.platforms.includes(f.platform))

  const products = byStatus.filter((p) => match(p))
  products.sort((a, b) =>
    f.sort === 'price-asc'
      ? (a.price || Infinity) - (b.price || Infinity)
      : f.sort === 'price-desc'
        ? b.price - a.price
        : f.sort === 'updated'
          ? b.updatedAt.localeCompare(a.updatedAt)
          : Number(b.price > 0) - Number(a.price > 0) || a.name.localeCompare(b.name, 'zh-CN'),
  )

  const brandCounts = new Map<string, number>()
  for (const p of byStatus) {
    if (p.brand?.slug && match(p, 'brand')) {
      brandCounts.set(p.brand.slug, (brandCounts.get(p.brand.slug) ?? 0) + 1)
    }
  }
  const visibleBrands = brands.filter(
    (b) => (brandCounts.get(b.slug) ?? 0) > 0 || brandSet.has(b.slug),
  )

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
  const pageHref = (n: number) => {
    const h = href({})
    const q = n > 1 ? `page=${n}` : ''
    return q ? (h.includes('?') ? `${h}&${q}` : `${h}?${q}`) : h
  }

  const navItem = (label: React.ReactNode, active: boolean, to: string, key?: string) => (
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
    </Link>
  )
  const seg = (
    items: readonly { value: string; label: string }[],
    current: string,
    key: 'status',
    label: string,
  ) => (
    <FilterTabs
      label={label}
      items={items.map((it) => ({
        key: it.label,
        label: it.label,
        href: href({ [key]: it.value }),
        active: current === it.value,
      }))}
    />
  )
  const section = (title: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <h3 className="px-2 pb-1 text-xs font-semibold tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  )
  const PRIMARY_BRANDS = 10
  const sortedBrands = [...visibleBrands].sort(
    (a, b) => (brandCounts.get(b.slug) ?? 0) - (brandCounts.get(a.slug) ?? 0),
  )
  const restBrands = sortedBrands.slice(PRIMARY_BRANDS)
  const brandItem = (b: (typeof sortedBrands)[number]) => {
    const active = brandSet.has(b.slug)
    return navItem(
      <>
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-sm border',
            active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background',
          )}
        >
          {active ? <Check className="size-3" /> : null}
        </span>
        <span className="truncate">{b.name}</span>
      </>,
      active,
      toggleBrand(b.slug),
      b.id,
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="产品库"
        description={
          <>
            <span className="tabular-nums">{byStatus.length}</span> 个
            {f.status === 'inactive' ? '下架' : f.status === 'all' ? '' : '在售'}产品 ·{' '}
            <span className="tabular-nums">{brands.length}</span>{' '}
            个品牌，点位与报价共用同一套设备分类
          </>
        }
        actions={
          <Form action="/products" className="flex w-full items-center gap-2">
            {KEYS.filter((k) => !['q', 'page'].includes(k) && f[k]).map((k) => (
              <input key={k} type="hidden" name={k} value={f[k]} />
            ))}
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <SearchField
                name="q"
                defaultValue={f.q}
                placeholder="搜索名称、SKU、型号、品牌"
                ariaLabel="搜索产品"
                controlClassName="pl-9"
              />
            </div>
            <SearchSubmit />
          </Form>
        }
      />

      <ProductsResizableLayout
        mobileToggle={
          <>
            <input
              type="checkbox"
              id="product-filters"
              aria-label="显示筛选"
              className="peer sr-only"
            />
            <label
              htmlFor="product-filters"
              className="flex h-9 cursor-pointer items-center justify-between rounded-lg border bg-background px-3 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring lg:hidden"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="size-4" />
                筛选
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </label>
          </>
        }
        sidebar={
          <>
            {section(
              '类别',
              <>
                {navItem('全部类别', !f.cat, href({ cat: '' }))}
                {DEVICE_GROUPS.map(({ category }) => {
                  const active = f.cat === category.slug
                  return (
                    <div key={category.slug}>
                      {navItem(
                        <>
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: category.color }}
                          />
                          <span className="truncate">{category.name}</span>
                        </>,
                        active,
                        href({ cat: active ? '' : category.slug }),
                      )}
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
                        <span className="group-open:hidden">展开更多品牌</span>
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
          </>
        }
      >
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
          {seg(STATUSES, f.status, 'status', '销售状态')}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {activeCount ? (
              <Button
                variant="ghost"
                size="sm"
                href={f.sort ? `/products?sort=${f.sort}` : '/products'}
                icon={<X />}
                label="清除筛选"
              />
            ) : null}
            <SortToggle
              items={SORTS.map((it) => ({
                value: it.value,
                label: it.label,
                href: href({ sort: it.value }),
                active: f.sort === it.value,
              }))}
            />
          </div>
        </div>

        {products.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="size-5" />}
            title="没有找到符合条件的产品"
            description="换个关键词或筛选条件试试；成员与管理员均可新增、修改产品与售价。"
            action={<Button variant="secondary" size="sm" href="/products" label="清除筛选" />}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {shown.map((p) => {
              const t = deviceTypeOf(p.deviceType)
              const color = categoryOf(t?.category)?.color ?? '#525252'
              return (
                <li
                  key={p.id}
                  className="group flex flex-col overflow-hidden rounded-[var(--radius-container)] border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative flex aspect-square w-full items-center justify-center bg-white p-5">
                    {p.image?.url ? (
                      <span className="relative block size-full">
                        <Image
                          src={p.image.url}
                          alt={p.image.alt ?? p.name}
                          fill
                          sizes="(min-width: 1536px) 18vw, (min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw"
                          className="object-contain transition-transform duration-300 group-hover:scale-105"
                        />
                      </span>
                    ) : (
                      <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden="true" />
                    )}
                    <span
                      className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium shadow-sm ring-1 ring-black/5"
                      style={{ color: `color-mix(in oklch, ${color} 70%, black)` }}
                    >
                      <span className="size-3.5" style={{ color }}>
                        <DeviceSymbol type={p.deviceType} />
                      </span>
                      {t?.name ?? '设备'}
                    </span>
                    {p.status === 'inactive' ? (
                      <Badge
                        variant="neutral"
                        className="absolute top-2 right-2"
                        label={'已下架'}
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-2 border-t p-3">
                    <h2 className="truncate text-sm font-medium" title={p.name}>
                      {p.name}
                    </h2>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {p.brand?.name ?? p.sku}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {p.price > 0 ? yuan(p.price) : '—'}
                      </span>
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
              <Button
                variant="secondary"
                size="sm"
                href={pageHref(page - 1)}
                icon={<ChevronLeft />}
                label="上一页"
              />
            ) : (
              <Button
                variant="secondary"
                size="sm"
                isDisabled
                icon={<ChevronLeft />}
                label="上一页"
              />
            )}
            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Button
                variant="secondary"
                size="sm"
                href={pageHref(page + 1)}
                icon={<ChevronRight />}
                label="下一页"
              />
            ) : (
              <Button
                variant="secondary"
                size="sm"
                isDisabled
                icon={<ChevronRight />}
                label="下一页"
              />
            )}
          </nav>
        ) : null}
      </ProductsResizableLayout>
    </section>
  )
}
