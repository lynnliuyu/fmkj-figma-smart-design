import type { Where } from 'payload'

import { relId } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload'
import { intParam, mpRoute, ok, readJson, text } from '@/lib/mp/http'
import { fillPointCounts, presentProject } from '@/lib/mp/present'
import { saveProjectInput } from '@/lib/services/project-service'

/** 项目列表：?q=关键词&status=active|archived|all&page=1&limit=20 */
export const GET = mpRoute(async ({ request, user }) => {
  const sp = new URL(request.url).searchParams
  const q = text(sp.get('q'), 60)
  const status =
    sp.get('status') === 'archived' ? 'archived' : sp.get('status') === 'all' ? 'all' : 'active'
  const and: Where[] = []
  if (status !== 'all') and.push({ status: { equals: status } })
  if (q)
    and.push({
      or: [
        { name: { like: q } },
        { customerName: { like: q } },
        { community: { like: q } },
        { address: { like: q } },
      ],
    })
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'projects',
    where: and.length ? { and } : undefined,
    sort: '-updatedAt',
    page: intParam(sp.get('page'), 1, 1, 1000),
    limit: intParam(sp.get('limit'), 20, 1, 50),
    depth: 0,
    user,
    overrideAccess: false,
    select: {
      name: true,
      customerName: true,
      customerPhone: true,
      community: true,
      address: true,
      platform: true,
      budget: true,
      status: true,
      pointCount: true,
      updatedAt: true,
    },
  })
  const ids = res.docs.map((p) => p.id)
  const [quotes, contracts, docs] = ids.length
    ? await Promise.all([
        payload.find({
          collection: 'quotes',
          where: { project: { in: ids } },
          limit: 1000,
          depth: 0,
          user,
          overrideAccess: false,
          select: { project: true },
        }),
        payload.find({
          collection: 'contracts',
          where: { project: { in: ids } },
          limit: 100,
          depth: 0,
          user,
          overrideAccess: false,
          select: { project: true, status: true },
        }),
        fillPointCounts(res.docs, user),
      ])
    : [{ docs: [] }, { docs: [] }, []]
  return ok({
    items: docs.map((p) =>
      presentProject(p, {
        quoteCount: quotes.docs.filter((x) => relId(x.project) === String(p.id)).length,
        contractStatus:
          contracts.docs.find((c) => relId(c.project) === String(p.id))?.status ?? null,
      }),
    ),
    page: res.page ?? 1,
    totalPages: res.totalPages,
    total: res.totalDocs,
    hasMore: res.hasNextPage,
  })
})

/** 新建项目（名称留空时自动按小区 + 房号或客户姓名生成）。 */
export const POST = mpRoute(async ({ request, user }) => {
  const body = await readJson(request)
  delete body.owner
  const result = await saveProjectInput(user, null, body)
  if (!result.ok)
    return Response.json(
      { ok: false, error: result.error, fieldErrors: result.fieldErrors },
      { status: 400 },
    )
  return ok({ id: result.id })
})
