import { appAuth } from '@/lib/app-auth'

export async function POST() {
  await appAuth.logout()
  // 用相对路径跳转，避免拼出沙箱内部地址
  return new Response(null, { status: 303, headers: { location: '/login' } })
}
