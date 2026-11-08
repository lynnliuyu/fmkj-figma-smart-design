import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { parseShareConfig, type CollaboratorItem } from '@/lib/project-access'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/**
 * 接受项目协作邀请：
 * 仅允许已由后台开通的成员账号（已登录，或通过 mode=login 验证邮箱密码）加入项目协作者列表；
 * 不开放陌生访客自助注册，防止通过分享链接越权进入工作区。
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as {
    token?: string
    mode?: 'current' | 'login'
    email?: string
    password?: string
  }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return fail(400, '协作邀请链接缺少凭证')

  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      overrideAccess: true,
      select: { name: true, owner: true, collaborators: true, shareConfig: true },
    })
    .catch(() => null)
  if (!project) return fail(404, '项目不存在或已被删除')

  const rawProj = project as unknown as {
    owner?: unknown
    collaborators?: CollaboratorItem[] | null
    shareConfig?: unknown
  }
  const shareConfig = parseShareConfig(rawProj.shareConfig)
  if (!shareConfig.enabled || shareConfig.token !== token) {
    return fail(403, '该协作链接已失效或已被项目管理员关闭')
  }

  let user = await appAuth.getCurrentUser()
  if (body.mode === 'login') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) return fail(400, '请输入邮箱和密码')
    const res = await appAuth.login(email, password)
    if (!res.ok) return fail(401, res.error)
    user = await appAuth.getCurrentUser()
  }

  if (!user) return fail(401, '请先使用已有成员账号登录以加入项目协作')

  const uid = String(user.id)
  const ownerId = relId(project.owner)
  if (ownerId && ownerId !== uid) {
    const currentCollabs = (rawProj.collaborators ?? []).map((c) => ({
      user: relId(c.user)!,
      role: c.role,
      joinedAt: c.joinedAt ?? new Date().toISOString(),
    }))
    const existingIdx = currentCollabs.findIndex((c) => c.user === uid)
    if (existingIdx >= 0) {
      // 如果新链接是 edit 权限，升级已有 read 协作者的权限
      if (shareConfig.role === 'edit' && currentCollabs[existingIdx].role !== 'edit') {
        currentCollabs[existingIdx].role = 'edit'
      }
    } else {
      currentCollabs.push({
        user: uid,
        role: shareConfig.role,
        joinedAt: new Date().toISOString(),
      })
    }
    await payload.update({
      collection: 'projects',
      id: project.id,
      data: { collaborators: currentCollabs } as never,
      overrideAccess: true,
      depth: 0,
    })
  }

  return Response.json({
    ok: true,
    projectId: String(project.id),
    role: !ownerId || ownerId === uid ? 'owner' : shareConfig.role,
  })
}
