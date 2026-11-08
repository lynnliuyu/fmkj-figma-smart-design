import { issueToken } from '@/lib/mp/auth'
import { fail, mpRoute, ok, readJson, text } from '@/lib/mp/http'

/**
 * 小程序打开网页打印页（报价单、合同、点位图、方案…）前换取一次性票据：{ path: '/print/...' }
 * 返回的 url 在 web-view 里打开后会写入 2 小时的网页会话并跳转到目标页。只允许站内打印页。
 */
export const POST = mpRoute(async ({ request, user }) => {
  const path = text((await readJson(request)).path, 300)
  if (!/^\/print\/[\w\-/]+(\?[\w\-=&%.]*)?$/.test(path)) return fail(400, '只能打开打印页面')
  const { token } = await issueToken('web-ticket', {
    userId: String(user.id),
    redirect: path,
    client: 'web-view',
  })
  return ok({ url: `/mp/web-login?ticket=${encodeURIComponent(token)}` })
})
