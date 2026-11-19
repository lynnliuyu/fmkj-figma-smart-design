import { relId } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok, readJson, text } from '@/lib/mp/http'
import { needAnswers, needRevision, withNeedDraft } from '@/lib/services/need-draft'
import { buildNeedResult, needSummary } from '@/lib/services/need-service'

/** Submit the confirmed answers once, even when requests race or a response is lost. */
export const POST = mpPublicRoute(async (request) => {
  const payload = await getPayloadClient()
  const url = new URL(request.url)
  const token = decodeURIComponent(url.pathname.split('/').slice(-2)[0] ?? '')
  const body = await readJson<{ phone?: string; revision?: string }>(request)
  const phone = text(body.phone, 30)

  return withNeedDraft(payload, token, async (lead, req) => {
    if (!lead) return fail(404, '需求单不存在或已过期')
    const existingProject = relId(lead.project)
    if (lead.status === 'converted') {
      if (!existingProject) return fail(409, '需求单已提交，请联系顾问', 'DRAFT_SUBMITTED')
      return ok({ projectId: existingProject })
    }
    if (body.revision !== needRevision(lead)) {
      return fail(409, '答案已更新，请重新生成清单再提交', 'DRAFT_CHANGED')
    }

    const result = await buildNeedResult(needAnswers(lead), req)
    const { pricing } = result
    const project = await payload.create({
      collection: 'projects',
      data: {
        name: `需求单 ${new Date().toISOString().slice(0, 10)} ${result.structured.house.bedrooms}室`,
        status: 'active',
        platform: '米家',
        budget: pricing.totals.total || null,
        notes: needSummary(result),
        customerPhone: phone || lead.phone || null,
      },
      overrideAccess: true,
      depth: 0,
      req,
    })

    await payload.update({
      collection: 'need-leads',
      id: lead.id,
      data: {
        status: 'converted',
        structured: result.structured,
        pricing: { ...pricing, at: new Date().toISOString() },
        project: project.id,
        ...(phone ? { phone } : {}),
      },
      overrideAccess: true,
      req,
    })

    return ok({
      projectId: String(project.id),
      total: pricing.totals.total,
      pendingPrice: pricing.pendingPrice.length,
    })
  })
})
