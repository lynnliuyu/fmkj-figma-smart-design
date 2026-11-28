import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { LIGHTING_DESIGNS, SCENE_CARDS, STAGES, TIERS } from '@/lib/need-flow'
import { lockRow } from '@/lib/pg-row-lock'
import type { Project, User } from '@/payload-types'

import { deviceName } from './need-service'

const projectIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const ticketPattern = /^(\d{13})\.([\w-]{43})$/
const ticketLifetimeMs = 15 * 60 * 1000

// Scope stays separate from general project access. Select no contact data or free-form notes.
const fromPool = sql`
  FROM projects p
  JOIN LATERAL (
    SELECT n.structured, n.pricing, n.updated_at
    FROM need_leads n
    WHERE n.project_id = p.id AND n.status = 'converted' AND n.owner_id IS NULL
    ORDER BY n.updated_at DESC, n.id DESC LIMIT 1
  ) n ON true
  WHERE p.status = 'active' AND p.owner_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM projects_collaborators c WHERE c._parent_id = p.id AND c.user_id IS NOT NULL)
`
const summaryFields = sql`
  p.id, p.community, p.budget,
  n.structured #> '{house,area}' AS area,
  COALESCE(n.pricing ->> 'at', n.updated_at::text) AS "submittedAt",
  CASE WHEN jsonb_typeof(n.pricing -> 'pendingPrice') = 'array'
    THEN jsonb_array_length(n.pricing -> 'pendingPrice') ELSE 0 END AS "pendingPriceCount"
`

type PoolRow = {
  id: Project['id']
  community: string | null
  budget: string | null
  area: unknown
  submittedAt: string
  pendingPriceCount: number
  total: number
}

function presentSummary(row: PoolRow) {
  return {
    id: row.id,
    community: row.community,
    budget: row.budget === null ? null : Number(row.budget),
    area: typeof row.area === 'number' ? row.area : null,
    submittedAt: row.submittedAt,
    pendingPriceCount: row.pendingPriceCount,
  }
}

export async function listNeedProjectPool(
  payload: Payload,
  page: number,
  limit: number,
  query: string,
) {
  const { drizzle } = payload.db as unknown as PostgresAdapter
  const filter = query.replace(/[\\%_]/g, '\\$&')
  const { rows } = await drizzle.execute<PoolRow>(sql`
    SELECT ${summaryFields}, count(*) over()::int AS total ${fromPool}
    ${filter ? sql`AND p.community ILIKE ${`%${filter}%`}` : sql``}
    ORDER BY "submittedAt" DESC, p.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `)
  const total = rows[0]?.total ?? 0
  return {
    items: rows.map(presentSummary),
    page,
    total,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  }
}

function ticketFor(secret: string, projectId: Project['id'], userId: User['id'], expires: number) {
  const signature = createHmac('sha256', secret)
    .update(`need-project-claim:${projectId}:${userId}:${expires}`)
    .digest('base64url')
  return `${expires}.${signature}`
}

export async function readNeedProjectPool(payload: Payload, id: Project['id'], userId: User['id']) {
  if (!projectIdPattern.test(id)) return null
  const { drizzle } = payload.db as unknown as PostgresAdapter
  const {
    rows: [row],
  } = await drizzle.execute<
    PoolRow & {
      houseType: string | null
      bedrooms: unknown
      livingRooms: unknown
      stage: string | null
      lighting: string | null
      tier: string | null
      scenes: unknown
      pendingDeviceTypes: string[] | null
    }
  >(sql`
    SELECT ${summaryFields},
      n.structured #>> '{house,type}' AS "houseType",
      n.structured #> '{house,bedrooms}' AS bedrooms,
      n.structured #> '{house,livingRooms}' AS "livingRooms",
      n.structured #>> '{house,stage}' AS stage,
      n.structured ->> 'lighting' AS lighting,
      n.structured ->> 'tier' AS tier,
      n.structured -> 'sceneCards' AS scenes,
      jsonb_path_query_array(n.pricing, '$.pendingPrice[*].deviceType ? (@.type() == "string")') AS "pendingDeviceTypes"
    ${fromPool} AND p.id = ${id}
  `)
  if (!row) return null
  const house = row.houseType === 'villa' ? '别墅' : row.houseType === 'duplex' ? '复式' : '平层'
  const rooms =
    typeof row.bedrooms === 'number' && typeof row.livingRooms === 'number'
      ? ` ${row.bedrooms}室${row.livingRooms}厅`
      : ''
  const stage = STAGES.find((item) => item.value === row.stage)?.label
  const lighting = LIGHTING_DESIGNS.find((item) => item.value === row.lighting)?.label
  const tier = TIERS.find((item) => item.value === row.tier)?.label
  const selectedScenes: unknown[] = Array.isArray(row.scenes) ? row.scenes : []
  const scenes = SCENE_CARDS.filter((item) => selectedScenes.includes(item.value)).map(
    (item) => item.label,
  )
  return {
    ...presentSummary(row),
    pendingPriceCategories: (row.pendingDeviceTypes ?? []).map(deviceName),
    summary: [
      `${house}${rooms}`,
      stage && `装修阶段：${stage}`,
      lighting && `灯光：${lighting}`,
      tier && `档次：${tier}`,
      scenes.length > 0 && `场景：${scenes.join('、')}`,
    ]
      .filter(Boolean)
      .join('\n'),
    claimTicket: ticketFor(payload.secret, id, userId, Date.now() + ticketLifetimeMs),
  }
}

export async function claimNeedProject(
  payload: Payload,
  id: Project['id'],
  userId: User['id'],
  ticket: string,
) {
  const expires = Number(ticketPattern.exec(ticket)?.[1])
  if (!projectIdPattern.test(id) || !(expires > Date.now())) return { status: 'missing' } as const
  const expected = ticketFor(payload.secret, id, userId, expires)
  if (!timingSafeEqual(Buffer.from(ticket), Buffer.from(expected)))
    return { status: 'missing' } as const

  const transactionID = await payload.db.beginTransaction()
  if (transactionID == null)
    throw new Error('Claiming a need project requires a database transaction')
  try {
    // Keep the row eligible for the locking read after another claimant writes owner.
    const [row] = await lockRow(
      payload,
      transactionID,
      sql`
      SELECT p.owner_id FROM projects p
      WHERE p.id = ${id} AND p.status = 'active'
        AND EXISTS (SELECT 1 FROM need_leads n WHERE n.project_id = p.id AND n.status = 'converted' AND n.owner_id IS NULL)
        AND NOT EXISTS (SELECT 1 FROM projects_collaborators c WHERE c._parent_id = p.id AND c.user_id IS NOT NULL)
      FOR UPDATE OF p
    `,
    )
    let result: { status: 'missing' | 'claimed' } | { status: 'taken'; name: string }
    if (!row) {
      result = { status: 'missing' }
    } else if (typeof row.owner_id === 'string') {
      // Only a member who obtained a ticket while this project was in the pool sees the claimant name.
      const [owner] = await lockRow(
        payload,
        transactionID,
        sql`SELECT name FROM users WHERE id = ${row.owner_id}`,
      )
      result = {
        status: 'taken',
        name: typeof owner?.name === 'string' && owner.name ? owner.name : '其他销售',
      }
    } else {
      await payload.update({
        collection: 'projects',
        id,
        data: { owner: userId },
        overrideAccess: true,
        depth: 0,
        req: { transactionID },
      })
      result = { status: 'claimed' }
    }
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
