import { fail, mpRoute, ok, readJson } from '@/lib/mp/http'
import { presentContract, presentProject } from '@/lib/mp/present'
import { presentProjectTemplates } from '@/lib/mp/templates'
import { loadProjectDocs } from '@/lib/project-docs'
import { quoteStatusLabel } from '@/lib/quotes'
import { saveProjectInput, setProjectStatus } from '@/lib/services/project-service'
import { getPluginFlags } from '@/plugins/state'

/** 项目详情：资料、进度、点位与预算概况、报价、合同、可打印的文档。 */
export const GET = mpRoute<{ id: string }>(async ({ user, params }) => {
  const d = await loadProjectDocs(params.id, user, 'all')
  if (!d) return fail(404, '项目不存在或已被删除')
  const flags = await getPluginFlags(d.owner?.id ?? user.id)
  const id = String(d.project.id)
  const latestQuote = d.quotes[0] ?? null
  // 交付方案模板（小程序项目页的「方案模板」卡片与抽屉）
  const templates = flags.proposal ? await presentProjectTemplates(user, d.proposalTemplate) : null
  const tpl = templates?.current ?? null
  return ok({
    project: presentProject(d.project, {
      quoteCount: d.quotes.length,
      contractStatus: d.contract?.status ?? null,
      pointCount: d.points.length,
    }),
    owner: d.owner
      ? { id: String(d.owner.id), name: d.owner.name, phone: d.owner.phone ?? null }
      : null,
    summary: {
      points: d.points.length,
      rooms: d.rooms.length,
      sheets: d.sheets.length,
      total: d.total,
      pending: d.pending,
      categories: d.categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        color: c.color,
        count: c.count,
        amount: c.amount,
      })),
      floors: d.floors.map((f) => ({
        name: f.floorName,
        sheetName: f.sheetName,
        points: f.pointCount,
        rooms: f.roomCount,
        subtotal: f.subtotal,
      })),
    },
    quotes: d.quotes.map((q) => ({
      id: q.id,
      title: q.title,
      total: q.total,
      status: q.status,
      statusLabel: quoteStatusLabel(q.status),
      scope: q.scope,
    })),
    contract: d.contract ? presentContract(d.contract) : null,
    proposal: tpl
      ? {
          slug: tpl.slug,
          label: tpl.label,
          thumb: tpl.thumb,
          audience: tpl.audience,
          chosen: templates!.chosen,
          count: templates!.options.length,
        }
      : null,
    documents: [
      {
        key: 'plans',
        title: '点位图',
        note: '每张图纸一页，附设备图例和统计',
        path: `/print/projects/${id}/plans`,
      },
      {
        key: 'checklist',
        title: '点位交底清单',
        note: '给安装团队逐点核对',
        path: `/print/projects/${id}/checklist`,
      },
      ...(tpl
        ? [
            {
              key: 'proposal',
              title: '方案演示',
              note: `${tpl.label} · 横版多页方案`,
              path: `/print/projects/${id}/proposal?template=${encodeURIComponent(tpl.slug)}`,
            },
          ]
        : []),
      ...(latestQuote
        ? [
            {
              key: 'quote',
              title: '报价单',
              note: latestQuote.title,
              path: `/print/quotes/${latestQuote.id}`,
            },
          ]
        : []),
      ...(d.contract
        ? [
            {
              key: 'contract',
              title: '合同',
              note: d.contract.number,
              path: `/print/contracts/${d.contract.id}`,
            },
          ]
        : []),
      ...(flags['after-sales']
        ? [
            {
              key: 'after-sales',
              title: '售后维保卡',
              note: '质保权益、设备台账与维保记录',
              path: `/print/projects/${id}/after-sales`,
            },
          ]
        : []),
    ],
  })
})

/** 修改项目资料；body.status = archived / active 时为归档 / 恢复。 */
export const PUT = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const body = await readJson(request)
  if (body.status === 'archived' || body.status === 'active') {
    const r = await setProjectStatus(user, params.id, body.status)
    return r.ok ? ok({ id: r.id }) : fail(400, r.error)
  }
  delete body.owner
  const result = await saveProjectInput(user, params.id, body)
  if (!result.ok)
    return Response.json(
      { ok: false, error: result.error, fieldErrors: result.fieldErrors },
      { status: 400 },
    )
  return ok({ id: result.id })
})
