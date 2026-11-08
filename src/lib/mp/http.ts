import { APIError, ValidationError } from 'payload'

import { getMpUser, type MpUser } from './auth'

/**
 * 小程序接口的统一响应：成功 `{ ok: true, data }`，失败 `{ ok: false, error, code? }` + HTTP 状态码。
 * 注意：wx.request 不支持 PATCH，修改一律用 PUT。
 */
export const ok = (data: unknown = null, init?: ResponseInit) =>
  Response.json({ ok: true, data }, init)
export const fail = (status: number, error: string, code?: string) =>
  Response.json({ ok: false, error, ...(code ? { code } : {}) }, { status })

export function errorStatus(error: unknown) {
  if (error instanceof ValidationError) return 400
  const status = (error as { status?: number })?.status
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500
}

export function errorMessage(error: unknown, fallback = '操作失败，请稍后重试') {
  if (error instanceof ValidationError) return '有字段未通过校验，请检查后重试'
  if (error instanceof APIError && error.status < 500) return error.message
  const status = (error as { status?: number })?.status
  if (status === 403) return '没有权限执行这个操作'
  if (status === 404) return '数据不存在或已被删除'
  console.error('[mp]', fallback, error)
  return fallback
}

type RouteCtx<P> = { request: Request; user: MpUser; params: P }

/** 免登录接口：统一兜底异常，保证始终返回 JSON。 */
export function mpPublicRoute(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await handler(request)
    } catch (error) {
      return fail(errorStatus(error), errorMessage(error, '服务器开小差了，请稍后重试'))
    }
  }
}

/** 需要登录的接口：解析令牌、统一兜底错误。 */
export function mpRoute<P extends Record<string, string> = Record<string, string>>(
  handler: (ctx: RouteCtx<P>) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    try {
      const user = await getMpUser(request)
      if (!user) return fail(401, '登录已过期，请重新登录', 'UNAUTHORIZED')
      const params = ((await context?.params) ?? {}) as P
      return await handler({ request, user, params })
    } catch (error) {
      return fail(errorStatus(error), errorMessage(error, '服务器开小差了，请稍后重试'))
    }
  }
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  return ((await request.json().catch(() => null)) ?? {}) as T
}

export const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''
export const intParam = (v: string | null, fallback: number, min: number, max: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}
