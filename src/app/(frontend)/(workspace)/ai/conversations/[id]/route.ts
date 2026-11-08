import { appAuth } from '@/lib/app-auth'
import { deleteConversation, getConversationMessages } from '@/plugins/ai-copilot/conversations'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/** 一个会话的全部消息（只能读自己的）。 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期')
  const messages = await getConversationMessages(user, (await params).id)
  return messages ? Response.json({ ok: true, messages }) : fail(404, '会话不存在')
}

/** 删除自己的会话及其消息（积分流水保留）。 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期')
  return (await deleteConversation(user, (await params).id))
    ? Response.json({ ok: true })
    : fail(404, '会话不存在')
}
