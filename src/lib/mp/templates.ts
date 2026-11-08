import type { User } from '@/payload-types'
import { loadProposalTemplates } from '@/plugins/proposal/registry'
import {
  BUILTIN_PROPOSAL_TEMPLATES,
  DEFAULT_PROPOSAL_TEMPLATE,
  ownerTemplates,
  resolveProposalTemplate,
  type ProposalTemplateDef,
} from '@/plugins/proposal/templates'

/** 有预渲染封面图（public/proposal-templates/<标识>.jpg）的内置模板 */
const THUMB_SLUGS = new Set(BUILTIN_PROPOSAL_TEMPLATES.map((t) => t.value))

/** 模板缩略图：内置模板用自己的封面图；后台新建的模板用同主题的封面图，再没有就用封面照片或默认模板封面 */
export const templateThumb = (t: Pick<ProposalTemplateDef, 'value' | 'theme' | 'coverPhoto'>) =>
  THUMB_SLUGS.has(t.value)
    ? `/proposal-templates/${t.value}.jpg`
    : THUMB_SLUGS.has(t.theme)
      ? `/proposal-templates/${t.theme}.jpg`
      : (t.coverPhoto ?? `/proposal-templates/${DEFAULT_PROPOSAL_TEMPLATE}.jpg`)

export type MpTemplateOption = {
  slug: string
  label: string
  description: string
  audience: string
  occasion: string
  highlights: string[]
  thumb: string
}

/** 小程序的方案模板清单与项目当前使用的模板（未选择时为默认模板） */
export async function presentProjectTemplates(user: User, chosen: string | null | undefined) {
  const templates = await loadProposalTemplates(user)
  const owners = ownerTemplates(templates)
  const current =
    resolveProposalTemplate(chosen, owners) ??
    resolveProposalTemplate(DEFAULT_PROPOSAL_TEMPLATE, owners) ??
    owners[0] ??
    null
  const options: MpTemplateOption[] = owners.map((t) => ({
    slug: t.value,
    label: t.label,
    description: t.description,
    audience: t.audience,
    occasion: t.occasion,
    highlights: t.highlights,
    thumb: templateThumb(t),
  }))
  return {
    current: current ? (options.find((o) => o.slug === current.value) ?? null) : null,
    chosen: Boolean(chosen && current && chosen === current.value),
    options,
  }
}
