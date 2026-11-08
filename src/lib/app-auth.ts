import fs from 'node:fs'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'

import { getPayloadClient } from '@/lib/payload'
import { grantTaskCreditIfEligible, isRealUserEmail } from '@/lib/credit-tasks'
import { userFromToken } from '@/lib/mp/auth'
import type { User } from '@/payload-types'

const APP_SESSION_COOKIE = 'app-session'
const SIGNED_OUT_SENTINEL = 'signed-out'
/** 微信小程序 web-view 里打开网页（打印页）时的会话，由一次性票据换取，2 小时有效。 */
const MP_WEB_COOKIE = 'mp-web-session'
const PREVIEW_SESSION_FILE = '/tmp/fmkj-preview-session.json'

type PreviewSessionState = { userId: string | 'signed-out' | null; at: number }

function readPreviewSession(): PreviewSessionState | null {
  if (!previewDemoEnabled()) return null
  try {
    if (!fs.existsSync(PREVIEW_SESSION_FILE)) return null
    return JSON.parse(fs.readFileSync(PREVIEW_SESSION_FILE, 'utf8')) as PreviewSessionState
  } catch {
    return null
  }
}

function writePreviewSession(userId: string | 'signed-out' | null) {
  if (!previewDemoEnabled()) return
  try {
    fs.writeFileSync(PREVIEW_SESSION_FILE, JSON.stringify({ userId, at: Date.now() }))
  } catch {
    /* ignore */
  }
}

/**
 * 只在 Figma Make 沙盒环境（FIGMA=1，含 next dev 与 deploy-preview 预览面板）启用：
 * 跨站 iframe 拦截第三方 Cookie 时自动回退到服务端预览会话或默认演示账号，避免卡在登录页死循环。
 * 自托管 Docker 服务器没有 FIGMA=1，一律严格校验真实 Cookie。
 */
export const previewDemoEnabled = () => process.env.FIGMA === '1'

/**
 * Cookie 策略：
 * - Figma Make 预览运行在跨站 HTTPS iframe 中，使用 SameSite=None + Secure + Partitioned（本地 localhost 调试回退为 Lax）；
 * - 自托管服务器与本地开发根据当前请求的真实协议（x-forwarded-proto / origin）决定 Secure，避免 .env 写了 https:// 但用 HTTP 访问时 Cookie 被浏览器拒收。
 */
async function sessionCookieOptions() {
  const h = await headers().catch(() => null)
  const host = h?.get('x-forwarded-host') || h?.get('host') || ''
  const proto = h?.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  const origin = h?.get('origin') || h?.get('referer') || ''
  const isLocalHttp =
    (host.startsWith('localhost') || host.startsWith('127.0.0.1')) &&
    proto !== 'https' &&
    !origin.startsWith('https://')

  if (process.env.FIGMA === '1') {
    if (isLocalHttp) {
      return { httpOnly: true, sameSite: 'lax' as const, secure: false, path: '/' }
    }
    return { httpOnly: true, sameSite: 'none' as const, secure: true, partitioned: true, path: '/' }
  }
  const isHttps = proto
    ? proto === 'https'
    : origin
      ? origin.startsWith('https://')
      : !isLocalHttp && Boolean(process.env.PUBLIC_URL?.startsWith('https://'))
  return { httpOnly: true, sameSite: 'lax' as const, secure: isHttps, path: '/' }
}

/**
 * Figma Make 预览环境兜底：沙箱重启后预览子域名会更换，且部分浏览器在跨站 iframe 中拦截第三方 Cookie。
 * 当预览环境未携带 Cookie（且未主动点击退出登录）时，自动回退到内置演示管理员账号（demo@fmkj.dev），避免卡在登录页死循环。
 */
async function resolvePreviewFallbackUser(): Promise<User | null> {
  if (!previewDemoEnabled()) return null
  const payload = await getPayloadClient()
  const memUserId = readPreviewSession()?.userId
  if (memUserId === SIGNED_OUT_SENTINEL) return null
  if (memUserId) {
    const memUser = await payload
      .findByID({ collection: 'users', id: memUserId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (memUser && (memUser as User).status === 'active') {
      return { ...(memUser as User), collection: 'users' } as User
    }
  }
  const preferred = await payload
    .find({
      collection: 'users',
      where: { and: [{ email: { equals: 'demo@fmkj.dev' } }, { status: { equals: 'active' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (preferred?.docs[0]) {
    return { ...(preferred.docs[0] as User), collection: 'users' } as User
  }
  const anyActive = await payload
    .find({
      collection: 'users',
      where: { status: { equals: 'active' } },
      sort: 'createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  return anyActive?.docs[0]
    ? ({ ...(anyActive.docs[0] as User), collection: 'users' } as User)
    : null
}

/**
 * 员工登录（app-session Cookie），与 Payload 后台的 CMS 登录完全独立。
 * 只读取 app-session，只认 `users` 集合的身份。
 */
export function createAppAuth(appUserCollection: 'users') {
  const getCurrentUser = cache(async (): Promise<User | null> => {
    // 必须在第一行调用 cookies()，确保所有鉴权路由在 Next.js 构建中始终保持 Dynamic (ƒ)，绝不被静态缓存
    const jar = await cookies()
    // 浏览器中可能同时存在旧的非 Partitioned Cookie（如 signed-out）与新的 Partitioned JWT Cookie，遍历全部同名值优先取有效 JWT
    const allTokens = jar
      .getAll(APP_SESSION_COOKIE)
      .map((c) => c.value)
      .filter(Boolean)
    const jwtTokens = allTokens.filter((t) => t !== SIGNED_OUT_SENTINEL)
    const hasSignedOutCookie = allTokens.includes(SIGNED_OUT_SENTINEL)

    if (previewDemoEnabled()) {
      const previewState = readPreviewSession()
      if (previewState?.userId && previewState.userId !== SIGNED_OUT_SENTINEL) {
        const fallback = await resolvePreviewFallbackUser()
        if (fallback) return fallback
      }
      if (previewState?.userId === SIGNED_OUT_SENTINEL && jwtTokens.length === 0) return null
    }

    if (jwtTokens.length > 0) {
      const payload = await getPayloadClient()
      for (const token of jwtTokens.reverse()) {
        const authHeaders = new Headers({ Authorization: `JWT ${token}` })
        const { user } = await payload.auth({ headers: authHeaders }).catch(() => ({ user: null }))
        if (user && user.collection === appUserCollection) {
          const appUser = user as User & { collection: string }
          if (appUser.status === 'active') {
            if (previewDemoEnabled() && readPreviewSession()?.userId === SIGNED_OUT_SENTINEL) {
              writePreviewSession(String(appUser.id))
            }
            return appUser
          }
        }
      }
    }
    const mpToken = jar.get(MP_WEB_COOKIE)?.value
    if (mpToken) {
      const mpUser = await userFromToken(mpToken, 'web')
      if (mpUser) return mpUser
    }
    if (hasSignedOutCookie) return null
    return resolvePreviewFallbackUser()
  })

  async function login(
    email: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const payload = await getPayloadClient()
    try {
      // 若账号此前因输错密码被锁定，登录前自动解除锁定计数
      const existing = await payload
        .find({
          collection: appUserCollection,
          where: { email: { equals: email } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          showHiddenFields: true,
        })
        .catch(() => null)
      const doc = existing?.docs[0] as
        | (User & { lockUntil?: string | null; loginAttempts?: number | null })
        | undefined
      if (doc && (doc.lockUntil || (doc.loginAttempts && doc.loginAttempts > 0))) {
        await payload
          .update({
            collection: appUserCollection,
            id: doc.id,
            data: { lockUntil: null, loginAttempts: 0 } as never,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
      }

      const result = await payload.login({
        collection: appUserCollection,
        data: { email, password },
      })
      if (!result.token || !result.user) return { ok: false, error: '邮箱或密码不正确' }
      if ((result.user as User).status !== 'active')
        return { ok: false, error: '该账号已停用，请联系管理员' }

      // 忽略自动化冒烟测试临时账号，避免覆盖预览面板当前登录的真实/演示账号
      if (!/^preview_\d+@example\.com$/i.test(email)) {
        writePreviewSession(String(result.user.id))
      }
      const opts = await sessionCookieOptions()
      const jar = await cookies()
      jar.set(APP_SESSION_COOKIE, result.token, {
        ...opts,
        expires: result.exp ? new Date(result.exp * 1000) : undefined,
      })
      return { ok: true }
    } catch {
      return { ok: false, error: '邮箱或密码不正确' }
    }
  }

  async function logout() {
    const jar = await cookies()
    const opts = await sessionCookieOptions()
    if (previewDemoEnabled()) {
      writePreviewSession(SIGNED_OUT_SENTINEL)
      jar.set(APP_SESSION_COOKIE, SIGNED_OUT_SENTINEL, { ...opts, maxAge: 60 * 60 * 12 })
    } else {
      jar.set(APP_SESSION_COOKIE, '', { ...opts, maxAge: 0 })
    }
    jar.set(MP_WEB_COOKIE, '', { ...opts, maxAge: 0 })
  }

  /** 小程序 web-view：用一次性票据换来的网页会话令牌写入 Cookie。 */
  async function startMpWebSession(token: string, expiresAt: string) {
    const opts = await sessionCookieOptions()
    ;(await cookies()).set(MP_WEB_COOKIE, token, { ...opts, expires: new Date(expiresAt) })
  }

  async function register(input: {
    name: string
    email: string
    password: string
    phone?: string
  }): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
    const name = input.name.trim().slice(0, 40)
    const email = input.email.trim().toLowerCase()
    const password = input.password
    const phone = input.phone?.trim().slice(0, 30) || undefined

    if (!name) return { ok: false, error: '请输入姓名或团队称呼' }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { ok: false, error: '请输入有效的邮箱地址' }
    if (!password || password.length < 8) return { ok: false, error: '密码长度至少为 8 位' }

    const payload = await getPayloadClient()
    const existing = await payload
      .find({
        collection: appUserCollection,
        where: { email: { equals: email } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (existing?.docs.length) {
      return { ok: false, error: '该邮箱已注册，请直接登录' }
    }

    try {
      const created = (await payload.create({
        collection: appUserCollection,
        data: {
          name,
          email,
          password,
          ...(phone ? { phone } : {}),
          status: 'active',
        } as never,
        overrideAccess: true,
        depth: 0,
      })) as User

      // 真实邮箱注册自动发放「绑定电子邮箱」+10 积分奖励
      if (isRealUserEmail(email)) {
        await grantTaskCreditIfEligible(String(created.id), 'bind_email').catch(() => null)
      }

      const loginRes = await login(email, password)
      if (!loginRes.ok) return loginRes
      return { ok: true, user: created }
    } catch {
      return { ok: false, error: '注册失败，请检查输入信息后重试' }
    }
  }

  return { getCurrentUser, login, register, logout, startMpWebSession }
}

export const appAuth = createAppAuth('users')
