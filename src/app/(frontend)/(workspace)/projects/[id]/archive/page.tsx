import Link from 'next/link'
import { Check, ChevronRight, Circle, History } from 'lucide-react'

import { BetaDocLink } from '@/components/beta-doc-link'
import { relId } from '@/lib/access'
import { getCompanyInfo } from '@/lib/cached-data'
import { contractStatusLabel, fmtLongDate, paymentAmounts } from '@/lib/contracts'
import { FINAL_QUOTE_SOURCE_LABEL, resolveFinalQuote } from '@/lib/deliverables'
import { categoryOfType, deviceTypeOf } from '@/lib/device-types'
import { nightScenePhotoForScene } from '@/lib/scene-night-photos'
import { miniAppCodeForCompany } from '@/lib/mini-app-code'
import { socialCaseTitle, socialSheetTitle } from '@/lib/social-poster'
import { inferScopeFromTitle } from '@/lib/point-scopes'
import { normalizeScene, planAreaOf, sceneAreas, scenePoints, sceneSheets } from '@/lib/point-scene'
import { projectDisplayName, quoteShortTitle } from '@/lib/project-name'
import { quoteStatusLabel, yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'
import { buildTemplateGallery, getTemplatePreviewDocs } from '@/plugins/proposal/preview'
import { loadProposalTemplates } from '@/plugins/proposal/registry'
import { DEFAULT_PROPOSAL_TEMPLATE, ownerTemplates, resolveProposalTemplate } from '@/plugins/proposal/templates'
import { getPluginFlags } from '@/plugins/state'

import { getProject, getProjectDeals } from '../project-data'
import { ArchiveButton } from './archive-button'
import { CopyClientLinkButton } from './copy-client-link'
import { DeliveryPackage, type DeliveryDoc } from './delivery-package'
import { SocialPosterDialog, type SocialPosterData } from './social-poster-dialog'
import { ArchiveTemplatePicker } from './template-picker-field'
import { AfterSalesSummary } from './after-sales-summary'
import { loadAfterSales } from '@/lib/services/after-sales-service'
import { parseShareConfig } from '@/lib/project-access'

/** 归档：核对资料 → 确认定稿（一份报价、一份方案）→ 打包交付资料 → 归档（项目转为只读）。 */
export default async function ProjectArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ user, payload, project, archived, role, readOnly }, { quotes, contract }] = await Promise.all([getProject(id), getProjectDeals(id)])
  // 分享配置只有 CMS 管理员有字段读权限：成员身份读到的项目里没有这个字段，必须以系统身份读取，
  // 否则每次打开归档页都会误判为「没有链接」而重新生成，已经发给业主的预览链接就失效了
  const shareDoc = await payload
    .findByID({ collection: 'projects', id: project.id, depth: 0, overrideAccess: true, select: { shareConfig: true } as never })
    .catch(() => null)
  const rawShare = (shareDoc as { shareConfig?: unknown } | null)?.shareConfig
  const shareConfig = parseShareConfig(rawShare)
  if (!rawShare || typeof (rawShare as { token?: unknown })?.token !== 'string') {
    await payload.update({ collection: 'projects', id: project.id, data: { shareConfig } as never, overrideAccess: true, depth: 0 }).catch(() => null)
  }
  const ownerId = relId(project.owner) || user.id
  const [flags, templates, company, fullSceneDoc, previewDocs] = await Promise.all([
    getPluginFlags(ownerId),
    loadProposalTemplates(user),
    getCompanyInfo(ownerId),
    payload.findByID({ collection: 'projects', id: project.id, depth: 0, overrideAccess: true, select: { pointMap: true } }).catch(() => null),
    getTemplatePreviewDocs().catch(() => null),
  ])
  const pid = String(project.id)
  const points = project.pointCount ?? 0
  const final = resolveFinalQuote(quotes, { contractQuoteId: relId(contract?.quote), finalQuoteId: relId(project.finalQuote) })
  const finalQuote = final.quote
  // 售后维保插件：质保倒计时与维保记录摘要（项目归档后仍持续使用）
  const afterSales = flags['after-sales'] ? await loadAfterSales(user, pid).catch(() => null) : null

  // 组装「小红书 / 朋友圈 3:4 案例晒单海报」数据（自动脱敏，只用小区名或项目简称，不暴露业主姓名电话）
  const normalized = normalizeScene(fullSceneDoc?.pointMap as never)
  const allSheets = sceneSheets(normalized.elements, normalized.files).filter((s) => s.url)
  const allAreas = sceneAreas(normalized.elements, allSheets)
  const allPoints = scenePoints(normalized.elements, allSheets, allAreas)
  const typeCounter = new Map<string, number>()
  for (const pt of allPoints) {
    typeCounter.set(pt.deviceType, (typeCounter.get(pt.deviceType) ?? 0) + 1)
  }
  const topTypes = [...typeCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, name: deviceTypeOf(type)?.name ?? '设备', count }))
  const hasLighting = allPoints.some((p) => categoryOfType(p.deviceType)?.slug === 'lighting')
  const sceneIdeas = [
    ...(hasLighting ? [{ name: '观影模式', title: '灯光退场，电影开场。', description: '观影场景 · 从客厅灯光开始讨论' }] : []),
    ...(allPoints.some((p) => p.deviceType === 'curtain-track') ? [{ name: '睡眠模式', title: '把一天，留在灯光之外。', description: '睡眠场景 · 窗帘与休息习惯一起确认' }] : []),
    ...(hasLighting && allPoints.some((p) => p.deviceType === 'motion-sensor') ? [{ name: '起夜模式', title: '夜里起身，脚下有光。', description: '夜间引导 · 感应与低亮度照明意向' }] : []),
  ]
  const posterData: SocialPosterData = {
    title: socialCaseTitle(project.community, [project.customerName, project.customerPhone]),
    platform: project.platform || '全屋智能',
    pointCount: allPoints.length || points,
    roomCount: new Set(allPoints.map((p) => p.areaId).filter(Boolean)).size || allAreas.length,
    floorCount: allSheets.length,
    totalAmount: finalQuote?.total ?? project.budget ?? null,
    budgetLabel: finalQuote ? '本次方案报价参考' : '项目预算参考',
    companyName: company.name,
    qrCodeUrl: company.qrCode?.url ?? '/brand/wechat-contact-qr.jpg',
    miniAppCodeUrl: miniAppCodeForCompany(company.name),
    sheets: allSheets.map((sheet, index) => ({
          name: socialSheetTitle(sheet.name, index),
          url: sheet.url!,
          points: allPoints
            .filter((p) => p.sheetId === sheet.id && p.rx !== null && p.ry !== null)
            .map((p) => ({ id: p.id, deviceType: p.deviceType, code: p.code, rx: p.rx, ry: p.ry, angle: p.angle })),
          areas: allAreas.filter((a) => a.sheetId === sheet.id).map((a) => planAreaOf(a, sheet)),
        })),
    topTypes,
    scenePhotos: sceneIdeas.flatMap((idea) => {
      const photo = nightScenePhotoForScene(idea.name)
      return photo ? [{ key: photo.key, title: idea.title, description: idea.description, url: photo.url, alt: photo.alt }] : []
    }),
  }
  const payments = contract?.payments ?? []
  const amounts = paymentAmounts(contract?.amount ?? 0, payments)
  const received = payments.filter((p) => p.received).length
  const deckTemplates = ownerTemplates(templates)
  const tpl =
    resolveProposalTemplate(project.proposalTemplate, deckTemplates) ??
    resolveProposalTemplate(DEFAULT_PROPOSAL_TEMPLATE, deckTemplates) ??
    deckTemplates[0] ??
    null
  const construction = templates.find((t) => t.framework === 'construction') ?? null
  const qTitle = (q: { title: string }) => quoteShortTitle(q.title, project.name)

  const checks = [
    { label: '点位图', done: points > 0, note: points ? `${points} 个点位` : '还没有布置点位', href: `/projects/${pid}/point-map` },
    {
      label: '定稿报价',
      done: Boolean(finalQuote && (final.source === 'contract' || final.source === 'chosen' || finalQuote.status === 'accepted')),
      note: finalQuote ? `${qTitle(finalQuote)} · ${FINAL_QUOTE_SOURCE_LABEL[final.source!]} · ${yuan(finalQuote.total)}` : '还没有报价',
      href: finalQuote ? `/projects/${pid}/quotes/${finalQuote.id}` : `/projects/${pid}/quotes`,
    },
    {
      label: '合同',
      done: contract?.status === 'signed',
      note: contract ? `${contract.number} · ${contractStatusLabel(contract.status)}${contract.signedAt ? ` · ${fmtLongDate(contract.signedAt)}` : ''}` : '还没有合同',
      href: `/projects/${pid}/contract`,
    },
    {
      label: '收款',
      done: payments.length > 0 && received === payments.length,
      note: payments.length
        ? `${received}/${payments.length} 期已收 · ${yuan(payments.reduce((s, p, i) => s + (p.received ? amounts[i] : 0), 0))}`
        : contract
          ? '合同里没有付款计划'
          : '签订合同后在「合同」里登记收款',
      href: `/projects/${pid}/contract`,
    },
  ]
  const ready = checks.every((c) => c.done)

  const proposalUrl =
    flags.proposal && points && tpl
      ? `/print/projects/${pid}/proposal?${new URLSearchParams({
          template: tpl.value,
          ...(finalQuote ? { quoteId: String(finalQuote.id), scope: inferScopeFromTitle(finalQuote.title) } : {}),
        }).toString()}`
      : null
  const docs: DeliveryDoc[] = [
    { key: 'plans', title: '点位图', note: points ? `${points} 个点位` : '未布置点位', url: points ? `/print/projects/${pid}/plans` : null, defaultOn: true },
    { key: 'checklist', title: '点位交底清单', note: points ? '' : '未布置点位', url: points ? `/print/projects/${pid}/checklist` : null, defaultOn: true },
    {
      key: 'quote',
      title: '定稿报价单',
      note: finalQuote ? yuan(finalQuote.total) : '未生成报价',
      url: finalQuote ? `/print/quotes/${finalQuote.id}` : null,
      defaultOn: true,
    },
    ...(flags.proposal
      ? [
          {
            key: 'proposal' as const,
            title: tpl ? `方案（${tpl.label}）` : '方案',
            note: points ? '' : '未布置点位',
            url: proposalUrl,
            defaultOn: true,
          },
        ]
      : []),
    { key: 'contract', title: '合同', note: contract ? contract.number : '未生成合同', url: contract ? `/print/contracts/${contract.id}` : null, defaultOn: true },
    ...(flags.proposal && construction
      ? [
          {
            key: 'construction' as const,
            title: '施工交底',
            note: points ? '' : '未布置点位',
            url: points ? `/print/projects/${pid}/proposal?template=${construction.value}` : null,
            defaultOn: false,
          },
        ]
      : []),
    ...(flags['after-sales']
      ? [
          {
            key: 'after-sales' as const,
            title: '售后维保卡',
            note: afterSales?.warranty.end ? `质保至 ${afterSales.warranty.end}` : '质保权益、设备台账与报修方式',
            url: `/print/projects/${pid}/after-sales`,
            defaultOn: false,
          },
        ]
      : []),
  ]
  const otherQuotes = quotes.filter((q) => String(q.id) !== String(finalQuote?.id ?? ''))
  const otherTemplates = flags.proposal && points ? deckTemplates.filter((t) => t.value !== tpl?.value) : []
  // 交付方案模板选择器：缩略图用示例别墅（各项目共用缓存），预览样张用本项目的数据
  const gallery = flags.proposal ? buildTemplateGallery(deckTemplates, previewDocs, { insights: flags['room-insights'] }) : null
  const previewLinks = Object.fromEntries(
    deckTemplates.map((t) => [
      t.value,
      `/print/projects/${pid}/proposal?${new URLSearchParams({ template: t.value, embed: '1', ...(finalQuote ? { quoteId: String(finalQuote.id), scope: inferScopeFromTitle(finalQuote.title) } : {}) }).toString()}`,
    ]),
  )

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">归档</h2>
          {archived ? <p className="text-sm text-muted-foreground">已于 {fmtLongDate(project.archivedAt)} 归档（只读）</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {points > 0 ? <SocialPosterDialog data={posterData} /> : null}
          {shareConfig.enabled ? <CopyClientLinkButton token={shareConfig.token} /> : null}
        </div>
      </header>

      <DeliveryPackage
        projectId={pid}
        projectName={projectDisplayName(project.name)}
        editable={!readOnly}
        docs={docs}
        quotes={quotes.map((q) => ({ value: String(q.id), label: `${qTitle(q)} · ${yuan(q.total)}` }))}
        finalQuote={{ id: finalQuote ? String(finalQuote.id) : null, sourceLabel: final.source ? FINAL_QUOTE_SOURCE_LABEL[final.source] : null, locked: final.source === 'contract' }}
        betaDoc={<BetaDocLink label="场景移交" href={`/print/projects/${pid}/handover`} />}
        proposalPicker={
          gallery && deckTemplates.length ? (
            <ArchiveTemplatePicker
              projectId={pid}
              templates={gallery.items}
              thumbs={gallery.thumbs}
              value={tpl?.value ?? null}
              previewLinks={previewLinks}
              editable={!readOnly}
            />
          ) : undefined
        }
        cover={{
          company: company.name,
          customer: project.customerName ?? '',
          address: [project.community, project.address].filter(Boolean).join(' '),
          date: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }),
        }}
      />

      {afterSales ? <AfterSalesSummary projectId={pid} data={afterSales} /> : null}

      {role !== 'read' ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-5 py-4">
          <div className="text-sm">
            <div className="font-medium">{archived ? '恢复为进行中项目' : ready ? '资料已齐备，可归档' : '归档项目'}</div>
            <div className="text-xs text-muted-foreground">{archived ? '恢复后可继续编辑点位、报价和合同' : '归档后转为只读，仍可查看与导出资料'}</div>
          </div>
          <ArchiveButton projectId={pid} archived={archived} primary={ready} />
        </section>
      ) : null}
    </div>
  )
}
