import { fail, mpRoute, ok, readJson, text } from '@/lib/mp/http'
import { getPayloadClient } from '@/lib/payload'
import { claimNeedProject } from '@/lib/services/need-project-pool'

export const POST = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const body = await readJson<{ ticket?: unknown }>(request)
  const result = await claimNeedProject(
    await getPayloadClient(),
    params.id,
    user.id,
    text(body.ticket, 100),
  )
  if (result.status === 'taken') return fail(409, `已被 ${result.name} 领取`, 'PROJECT_CLAIMED')
  if (result.status === 'missing') return fail(404, '项目不存在或已被删除')
  return ok({ id: params.id })
})
