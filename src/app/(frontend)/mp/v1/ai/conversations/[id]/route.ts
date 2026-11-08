import { fail, mpRoute, ok } from '@/lib/mp/http'
import { getPayloadClient } from '@/lib/payload'
import { deleteConversation, getConversationMessages } from '@/plugins/ai-copilot/conversations'

export const GET = mpRoute<{ id: string }>(async ({ user, params }) => {
  const messages = await getConversationMessages(user, params.id)
  if (!messages) return fail(404, '会话不存在')
  const payload = await getPayloadClient()
  const conv = await payload
    .findByID({
      collection: 'ai-conversations',
      id: params.id,
      depth: 1,
      user,
      overrideAccess: false,
      select: { model: true, project: true },
      populate: { projects: { name: true } },
    })
    .catch(() => null)
  const proj =
    conv?.project && typeof conv.project === 'object'
      ? { id: String(conv.project.id), name: conv.project.name }
      : null
  return ok({ messages, model: conv?.model ?? null, project: proj })
})

export const DELETE = mpRoute<{ id: string }>(async ({ user, params }) =>
  (await deleteConversation(user, params.id)) ? ok() : fail(404, '会话不存在'),
)
