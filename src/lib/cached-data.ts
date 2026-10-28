import { CACHE_TAGS } from '@/lib/cache-tags'
import { memoize } from '@/lib/memo-cache'
import { getPayloadClient } from '@/lib/payload'
import type { Brand, Category, Media, Product } from '@/payload-types'

/**
 * 很少变动的共享数据，缓存在服务端进程内，写入时由集合 hook 立即清除。
 * 这里使用 overrideAccess 读取完整数据：调用方页面已在工作区布局中校验员工登录，
 * 成本等敏感字段由调用方按角色决定是否展示或下发。
 */

/** 兜底过期时间：即使有绕过 hook 的修改，最多 60 秒后也会生效。 */
const TTL = 60_000

export type CatalogProduct = {
  id: string
  name: string
  sku: string
  price: number
  cost: number | null
  unit: string
  stock: number | null
  description: string | null
  platforms: string[]
  status: string
  deviceType: string | null
  tags: string[]
  updatedAt: string
  brand: { id: string; name: string; slug: string; logo: string | null } | null
  category: { id: string; name: string; slug: string } | null
  image: { id: string; url: string; alt: string } | null
}

export const getCatalog = memoize(
  'catalog-products-v2',
  [CACHE_TAGS.catalog],
  TTL,
  async (): Promise<CatalogProduct[]> => {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'products',
      depth: 2,
      limit: 1000,
      sort: 'name',
      overrideAccess: true,
      populate: { brands: { name: true, slug: true, logo: true }, categories: { name: true, slug: true }, media: { url: true, alt: true } },
    })
    return (result.docs as Product[]).map((p) => {
      const b = typeof p.brand === 'object' ? (p.brand as Brand | null) : null
      const c = typeof p.category === 'object' ? (p.category as Category | null) : null
      const m = typeof p.image === 'object' ? (p.image as Media | null) : null
      const logo = b && typeof b.logo === 'object' ? (b.logo as Media | null) : null
      return {
        id: String(p.id),
        name: p.name,
        sku: p.sku,
        price: p.price,
        cost: typeof p.cost === 'number' ? p.cost : null,
        unit: p.unit,
        stock: typeof p.stock === 'number' ? p.stock : null,
        description: p.description ?? null,
        platforms: (p.platforms ?? []) as string[],
        status: p.status ?? 'active',
        deviceType: p.deviceType ?? null,
        tags: (p.tags ?? []) as string[],
        updatedAt: p.updatedAt,
        brand: b ? { id: String(b.id), name: b.name, slug: b.slug, logo: logo?.url ?? null } : null,
        category: c ? { id: String(c.id), name: c.name, slug: c.slug } : null,
        image: m?.url ? { id: String(m.id), url: m.url, alt: m.alt ?? p.name } : null,
      }
    })
  },
)

export const getCategories = memoize(
  'catalog-categories-v1',
  [CACHE_TAGS.catalog],
  TTL,
  async () => {
    const payload = await getPayloadClient()
    const r = await payload.find({ collection: 'categories', limit: 200, depth: 0, overrideAccess: true, select: { name: true, slug: true, sortOrder: true } })
    return (r.docs as Category[]).map((c) => ({ id: String(c.id), name: c.name, slug: c.slug }))
  },
)

export const getBrands = memoize(
  'catalog-brands-v2',
  [CACHE_TAGS.catalog],
  TTL,
  async () => {
    const payload = await getPayloadClient()
    const r = await payload.find({ collection: 'brands', limit: 200, sort: 'name', depth: 1, overrideAccess: true, select: { name: true, slug: true, logo: true }, populate: { media: { url: true } } })
    return (r.docs as Brand[]).map((b) => {
      const logo = typeof b.logo === 'object' ? (b.logo as Media | null) : null
      return { id: String(b.id), name: b.name, slug: b.slug, logo: logo?.url ?? null }
    })
  },
)

/** 负责人下拉：启用员工的 id 和姓名。 */
export const getOwnerOptions = memoize(
  'staff-owner-options-v1',
  [CACHE_TAGS.staff],
  TTL,
  async () => {
    const payload = await getPayloadClient()
    const users = await payload.find({
      collection: 'users',
      where: { status: { equals: 'active' } },
      select: { name: true },
      sort: 'name',
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    return users.docs.map((u) => ({ value: String(u.id), label: u.name }))
  },
)

export type CompanyInfo = {
  name: string
  slogan: string | null
  phone: string | null
  email: string | null
  address: string | null
  qrCaption: string | null
  quoteNotes: string | null
  printProductImages: boolean
  logo: { url: string; alt: string; width: number | null; height: number | null } | null
  qrCode: { url: string; alt: string } | null
}

export const getCompanyInfo = memoize(
  'company-settings-v2',
  [CACHE_TAGS.company],
  TTL,
  async (): Promise<CompanyInfo> => {
    const payload = await getPayloadClient()
    const s = await payload.findGlobal({ slug: 'company-settings', depth: 1, overrideAccess: true })
    const logo = s.logo && typeof s.logo === 'object' ? (s.logo as Media) : null
    const qr = s.qrCode && typeof s.qrCode === 'object' ? (s.qrCode as Media) : null
    return {
      name: s.name || 'FMKJ 智能家居',
      slogan: s.slogan ?? null,
      phone: s.phone ?? null,
      email: s.email ?? null,
      address: s.address ?? null,
      qrCaption: s.qrCaption ?? null,
      quoteNotes: s.quoteNotes ?? null,
      printProductImages: s.printProductImages !== false,
      logo: logo?.url ? { url: logo.url, alt: logo.alt || s.name, width: logo.width ?? null, height: logo.height ?? null } : null,
      qrCode: qr?.url ? { url: qr.url, alt: qr.alt || '二维码' } : null,
    }
  },
)
