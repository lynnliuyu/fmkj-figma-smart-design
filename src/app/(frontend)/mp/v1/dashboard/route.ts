import { getPayloadClient } from '@/lib/payload'
import { presentMe } from '@/lib/mp/auth'
import { mpRoute, ok } from '@/lib/mp/http'
import { fillPointCounts, presentProject, presentQuoteSummary } from '@/lib/mp/present'
import { relId } from '@/lib/access'

/** 工作台：关键数字、最近的项目和报价。 */
export const GET = mpRoute(async ({ user }) => {
  const payload = await getPayloadClient()
  const base = { user, overrideAccess: false as const }
  const count = (collection: 'projects' | 'quotes' | 'contracts', field: string, value: string) =>
    payload
      .count({ collection, where: { [field]: { equals: value } }, ...base })
      .then((r) => r.totalDocs)
  const [
    activeProjects,
    draftQuotes,
    sentQuotes,
    acceptedQuotes,
    draftContracts,
    signedContracts,
    recent,
    quotes,
  ] = await Promise.all([
    count('projects', 'status', 'active'),
    count('quotes', 'status', 'draft'),
    count('quotes', 'status', 'sent'),
    count('quotes', 'status', 'accepted'),
    count('contracts', 'status', 'draft'),
    count('contracts', 'status', 'signed'),
    payload.find({
      collection: 'projects',
      where: { status: { equals: 'active' } },
      sort: '-updatedAt',
      limit: 6,
      depth: 0,
      ...base,
      select: {
        name: true,
        customerName: true,
        community: true,
        address: true,
        platform: true,
        status: true,
        pointCount: true,
        updatedAt: true,
      },
    }),
    payload.find({
      collection: 'quotes',
      sort: '-updatedAt',
      limit: 5,
      depth: 1,
      ...base,
      select: { title: true, status: true, total: true, updatedAt: true, project: true },
      populate: { projects: { name: true } },
    }),
  ])
  const ids = recent.docs.map((p) => p.id)
  const [projectQuotes, projectContracts, recentDocs] = ids.length
    ? await Promise.all([
        payload.find({
          collection: 'quotes',
          where: { project: { in: ids } },
          limit: 300,
          depth: 0,
          ...base,
          select: { project: true },
        }),
        payload.find({
          collection: 'contracts',
          where: { project: { in: ids } },
          limit: 50,
          depth: 0,
          ...base,
          select: { project: true, status: true },
        }),
        fillPointCounts(recent.docs, user),
      ])
    : [{ docs: [] }, { docs: [] }, []]
  return ok({
    me: await presentMe(user),
    stats: {
      activeProjects,
      draftQuotes,
      sentQuotes,
      acceptedQuotes,
      draftContracts,
      signedContracts,
    },
    recentProjects: recentDocs.map((p) =>
      presentProject(p, {
        quoteCount: projectQuotes.docs.filter((q) => relId(q.project) === String(p.id)).length,
        contractStatus:
          projectContracts.docs.find((c) => relId(c.project) === String(p.id))?.status ?? null,
      }),
    ),
    recentQuotes: quotes.docs.map((q) => ({
      ...presentQuoteSummary(q),
      projectId: relId(q.project),
      projectName: q.project && typeof q.project === 'object' ? q.project.name : null,
    })),
  })
})
