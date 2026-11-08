/**
 * 首页演示数据：读取系统内置的示例母版项目（isDemoTemplate），
 * 把它的图纸、房间、点位与已确认报价整理成首页「公示牌」要用的结构。
 * 首页是按小时重新生成的静态页；这里再缓存 10 分钟，避免同一次生成里重复查询。
 */
import { floorTagFromSheetName } from '@/lib/area-analysis'
import { BUILTIN_DEMO_SHEETS } from '@/lib/builtin-demo-sheets'
import { getCatalog, resolveMediaUrl } from '@/lib/cached-data'
import { ensureDemoTemplateProject } from '@/lib/demo-project'
import { memoize } from '@/lib/memo-cache'
import { getPayloadClient } from '@/lib/payload'
import {
  normalizeScene,
  sceneAreas,
  scenePoints,
  sceneSheets,
  planAreaOf,
  type PlanAreaShape,
} from '@/lib/point-scene'
import type { Media } from '@/payload-types'

export type ShowcasePoint = {
  id: string
  type: string
  code: string
  rx: number
  ry: number
  room: string | null
}
export type ShowcaseArea = PlanAreaShape
export type ShowcaseSheet = {
  id: string
  name: string
  floor: string
  url: string
  points: ShowcasePoint[]
  areas: ShowcaseArea[]
}
export type ShowcaseLine = {
  type: string
  name: string
  sku: string
  unit: string
  price: number
  qty: number
  image: string | null
  brandName?: string | null
  brandLogo?: string | null
}
export type ShowcaseQuote = {
  title: string
  lines: ShowcaseLine[]
  fees: { name: string; amount: number }[]
  discount: number
  productTotal: number
  total: number
  quoteCount: number
}
export type LandingShowcase = {
  project: { name: string; customer: string; community: string; address: string; platform: string }
  sheets: ShowcaseSheet[]
  pointCount: number
  roomCount: number
  quote: ShowcaseQuote | null
  library: { products: number; brands: number }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const text = (v: unknown) => (typeof v === 'string' ? v : '')

const STATIC_SHEET_URL_MAP: Record<string, string> = {
  '/api/media/file/gy-1f-light-original.png': '/demo-plans/gy-1f-light.png',
  '/api/media/file/gy-2f-light-original.png': '/demo-plans/gy-2f-light.png',
  '/api/media/file/gy-3f-light-original.png': '/demo-plans/gy-3f-light.png',
}

export const getLandingShowcase = memoize<LandingShowcase | null>(
  'landing-showcase-v3',
  [],
  10 * 60_000,
  async () => {
    const payload = await getPayloadClient()
    await ensureDemoTemplateProject().catch(() => null)
    const res = await payload.find({
      collection: 'projects',
      where: { isDemoTemplate: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: {
        name: true,
        customerName: true,
        community: true,
        address: true,
        platform: true,
        pointMap: true,
      } as never,
    })
    const project = res.docs[0] as unknown as Record<string, unknown> | undefined
    if (!project) {
      return {
        project: {
          name: '湖山赋别墅全屋智能',
          customer: '林先生',
          community: '湖山赋',
          address: '',
          platform: '米家',
        },
        sheets: BUILTIN_DEMO_SHEETS,
        pointCount: BUILTIN_DEMO_SHEETS.reduce((s, sh) => s + sh.points.length, 0),
        roomCount: BUILTIN_DEMO_SHEETS.reduce((s, sh) => s + sh.areas.length, 0),
        quote: null,
        library: { products: 0, brands: 0 },
      }
    }

    const scene = normalizeScene(project.pointMap as never)
    const allSheets = sceneSheets(scene.elements, scene.files)
    const areas = sceneAreas(scene.elements, allSheets)
    const points = scenePoints(scene.elements, allSheets, areas)
    const areaName = new Map(areas.map((a) => [a.id, a.name]))

    const parsedSheets: ShowcaseSheet[] = allSheets
      .filter((s) => s.url)
      .map((s, i) => ({
        id: s.id,
        name: s.name,
        floor: floorTagFromSheetName(s.name) || `第${i + 1}层`,
        url: STATIC_SHEET_URL_MAP[s.url!] ?? s.url!,
        points: points
          .filter((p) => p.sheetId === s.id && p.rx != null && p.ry != null)
          .map((p) => ({
            id: p.id,
            type: p.deviceType,
            code: p.code,
            rx: p.rx!,
            ry: p.ry!,
            room: p.areaId ? (areaName.get(p.areaId) ?? null) : null,
          })),
        areas: areas.filter((a) => a.sheetId === s.id).map((a) => planAreaOf(a, s)),
      }))
    const parsedPointCount = parsedSheets.reduce((s, sh) => s + sh.points.length, 0)
    const hasBlankSheet = parsedSheets.some((s) => s.url.includes('blank-sheet'))
    const sheets: ShowcaseSheet[] =
      parsedSheets.length >= 3 && parsedPointCount >= 100 && !hasBlankSheet
        ? parsedSheets
        : BUILTIN_DEMO_SHEETS
    const totalRooms =
      sheets === BUILTIN_DEMO_SHEETS
        ? BUILTIN_DEMO_SHEETS.reduce((s, sh) => s + sh.areas.length, 0)
        : new Set(points.map((p) => p.areaId).filter(Boolean)).size

    const [quotes, products, brands, catalog] = await Promise.all([
      payload.find({
        collection: 'quotes',
        where: { project: { equals: project.id as string } },
        limit: 10,
        depth: 0,
        overrideAccess: true,
        select: {
          title: true,
          status: true,
          items: true,
          fees: true,
          discount: true,
          productTotal: true,
          total: true,
        } as never,
      }),
      payload.count({
        collection: 'products',
        where: { status: { equals: 'active' } },
        overrideAccess: true,
      }),
      payload.count({ collection: 'brands', overrideAccess: true }),
      getCatalog().catch(() => []),
    ])
    const catalogById = new Map(catalog.map((p) => [p.id, p]))

    // 首页只展示已确认的那一份报价；没有已确认的就取金额最高的一份
    const docs = quotes.docs as unknown as Record<string, unknown>[]
    const main =
      docs.find((q) => q.status === 'accepted') ??
      [...docs].sort((a, b) => num(b.total) - num(a.total))[0]
    let quote: ShowcaseQuote | null = null
    if (main) {
      const items = (Array.isArray(main.items) ? main.items : []) as Record<string, unknown>[]
      const imageIds = [
        ...new Set(items.map((i) => i.image).filter((id): id is string => typeof id === 'string')),
      ]
      const media = imageIds.length
        ? await payload.find({
            collection: 'media',
            where: { id: { in: imageIds } },
            limit: imageIds.length,
            depth: 0,
            overrideAccess: true,
          })
        : { docs: [] as Media[] }
      const imageUrl = new Map(media.docs.map((m) => [String(m.id), resolveMediaUrl(m)]))
      quote = {
        title: text(main.title),
        lines: items.map((i) => {
          const pid =
            typeof i.product === 'string'
              ? i.product
              : i.product && typeof i.product === 'object'
                ? String((i.product as { id?: unknown }).id ?? '')
                : ''
          const catProd = pid ? catalogById.get(pid) : undefined
          const customImg = typeof i.image === 'string' ? (imageUrl.get(i.image) ?? null) : null
          return {
            type: text(i.deviceType) || catProd?.deviceType || 'other',
            name: text(i.name) || catProd?.name || '',
            sku: text(i.sku) || catProd?.sku || '',
            unit: text(i.unit) || catProd?.unit || '个',
            price: num(i.price),
            qty: num(i.quantity),
            image: customImg ?? catProd?.image?.url ?? null,
            brandName: catProd?.brand?.name ?? null,
            brandLogo: catProd?.brand?.logo ?? null,
          }
        }),
        fees: ((Array.isArray(main.fees) ? main.fees : []) as Record<string, unknown>[]).map(
          (f) => ({ name: text(f.name), amount: num(f.amount) }),
        ),
        discount: num(main.discount),
        productTotal: num(main.productTotal),
        total: num(main.total),
        quoteCount: docs.length,
      }
    }

    return {
      project: {
        name: text(project.name).replace(/^【示例】/, ''),
        customer: text(project.customerName),
        community: text(project.community),
        address: text(project.address),
        platform: text(project.platform),
      },
      sheets,
      pointCount: sheets.reduce((s, sh) => s + sh.points.length, 0),
      roomCount: totalRooms,
      quote,
      library: { products: products.totalDocs, brands: brands.totalDocs },
    }
  },
)
