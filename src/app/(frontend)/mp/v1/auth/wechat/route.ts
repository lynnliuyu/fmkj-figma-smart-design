import {
  autoRegisterWechatUser,
  bindOpenid,
  code2Session,
  findBinding,
  issueToken,
  loadActiveUser,
  presentMe,
} from '@/lib/mp/auth'
import { fail, mpPublicRoute, ok, readJson, text } from '@/lib/mp/http'
import { relId } from '@/lib/access'

/**
 * 微信一键登录：wx.login 的 code → openid。
 * 已绑定成员 → 直接签发登录令牌；
 * 新微信用户（未绑定） → 默认直接一键自动注册新账号并登录（自动赠送初始积分与演示项目），无需再手动绑定！
 */
export const POST = mpPublicRoute(async (request: Request) => {
  const body = await readJson(request)
  const code = text(body.code, 200)
  if (!code) return fail(400, '缺少微信登录凭证')
  const session = await code2Session(code)
  if (!session.ok) return fail(400, session.error, 'WECHAT_LOGIN_FAILED')

  const binding = await findBinding(session.openid, session.unionid)
  const user = binding ? await loadActiveUser(relId(binding.user)) : null
  if (binding && user) {
    await bindOpenid(
      String(user.id),
      session.openid,
      session.unionid,
      text(body.nickname, 40) || null,
    )
    const { token, expiresAt } = await issueToken('session', {
      userId: String(user.id),
      openid: session.openid,
      client: 'wechat',
    })
    return ok({ token, expiresAt, user: await presentMe(user) })
  }
  if (binding && !user) return fail(403, '绑定的账号已停用，请联系管理员', 'ACCOUNT_DISABLED')

  // 如果客户端明确请求仅获取绑定票据（用于将当前微信号改绑到已有网页端邮箱账号），返回 bindTicket
  if (body.bindOnly === true) {
    const { token: bindTicket, expiresAt } = await issueToken('bind', {
      openid: session.openid,
      unionid: session.unionid,
      client: 'wechat',
    })
    return ok({ needBind: true, bindTicket, expiresAt })
  }

  // 新用户默认微信一键自动注册并直接登录
  const newUser = await autoRegisterWechatUser(
    session.openid,
    session.unionid,
    text(body.nickname, 40) || null,
  )
  const { token, expiresAt } = await issueToken('session', {
    userId: String(newUser.id),
    openid: session.openid,
    client: 'wechat',
  })
  return ok({ token, expiresAt, user: await presentMe(newUser), isNewUser: true })
})
