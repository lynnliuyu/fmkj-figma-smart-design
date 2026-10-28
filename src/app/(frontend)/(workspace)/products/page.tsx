import Form from 'next/form'
import Link from 'next/link'
import { Check, ImageIcon, PackageSearch, Search, X } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { DeviceSymbol } from '@/components/device-symbol'
import { LinkPending } from '@/components/link-pending'
import { SearchSubmit } from '@/components/search-submit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  tag?: string
  min?: string
  max?: string
  status?: string
  img?: string
  sort?: string
}
const KEYS = ['q', 'cat', 'type', 'brand', 'platform', 'tag', 'min', 'max', 'status', 'img', 'sort'] as const

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
  const match = (p: (typeof catalog)[number], skip?: 'cat' | 'type' | 'brand' | 'platform' | 'tag') =>
    (!keyword || `${p.name} ${p.sku} ${p.brand?.name ?? ''} ${p.description ?? ''}`.toLowerCase().includes(keyword)) &&
    (skip === 'cat' || skip === 'type' || !f.cat || deviceTypeOf(p.deviceType)?.category === f.cat) &&
    (skip === 'type' || !f.type || p.deviceType === f.type) &&
    (skip === 'brand' || brandSet.size === 0 || (p.brand && brandSet.has(p.brand.slug))) &&
    (skip === 'platform' || !f.platform || p.platforms.includes(f.platform)) &&
    (skip === 'tag' || !f.tag || p.tags.includes(f.tag)) &&
    (min === null || p.price >= min) &&
    (max === null || p.price <= max) &&
    (f.img !== 'yes' || Boolean(p.image)) &&
    (f.img !== 'no' || !p.image)

  const products = byStatus.filter((p) => match(p))
  products.sort((a, b) =>
    f.sort === 'price-asc' ? a.price - b.price : f.sort === 'price-desc' ? b.price - a.price : f.sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name, 'zh-CN'),
  )

  const count = (skip: 'cat' | 'type' | 'brand' | 'platform' | 'tag', test: (p: (typeof catalog)[number]) => boolean) =>
    byStatus.filter((p) => match(p, skip) && test(p)).length
  const brandCounts = new Map(brands.map((b) => [b.slug, count('brand', (p) => p.brand?.slug === b.slug)]))
  const visibleBrands = brands.filter((b) => (brandCounts.get(b.slug) ?? 0) > 0 || brandSet.has(b.slug))
  const tags = [...new Set(byStatus.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const activeGroup = DEVICE_GROUPS.find((g) => g.category.slug === f.cat)

  const href = (patch: Partial<Record<(typeof KEYS)[number], string>>) => {
    const params = new URLSearchParams()
    for (const k of KEYS) {
      const v = k in patch ? patch[k]! : f[k]
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
  const activeCount = KEYS.filter((k) => k !== 'sort' && f[k]).length

  const chip = (label: React.ReactNode, active: boolean, to: string, extra?: React.ReactNode, key?: string) => (
    <Button key={key} asChild size="sm" variant={active ? 'default' : 'outline'} className="h-8 gap-1.5">
      <Link href={to} aria-current={active ? 'true' : undefined} scroll={false}>
        {active ? <Check className="size-3.5" /> : null}
        <LinkPending />
        {label}
        {extra}
      </Link>
    </Button>
  )
  const n = (v: number) => <span className="text-[11px] tabular-nums opacity-60">{v}</span>
  const row = (label: string, children: React.ReactNode) => (
    <div className="grid gap-2 md:grid-cols-[5rem_1fr] md:items-start">
      <div className="pt-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">产品库</h1>
          <p className="text-sm text-muted-foreground">
            找到 <span className="font-medium text-foreground tabular-nums">{products.length}</span> 个产品
            {showCost ? '，成本仅管理员与经理可见' : ''}
          </p>
        </div>
        {activeCount ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={f.sort ? `/products?sort=${f.sort}` : '/products'}><X className="size-4" />清除 {activeCount} 个筛选</Link>
          </Button>
        ) : null}
      </header>

      <Form action="/products" className="flex flex-wrap items-center gap-2">
        {KEYS.filter((k) => !['q', 'min', 'max'].includes(k) && f[k]).map((k) => <input key={k} type="hidden" name={k} value={f[k]} />)}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={f.q} placeholder="搜索名称、型号、品牌" aria-label="搜索产品" className="pl-9" />
        </div>
        <div className="flex items-center gap-1.5">
          <Input name="min" defaultValue={f.min} inputMode="decimal" placeholder="最低价" aria-label="最低价" className="w-24" />
          <span className="text-muted-foreground">–</span>
          <Input name="max" defaultValue={f.max} inputMode="decimal" placeholder="最高价" aria-label="最高价" className="w-24" />
        </div>
        <SearchSubmit variant="default" />
      </Form>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        {row(
          '类别',
          <>
            {chip('全部', !f.cat, href({ cat: '', type: '' }))}
            {DEVICE_GROUPS.map(({ category }) =>
              chip(category.name, f.cat === category.slug, href({ cat: f.cat === category.slug ? '' : category.slug, type: '' }), n(count('cat', (p) => deviceTypeOf(p.deviceType)?.category === category.slug)), category.slug),
            )}
          </>,
        )}
        {activeGroup
          ? row(
              '设备类型',
              <>
                {chip('全部', !f.type, href({ type: '' }))}
                {activeGroup.types.map((t) =>
                  chip(
                    <>
                      <span className="size-4"><DeviceSymbol type={t.value} color={f.type === t.value ? 'currentColor' : undefined} /></span>
                      {t.name}
                    </>,
                    f.type === t.value,
                    href({ type: f.type === t.value ? '' : t.value }),
                    n(count('type', (p) => p.deviceType === t.value)),
                    t.value,
                  ),
                )}
              </>,
            )
          : null}
        {row(
          '品牌',
          visibleBrands.length ? (
            visibleBrands.map((b) => {
              const active = brandSet.has(b.slug)
              return (
                <Link
                  key={b.id}
                  href={toggleBrand(b.slug)}
                  scroll={false}
                  aria-pressed={active}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-sm transition-colors hover:bg-accent',
                    active && 'border-primary bg-primary/5 ring-1 ring-primary',
                  )}
                >
                  <LinkPending />
                  <BrandLogo name={b.name} logo={b.logo} className="h-4" />
                  <span>{b.name}</span>
                  {n(brandCounts.get(b.slug) ?? 0)}
                </Link>
              )
            })
          ) : (
            <span className="pt-1.5 text-xs text-muted-foreground">当前条件下没有品牌</span>
          ),
        )}
        {row(
          '平台',
          <>
            {chip('全部', !f.platform, href({ platform: '' }))}
            {PRODUCT_PLATFORMS.map((pl) => chip(pl, f.platform === pl, href({ platform: f.platform === pl ? '' : pl }), n(count('platform', (p) => p.platforms.includes(pl))), pl))}
          </>,
        )}
        {tags.length
          ? row(
              '标签',
              <>
                {chip('全部', !f.tag, href({ tag: '' }))}
                {tags.map((t) => chip(t, f.tag === t, href({ tag: f.tag === t ? '' : t }), n(count('tag', (p) => p.tags.includes(t))), t))}
              </>,
            )
          : null}
        <div className="grid gap-3 border-t pt-3 md:grid-cols-3">
          {row('状态', STATUSES.map((s) => chip(s.label, f.status === s.value, href({ status: s.value }), undefined, s.label)))}
          {row('图片', [
            chip('不限', !f.img, href({ img: '' }), undefined, 'any'),
            chip('有图', f.img === 'yes', href({ img: 'yes' }), undefined, 'yes'),
            chip('缺图', f.img === 'no', href({ img: 'no' }), undefined, 'no'),
          ])}
          {row('排序', SORTS.map((s) => chip(s.label, f.sort === s.value, href({ sort: s.value }), undefined, s.label)))}
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
            const t = deviceTypeOf(p.deviceType)
            const color = categoryOf(t?.category)?.color ?? '#525252'
            return (
              <li key={p.id}>
                <Card className="h-full gap-0 overflow-hidden p-0 transition-colors hover:border-primary/50">
                  <div className="relative flex aspect-[4/3] w-full items-center justify-center bg-muted">
                    {p.image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image.url} alt={p.image.alt ?? p.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
                    )}
                    {p.status === 'inactive' ? <Badge variant="secondary" className="absolute top-2 left-2">已下架</Badge> : null}
                    {p.brand?.logo ? (
                      <span className="absolute right-2 bottom-2 rounded-md bg-white/90 px-1.5 py-1 shadow-sm">
                        <BrandLogo name={p.brand.name} logo={p.brand.logo} className="h-4" />
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
                      <span className="size-4"><DeviceSymbol type={p.deviceType} /></span>
                      {deviceTypeLabel(p.deviceType)}
                    </div>
                    <h2 className="text-sm leading-snug font-semibold">{p.name}</h2>
                    <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                      <span>{p.brand?.name ?? '未知品牌'}</span>
                      <span aria-hidden="true" className="text-muted-foreground/60">/</span>
                      <span className="break-all">{p.sku}</span>
                    </p>
                    {p.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p> : null}
                    {p.platforms.length || p.tags.length ? (
                      <div className="flex flex-wrap gap-1">
                        {p.platforms.map((pl) => <Badge key={pl} variant="outline">{pl}</Badge>)}
                        {p.tags.map((tg) => <Badge key={`t-${tg}`} variant="secondary">{tg}</Badge>)}
                      </div>
                    ) : null}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                      <div>
                        <span className="text-lg font-bold tabular-nums">{yuan(p.price)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">/ {p.unit}</span>
                        {showCost ? <p className="text-xs text-muted-foreground tabular-nums">成本 {yuan(p.cost)}</p> : null}
                      </div>
                      {p.stock !== null ? (
                        <Badge variant={p.stock > 0 ? 'secondary' : 'destructive'} className="tabular-nums">
                          {p.stock > 0 ? `库存 ${p.stock}` : '缺货'}
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
