import { getPayloadClient } from '@/lib/payload'
import {
  bindOpenid,
  findBinding,
  issueToken,
  loadActiveUser,
  presentMe,
  readToken,
} from '@/lib/mp/auth'
import { fail, mpPublicRoute, ok, readJson, text } from '@/lib/mp/http'
import { relId } from '@/lib/access'

/** 用账号密码把当前微信绑定到成员账号，成功后直接登录。 */
export const POST = mpPublicRoute(async (request: Request) => {
  const body = await readJson(request)
  const email = text(body.email, 120).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) return fail(400, '请输入邮箱和密码')
  const rawTicket = text(body.ticket, 200)
  const ticket = await readToken(rawTicket, 'bind')
  if (!ticket?.openid) return fail(400, '绑定已超时，请重新点击微信登录', 'BIND_EXPIRED')

  const payload = await getPayloadClient()
  let userId: string | null = null
  try {
    const result = await payload.login({ collection: 'users', data: { email, password } })
    userId = result.user ? String(result.user.id) : null
  } catch {
    return fail(401, '邮箱或密码不正确')
  }
  const user = await loadActiveUser(userId)
  if (!user) return fail(403, '该账号已停用，请联系管理员')
  const existing = await findBinding(ticket.openid, ticket.unionid)
  if (existing && relId(existing.user) !== String(user.id))
    return fail(409, '这个微信已绑定其他账号，请先在后台解绑')

  try {
    await bindOpenid(
      String(user.id),
      ticket.openid,
      ticket.unionid ?? null,
      text(body.nickname, 40) || null,
    )
  } catch (err) {
    const latest = await findBinding(ticket.openid)
    if (latest && relId(latest.user) !== String(user.id))
      return fail(409, '这个微信已绑定其他账号，请先在后台解绑')
    if (!latest) throw err
  }
  await readToken(rawTicket, 'bind', { consume: true })
  const { token, expiresAt } = await issueToken('session', {
    userId: String(user.id),
    openid: ticket.openid,
    client: 'wechat',
  })
  return ok({ token, expiresAt, user: await presentMe(user) })
})
