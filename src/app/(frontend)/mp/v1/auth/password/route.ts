import { getPayloadClient } from '@/lib/payload'
import { bindOpenid, code2Session, issueToken, loadActiveUser, presentMe } from '@/lib/mp/auth'
import { fail, mpPublicRoute, ok, readJson, text } from '@/lib/mp/http'

/** 账号密码登录（未配置微信登录、或在开发者工具里调试时使用）。连续输错由 Payload 的登录限制保护。 */
export const POST = mpPublicRoute(async (request: Request) => {
  const body = await readJson(request)
  const email = text(body.email, 120).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) return fail(400, '请输入邮箱和密码')
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

  // 如果小程序端同时传了 wx.login 的 code，自动将当前微信号绑定到该网页账号上
  const wxCode = text(body.code, 200)
  let boundOpenid: string | null = null
  if (wxCode) {
    const session = await code2Session(wxCode).catch(() => null)
    if (session && session.ok) {
      boundOpenid = session.openid
      await bindOpenid(String(user.id), session.openid, session.unionid).catch(() => null)
    }
  }

  const { token, expiresAt } = await issueToken('session', {
    userId: String(user.id),
    openid: boundOpenid,
    client: 'password',
  })
  return ok({ token, expiresAt, user: await presentMe(user) })
})
