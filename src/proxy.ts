import { NextResponse, type NextRequest } from 'next/server'

/**
 * 只给需要登录的工作台页面带上当前地址（请求头 x-pathname）。
 * 未登录时页面据此跳到 /login?from=原地址，登录后回到原页面（见 src/lib/login-redirect.ts）。
 * 不做鉴权判断：每个页面、接口和 Server Action 仍各自校验登录与权限。
 */
export function proxy(request: NextRequest) {
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
  ],
}
