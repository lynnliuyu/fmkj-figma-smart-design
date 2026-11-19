import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok, readJson } from '@/lib/mp/http'
import { buildNeedResult, needSummary } from '@/lib/services/need-service'

/**
 * 提交需求单 → 生成项目草稿（issue #194）。
 *
 * - 幂等：已 converted 直接返回原 projectId，不重复建项目
 * - 只写 need-leads.structured/pricing 与 projects 草稿；不改产品售价
 * - 项目名/客户名缺失时用「需求单-日期」占位，销售接管后改
 */
export const POST = mpPublicRoute(async (request) => {
  const payload = await getPayloadClient()
  const url = new URL(request.url)
  const token = decodeURIComponent(url.pathname.split('/').slice(-2)[0] ?? '')
  const body = await readJson<{ phone?: string }>(request)

  const found = await payload.find({
    collection: 'need-leads',
    where: { token: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const lead = found.docs[0]
  if (!lead) return fail(404, '需求单不存在或已过期')
  if (lead.status === 'converted' && lead.project) {
    return ok({ projectId: String((lead.project as { id?: unknown })?.id ?? lead.project) })
  }

  const answers = (lead.answers as Record<string, unknown>) ?? {}
  const result = await buildNeedResult(answers)
  const { pricing } = result
  const summary = needSummary(result)

  const project = await payload.create({
    collection: 'projects',
    data: {
      name: `需求单 ${new Date().toISOString().slice(0, 10)} ${result.structured.house.bedrooms}室`,
      // Projects 只有 active/archived；草稿用 active，并在 notes 首行标记「待接管」
      status: 'active',
      platform: '米家',
      budget: pricing.totals.total || null,
      notes: summary,
      customerPhone: body.phone || lead.phone || null,
    } as never,
    overrideAccess: true,
    depth: 0,
  })
  const projectId = String((project as unknown as { id: string | number }).id)

  await payload.update({
    collection: 'need-leads',
    id: lead.id,
    data: {
      status: 'converted',
      structured: result.structured,
      pricing: { ...pricing, at: new Date().toISOString() },
      project: projectId,
      ...(body.phone ? { phone: body.phone } : {}),
    },
    overrideAccess: true,
  })

  return ok({ projectId, total: pricing.totals.total, pendingPrice: pricing.pendingPrice.length })
})
