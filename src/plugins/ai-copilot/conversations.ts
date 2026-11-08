import { getPayloadClient } from '@/lib/payload'
import type { User } from '@/payload-types'

/** AI 会话读取与删除（网页和微信小程序共用），只能操作自己的会话。 */
export async function listConversations(user: User) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'ai-conversations',
    where: { owner: { equals: user.id } },
    sort: '-updatedAt',
    limit: 30,
    depth: 0,
    user,
    overrideAccess: false,
    select: { title: true, updatedAt: true },
  })
  return docs.map((d) => ({ id: String(d.id), title: d.title, updatedAt: d.updatedAt }))
}

export async function getConversationMessages(user: User, id: string) {
  const payload = await getPayloadClient()
  const conv = await payload
    .findByID({ collection: 'ai-conversations', id, depth: 0, user, overrideAccess: false })
    .catch(() => null)
  if (!conv) return null
  const { docs } = await payload.find({
    collection: 'ai-messages',
    where: { conversation: { equals: id } },
    sort: 'createdAt',
    limit: 200,
    depth: 0,
    user,
    overrideAccess: false,
    select: {
      role: true,
      content: true,
      model: true,
      cost: true,
      toolCalls: true,
      createdAt: true,
    },
  })
  return docs.map((m) => ({
    id: String(m.id),
    role: m.role,
    content: m.content,
    model: m.model ?? null,
    cost: m.cost ?? null,
    toolCalls: m.toolCalls ?? null,
    createdAt: m.createdAt,
  }))
}

/** 删除会话及其消息（积分流水保留）。 */
export async function deleteConversation(user: User, id: string) {
  const payload = await getPayloadClient()
  const conv = await payload
    .findByID({ collection: 'ai-conversations', id, depth: 0, user, overrideAccess: false })
    .catch(() => null)
  if (!conv) return false
  await payload.delete({
    collection: 'ai-messages',
    where: { conversation: { equals: id } },
    user,
    overrideAccess: false,
  })
  await payload.delete({ collection: 'ai-conversations', id, user, overrideAccess: false })
  return true
}
