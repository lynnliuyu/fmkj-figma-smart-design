import { NextResponse, type NextRequest } from 'next/server'

/**
 * Payload 的 `/api/media/file/:filename` 只注册了 GET（见 payload/dist/uploads/endpoints），
 * **不处理 HEAD** —— 任何 HEAD 请求都会落到 404。
 *
 * 为什么必须补上：GET 返 200 而 HEAD 返 404，属于协议层面的不一致，
 * 会误伤链接检查器、CDN 预取、浏览器预加载、SEO 工具这类只发 HEAD 的调用方；
 * 而 `next.config.ts` 又给这条路径配了长缓存，404 一旦被缓存就极难冲掉
 * （2026-11-09 事故：产品库图片在部分浏览器上一直显示裂图，硬刷新都无效）。
 *
 * 处理方式：转成一次内部 GET，只回传状态码与响应头，丢掉 body —— 这正是 HEAD 的语义。
 */
async function handleMediaHead(request: NextRequest): Promise<Response> {
  const res = await fetch(new URL(request.url), {
    method: 'GET',
    headers: { 'x-media-head-probe': '1' },
    cache: 'no-store',
  })
  const headers = new Headers(res.headers)
  // 这两项与「没有 body」矛盾，按规范不该出现在 HEAD 响应里
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(null, { status: res.status, headers })
}

/**
 * 只给需要登录的工作台页面带上当前地址（请求头 x-pathname）。
 * 未登录时页面据此跳到 /login?from=原地址，登录后回到原页面（见 src/lib/login-redirect.ts）。
 * 不做鉴权判断：每个页面、接口和 Server Action 仍各自校验登录与权限。
 */
export async function proxy(request: NextRequest) {
  if (request.method === 'HEAD' && request.nextUrl.pathname.startsWith('/api/media/file/')) {
    try {
      return await handleMediaHead(request)
    } catch {
      // 探测失败就放行，让下游按原样处理 —— 不能因为一个 HEAD 探测而影响正常请求
    }
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/projects/:path*',
    '/products/:path*',
    '/capabilities/:path*',
    '/membership/:path*',
    '/settings/:path*',
    '/ai/:path*',
    '/quotes/:path*',
    // HEAD 探测：只影响 HEAD 请求（GET 仍由 Payload 直接处理，不走这里）
    '/api/media/file/:path*',
  ],
}
