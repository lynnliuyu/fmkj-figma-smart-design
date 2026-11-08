import { APIError } from 'payload'

import { getPayloadClient } from '@/lib/payload'
import type { User } from '@/payload-types'
import { loadProposalTemplates } from '@/plugins/proposal/registry'

export type DeliverablesPatch = { finalQuote?: string | null; proposalTemplate?: string | null }
export type DeliverablesResult = { ok: true } | { ok: false; error: string }

/**
 * 设置交付资料：定稿报价、交付方案模板（只接受这两个字段；网页归档页与小程序共用）。
 * 报价必须属于本项目（由项目集合的校验保证）；模板必须是当前可用的业主方案模板（施工交底单独生成）。
 */
export async function saveDeliverables(
  user: User,
  projectId: string,
  patch: DeliverablesPatch,
): Promise<DeliverablesResult> {
  const data: { finalQuote?: string | null; proposalTemplate?: string | null } = {}
  if ('finalQuote' in patch)
    data.finalQuote =
      typeof patch.finalQuote === 'string' && patch.finalQuote.trim()
        ? patch.finalQuote.trim().slice(0, 64)
        : null
  if ('proposalTemplate' in patch) {
    const slug =
      typeof patch.proposalTemplate === 'string' ? patch.proposalTemplate.trim().slice(0, 60) : ''
    if (slug) {
      const templates = await loadProposalTemplates(user)
      const tpl = templates.find((t) => t.value === slug)
      if (!tpl) return { ok: false, error: '方案模板不存在或已停用' }
      if (tpl.kind !== 'owner')
        return { ok: false, error: '施工交底会单独生成，交付方案请选择业主方案模板' }
    }
    data.proposalTemplate = slug || null
  }
  if (!Object.keys(data).length) return { ok: false, error: '没有要保存的内容' }
  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'projects',
      id: projectId,
      data,
      user,
      overrideAccess: false,
      depth: 0,
      select: { finalQuote: true, proposalTemplate: true },
    })
    return { ok: true }
  } catch (error) {
    if (error instanceof APIError && error.status < 500) return { ok: false, error: error.message }
    if (
      error instanceof Error &&
      /ValidationError|只能选择|不存在/.test(`${error.name} ${error.message}`)
    )
      return { ok: false, error: '只能选择本项目的报价单' }
    console.error('[projects] set deliverables failed', error)
    return { ok: false, error: '保存失败，请稍后重试' }
  }
}
