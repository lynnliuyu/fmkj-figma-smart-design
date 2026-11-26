import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok, readJson, text } from '@/lib/mp/http'
import { needAnswers, needRevision, withNeedDraft } from '@/lib/services/need-draft'
import { syncNeedProject } from '@/lib/services/need-project'
import { buildNeedResult, needSummary } from '@/lib/services/need-service'

/** 提交后仍可再次提交：同一需求单更新同一个项目，不重复建。 */
export const POST = mpPublicRoute(async (request) => {
  const payload = await getPayloadClient()
  const url = new URL(request.url)
  const token = decodeURIComponent(url.pathname.split('/').slice(-2)[0] ?? '')
  const body = await readJson<{ phone?: string; revision?: string }>(request)
  const phone = text(body.phone, 30)

  return withNeedDraft(payload, token, async (lead, req) => {
    if (!lead) return fail(404, '需求单不存在或已过期')
    if (body.revision !== needRevision(lead)) {
      return fail(409, '答案已更新，请重新生成清单再提交', 'DRAFT_CHANGED')
    }

    const result = await buildNeedResult(needAnswers(lead), req)
    const { pricing } = result
    const projectId = await syncNeedProject(
      payload,
      lead,
      result,
      needSummary(result),
      req,
      phone || null,
    )

    const saved = await payload.update({
      collection: 'need-leads',
      id: lead.id,
      data: {
        status: 'converted',
        structured: result.structured,
        pricing: { ...pricing, at: new Date().toISOString() },
        project: projectId,
        ...(phone ? { phone } : {}),
      },
      overrideAccess: true,
      req,
    })

    return ok({
      projectId,
      total: pricing.totals.total,
      pendingPrice: pricing.pendingPrice.length,
      // 提交会改变需求单状态，版本号随之变化；返回新版本，客户端返回修改后可直接继续保存。
      revision: needRevision(saved),
    })
  })
})
