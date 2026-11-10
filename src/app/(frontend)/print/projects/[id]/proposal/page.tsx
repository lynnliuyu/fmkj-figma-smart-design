import { Fragment } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PrintToolbar } from '@/components/print-toolbar'
import { Button } from '@astryxdesign/core/Button'
import { DocEmpty } from '@/documents/parts'
import { appAuth } from '@/lib/app-auth'
import { isPointScope, loadProjectDocs, POINT_SCOPES, type PointScope } from '@/lib/project-docs'
import { constructionDeckPages } from '@/plugins/proposal/construction-deck'
import {
  customizeTheme,
  DECK_THEMES,
  DeckRoot,
  deckPages,
  isDeckTheme,
} from '@/plugins/proposal/deck'
import { buildTemplateGallery } from '@/plugins/proposal/preview'
import { loadProposalTemplates } from '@/plugins/proposal/registry'
import {
  DEFAULT_PROPOSAL_TEMPLATE,
  isProposalMarkers,
  resolveProposalTemplate,
  type ProposalMarkers,
} from '@/plugins/proposal/templates'
import { getPluginFlags } from '@/plugins/state'

import { ProposalTemplateSwitcher } from './template-switcher'

export const metadata = { title: '智能家居方案', robots: { index: false, follow: false } }

/**
 * 方案演示（插件）：按模板（章节结构 + 视觉主题）生成横版提案或施工交底，可打印、导出 PDF 或图片。
 * embed=1：只显示方案页面（模板选择器里的「预览样张」用）。
 */
export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    template?: string
    markers?: string
    scope?: string
    quoteId?: string
    embed?: string
  }>
}) {
  const { id } = await params
  const sp = await searchParams
  const embed = sp.embed === '1'
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/projects/${id}/proposal`)
  let scope: PointScope = isPointScope(sp.scope) ? sp.scope : 'all'
  // 模板只依赖当前用户，和项目数据同时读取
  const templatesP = loadProposalTemplates(user)
  let d = await loadProjectDocs(id, user, scope, sp.quoteId ?? null)
  if (!d) notFound()
  // 没指定范围和报价时用定稿报价（定稿可能是「不含灯具」等其他范围）
  if (!sp.scope && !sp.quoteId && d.finalQuoteId && String(d.quote?.id ?? '') !== d.finalQuoteId) {
    const fq = d.quotes.find((q) => q.id === d!.finalQuoteId)
    if (fq) {
      scope = fq.scope
      d = (await loadProjectDocs(id, user, scope, fq.id)) ?? d
    }
  }
  const docs = d
  const [flags, templates] = await Promise.all([
    getPluginFlags(docs.owner?.id ?? user.id),
    templatesP,
  ])
  if (!flags.proposal) notFound()
  if (!templates.length) {
    return (
      <section className="mx-auto my-12 flex max-w-xl flex-col items-center gap-4 rounded-xl border border-dashed bg-background px-6 py-12 text-center">
        <h1 className="text-lg font-semibold">暂无启用的方案模板</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          请联系管理员启用方案模板，再打开本项目生成方案。
        </p>
        <Button
          variant="secondary"
          size="sm"
          href={`/projects/${id}/archive`}
          label="返回项目归档"
        />
      </section>
    )
  }
  // 模板：网址参数 → 项目在「归档」里选定的交付方案模板 → 设置里的默认方案模板 → 栖序雅致
  const saved = d.company.documentDefaults.proposal?.layout
  const tpl =
    resolveProposalTemplate(sp.template, templates) ??
    resolveProposalTemplate(docs.proposalTemplate, templates) ??
    resolveProposalTemplate(saved, templates) ??
    resolveProposalTemplate(DEFAULT_PROPOSAL_TEMPLATE, templates) ??
    templates[0]!
  const t = tpl.value
  const deck = tpl.framework !== 'construction'
  const theme = customizeTheme(DECK_THEMES[isDeckTheme(tpl.theme) ? tpl.theme : 'qixu'], {
    headline: tpl.headline,
    coverTagline: tpl.tagline,
    coverPhoto: tpl.coverPhoto,
    accent: tpl.accent,
  })
  const markerOptions: { value: ProposalMarkers; label: string }[] = deck
    ? [{ value: 'symbol', label: '设备图标' }]
    : [
        { value: 'symbol', label: '设备图标' },
        { value: 'product', label: '产品图' },
      ]
  const markers: ProposalMarkers =
    isProposalMarkers(sp.markers) && markerOptions.some((o) => o.value === sp.markers)
      ? sp.markers
      : 'symbol'
  const date = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const base = `/print/projects/${id}/proposal`
  const activeQuoteId = docs.quote ? String(docs.quote.id) : ''
  const href = (patch: {
    template?: string
    markers?: string
    scope?: string
    quoteId?: string
  }) => {
    const q = new URLSearchParams({
      template: patch.template ?? tpl.value,
      markers: patch.markers ?? markers,
      scope: patch.scope ?? scope,
    })
    const nextQuoteId =
      patch.quoteId !== undefined
        ? patch.quoteId
        : patch.scope && patch.scope !== scope
          ? ''
          : activeQuoteId
    if (nextQuoteId) q.set('quoteId', nextQuoteId)
    return `${base}?${q.toString()}`
  }
  const empty =
    docs.points.length === 0 ? (
      <DocEmpty projectId={id}>点位图里还没有点位。布置好设备后，这里会生成整套方案。</DocEmpty>
    ) : null
  // 模板选择器：缩略图与页数直接用本项目的数据计算（只在打开选择器时渲染）
  const gallery = embed
    ? null
    : buildTemplateGallery(templates, docs, { insights: flags['room-insights'] })
  const templateLinks = Object.fromEntries(
    templates.map((x) => [x.value, href({ template: x.value })]),
  )

  return (
    <div className="min-h-screen bg-neutral-200/70 print:min-h-0 print:bg-white">
      <style>{'@media print { @page { size: A4 landscape; margin: 0; } }'}</style>
      {gallery ? (
        <PrintToolbar
          back={{ href: `/projects/${id}/archive`, label: '返回归档' }}
          exportName={`${docs.project.name}-${tpl.label}${scope === 'all' ? '' : '-' + POINT_SCOPES.find((x) => x.value === scope)!.label}`}
          wide={deck}
          picker={
            <ProposalTemplateSwitcher
              templates={gallery.items}
              thumbs={gallery.thumbs}
              value={t}
              links={templateLinks}
              previewLinks={Object.fromEntries(
                Object.entries(templateLinks).map(([k, v]) => [k, `${v}&embed=1`]),
              )}
              pageNote="按本项目计算"
            />
          }
          groups={[
            ...(docs.projectList.length > 1
              ? [
                  {
                    label: '项目',
                    value: id,
                    options: docs.projectList.slice(0, 5).map((p) => ({
                      value: p.id,
                      label: `${p.name}（${p.pointCount}点）`,
                      href: `/print/projects/${p.id}/proposal?template=${encodeURIComponent(t)}&scope=${scope}`,
                    })),
                  },
                ]
              : []),
            {
              label: '范围',
              value: scope,
              options: POINT_SCOPES.map((x) => ({
                value: x.value,
                label: x.label,
                href: href({ scope: x.value }),
              })),
            },
            ...(docs.quotes.length > 1
              ? [
                  {
                    label: '报价版本',
                    value: activeQuoteId,
                    options: docs.quotes.slice(0, 4).map((q) => ({
                      value: q.id,
                      label: `${q.id === docs.finalQuoteId ? '定稿 · ' : ''}${q.title.replace(docs.project.name, '').trim() || '报价'} ¥${q.total.toLocaleString('zh-CN')}`,
                      href: href({ quoteId: q.id, scope: q.scope }),
                    })),
                  },
                ]
              : []),
            {
              label: '点位',
              value: markers,
              options: markerOptions.map((o) => ({ ...o, href: href({ markers: o.value }) })),
            },
          ]}
        />
      ) : null}
      {deck ? (
        <DeckRoot theme={theme}>
          {empty}
          {deckPages(docs, theme, {
            sections: tpl.sections,
            markers,
            insights: flags['room-insights'],
          })}
        </DeckRoot>
      ) : (
        <div className="space-y-6 py-6 print:space-y-0 print:py-0">
          {empty}
          {constructionDeckPages(
            docs,
            markers === 'product' ? 'product' : 'symbol',
            flags['room-insights'],
            date,
          ).map((render, i) => (
            <Fragment key={i}>{render(i + 1)}</Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
