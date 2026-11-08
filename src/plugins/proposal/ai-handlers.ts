import type { AiToolHandler } from '@/plugins/ai-copilot/tools/context'
import { loadProposalTemplates } from './registry'
import { recommendTemplates } from './templates'

export const proposalHandlers: Record<string, AiToolHandler> = {
  async recommend_proposal_template(args, ctx) {
    const templates = await loadProposalTemplates(ctx.user)
    const audience = typeof args.audience === 'string' ? args.audience.trim() : ''
    const occasion = typeof args.occasion === 'string' ? args.occasion.trim() : ''
    const budgetSensitive = Boolean(args.budgetSensitive)
    const picks = recommendTemplates(templates, { audience, occasion, budgetSensitive }, 3)
    const top = picks[0]?.template
    const previewHref =
      ctx.projectId && top
        ? `/print/projects/${ctx.projectId}/proposal?template=${encodeURIComponent(top.value)}`
        : top
          ? `/templates/${top.value}`
          : '/templates'
    return {
      result: {
        recommendations: picks.map(({ template: t, reasons }) => ({
          slug: t.value,
          name: t.label,
          framework: t.framework,
          audience: t.audience,
          occasion: t.occasion,
          highlights: t.highlights,
          reasons,
          sampleUrl: `/templates/${t.value}`,
          projectPreviewUrl: ctx.projectId
            ? `/print/projects/${ctx.projectId}/proposal?template=${encodeURIComponent(t.value)}`
            : null,
        })),
      },
      summary: top ? `推荐方案模板「${top.label}」等 ${picks.length} 套` : '已列出推荐方案模板',
      href: previewHref,
      hrefLabel: ctx.projectId
        ? `用「${top?.label ?? '推荐模板'}」预览本项目方案`
        : '打开方案模板库',
    }
  },
}
