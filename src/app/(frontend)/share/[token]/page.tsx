import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Gift, MapPin, MessageCircle, Phone, Sparkles } from 'lucide-react'

import { PlanDemo } from '@/components/landing/plan-demo'
import { ProposalShowcase } from '@/components/landing/proposal-showcase'
import { QuoteShowcase } from '@/components/landing/quote-showcase'
import { money, Section } from '@/components/landing/section'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { MINIMAL_STYLE } from '@/documents/minimal'
import { DOC_KINDS } from '@/documents/registry'
import { relId } from '@/lib/access'
import { floorTagFromSheetName } from '@/lib/area-analysis'
import { APP_NAME } from '@/lib/brand'
import { getCatalog, getCompanyInfo, resolveMediaUrl } from '@/lib/cached-data'
import { clientVisibleQuoteIds, mainQuoteId } from '@/lib/client-feedback'
import { categoryOfType } from '@/lib/device-types'
import type { LandingShowcase, ShowcaseQuote } from '@/lib/landing-showcase'
import { getPayloadClient } from '@/lib/payload'
import { normalizeScene, planAreaOf, sceneAreas, scenePoints, sceneSheets } from '@/lib/point-scene'
import { projectDisplayName, quoteShortTitle } from '@/lib/project-name'
import type { Media, Project } from '@/payload-types'
import { PLUGIN_DOC_STYLES } from '@/plugins/doc-styles/styles'

import { ClientDecisionPanel, type CompareQuote } from './client-decision-panel'
import { ShareExportButton } from './share-export-button'
import { SharedLinkExpired } from './share-gate'
import { UnlockForm } from './unlock-form'
import { isShareUnlocked } from './actions'
import { parseShareConfig, shareLinkState, type ShareLinkState } from '@/lib/project-access'

export const metadata: Metadata = {
  title: `方案与报价预览 · ${APP_NAME}`,
  robots: { index: false, follow: false },
}

const DOC_STYLES = [MINIMAL_STYLE, ...PLUGIN_DOC_STYLES]
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const text = (v: unknown) => (typeof v === 'string' ? v : '')

async function loadSharedShowcase(token: string) {
  const trimmed = token.trim()
  if (!trimmed || trimmed.length < 4 || trimmed.length > 80) return null
  const payload = await getPayloadClient()

  let project: Project | null = null
  // 分享链接的校验状态：demo 链接恒为 ok；正式链接由 shareLinkState 判定。
  // 显式标注成 ShareLinkState —— 否则 TS 会把类型收窄成初始值的字面量。
  let state: ShareLinkState = { status: 'ok' }
  if (trimmed === 'demo') {
    const demoRes = await payload.find({
      collection: 'projects',
      where: { isDemoTemplate: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    project = (demoRes.docs[0] as Project | undefined) ?? null
  } else {
    // 只拉取 id 与 shareConfig，避免扫描项目表时把数以百计的 pointMap 大 JSON 全部读进内存
    const res = await payload.find({
      collection: 'projects',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      select: { shareConfig: true } as never,
    })
    // 用 shareLinkState 统一校验：一并检查「链接是否开启 / 凭证是否匹配 / 是否过期」。
    // 过期的链接不再展示客户方案——2026-11-09 新增有效期能力时一并接上。
    // 这里放行 password-required 只是为了让页面能渲染「输入密码」那一屏；
    // 密码是否正确由 resolveShareGate() 再判一次。
    // 注意：不要在 find 的回调里给 state 赋值——TS 的控制流分析看不到回调内的写入，
    // 会把 state 的类型收窄成初始值。先算出命中项和状态，再在外面赋值。
    const candidates = (res.docs as Project[]).map((p) => ({
      project: p,
      st: shareLinkState((p as unknown as { shareConfig?: unknown }).shareConfig, trimmed),
    }))
    const hit = candidates.find((c) => c.st.status !== 'invalid')
    state = hit ? hit.st : { status: 'invalid' }
    const matched = hit?.project
    if (matched) {
      project = (await payload
        .findByID({
          collection: 'projects',
          id: matched.id,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)) as Project | null
    }
  }
  if (!project) return null

  const ownerId = relId(project.owner)
  const [company, quotesRes, catalog] = await Promise.all([
    getCompanyInfo(ownerId),
    payload.find({
      collection: 'quotes',
      where: { project: { equals: project.id } },
      sort: '-updatedAt',
      limit: 10,
      depth: 0,
      overrideAccess: true,
    }),
    getCatalog().catch(() => []),
  ])
  const catalogById = new Map(catalog.map((p) => [p.id, p]))

  const scene = normalizeScene(project.pointMap as never)
  const allSheets = sceneSheets(scene.elements, scene.files)
  const areas = sceneAreas(scene.elements, allSheets)
  const points = scenePoints(scene.elements, allSheets, areas)
  const areaName = new Map(areas.map((a) => [a.id, a.name]))

  const sheets = allSheets
    .filter((s) => s.url)
    .map((s, i) => ({
      id: s.id,
      name: s.name,
      floor: floorTagFromSheetName(s.name) || `第${i + 1}层`,
      url: s.url!,
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

  const docs = quotesRes.docs as unknown as Record<string, unknown>[]
  const finalQuoteId = relId((project as { finalQuote?: unknown }).finalQuote)
  const main =
    (finalQuoteId ? docs.find((q) => String(q.id) === finalQuoteId) : undefined) ??
    docs.find((q) => q.status === 'accepted') ??
    docs[0]

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
      fees: ((Array.isArray(main.fees) ? main.fees : []) as Record<string, unknown>[]).map((f) => ({
        name: text(f.name),
        amount: num(f.amount),
      })),
      discount: num(main.discount),
      productTotal: num(main.productTotal),
      total: num(main.total),
      quoteCount: docs.length,
    }
  }

  // 业主可见的方案（主方案 + 已发送 / 已确认的报价），用于方案对比与意向确认；按总价从低到高排列
  const mainId = mainQuoteId(
    docs.map((q) => ({ id: String(q.id), status: text(q.status) })),
    finalQuoteId,
  )
  const visibleIds = clientVisibleQuoteIds(
    docs.map((q) => ({ id: String(q.id), status: text(q.status) })),
    mainId,
  )
  const compare: CompareQuote[] = visibleIds
    .map((qid) => docs.find((q) => String(q.id) === qid))
    .filter((q): q is Record<string, unknown> => Boolean(q))
    .map((q) => {
      const items = (Array.isArray(q.items) ? q.items : []) as Record<string, unknown>[]
      return {
        id: String(q.id),
        title: quoteShortTitle(text(q.title), project.name) || text(q.title),
        total: num(q.total),
        productTotal: num(q.productTotal),
        feeTotal: num(q.feeTotal),
        discount: num(q.discount),
        isMain: String(q.id) === mainId,
        lines: items
          .filter((i) => typeof i.id === 'string' && i.id)
          .map((i) => {
            const pid =
              typeof i.product === 'string'
                ? i.product
                : i.product && typeof i.product === 'object'
                  ? String((i.product as { id?: unknown }).id ?? '')
                  : ''
            const catProd = pid ? catalogById.get(pid) : undefined
            const cat = categoryOfType(text(i.deviceType) || catProd?.deviceType || 'other')
            return {
              itemId: String(i.id),
              category: cat?.slug ?? 'other',
              categoryName: cat?.name ?? '其他',
              name: text(i.name) || catProd?.name || '',
              sku: text(i.sku) || catProd?.sku || '',
              unit: text(i.unit) || catProd?.unit || '个',
              qty: num(i.quantity),
              amount: Math.round(num(i.price) * num(i.quantity) * 100) / 100,
              brandName: catProd?.brand?.name ?? null,
            }
          }),
      }
    })
    .sort((a, b) => a.total - b.total)

  const data: LandingShowcase = {
    project: {
      name: projectDisplayName(project.name),
      customer: text(project.customerName),
      community: text(project.community),
      address: text(project.address),
      platform: text(project.platform),
    },
    sheets,
    pointCount: sheets.reduce((s, sh) => s + sh.points.length, 0),
    roomCount: new Set(points.map((p) => p.areaId).filter(Boolean)).size,
    quote,
    library: { products: catalog.length, brands: 27 },
  }

  // 演示链接（/share/demo）只能浏览，不能提交意向
  const shareCfg = parseShareConfig((project as unknown as { shareConfig?: unknown }).shareConfig)
  return {
    data,
    company,
    compare,
    canSubmit: trimmed !== 'demo',
    state,
    passwordHash: shareCfg.passwordHash ?? null,
  }
}

/** 业主免登录只读预览页：展示交互式点位图、横版方案与定稿报价单，支持一键导出方案与报价 PDF。 */
export default async function ClientSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const shared = await loadSharedShowcase(token)
  if (!shared) notFound()
  const { data, company, compare, canSubmit, state, passwordHash } = shared

  // 链接已过期：给出明确说明，而不是 404——客户看到「链接已过期」才知道该找谁重发。
  if (state.status === 'expired') {
    return <SharedLinkExpired />
  }

  // 设了访问密码且本次会话还没通过校验：先给密码屏，不渲染任何方案内容。
  if (passwordHash && !(await isShareUnlocked(token, passwordHash))) {
    return <UnlockForm token={token} />
  }
  const address = [data.project.community, data.project.address].filter(Boolean).join(' ')

  return (
    <div data-landing className="min-h-svh overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {company.logo ? (
              <Image
                src={company.logo.url}
                alt={company.name}
                width={company.logo.width ?? 96}
                height={company.logo.height ?? 96}
                className="h-8 w-auto object-contain"
                unoptimized
              />
            ) : null}
            <div>
              <p className="text-sm font-medium">{company.name}</p>
              {company.slogan ? (
                <p className="text-xs text-muted-foreground">{company.slogan}</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {company.phone ? (
              <span className="hidden items-center gap-1 sm:inline-flex">
                <Phone className="size-3.5" />
                {company.phone}
              </span>
            ) : null}
            <Badge variant="neutral" className="hidden sm:inline-flex" label={'业主方案预览'} />
            <ShareExportButton projectName={data.project.name} />
            {compare.length ? (
              <Button size="sm" className="rounded-full" href="#decide" label="确认意向" />
            ) : null}
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {data.project.customer ? <span>客户：{data.project.customer}</span> : null}
                  {address ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {address}
                    </span>
                  ) : null}
                  {data.project.platform ? <span>主平台：{data.project.platform}</span> : null}
                </div>
                <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
                  {data.project.name}
                </h1>
              </div>
              {data.quote ? (
                <div className="text-left sm:text-right">
                  <p className="text-xs text-muted-foreground">方案报价合计</p>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {money(data.quote.total)}
                  </p>
                </div>
              ) : null}
            </div>

            {data.sheets.length > 0 ? (
              <div className="mt-8">
                <PlanDemo data={data} />
              </div>
            ) : null}
          </div>
        </section>

        <Section id="proposal" labelledBy="proposal-title" className="pt-20 sm:pt-28">
          <ProposalShowcase data={data} company={company} />
        </Section>

        {data.quote ? (
          <Section id="quote" labelledBy="quote-title" className="pt-20 sm:pt-28">
            <QuoteShowcase
              data={data}
              quote={data.quote}
              styles={DOC_STYLES}
              layouts={DOC_KINDS.quote.layouts}
              company={company}
            />
          </Section>
        ) : null}

        {compare.length ? (
          <ClientDecisionPanel
            shareToken={token}
            quotes={compare}
            companyName={company.name}
            defaultName={data.project.customer}
            canSubmit={canSubmit}
          />
        ) : null}
      </main>

      <footer className="mt-16 border-t border-border/70 bg-muted/20 py-12">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          {/* 左侧：本方案专属设计师 / 服务商联系卡 */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center lg:col-span-6">
            <div className="space-y-2">
              <Badge variant="neutral" className="text-xs" label={'方案设计及交付团队'} />
              <p className="text-lg font-semibold">{company.name}</p>
              {company.slogan ? (
                <p className="text-xs text-muted-foreground">{company.slogan}</p>
              ) : null}
              <div className="space-y-1 pt-1 text-xs text-muted-foreground">
                {company.phone ? <p>联系电话：{company.phone}</p> : null}
                {company.address ? <p>服务地址：{company.address}</p> : null}
              </div>
            </div>
            {company.qrCode?.url ? (
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <div className="overflow-hidden rounded-xl border bg-white p-1.5 shadow-2xs">
                  <Image
                    src={company.qrCode.url}
                    alt={company.qrCaption || '微信联系二维码'}
                    width={96}
                    height={96}
                    unoptimized
                    className="size-24 object-contain"
                  />
                </div>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageCircle className="size-3 text-primary" />
                  {company.qrCaption || '扫码添加微信'}
                </span>
              </div>
            ) : null}
          </div>

          {/* 右侧：繁梦空间 FMKJ 品牌背书微名片（驱动同行裂变） */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-6 lg:col-span-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" />
                由「繁梦空间 FMKJ」全屋智能设计工作台驱动生成
              </div>
              <p className="text-base font-semibold">
                几分钟完成全屋智能点位图、8 章横版提案与精准报价
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                上传户型图自动识别开关灯具点位，一键匹配米家、Aqara、Apple Home、华为、KNX
                产品库，同步导出客户提案、报价单、合同与水电施工交底单。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Button
                size="sm"
                className="rounded-full"
                href="/login?mode=register"
                icon={<Gift />}
                label="设计师免费体验（送 20 AI 积分）"
              />
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                href="/"
                icon={<ArrowRight />}
                label="了解繁梦空间"
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
