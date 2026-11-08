/* eslint-disable @next/next/no-img-element -- 示例缩略图兜底用同源静态照片 */
/**
 * 模板预览（服务端）：用平台内置的示例母版项目实时渲染模板缩略图与样张。
 * 缩略图就是真实方案的封面（同一套页面组件、同一份主题），模板代码或后台模板一改，缩略图自动跟着变，
 * 不需要人工截图；需要静态图片（小程序、分享卡片）时运行 scripts/generate-template-thumbnails.mjs 批量生成。
 */
import { ScaledFrame } from '@/components/scaled-frame'
import { ensureDemoTemplateProject } from '@/lib/demo-project'
import { memoize } from '@/lib/memo-cache'
import { getPayloadClient } from '@/lib/payload'
import { loadSystemProjectDocs, type ProjectDocsData } from '@/lib/project-docs'
import { TEMPLATE_PREVIEW_TAG } from '@/lib/revalidate-templates'

import { constructionDeckPages } from './construction-deck'
import { customizeTheme, DECK_THEMES, DeckFrame, deckCover, isDeckTheme, type DeckTheme } from './deck'
import { toPickerTemplate, type PickerTemplate } from './picker-data'
import type { ProposalTemplateDef } from './templates'

export const DECK_W = 1440
export const DECK_H = 960
/** 施工交底是 A4 横版（297mm × 210mm，按 96dpi） */
export const A4_W = 1123
export const A4_H = 794

/** 示例母版项目的方案数据（模板库、缩略图共用，进程内缓存 10 分钟；场景库或模板变动时立即清除） */
export const getTemplatePreviewDocs = memoize<ProjectDocsData | null>('template-preview-docs-v1', [TEMPLATE_PREVIEW_TAG], 10 * 60_000, async () => {
  const payload = await getPayloadClient()
  await ensureDemoTemplateProject().catch(() => null)
  const res = await payload.find({ collection: 'projects', where: { isDemoTemplate: { equals: true } }, limit: 1, depth: 0, overrideAccess: true, select: { name: true } })
  const id = res.docs[0]?.id
  return id ? loadSystemProjectDocs(String(id)) : null
})

/** 模板的视觉主题（后台的强调色、封面图、标语覆盖在内置主题上） */
export const templateTheme = (t: ProposalTemplateDef): DeckTheme =>
  customizeTheme(DECK_THEMES[isDeckTheme(t.theme) ? t.theme : 'qixu'], { headline: t.headline, coverTagline: t.tagline, coverPhoto: t.coverPhoto, accent: t.accent })

const today = () => new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' })

/** 没有示例项目时的兜底缩略图：主题色板 + 封面照片 + 标语 */
function SwatchThumb({ template }: { template: ProposalTemplateDef }) {
  const theme = templateTheme(template)
  const c = theme.style.colors
  return (
    <div className="relative flex aspect-[3/2] w-full flex-col overflow-hidden" style={{ background: c.paper, color: c.ink }}>
      {theme.cover !== 'type' && template.kind === 'owner' ? <img src={theme.coverPhoto} alt="" loading="lazy" className="h-3/5 w-full object-cover" /> : null}
      <div className="flex flex-1 flex-col justify-center gap-1 px-[6%]">
        <span className="text-[clamp(10px,2.2vw,18px)] font-semibold">{template.kind === 'construction' ? '施工交底' : theme.headline}</span>
        <span className="h-0.5 w-10" style={{ background: c.accent }} />
      </div>
    </div>
  )
}

type PreviewResult = { thumb: React.ReactNode; pages: number | null }

/** 一个模板的缩略图（封面）与页数 */
export function templatePreview(template: ProposalTemplateDef, docs: ProjectDocsData | null, insights = true): PreviewResult {
  if (!docs) return { thumb: <SwatchThumb template={template} />, pages: null }
  if (template.kind === 'construction') {
    const pages = constructionDeckPages(docs, 'symbol', insights, today())
    return {
      thumb: (
        <ScaledFrame width={A4_W} height={A4_H} label={`${template.label}缩略图`}>
          <div className="w-[297mm] bg-white [&_section]:shadow-none">{pages[0]?.(1)}</div>
        </ScaledFrame>
      ),
      pages: pages.length,
    }
  }
  const theme = templateTheme(template)
  const { cover, total } = deckCover(docs, theme, { insights, sections: template.sections })
  return {
    thumb: (
      <ScaledFrame width={DECK_W} height={DECK_H} label={`${template.label}封面缩略图`}>
        <DeckFrame theme={theme}>{cover}</DeckFrame>
      </ScaledFrame>
    ),
    pages: total,
  }
}

/** 选择器 / 模板库要用的全部数据：展示信息与缩略图 */
export function buildTemplateGallery(
  templates: ProposalTemplateDef[],
  docs: ProjectDocsData | null,
  opts: { insights?: boolean } = {},
): { items: PickerTemplate[]; thumbs: Record<string, React.ReactNode> } {
  const thumbs: Record<string, React.ReactNode> = {}
  const items = templates.map((t) => {
    const p = templatePreview(t, docs, opts.insights ?? true)
    thumbs[t.value] = p.thumb
    return toPickerTemplate(t, { pages: p.pages })
  })
  return { items, thumbs }
}
