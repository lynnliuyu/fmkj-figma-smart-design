import { relId } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload'
import { fail, mpRoute, ok, readJson } from '@/lib/mp/http'
import { presentQuote } from '@/lib/mp/present'
import { deleteQuoteById, saveQuoteInput, type QuoteInput } from '@/lib/services/quote-service'
import type { Project, Quote } from '@/payload-types'

/** 报价详情（含产品图）；已用于已签订合同或项目已归档时为只读。 */
export const GET = mpRoute<{ id: string }>(async ({ user, params }) => {
  const payload = await getPayloadClient()
  const quote = (await payload
    .findByID({
      collection: 'quotes',
      id: params.id,
      depth: 1,
      user,
      overrideAccess: false,
      populate: { projects: { name: true, status: true }, products: { name: true } },
    })
    .catch(() => null)) as Quote | null
  if (!quote) return fail(404, '报价不存在或已被删除')
  const project =
    quote.project && typeof quote.project === 'object' ? (quote.project as Project) : null
  const contracts = project
    ? await payload.find({
        collection: 'contracts',
        where: { project: { equals: project.id } },
        limit: 1,
        depth: 0,
        user,
        overrideAccess: false,
        select: { number: true, status: true, quote: true },
      })
    : { docs: [] }
  const contract = contracts.docs[0] ?? null
  const usesThisQuote = Boolean(contract && relId(contract.quote) === String(quote.id))
  const lockReason =
    project?.status === 'archived'
      ? '项目已归档，报价只读'
      : usesThisQuote && contract?.status === 'signed'
        ? `这份报价已用于已签订的合同 ${contract.number}，内容已锁定`
        : null
  return ok({
    quote: presentQuote(quote),
    project: project
      ? { id: String(project.id), name: project.name, archived: project.status === 'archived' }
      : null,
    contract: contract
      ? { id: String(contract.id), number: contract.number, status: contract.status, usesThisQuote }
      : null,
    readOnly: Boolean(lockReason),
    lockReason,
    printPath: `/print/quotes/${quote.id}`,
  })
})

/** 保存报价：{ title, status, discount, notes, items: [{ id?, product?, name, sku, unit, price, quantity }], fees: [{ name, amount }] } */
export const PUT = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const r = await saveQuoteInput(
    user,
    params.id,
    (await readJson(request)) as unknown as QuoteInput,
  )
  return r.ok ? ok({ total: r.total }) : fail(400, r.error)
})

export const DELETE = mpRoute<{ id: string }>(async ({ user, params }) => {
  const r = await deleteQuoteById(user, params.id)
  return r.ok ? ok() : fail(400, r.error)
})
