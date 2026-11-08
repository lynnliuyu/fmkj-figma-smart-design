import { APIError, ValidationError } from 'payload'

import { relId } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload'
import { canManageProject, type CollaboratorItem } from '@/lib/project-access'
import { DEFAULT_PLATFORM, isProjectPlatform } from '@/lib/projects'
import type { Project, User } from '@/payload-types'

/** 项目保存规则（网页表单和小程序共用）：只接受白名单字段；名称留空时由集合按小区、房号或客户姓名自动生成。 */
export type ProjectSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const str = (input: Record<string, unknown>, key: string, max: number) => {
  const raw = input[key]
  const v = raw === null || raw === undefined ? '' : String(raw).trim()
  return v === '__none' ? '' : v.slice(0, max)
}

export function parseProjectInput(input: Record<string, unknown>) {
  const fieldErrors: Record<string, string> = {}
  const budgetRaw = str(input, 'budget', 20)
  const budget = budgetRaw ? Number(budgetRaw) : null
  if (budget !== null && (!Number.isFinite(budget) || budget < 0))
    fieldErrors.budget = '预算需为非负数字'
  const platformRaw = str(input, 'platform', 40)
  if (platformRaw && !isProjectPlatform(platformRaw)) fieldErrors.platform = '取值无效'
  const data = {
    name: str(input, 'name', 120),
    customerName: str(input, 'customerName', 60) || null,
    customerPhone: str(input, 'customerPhone', 30) || null,
    community: str(input, 'community', 80) || null,
    address: str(input, 'address', 200) || null,
    platform: (platformRaw || DEFAULT_PLATFORM) as Project['platform'],
    budget,
    notes: str(input, 'notes', 2000) || null,
  }
  return { data, owner: str(input, 'owner', 64), fieldErrors }
}

function toFailure(error: unknown): ProjectSaveResult {
  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {}
    for (const e of error.data?.errors ?? []) fieldErrors[e.path] = e.message
    return { ok: false, error: '有字段未通过校验，请检查后重试', fieldErrors }
  }
  if (error instanceof APIError && error.status < 500) return { ok: false, error: error.message }
  const status = (error as { status?: number })?.status
  if (status === 403) return { ok: false, error: '没有权限修改这个项目' }
  if (status === 404) return { ok: false, error: '项目不存在或已被删除' }
  console.error('[projects] save failed', error)
  return { ok: false, error: '保存失败，请稍后重试' }
}

/** 新建（id 为空）或修改项目。负责人只能是启用中的成员；新建时默认负责人是自己。 */
export async function saveProjectInput(
  user: User,
  id: string | null,
  input: Record<string, unknown>,
): Promise<ProjectSaveResult> {
  const { data, owner, fieldErrors } = parseProjectInput(input)
  if (Object.keys(fieldErrors).length) return { ok: false, error: '请检查标记的字段', fieldErrors }

  const payload = await getPayloadClient()
  const ownerProvided = Object.prototype.hasOwnProperty.call(input, 'owner')
  if (id && ownerProvided) {
    const existing = await payload
      .findByID({
        collection: 'projects',
        id,
        depth: 0,
        user,
        overrideAccess: false,
        select: { owner: true, collaborators: true },
      })
      .catch(() => null)
    if (!existing) return { ok: false, error: '项目不存在或已被删除' }
    const currentOwnerId = relId(existing.owner)
    if ((owner || '') !== (currentOwnerId || '')) {
      if (!canManageProject(existing as never, user.id)) {
        return { ok: false, error: '只有项目创建者（负责人）可以转让负责人' }
      }
      if (owner) {
        const collabs =
          (existing as unknown as { collaborators?: CollaboratorItem[] | null }).collaborators ?? []
        const allowedIds = new Set<string>([
          String(user.id),
          ...(currentOwnerId ? [currentOwnerId] : []),
          ...collabs.map((c) => relId(c.user)).filter((x): x is string => Boolean(x)),
        ])
        if (!allowedIds.has(owner)) {
          return {
            ok: false,
            error: '请检查标记的字段',
            fieldErrors: { owner: '只能将负责人转让给已加入该项目的协作者' },
          }
        }
      }
    }
  }
  if (owner) {
    const found = await payload.find({
      collection: 'users',
      where: { and: [{ id: { equals: owner } }, { status: { equals: 'active' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { name: true },
    })
    if (!found.docs.length)
      return {
        ok: false,
        error: '请检查标记的字段',
        fieldErrors: { owner: '负责人不存在或已停用' },
      }
  }

  try {
    // 表单里出现 owner 字段（哪怕为空）才修改负责人；小程序只改资料时不带这个字段
    const doc = id
      ? await payload.update({
          collection: 'projects',
          id,
          data: { ...data, ...(ownerProvided ? { owner: owner || null } : {}) },
          user,
          overrideAccess: false,
          depth: 0,
          select: { name: true },
        })
      : await payload.create({
          collection: 'projects',
          data: { ...data, owner: owner || user.id, status: 'active' },
          user,
          overrideAccess: false,
          depth: 0,
          select: { name: true },
        })
    return { ok: true, id: String(doc.id) }
  } catch (error) {
    return toFailure(error)
  }
}

/** 归档 / 恢复项目（归档后点位、报价、合同只读，由集合 hook 保证）。 */
export async function setProjectStatus(
  user: User,
  id: string,
  status: 'active' | 'archived',
): Promise<ProjectSaveResult> {
  try {
    const payload = await getPayloadClient()
    const doc = await payload.update({
      collection: 'projects',
      id,
      data: { status },
      user,
      overrideAccess: false,
      depth: 0,
      select: { name: true },
    })
    return { ok: true, id: String(doc.id) }
  } catch (error) {
    return toFailure(error)
  }
}
