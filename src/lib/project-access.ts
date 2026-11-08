import { randomBytes } from 'node:crypto'

import { relId } from '@/lib/access'
import type { Project, User } from '@/payload-types'

export type ProjectRole = 'owner' | 'edit' | 'read'
export type CollaboratorRole = 'edit' | 'read'

export type ShareConfig = {
  enabled: boolean
  token: string
  role: CollaboratorRole
}

export type CollaboratorItem = {
  id?: string | null
  user: string | number | User
  role: CollaboratorRole
  joinedAt?: string | null
}

export function parseShareConfig(raw: unknown): ShareConfig {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>
    const token =
      typeof r.token === 'string' && r.token.trim().length >= 12
        ? r.token.trim()
        : randomBytes(16).toString('base64url')
    const role: CollaboratorRole = r.role === 'edit' ? 'edit' : 'read'
    const enabled = r.enabled !== false
    return { enabled, token, role }
  }
  return {
    enabled: true,
    token: randomBytes(16).toString('base64url'),
    role: 'read',
  }
}

/**
 * 业主分享链接凭证的严格比对：项目必须已保存分享配置、未关闭链接，且凭证完全一致。
 * 与 parseShareConfig 不同，这里不会为缺失的配置临时生成新凭证。
 */
export function shareLinkMatches(raw: unknown, token: unknown): boolean {
  if (typeof token !== 'string' || token.trim().length < 12) return false
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const r = raw as Record<string, unknown>
  return r.enabled !== false && typeof r.token === 'string' && r.token.trim() === token.trim()
}

/**
 * 计算当前成员在指定项目上的角色：
 * - owner：项目创建者（或旧数据未记录 owner 的项目）
 * - edit：可编辑协作者
 * - read：仅查看协作者
 * - null：无权访问该项目
 */
export function getProjectRole(
  project: Pick<Project, 'owner'> & { collaborators?: CollaboratorItem[] | null },
  userId: string | number | null | undefined,
): ProjectRole | null {
  if (!userId) return null
  const uid = String(userId)
  const ownerId = relId(project.owner)
  if (ownerId && ownerId === uid) return 'owner'
  const collab = (project.collaborators ?? []).find((c) => relId(c.user) === uid)
  if (!collab) return null
  return collab.role === 'edit' ? 'edit' : 'read'
}

export function canReadProject(
  project: Pick<Project, 'owner'> & { collaborators?: CollaboratorItem[] | null },
  userId: string | number | null | undefined,
): boolean {
  return getProjectRole(project, userId) !== null
}

export function canEditProject(
  project: Pick<Project, 'owner'> & { collaborators?: CollaboratorItem[] | null },
  userId: string | number | null | undefined,
): boolean {
  const role = getProjectRole(project, userId)
  return role === 'owner' || role === 'edit'
}

export function canManageProject(
  project: Pick<Project, 'owner'> & { collaborators?: CollaboratorItem[] | null },
  userId: string | number | null | undefined,
): boolean {
  return getProjectRole(project, userId) === 'owner'
}

export function roleLabel(role: ProjectRole): string {
  if (role === 'owner') return '项目管理员'
  if (role === 'edit') return '可编辑'
  return '仅查看'
}
