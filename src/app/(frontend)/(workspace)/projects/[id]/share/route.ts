import { randomBytes } from 'node:crypto'

import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import {
  getProjectRole,
  parseShareConfig,
  type CollaboratorItem,
  type CollaboratorRole,
} from '@/lib/project-access'
import type { User } from '@/payload-types'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

async function loadProjectWithUsers(projectId: string) {
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id: projectId,
      depth: 1,
      overrideAccess: true,
      populate: { users: { name: true, email: true } },
    })
    .catch(() => null)
  return { payload, project }
}

function serializeCollaborators(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const c = item as CollaboratorItem
      const u = typeof c.user === 'object' && c.user ? (c.user as User) : null
      const userId = relId(c.user)
      if (!userId) return null
      return {
        userId,
        name: u?.name ?? '协作成员',
        email: u?.email ?? '',
        role: c.role === 'edit' ? ('edit' as const) : ('read' as const),
        joinedAt: c.joinedAt ?? null,
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
}

/** 读取项目当前的协作配置、创建者信息和协作者列表。 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')
  const { id } = await context.params
  const { payload, project } = await loadProjectWithUsers(id)
  if (!project) return fail(404, '项目不存在')

  const rawProj = project as unknown as {
    owner?: unknown
    collaborators?: CollaboratorItem[] | null
    shareConfig?: unknown
  }
  const role = getProjectRole(
    { owner: project.owner, collaborators: rawProj.collaborators },
    user.id,
  )
  if (!role) return fail(403, '你没有该项目的访问权限')

  let shareConfig = parseShareConfig(rawProj.shareConfig)

  // 仅当项目管理员（owner）首次打开时将自动生成的 token 持久化到项目中
  if (
    role === 'owner' &&
    (!rawProj.shareConfig ||
      typeof (rawProj.shareConfig as { token?: unknown })?.token !== 'string')
  ) {
    await payload
      .update({
        collection: 'projects',
        id: project.id,
        data: { shareConfig } as never,
        overrideAccess: true,
        depth: 0,
      })
      .catch(() => null)
  }

  const ownerObj =
    typeof project.owner === 'object' && project.owner ? (project.owner as User) : null
  return Response.json({
    ok: true,
    role,
    owner: {
      id: relId(project.owner),
      name: ownerObj?.name ?? '项目创建者',
      email: ownerObj?.email ?? '',
    },
    shareConfig:
      role === 'owner'
        ? shareConfig
        : { enabled: shareConfig.enabled, role: shareConfig.role, token: '' },
    collaborators: serializeCollaborators(rawProj.collaborators),
  })
}

/** 更新协作链接配置、修改协作者权限、移除协作者或退出协作。 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')
  const { id } = await context.params
  const { payload, project } = await loadProjectWithUsers(id)
  if (!project) return fail(404, '项目不存在')

  const rawProj = project as unknown as {
    owner?: unknown
    collaborators?: CollaboratorItem[] | null
    shareConfig?: unknown
  }
  const myRole = getProjectRole(
    { owner: project.owner, collaborators: rawProj.collaborators },
    user.id,
  )
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'config' | 'collaborator' | 'leave'
    enabled?: boolean
    role?: CollaboratorRole
    resetToken?: boolean
    userId?: string
    remove?: boolean
  }

  if (body.action === 'leave') {
    const nextCollabs = (rawProj.collaborators ?? [])
      .filter((c) => relId(c.user) !== String(user.id))
      .map((c) => ({ user: relId(c.user)!, role: c.role, joinedAt: c.joinedAt ?? null }))
    await payload.update({
      collection: 'projects',
      id: project.id,
      data: { collaborators: nextCollabs } as never,
      overrideAccess: true,
      depth: 0,
    })
    return Response.json({ ok: true })
  }

  if (myRole !== 'owner') {
    return fail(403, '只有项目创建者（管理员）可以修改协作权限')
  }

  if (body.action === 'config') {
    const current = parseShareConfig(rawProj.shareConfig)
    const nextConfig = {
      enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
      role: body.role === 'edit' || body.role === 'read' ? body.role : current.role,
      token: body.resetToken ? randomBytes(16).toString('base64url') : current.token,
    }
    await payload.update({
      collection: 'projects',
      id: project.id,
      data: { shareConfig: nextConfig } as never,
      overrideAccess: true,
      depth: 0,
    })
    return Response.json({ ok: true, shareConfig: nextConfig })
  }

  if (body.action === 'collaborator' && body.userId) {
    const targetId = String(body.userId)
    const currentList = rawProj.collaborators ?? []
    const nextCollabs = body.remove
      ? currentList.filter((c) => relId(c.user) !== targetId)
      : currentList.map((c) =>
          relId(c.user) === targetId
            ? { ...c, role: body.role === 'edit' ? ('edit' as const) : ('read' as const) }
            : c,
        )
    const updated = await payload.update({
      collection: 'projects',
      id: project.id,
      data: {
        collaborators: nextCollabs.map((c) => ({
          user: relId(c.user)!,
          role: c.role,
          joinedAt: c.joinedAt ?? null,
        })),
      } as never,
      overrideAccess: true,
      depth: 1,
      populate: { users: { name: true, email: true } },
    })
    const updatedRaw = updated as unknown as { collaborators?: CollaboratorItem[] | null }
    return Response.json({
      ok: true,
      collaborators: serializeCollaborators(updatedRaw.collaborators),
    })
  }

  return fail(400, '无效的协作操作')
}
