import { cache } from 'react'

import { getPayloadClient } from '@/lib/payload'
import { ensureBuiltinLibrarySeeded } from '@/lib/proposal-library'
import type { User } from '@/payload-types'

import { isDeckTheme } from './deck/themes'
import {
  frameworkOf,
  isDeckSection,
  isProposalFramework,
  kindOfFramework,
  normalizeSections,
} from './framework'
import { BUILTIN_PROPOSAL_TEMPLATES, type ProposalTemplateDef } from './templates'

/**
 * 方案模板清单（服务端）：后台「方案模板」里启用的模板；后台一个模板都没有时用内置模板。
 * 同一次请求里多处读取只查一次。
 * - 后台没填的「适合客户 / 使用时机 / 外观特点」沿用同标识内置模板的文案，再没有就用版式框架的默认说明；
 * - 章节按编排规范整理（封面置顶、投资与服务交付置底、去重，见 framework.ts）；
 * - 后台尚未建立的内置模板在读取时补齐，新增主题无需先写入后台才能预览；同标识的后台覆盖和停用始终优先。
 * user 为 null 时按系统身份读取（公开的模板库页面使用；模板本身不含任何成员数据）。
 */
export const loadProposalTemplates = cache(
  async (user: User | null): Promise<ProposalTemplateDef[]> => {
    const payload = await getPayloadClient()
    await ensureBuiltinLibrarySeeded(payload)
    const access = user ? { user, overrideAccess: false } : { overrideAccess: true }
    const res = await payload
      .find({
        collection: 'proposal-templates',
        sort: 'sortOrder',
        limit: 100,
        depth: 1,
        ...access,
      })
      .catch(() => null)
    if (!res?.docs.length) return BUILTIN_PROPOSAL_TEMPLATES
    const builtinOf = new Map(BUILTIN_PROPOSAL_TEMPLATES.map((t) => [t.value, t]))
    const list = res.docs
      .filter((d) => d.enabled !== false)
      .map((d): ProposalTemplateDef => {
        const base = builtinOf.get(d.slug)
        const framework = isProposalFramework(d.framework)
          ? d.framework
          : (base?.framework ?? 'full')
        const rawSections = (d.sections ?? []).filter(isDeckSection)
        const sections =
          framework === 'story' && rawSections.length === 6 && !rawSections.includes('system')
            ? (['cover', 'scenes', 'zones', 'plans', 'system', 'investment', 'service'] as const)
            : rawSections
        const cover = d.coverImage && typeof d.coverImage === 'object' ? d.coverImage.url : null
        const fw = frameworkOf(framework)
        const doc = d as typeof d & {
          audience?: string | null
          occasion?: string | null
          highlights?: string[] | null
        }
        const highlights = (doc.highlights ?? [])
          .map((h) => String(h).trim())
          .filter(Boolean)
          .slice(0, 4)
        return {
          value: d.slug,
          label: d.name,
          description: d.description || base?.description || '',
          kind: kindOfFramework(framework),
          audience: doc.audience?.trim() || base?.audience || fw.audience,
          occasion: doc.occasion?.trim() || base?.occasion || fw.occasion,
          highlights: highlights.length ? highlights : (base?.highlights ?? []),
          framework,
          theme: isDeckTheme(d.theme) ? d.theme : (base?.theme ?? 'qixu'),
          sections: normalizeSections(sections, framework),
          markers: 'symbol',
          headline: d.headline ?? null,
          tagline: d.tagline ?? null,
          coverPhoto: cover ?? null,
          accent: d.accent ?? null,
        }
      })
    const managedSlugs = new Set(res.docs.map((d) => d.slug))
    const hasManagedConstruction = res.docs.some((d) => d.framework === 'construction')
    // 已存在但停用的记录不能被兜底重新启用；后台自定义的交底框架也不重复补。
    for (const builtin of BUILTIN_PROPOSAL_TEMPLATES) {
      if (
        managedSlugs.has(builtin.value) ||
        (builtin.kind === 'construction' && hasManagedConstruction)
      )
        continue
      list.push(builtin)
    }
    return list
  },
)

/** 公开模板库（/templates）用：系统身份读取后台模板，没有时用内置模板 */
export const loadPublicProposalTemplates = () => loadProposalTemplates(null)
