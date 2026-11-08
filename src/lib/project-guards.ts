import { APIError, type PayloadRequest } from 'payload'

import { isMember } from '@/lib/access'
import { canEditProject } from '@/lib/project-access'

export const ARCHIVED_MESSAGE = '项目已归档，恢复项目后才能修改'
export const READONLY_COLLAB_MESSAGE = '你对该项目仅有查看权限，无法修改'

/**
 * 成员修改报价、合同前检查所属项目：已归档的项目只读，仅查看协作者只读。
 * CMS 管理员和命令行（没有登录用户）不受限制，方便后台修正数据。
 */
export async function assertProjectEditable(req: PayloadRequest, projectId: string | null) {
  if (!isMember(req) || !projectId) return
  const project = await req.payload
    .findByID({
      collection: 'projects',
      id: projectId,
      depth: 0,
      req,
      overrideAccess: true,
      select: { status: true, owner: true, collaborators: true },
    })
    .catch(() => null)
  if (!project) throw new APIError('项目不存在或已被删除', 404)
  if (req.user && !canEditProject(project as never, req.user.id))
    throw new APIError(READONLY_COLLAB_MESSAGE, 403)
  if (project.status === 'archived') throw new APIError(ARCHIVED_MESSAGE, 403)
}

/** 集合 hook 抛出的中文提示（如「项目已归档…」）直接显示；Payload 自带的英文报错换成通用提示。 */
export const readableError = (error: unknown, fallback: string) =>
  error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : fallback
