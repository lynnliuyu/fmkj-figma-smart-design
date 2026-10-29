import { appAuth } from '@/lib/app-auth'
import { setProjectDefault } from '@/lib/project-defaults'

import { canEditProjects } from '../../../data'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/** 设置项目默认型号：{ deviceType, productId | null } */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')
  if (!canEditProjects(user.role)) return fail(403, '只读账号不能修改默认型号')
  const body = (await request.json().catch(() => null)) as { deviceType?: unknown; productId?: unknown } | null
  if (!body) return fail(400, '提交的数据格式无效')
  const { id } = await params
  const result = await setProjectDefault(user, id, body.deviceType, body.productId ?? null)
  if (!result.ok) return fail(result.status, result.error)
  return Response.json({ ok: true, defaults: result.defaults })
}
