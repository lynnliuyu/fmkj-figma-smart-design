import { appAuth } from '@/lib/app-auth'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return Response.json({ error: '请输入邮箱和密码' }, { status: 400 })
  }

  const result = await appAuth.login(email, password)
  if (!result.ok) return Response.json({ error: result.error }, { status: 401 })
  return Response.json({ ok: true })
}
