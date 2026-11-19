import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok } from '@/lib/mp/http'
import { findNeedDraft, needRevision } from '@/lib/services/need-draft'

/**
 * 读回已填需求（免登录，凭 token）——「中途退出再进入不丢」。
 * 只返回业主自己的答案与状态；不返回内部备注/销售信息。
 */
export const GET = mpPublicRoute(async (request) => {
  const payload = await getPayloadClient()
  const url = new URL(request.url)
  const token = decodeURIComponent(url.pathname.split('/').pop() ?? '')
  if (!token) return fail(400, '缺少需求单凭证')

  const doc = await findNeedDraft(payload, token)
  if (!doc) return fail(404, '需求单不存在或已过期')

  return ok(
    {
      token: doc.token,
      revision: needRevision(doc),
      status: doc.status,
      source: doc.source ?? null,
      answers: doc.answers ?? {},
      structured: doc.structured ?? null,
      pricing: doc.pricing ?? null,
      projectId: doc.project ? String((doc.project as { id?: unknown })?.id ?? doc.project) : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
