import { relId } from '@/lib/access'
import { APP_NAME } from '@/lib/brand'
import { CACHE_TAGS } from '@/lib/cache-tags'
import { deviceTypeOf } from '@/lib/device-types'
import { memoize } from '@/lib/memo-cache'
import { getPayloadClient } from '@/lib/payload'
import type { Brand, Category, Media, Product } from '@/payload-types'
import {
  parseAiModels,
  parseCustomChannels,
  type AiModelConfig,
} from '@/plugins/ai-copilot/templates'

/**
 * 很少变动的共享数据，缓存在服务端进程内，写入时由集合 hook 立即清除。
 * 这里使用 overrideAccess 读取完整数据：调用方页面已在工作区布局中校验员工登录，
 * 只在登录后的页面和接口里使用。
 */

/** 兜底过期时间：即使有绕过 hook 的修改，最多 60 秒后也会生效。 */
const TTL = 60_000

/** 兼容云端存储与自托管本地存储：当 m.url 未直接填充时，按 filename 拼接标准文件访问路径 */
export function resolveMediaUrl(m: Partial<Media> | null | undefined): string | null {
  if (!m || typeof m !== 'object') return null
  if (typeof m.url === 'string' && m.url) return m.url
  if (typeof m.filename === 'string' && m.filename)
    return `/api/media/file/${encodeURIComponent(m.filename)}`
  return null
}

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
  /** 预计算的小写检索串与大类 slug，避免列表筛选时重复拼接与转换 */
  searchText?: string
  categorySlug?: string | null
}

export const getCatalog = memoize(
  'catalog-products-v4',
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
      select: {
        name: true,
        sku: true,
        price: true,
        cost: true,
        unit: true,
        stock: true,
        description: true,
        platforms: true,
        status: true,
        deviceType: true,
        tags: true,
        updatedAt: true,
        brand: true,
        category: true,
        image: true,
      },
      populate: {
        brands: { name: true, slug: true, logo: true },
        categories: { name: true, slug: true },
        media: { url: true, filename: true, alt: true },
      },
    })
    return (result.docs as Product[]).map((p) => {
      const b = typeof p.brand === 'object' ? (p.brand as Brand | null) : null
      const c = typeof p.category === 'object' ? (p.category as Category | null) : null
      const m = typeof p.image === 'object' ? (p.image as Media | null) : null
      const logo = b && typeof b.logo === 'object' ? (b.logo as Media | null) : null
      const imgUrl = resolveMediaUrl(m)
      const logoUrl = resolveMediaUrl(logo)
      const deviceType = p.deviceType ?? null
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
        deviceType,
        tags: (p.tags ?? []) as string[],
        updatedAt: p.updatedAt,
        brand: b ? { id: String(b.id), name: b.name, slug: b.slug, logo: logoUrl } : null,
        category: c ? { id: String(c.id), name: c.name, slug: c.slug } : null,
        image: m && imgUrl ? { id: String(m.id), url: imgUrl, alt: m.alt ?? p.name } : null,
        searchText: `${p.name} ${p.sku} ${b?.name ?? ''} ${p.description ?? ''}`.toLowerCase(),
        categorySlug: deviceTypeOf(deviceType)?.category ?? c?.slug ?? null,
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
    const r = await payload.find({
      collection: 'categories',
      limit: 200,
      depth: 0,
      overrideAccess: true,
      select: { name: true, slug: true, sortOrder: true },
    })
    return (r.docs as Category[]).map((c) => ({ id: String(c.id), name: c.name, slug: c.slug }))
  },
)

export const getBrands = memoize('catalog-brands-v3', [CACHE_TAGS.catalog], TTL, async () => {
  const payload = await getPayloadClient()
  const r = await payload.find({
    collection: 'brands',
    limit: 200,
    sort: 'name',
    depth: 1,
    overrideAccess: true,
    select: { name: true, slug: true, logo: true },
  })
  return (r.docs as Brand[]).map((b) => {
    const logo = typeof b.logo === 'object' ? (b.logo as Media | null) : null
    return { id: String(b.id), name: b.name, slug: b.slug, logo: resolveMediaUrl(logo) }
  })
})

/**
 * 单个项目的负责人下拉候选：只包含该项目当前负责人与已加入该项目的协作者，
 * 不再向前端暴露系统内其他无关用户。
 */
export async function getProjectOwnerOptions(project: {
  owner?: unknown
  collaborators?: Array<{ user?: unknown }> | null
}): Promise<{ value: string; label: string }[]> {
  const ids = new Set<string>()
  const ownerId = relId(project.owner)
  if (ownerId) ids.add(ownerId)
  for (const c of project.collaborators ?? []) {
    const uid = relId(c.user)
    if (uid) ids.add(uid)
  }
  if (ids.size === 0) return []
  const payload = await getPayloadClient()
  const users = await payload.find({
    collection: 'users',
    where: {
      and: [{ id: { in: [...ids] } }, { status: { equals: 'active' } }],
    },
    select: { name: true },
    sort: 'name',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const options = users.docs.map((u) => ({ value: String(u.id), label: u.name }))
  if (ownerId && !options.some((o) => o.value === ownerId)) {
    options.unshift({ value: ownerId, label: '当前负责人' })
  }
  return options
}

export type CompanyInfo = {
  name: string
  slogan: string | null
  phone: string | null
  email: string | null
  address: string | null
  qrCaption: string | null
  quoteNotes: string | null
  contractTerms: string | null
  printProductImages: boolean
  /** 各类文档的默认风格和版式 */
  documentDefaults: Record<string, { style?: string; layout?: string }>
  /** 已关闭的插件 */
  disabledPlugins: string[]
  /** 后台配置的 AI 模型与渠道列表 */
  aiModels: AiModelConfig[]
  logo: { url: string; alt: string; width: number | null; height: number | null } | null
  qrCode: { url: string; alt: string } | null
  /** 成员是否填写过自己的公司资料（未填写时沿用平台默认抬头） */
  isCustom?: boolean
}

function parseDocumentDefaults(value: unknown): CompanyInfo['documentDefaults'] {
  const out: CompanyInfo['documentDefaults'] = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [kind, v] of Object.entries(value as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const { style, layout } = v as { style?: unknown; layout?: unknown }
    out[kind] = {
      style: typeof style === 'string' ? style : undefined,
      layout: typeof layout === 'string' ? layout : undefined,
    }
  }
  return out
}

const DEFAULT_WECHAT_QR_URL = '/brand/wechat-contact-qr.jpg'

function resolveCompanyQr(
  qr: Media | null,
  rawUrl: string | null,
  fallbackAlt: string,
): { url: string; alt: string } {
  if (rawUrl && !rawUrl.includes('20261028221115_35_1')) {
    return { url: rawUrl, alt: qr?.alt || fallbackAlt }
  }
  return { url: DEFAULT_WECHAT_QR_URL, alt: qr?.alt || fallbackAlt }
}

const getBaseCompanyInfo = memoize(
  'company-settings-v9',
  [CACHE_TAGS.company],
  TTL,
  async (): Promise<CompanyInfo> => {
    const payload = await getPayloadClient()
    const [s, ai] = await Promise.all([
      payload.findGlobal({ slug: 'company-settings', depth: 1, overrideAccess: true }),
      payload.findGlobal({ slug: 'ai-settings', depth: 0, overrideAccess: true }).catch(() => null),
    ])
    // 优先读「AI 设置」；尚未配置时沿用旧位置（抬头与默认内容）里的模型
    const newAiModels = (ai as unknown as { aiModels?: unknown } | null)?.aiModels
    const rawAiModels =
      Array.isArray(newAiModels) && newAiModels.length
        ? newAiModels
        : (s as unknown as { aiModels?: unknown }).aiModels
    const logo = s.logo && typeof s.logo === 'object' ? (s.logo as Media) : null
    const qr = s.qrCode && typeof s.qrCode === 'object' ? (s.qrCode as Media) : null
    const logoUrl = resolveMediaUrl(logo)
    const qrUrl = resolveMediaUrl(qr)
    const qrCaption = s.qrCaption ?? '扫码添加微信'
    const configuredName = s.name?.trim()
    const platformBrand =
      !configuredName || configuredName === 'FMKJ 智能家居' || configuredName === APP_NAME
    const name = platformBrand ? APP_NAME : configuredName || APP_NAME
    return {
      name,
      slogan: s.slogan ?? null,
      phone: s.phone ?? null,
      email: s.email ?? null,
      address: s.address ?? null,
      qrCaption,
      quoteNotes: s.quoteNotes ?? null,
      contractTerms: s.contractTerms ?? null,
      printProductImages: s.printProductImages !== false,
      documentDefaults: parseDocumentDefaults(s.documentDefaults),
      disabledPlugins: Array.isArray(s.disabledPlugins)
        ? s.disabledPlugins.filter((v): v is string => typeof v === 'string')
        : [],
      aiModels: parseAiModels(
        rawAiModels,
        parseCustomChannels((ai as unknown as { customChannels?: unknown } | null)?.customChannels),
      ),
      logo:
        logo && logoUrl
          ? {
              url: logoUrl,
              alt: logo.alt || name,
              width: logo.width ?? null,
              height: logo.height ?? null,
            }
          : platformBrand
            ? { url: '/brand/fmkj-logo.svg', alt: APP_NAME, width: 436, height: 120 }
            : null,
      qrCode: resolveCompanyQr(qr, qrUrl, qrCaption),
    }
  },
)

type RawUserCompanyProfile = {
  name?: string | null
  slogan?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  qrCaption?: string | null
  quoteNotes?: string | null
  contractTerms?: string | null
  printProductImages?: boolean | null
  documentDefaults?: unknown
  disabledPlugins?: unknown
  logo?: Media | string | number | null
  qrCode?: Media | string | number | null
}

/**
 * 获取抬头与默认配置：
 * - 传入 userId 时，优先读取该账号自己保存的 `companyProfile`（每个账号独立抬头）；
 *   若该账号尚未保存过自己的抬头，则回退到系统全局默认抬头；
 * - 全局 AI 模型列表（`aiModels`）始终来自系统全局配置。
 * - 结果按 userId 缓存在进程内（当 Users 或 CompanySettings 变更时由 hook 自动清除缓存）。
 */
export async function getCompanyInfo(userId?: string | number | null): Promise<CompanyInfo> {
  if (!userId) return getBaseCompanyInfo()
  const uid = String(userId)
  return memoize(
    `company-user-v2:${uid}`,
    [CACHE_TAGS.company, CACHE_TAGS.staff],
    TTL,
    async (): Promise<CompanyInfo> => {
      const [base, payload] = await Promise.all([getBaseCompanyInfo(), getPayloadClient()])
      const userDoc = await payload
        .findByID({
          collection: 'users',
          id: uid,
          depth: 1,
          overrideAccess: true,
          select: { name: true, phone: true, email: true, companyProfile: true } as never,
          populate: { media: { url: true, filename: true, alt: true, width: true, height: true } },
        })
        .catch(() => null)
      if (!userDoc) return base

      const p =
        (userDoc as unknown as { companyProfile?: RawUserCompanyProfile | null }).companyProfile ??
        null
      const hasCustomHeader = Boolean(p && typeof p.name === 'string' && p.name.trim())
      const userDocDefaults = p?.documentDefaults ? parseDocumentDefaults(p.documentDefaults) : {}
      const mergedDocDefaults = { ...base.documentDefaults, ...userDocDefaults }
      const disabledPlugins = Array.isArray(p?.disabledPlugins)
        ? p!.disabledPlugins.filter((v): v is string => typeof v === 'string')
        : base.disabledPlugins

      if (!hasCustomHeader || !p) {
        return {
          ...base,
          documentDefaults: mergedDocDefaults,
          disabledPlugins,
        }
      }

      const logo = p.logo && typeof p.logo === 'object' ? (p.logo as Media) : null
      const qr = p.qrCode && typeof p.qrCode === 'object' ? (p.qrCode as Media) : null
      const logoUrl = resolveMediaUrl(logo)
      const qrUrl = resolveMediaUrl(qr)
      const name = p.name!.trim()

      return {
        name,
        slogan: p.slogan ?? null,
        phone: p.phone ?? null,
        email: p.email ?? null,
        address: p.address ?? null,
        qrCaption: p.qrCaption ?? null,
        quoteNotes: p.quoteNotes ?? null,
        contractTerms: p.contractTerms ?? base.contractTerms,
        printProductImages: p.printProductImages !== false,
        documentDefaults: mergedDocDefaults,
        disabledPlugins,
        aiModels: base.aiModels,
        logo:
          logo && logoUrl
            ? {
                url: logoUrl,
                alt: logo.alt || name,
                width: logo.width ?? null,
                height: logo.height ?? null,
              }
            : null,
        qrCode: qr && qrUrl ? resolveCompanyQr(qr, qrUrl, p.qrCaption || '二维码') : base.qrCode,
        isCustom: true,
      }
    },
  )()
}
