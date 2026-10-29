import { cookies } from 'next/headers'
import { cache } from 'react'

import { getPayloadClient } from '@/lib/payload'
import type { User } from '@/payload-types'

const APP_SESSION_COOKIE = 'app-session'

/**
 * 员工登录（app-session Cookie），与 Payload 后台的 CMS 登录完全独立。
 * 只读取 app-session，只认 `users` 集合的身份。
 */
export function createAppAuth(appUserCollection: 'users') {
  const getCurrentUser = cache(async (): Promise<User | null> => {
    const token = (await cookies()).get(APP_SESSION_COOKIE)?.value
    if (!token) return null

    const payload = await getPayloadClient()
    const authHeaders = new Headers({ Authorization: `JWT ${token}` })
    const { user } = await payload.auth({ headers: authHeaders })
    if (!user || user.collection !== appUserCollection) return null
    const appUser = user as User & { collection: string }
    if (appUser.status !== 'active') return null
    return appUser
  })

  async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const payload = await getPayloadClient()
    try {
      const result = await payload.login({
        collection: appUserCollection,
        data: { email, password },
      })
      if (!result.token || !result.user) return { ok: false, error: '邮箱或密码不正确' }
      if ((result.user as User).status !== 'active') return { ok: false, error: '该账号已停用，请联系管理员' }

      ;(await cookies()).set(APP_SESSION_COOKIE, result.token, {
        httpOnly: true,
        // 预览运行在 Figma Make 的跨站 iframe 中，lax Cookie 不会被发送，
        // 需 SameSite=None + Secure；Partitioned 让 Chrome 在禁用第三方 Cookie 时仍保留登录。
        sameSite: 'none',
        secure: true,
        partitioned: true,
        path: '/',
        expires: result.exp ? new Date(result.exp * 1000) : undefined,
      })
      return { ok: true }
    } catch {
      return { ok: false, error: '邮箱或密码不正确' }
    }
  }

  async function logout() {
    ;(await cookies()).set(APP_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'none', secure: true, partitioned: true, path: '/', maxAge: 0 })
  }

  return { getCurrentUser, login, logout }
}

export const appAuth = createAppAuth('users')
