import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { constructionDeckPages } from '@/plugins/proposal/construction-deck'
import { DeckRoot, deckPreviewPages } from '@/plugins/proposal/deck'
import { getTemplatePreviewDocs, templateTheme } from '@/plugins/proposal/preview'
import { loadPublicProposalTemplates } from '@/plugins/proposal/registry'
import { resolveProposalTemplate } from '@/plugins/proposal/templates'

export const metadata: Metadata = { title: '模板样张', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export const dynamicParams = true

/**
 * 只有方案页面的样张（无页头页脚、无留白，第一屏就是 1440 × 960 的封面）：
 * 后台「方案模板」的实时预览、选择器预览与 scripts/generate-template-thumbnails.mjs 截图都用它。
 */
export default async function TemplateSlidesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [templates, docs] = await Promise.all([
    loadPublicProposalTemplates(),
    getTemplatePreviewDocs().catch(() => null),
  ])
  const tpl = resolveProposalTemplate(slug, templates)
  if (!tpl) notFound()
  if (!docs) return <p className="p-10 text-sm text-muted-foreground">示例项目暂时不可用。</p>
  if (tpl.kind === 'construction') {
    const date = new Date().toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    return (
      <div className="w-[297mm] bg-white [&_section]:shadow-none">
        {constructionDeckPages(docs, 'symbol', true, date).map((render, i) => (
          <div key={i}>{render(i + 1)}</div>
        ))}
      </div>
    )
  }
  const theme = templateTheme(tpl)
  return (
    <DeckRoot theme={theme} bare>
      {deckPreviewPages(docs, theme, { insights: true, sections: tpl.sections })}
    </DeckRoot>
  )
}
