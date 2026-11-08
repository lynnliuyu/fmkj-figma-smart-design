import { relId } from '@/lib/access'
import { fail, mpRoute, ok, readJson, text } from '@/lib/mp/http'
import { presentProjectTemplates } from '@/lib/mp/templates'
import { getPayloadClient } from '@/lib/payload'
import { canEditProject, type CollaboratorItem } from '@/lib/project-access'
import { saveDeliverables } from '@/lib/services/deliverables-service'
import type { User } from '@/payload-types'
import { getPluginFlags } from '@/plugins/state'

async function loadProject(user: User, id: string) {
  const payload = await getPayloadClient()
  return payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { owner: true, collaborators: true, status: true, proposalTemplate: true },
    })
    .catch(() => null)
}

/** 交付方案模板：可选模板（带缩略图、适用客户与会员等级）、当前模板和预览地址 */
export const GET = mpRoute<{ id: string }>(async ({ user, params }) => {
  const project = await loadProject(user, params.id)
  if (!project) return fail(404, '项目不存在或已被删除')
  const flags = await getPluginFlags(relId(project.owner) ?? user.id)
  if (!flags.proposal) return fail(403, '「方案演示」插件未启用')
  const data = await presentProjectTemplates(user, project.proposalTemplate)
  const editable =
    project.status !== 'archived' &&
    canEditProject(
      { owner: project.owner, collaborators: (project.collaborators ?? []) as CollaboratorItem[] },
      user.id,
    )
  return ok({
    ...data,
    editable,
    previewPath: data.current
      ? `/print/projects/${params.id}/proposal?template=${encodeURIComponent(data.current.slug)}`
      : null,
  })
})

/** 设置交付方案模板：body.template = 模板标识（空字符串恢复默认） */
export const PUT = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const body = await readJson(request)
  const project = await loadProject(user, params.id)
  if (!project) return fail(404, '项目不存在或已被删除')
  const flags = await getPluginFlags(relId(project.owner) ?? user.id)
  if (!flags.proposal) return fail(403, '「方案演示」插件未启用')
  const result = await saveDeliverables(user, params.id, {
    proposalTemplate: text(body.template, 60) || null,
  })
  if (!result.ok) return fail(400, result.error)
  const data = await presentProjectTemplates(user, text(body.template, 60) || null)
  return ok({
    current: data.current,
    previewPath: data.current
      ? `/print/projects/${params.id}/proposal?template=${encodeURIComponent(data.current.slug)}`
      : null,
  })
})
