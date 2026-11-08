import { fail, mpRoute, ok } from '@/lib/mp/http'
import { presentPointMap } from '@/lib/mp/present'
import { parseDefaults } from '@/lib/point-map-items'
import { isPointScope, loadProjectDocs } from '@/lib/project-docs'
import { getPluginFlags } from '@/plugins/state'

/** 点位图：?scope=all|no-light|switch|switch-light&quoteId=（型号和单价跟随关联报价）。 */
export const GET = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const sp = new URL(request.url).searchParams
  const scope = isPointScope(sp.get('scope')) ? (sp.get('scope') as 'all') : 'all'
  const d = await loadProjectDocs(params.id, user, scope, sp.get('quoteId'))
  if (!d) return fail(404, '项目不存在或已被删除')
  const flags = await getPluginFlags(d.owner?.id ?? user.id)
  return ok({
    project: {
      id: String(d.project.id),
      name: d.project.name,
      status: d.project.status,
      platform: d.project.platform ?? null,
    },
    scope,
    readOnly: d.project.status === 'archived',
    smartSelect: Boolean(flags['smart-select']),
    defaults: parseDefaults(d.project.defaultProducts),
    ...presentPointMap(d),
  })
})
