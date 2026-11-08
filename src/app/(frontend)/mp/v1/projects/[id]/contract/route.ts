import { getPayloadClient } from '@/lib/payload'
import { fail, mpRoute, ok, readJson, text } from '@/lib/mp/http'
import { presentContract, presentQuoteSummary } from '@/lib/mp/present'
import { createContractFromQuote } from '@/lib/services/contract-service'

/** 项目的合同（每个项目一份）以及可用于生成合同的报价。 */
export const GET = mpRoute<{ id: string }>(async ({ user, params }) => {
  const payload = await getPayloadClient()
  const [project, contracts, quotes] = await Promise.all([
    payload
      .findByID({
        collection: 'projects',
        id: params.id,
        depth: 0,
        user,
        overrideAccess: false,
        select: { name: true, status: true },
      })
      .catch(() => null),
    payload.find({
      collection: 'contracts',
      where: { project: { equals: params.id } },
      limit: 1,
      depth: 0,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'quotes',
      where: { project: { equals: params.id } },
      sort: '-updatedAt',
      limit: 100,
      depth: 0,
      user,
      overrideAccess: false,
      select: { title: true, status: true, total: true, updatedAt: true },
    }),
  ])
  if (!project) return fail(404, '项目不存在或已被删除')
  return ok({
    project: {
      id: String(project.id),
      name: project.name,
      archived: project.status === 'archived',
    },
    contract: contracts.docs[0] ? presentContract(contracts.docs[0]) : null,
    quotes: quotes.docs.map(presentQuoteSummary),
  })
})

/** 用一份报价生成合同：{ quoteId } */
export const POST = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const body = await readJson(request)
  const r = await createContractFromQuote(user, params.id, text(body.quoteId, 64))
  return r.ok ? ok({ id: r.id }) : fail(400, r.error)
})
