'use server'

import { redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { relId } from '@/lib/access'
import { cloneDemoProjectForUser } from '@/lib/demo-project'
import { getPayloadClient } from '@/lib/payload'
import { saveProjectInput } from '@/lib/services/project-service'

export type ProjectFormState =
  | { ok: true; id: string; savedAt: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | null

/** 项目的保存规则在 src/lib/services/project-service.ts，网页和微信小程序共用。 */
export async function saveProject(
  _prev: ProjectFormState,
  form: FormData,
): Promise<ProjectFormState> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  const input: Record<string, unknown> = {}
  for (const [key, value] of form.entries()) if (typeof value === 'string') input[key] = value
  const id = typeof input.id === 'string' ? input.id.trim().slice(0, 64) : ''
  delete input.id
  const result = await saveProjectInput(user, id || null, input)
  return result.ok ? { ok: true, id: result.id, savedAt: Date.now() } : result
}

/** 领取示例项目：没有示例项目的账号复制一份到自己名下（已有则不重复发放），完成后打开它。 */
export async function claimDemoProject() {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect('/login')
  const id = await cloneDemoProjectForUser(user.id)
  redirect(id ? `/projects/${id}` : '/projects')
}

export type DeleteProjectResult = { ok: true } | { ok: false; error: string }

/**
 * 删除项目：只有项目负责人可以删除；有已签合同的项目不能删除（请改为归档）。
 * 同时删除项目下的报价单和未签合同，AI 对话保留但解除关联。
 */
export async function deleteProject(projectId: string): Promise<DeleteProjectResult> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  const id = String(projectId ?? '')
    .trim()
    .slice(0, 64)
  if (!id) return { ok: false, error: '项目不存在' }
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { owner: true },
    })
    .catch(() => null)
  if (!project) return { ok: false, error: '项目不存在或无权访问' }
  if (relId(project.owner) !== String(user.id))
    return { ok: false, error: '只有项目负责人可以删除项目' }

  const byProject = { project: { equals: id } }
  const signed = await payload.count({
    collection: 'contracts',
    where: { and: [byProject, { status: { equals: 'signed' } }] },
    overrideAccess: true,
  })
  if (signed.totalDocs)
    return { ok: false, error: '项目已有签订的合同，不能删除。可以在「归档」中归档项目。' }

  try {
    await payload.delete({ collection: 'contracts', where: byProject, overrideAccess: true })
    await payload.delete({ collection: 'quotes', where: byProject, overrideAccess: true })
    await payload.update({
      collection: 'ai-conversations',
      where: byProject,
      data: { project: null },
      overrideAccess: true,
    })
    await payload.delete({ collection: 'projects', id, user, overrideAccess: false })
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `删除失败：${e.message}` : '删除失败，请稍后再试',
    }
  }
  return { ok: true }
}
