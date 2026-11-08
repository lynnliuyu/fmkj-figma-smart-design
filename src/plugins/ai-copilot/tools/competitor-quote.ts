import { getCatalog, type CatalogProduct } from '@/lib/cached-data'
import { inferDeviceType } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import { resolveDeviceType } from '@/plugins/ai-import/point-import'

import { refreshContextProject, type AiToolHandler } from './context'

/**
 * 竞品报价单转配单：把客户拿来的外店报价单（AI 识图或粘贴的 Excel 内容）逐行匹配到本平台产品库的同级型号，
 * 在当前项目生成一份对比报价单（草稿），并给出整单差价。
 *
 * 匹配规则：先按品名 / 型号推断设备类型，只在同类型的在售产品里挑；
 * 评分 = 文字相似度（双字切分）+ 品牌一致 + 型号命中 + 价位接近（同级）+ 指定品牌偏好。
 * 没把握的行保留外店品名和单价，标记「待匹配」，方便在报价台里一键换型号。
 */

export type CompetitorLine = {
  name: string
  brand: string
  model: string
  deviceType: string
  quantity: number
  unitPrice: number | null
}
export type CompetitorMatch = {
  line: CompetitorLine
  product: CatalogProduct | null
  deviceType: string | null
  score: number
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/·,，。.:：;；()（）【】[\]"'“”]+/g, '')
function grams(s: string) {
  const n = norm(s)
  const set = new Set<string>()
  for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2))
  if (n.length === 1) set.add(n)
  return set
}
function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : null
const round2 = (n: number) => Math.round(n * 100) / 100

export function sanitizeCompetitorLine(raw: unknown): CompetitorLine | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = str(r.name, 120)
  const quantity = num(r.quantity)
  if (!name || quantity === null || quantity <= 0) return null
  const price = num(r.unitPrice)
  return {
    name,
    brand: str(r.brand, 40),
    model: str(r.model, 80),
    deviceType: str(r.deviceType, 40),
    quantity: Math.min(9999, Math.round(quantity * 100) / 100),
    unitPrice: price !== null && price >= 0 ? round2(price) : null,
  }
}

/** 一行外店明细匹配到产品库的同级型号（没把握时 product 为 null） */
export function matchCompetitorLine(
  line: CompetitorLine,
  catalog: CatalogProduct[],
  opts: { preferBrand?: string | null } = {},
): CompetitorMatch {
  const text = [line.brand, line.name, line.model].filter(Boolean).join(' ')
  const inferred = inferDeviceType(text, /开关|键/.test(text) ? 'switch' : null)
  const dt =
    resolveDeviceType(line.deviceType) ??
    resolveDeviceType(line.name) ??
    (inferred === 'other' ? null : inferred)
  const active = catalog.filter((p) => (p.status ?? 'active') === 'active')
  const pool = dt ? active.filter((p) => p.deviceType === dt) : active
  if (!pool.length) return { line, product: null, deviceType: dt, score: 0 }
  const lineGrams = grams(text)
  const lineText = norm(text)
  const prefer = norm(opts.preferBrand ?? '')
  let best: CatalogProduct | null = null
  let bestScore = -Infinity
  let bestText = 0
  for (const p of pool) {
    const brand = norm(p.brand?.name ?? '')
    // 文字相关度：品名相似 + 品牌一致 + 型号命中
    let text = 6 * jaccard(lineGrams, grams(`${p.brand?.name ?? ''} ${p.name} ${p.sku}`))
    if (brand && lineText.includes(brand)) text += 2.5
    const sku = norm(p.sku)
    if (sku.length >= 4 && lineText.includes(sku)) text += 4
    let score = text
    if (line.unitPrice && line.unitPrice > 0 && p.price > 0)
      score += 2 * (1 - Math.min(1, Math.abs(p.price - line.unitPrice) / line.unitPrice))
    if (prefer && brand && (brand.includes(prefer) || prefer.includes(brand))) score += 2
    if (p.price > 0) score += 0.3
    if (p.image) score += 0.1
    if (score > bestScore) {
      best = p
      bestScore = score
      bestText = text
    }
  }
  // 推断不出设备类型时，只接受文字本身足够相近的结果（价位接近不算数），避免把装饰条匹配成路由器
  if (!dt && bestText < 2.2) return { line, product: null, deviceType: null, score: bestScore }
  return { line, product: best, deviceType: dt ?? best?.deviceType ?? null, score: bestScore }
}

export const competitorQuoteHandlers: Record<string, AiToolHandler> = {
  async create_quote_from_competitor(args, ctx) {
    if (!ctx.projectId)
      return { result: { error: '没有关联项目，请先新建或选择项目' }, summary: '未关联项目' }
    const lines = (Array.isArray(args.items) ? args.items : [])
      .map(sanitizeCompetitorLine)
      .filter((l): l is CompetitorLine => Boolean(l))
      .slice(0, 200)
    if (!lines.length)
      return {
        result: { error: '没有可用的产品明细：每行至少需要品名与数量' },
        summary: '缺少产品明细',
      }
    const payload = await getPayloadClient()
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { status: true },
      })
      .catch(() => null)
    if (!project) return { result: { error: '项目不存在或无权限' }, summary: '项目不可用' }
    if (project.status === 'archived')
      return { result: { error: '项目已归档，不能新建报价' }, summary: '项目已归档' }

    const catalog = await getCatalog()
    const preferBrand = str(args.preferBrand, 40) || null
    const matches = lines.map((l) => matchCompetitorLine(l, catalog, { preferBrand }))
    const items = matches.map((m) =>
      m.product
        ? {
            product: m.product.id,
            deviceType: (m.product.deviceType ?? m.deviceType) as never,
            image: m.product.image?.id ?? null,
            name: m.product.name,
            sku: m.product.sku,
            unit: m.product.unit,
            price: m.product.price,
            quantity: m.line.quantity,
          }
        : {
            product: null,
            deviceType: (m.deviceType ?? null) as never,
            image: null,
            name: `${m.line.name}（外店型号，待匹配）`.slice(0, 200),
            sku: m.line.model || null,
            unit: '个',
            price: m.line.unitPrice ?? 0,
            quantity: m.line.quantity,
          },
    )
    const fees = Array.isArray(args.fees)
      ? (args.fees as { name?: unknown; amount?: unknown }[])
          .map((f) => ({ name: str(f.name, 60), amount: num(f.amount) ?? 0 }))
          .filter((f) => f.name && f.amount > 0)
          .map((f) => ({ name: f.name, amount: round2(f.amount) }))
      : []
    const linesTotal = lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.quantity, 0)
    const competitorTotal =
      num(args.competitorTotal) ??
      (linesTotal > 0 ? round2(linesTotal + fees.reduce((s, f) => s + f.amount, 0)) : null)
    const competitorName = str(args.competitorName, 40) || '外店'
    const matched = matches.filter((m) => m.product).length
    const title = str(args.title, 60) || `竞品对比配单（${competitorName}）`
    const notes = `根据客户提供的${competitorName}报价单转换${competitorTotal ? `（外店合计 ¥${competitorTotal.toLocaleString('zh-CN')}）` : ''}：已匹配 ${matched}/${lines.length} 项同级型号${matched < lines.length ? '，标「待匹配」的行请在报价台「更换型号」' : ''}。`

    const quote = await payload.create({
      collection: 'quotes',
      data: { title, project: ctx.projectId, status: 'draft', items, fees, discount: 0, notes },
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, ctx.projectId)
    const ourTotal = quote.total ?? 0
    const diff = competitorTotal !== null ? round2(ourTotal - competitorTotal) : null
    return {
      result: {
        quoteId: String(quote.id),
        title: quote.title,
        matched,
        unmatched: lines.length - matched,
        ourTotal,
        competitorTotal,
        diff,
        lines: matches.slice(0, 60).map((m) => ({
          competitor: `${[m.line.brand, m.line.name, m.line.model].filter(Boolean).join(' ')} ×${m.line.quantity}${m.line.unitPrice !== null ? ` @¥${m.line.unitPrice}` : ''}`,
          matched: m.product
            ? {
                name: m.product.name,
                sku: m.product.sku,
                brand: m.product.brand?.name ?? null,
                price: m.product.price,
              }
            : null,
          priceDiff:
            m.product && m.line.unitPrice !== null
              ? round2(m.product.price - m.line.unitPrice)
              : null,
        })),
      },
      summary: `已生成「${quote.title}」：匹配 ${matched}/${lines.length} 项，本店合计 ¥${ourTotal}${competitorTotal !== null ? `，外店 ¥${competitorTotal}（${diff! >= 0 ? '高' : '低'} ¥${Math.abs(diff!)}）` : ''}`,
      href: `/projects/${ctx.projectId}/quotes/${quote.id}`,
      hrefLabel: '打开对比报价单',
    }
  },
}
