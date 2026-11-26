import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok } from '@/lib/mp/http'
import { getOwnerLead, ownerProjectId } from '@/lib/mp/owner-auth'
import { presentProject } from '@/lib/mp/present'

/** 业主查看自己的方案项目：令牌只对应一份需求单，别人的项目一律 404。 */
export const GET = mpPublicRoute(async (request) => {
  const url = new URL(request.url)
  const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '')
  const lead = await getOwnerLead(request)
  if (!lead) return fail(401, '需求单凭证无效，请重新打开清单', 'UNAUTHORIZED')
  const projectId = ownerProjectId(lead)
  if (!projectId || projectId !== id) return fail(404, '项目不存在或无权查看')
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id: projectId,
      depth: 0,
      overrideAccess: true,
      select: {
        name: true,
        community: true,
        address: true,
        platform: true,
        budget: true,
        status: true,
        pointCount: true,
      },
    })
    .catch(() => null)
  if (!project) return fail(404, '项目不存在或无权查看')
  return ok(
    { project: presentProject(project as never, { quoteCount: 0 }) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
