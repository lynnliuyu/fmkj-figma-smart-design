import { createHash, randomBytes } from 'node:crypto'

import { relId } from '@/lib/access'
import { grantTaskCreditIfEligible, loadAndSyncUserCreditTasks } from '@/lib/credit-tasks'
import { getPayloadClient } from '@/lib/payload'
import type { User } from '@/payload-types'

/**
 * 微信小程序登录：不依赖 Cookie，小程序在请求头里带 `Authorization: Bearer <令牌>`。
 * 令牌是 32 字节随机串，数据库只存 SHA-256 哈希；成员停用后令牌立即失效。
 */
export type MpUser = User & { collection: 'users' }
export type MpTokenKind = 'session' | 'bind' | 'web-ticket' | 'web'

const HOUR = 60 * 60 * 1000
const TTL: Record<MpTokenKind, number> = {
  session: 30 * 24 * HOUR,
  bind: 10 * 60 * 1000,
  'web-ticket': 2 * 60 * 1000,
  web: 7 * 24 * HOUR,
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

type TokenData = { userId?: string | null; openid?: string | null; unionid?: string | null; redirect?: string | null; client?: string | null }

/** 签发令牌，返回原文（只此一次）。顺手清理已过期的记录。 */
export async function issueToken(kind: MpTokenKind, data: TokenData) {
  const payload = await getPayloadClient()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL[kind]).toISOString()
  await payload.create({
    collection: 'mp-sessions',
    data: {
      tokenHash: hashToken(token),
      kind,
      user: data.userId ?? null,
      openid: data.openid ?? null,
      unionid: data.unionid ?? null,
      redirect: data.redirect ?? null,
      client: data.client ?? null,
      expiresAt,
      lastUsedAt: new Date().toISOString(),
    },
    overrideAccess: true,
    depth: 0,
  })
  void payload
    .delete({ collection: 'mp-sessions', where: { expiresAt: { less_than: new Date().toISOString() } }, overrideAccess: true, depth: 0 })
    .catch(() => null)
  return { token, expiresAt }
}

/** 读取令牌记录；过期的直接删除。consume=true 时读取后立即删除（一次性票据）。 */
export async function readToken(token: string | null | undefined, kind: MpTokenKind, opts: { consume?: boolean } = {}) {
  if (!token || token.length < 20 || token.length > 200) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'mp-sessions',
    where: { and: [{ tokenHash: { equals: hashToken(token) } }, { kind: { equals: kind } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = docs[0]
  if (!doc) return null
  const expired = new Date(doc.expiresAt).getTime() < Date.now()
  if (expired || opts.consume) await payload.delete({ collection: 'mp-sessions', id: doc.id, overrideAccess: true, depth: 0 }).catch(() => null)
  return expired ? null : doc
}

export async function revokeToken(token: string | null | undefined) {
  if (!token) return
  const payload = await getPayloadClient()
  await payload.delete({ collection: 'mp-sessions', where: { tokenHash: { equals: hashToken(token) } }, overrideAccess: true, depth: 0 }).catch(() => null)
}

/** 启用中的成员；带上 collection，Local API 的访问控制据此识别成员身份。 */
export async function loadActiveUser(userId: string | null | undefined): Promise<MpUser | null> {
  if (!userId) return null
  const payload = await getPayloadClient()
  const user = (await payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true }).catch(() => null)) as User | null
  if (!user || user.status !== 'active') return null
  return { ...user, collection: 'users' }
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization')?.trim() ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || request.headers.get('x-mp-token')?.trim() || null
}

/** 用会话令牌换成员；超过一天未用的会话刷新有效期（滑动续期）。 */
export async function userFromToken(token: string | null | undefined, kind: 'session' | 'web' = 'session'): Promise<MpUser | null> {
  const session = await readToken(token, kind)
  if (!session) return null
  const user = await loadActiveUser(relId(session.user))
  if (!user) return null
  if ((kind === 'session' || kind === 'web') && (!session.lastUsedAt || Date.now() - new Date(session.lastUsedAt).getTime() > 24 * HOUR)) {
    const payload = await getPayloadClient()
    await payload
      .update({
        collection: 'mp-sessions',
        id: session.id,
        data: { lastUsedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + TTL[kind]).toISOString() },
        overrideAccess: true,
        depth: 0,
      })
      .catch(() => null)
  }
  return user
}

export const getMpUser = (request: Request) => userFromToken(bearerToken(request), 'session')

/* ---------------- 微信 ---------------- */

export const wechatConfigured = () => Boolean(process.env.WECHAT_MP_APPID && process.env.WECHAT_MP_SECRET)
export const wechatOpenConfigured = () => Boolean(process.env.WECHAT_OPEN_APPID && process.env.WECHAT_OPEN_SECRET)

/**
 * 电脑网页的「小程序扫码登录」只能在小程序连接的那台服务器上完成：自托管部署（docker-compose 要求设置 PUBLIC_URL）。
 * Figma Make 预览和 Figma 托管站点用的不是小程序那边的数据库，扫码后这里永远等不到确认，
 * 所以这些环境的登录页只给邮箱密码登录，不再默认显示一张扫不通的二维码。
 */
export const qrLoginAvailable = () => process.env.FIGMA !== '1' && Boolean(process.env.PUBLIC_URL)

const WECHAT_ERRORS: Record<number, string> = {
  40029: '微信登录凭证无效，请重试',
  40163: '微信登录凭证已使用，请重试',
  45011: '登录太频繁，请稍后再试',
  40226: '该微信账号存在风险，暂时无法登录',
  40013: '小程序 AppID 配置错误',
  40125: '小程序 AppSecret 配置错误',
}

/** wx.login 的 code 换 openid（session_key 只在服务端使用，不保存、不返回）。 */
export async function code2Session(code: string): Promise<{ ok: true; openid: string; unionid: string | null } | { ok: false; error: string }> {
  if (!wechatConfigured()) return { ok: false, error: '服务器还没有配置小程序 AppID 和 AppSecret（WECHAT_MP_APPID / WECHAT_MP_SECRET）' }
  const params = new URLSearchParams({
    appid: process.env.WECHAT_MP_APPID!,
    secret: process.env.WECHAT_MP_SECRET!,
    js_code: code,
    grant_type: 'authorization_code',
  })
  try {
    const res = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`, { signal: AbortSignal.timeout(8000) })
    const data = (await res.json().catch(() => null)) as { openid?: string; unionid?: string; errcode?: number; errmsg?: string } | null
    if (!data?.openid) {
      if (data?.errcode) console.error('[mp] jscode2session', data.errcode, data.errmsg)
      return { ok: false, error: (data?.errcode && WECHAT_ERRORS[data.errcode]) || '微信登录失败，请稍后重试' }
    }
    return { ok: true, openid: data.openid, unionid: data.unionid ?? null }
  } catch {
    return { ok: false, error: '无法连接微信服务器，请稍后重试' }
  }
}

export async function findBinding(openid: string, unionid?: string | null) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'wechat-accounts', where: { openid: { equals: openid } }, limit: 1, depth: 0, overrideAccess: true })
  if (docs[0]) return docs[0]
  if (unionid) {
    const byUnion = await payload.find({
      collection: 'wechat-accounts',
      where: { unionid: { equals: unionid } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (byUnion.docs[0]) return byUnion.docs[0]
  }
  return null
}

export async function bindOpenid(userId: string, openid: string, unionid: string | null, nickname?: string | null) {
  const payload = await getPayloadClient()
  const existing = await findBinding(openid, unionid)
  const prevUserId = existing ? relId(existing.user) : null

  // 如果该微信号之前一键生成过一个临时微信小号（@wx.fmkj.local），当用户主动用已有网页邮箱账号登录并改绑时，自动停用该临时小号
  if (prevUserId && prevUserId !== userId) {
    const prevUser = (await payload.findByID({ collection: 'users', id: prevUserId, depth: 0, overrideAccess: true }).catch(() => null)) as User | null
    if (prevUser && prevUser.email?.endsWith('@wx.fmkj.local')) {
      await payload
        .update({
          collection: 'users',
          id: prevUserId,
          data: { status: 'disabled' } as never,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)
    }
  }

  const data = { user: userId, unionid, lastLoginAt: new Date().toISOString(), ...(nickname ? { nickname: nickname.slice(0, 40) } : {}) }
  const record = existing
    ? await payload.update({ collection: 'wechat-accounts', id: existing.id, data, overrideAccess: true, depth: 0 })
    : await payload.create({ collection: 'wechat-accounts', data: { openid, ...data }, overrideAccess: true, depth: 0 })

  // 绑定微信成功后，自动发放「绑定微信小程序」+10 积分奖励（按 userId 幂等，每个账号限领一次；同一微信号换绑其他账号不再重复发放）
  await grantTaskCreditIfEligible(userId, 'bind_wechat', { openid }).catch(() => null)
  return record
}

/**
 * 微信小程序新用户一键自动注册：
 * 当 openid 尚未绑定任何账号时，自动创建新成员账号，并通过 bindOpenid 自动发放「绑定微信小程序 +10 积分」与克隆示例项目。
 */
export async function autoRegisterWechatUser(openid: string, unionid: string | null, nickname?: string | null): Promise<MpUser> {
  const payload = await getPayloadClient()
  const shortHash = createHash('sha256').update(openid).digest('hex').slice(0, 8)
  const email = `wx_${shortHash}@wx.fmkj.local`
  const displayName = (nickname && nickname.trim() ? nickname.trim().slice(0, 32) : '') || `微信用户${shortHash.slice(0, 4).toUpperCase()}`

  // 如果已存在同占位邮箱的账号，直接复用并绑定
  const existing = await payload
    .find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)

  let user = (existing?.docs?.[0] as User | undefined) ?? null
  if (!user) {
    const randomPassword = randomBytes(18).toString('base64url')
    user = (await payload.create({
      collection: 'users',
      data: {
        name: displayName,
        email,
        password: randomPassword,
        status: 'active',
      } as never,
      overrideAccess: true,
      depth: 0,
    })) as User
  }

  await bindOpenid(String(user.id), openid, unionid, displayName)
  const refreshed = (await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true }).catch(() => user)) as User
  return { ...refreshed, collection: 'users' }
}

/** 小程序里展示的成员资料。 */
export async function presentMe(user: MpUser) {
  const payload = await getPayloadClient()
  const { tasks: creditTasks } = await loadAndSyncUserCreditTasks(user).catch(() => ({ tasks: [] }))
  const fresh = (await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true }).catch(() => user)) as User
  const { totalDocs } = await payload.count({ collection: 'wechat-accounts', where: { user: { equals: user.id } }, overrideAccess: true })
  return {
    id: String(fresh.id),
    name: fresh.name,
    email: fresh.email,
    phone: fresh.phone ?? null,
    aiCredits: fresh.aiCredits ?? 0,
    wechatBound: totalDocs > 0,
    creditTasks,
  }
}
