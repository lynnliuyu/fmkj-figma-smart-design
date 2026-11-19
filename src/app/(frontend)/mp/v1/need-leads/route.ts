import { isDeepStrictEqual } from 'node:util'

import { fail, mpPublicRoute, ok, readJson, text } from '@/lib/mp/http'
import { getPayloadClient } from '@/lib/payload'
import { consumeRateLimit, type RateLimitResult } from '@/lib/rate-limit'
import {
  isIssuedNeedToken,
  issueNeedToken,
  needAnswers,
  needRevision,
  withNeedDraft,
} from '@/lib/services/need-draft'

const ANSWER_KEYS = [
  'house',
  'lighting',
  'level',
  'security',
  'panels',
  'scenes',
  'ecosystem',
  'sceneCards',
  'budgetBand',
  'rooms',
  'deviceEdits',
] as const

const MAX_BYTES = 64 * 1024

function rateLimitResponse(limit: RateLimitResult) {
  if (limit.ok) return null
  const response = fail(429, '保存请求过多，请稍后重试', 'RATE_LIMITED')
  response.headers.set('Retry-After', String(limit.retryAfterSeconds))
  return response
}

// Keep a process-wide ceiling for new credentials/records and a separate budget for each draft.
// The ceiling limits bursts even when someone requests fresh credentials repeatedly.
export const GET = mpPublicRoute(async () => {
  const limited = rateLimitResponse(consumeRateLimit('need:issue', 240, 60_000))
  if (limited) return limited
  const payload = await getPayloadClient()
  return ok({ token: issueNeedToken(payload.secret) }, { headers: { 'Cache-Control': 'no-store' } })
})

/** The same issued token is reused on a retry, including after an unanswered first save. */
export const POST = mpPublicRoute(async (request) => {
  const body = await readJson<{
    token?: string
    revision?: string
    source?: string
    answers?: unknown
    phone?: string
  }>(request)
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES)
    return fail(413, '提交内容过大，请精简后重试')

  const token = typeof body.token === 'string' ? body.token : ''
  if (!/^[\w.-]{22,96}$/.test(token)) return fail(400, '缺少有效的需求单凭证')
  const revision = body.revision ?? ''
  if (typeof revision !== 'string' || (revision && !/^[\w-]{43}$/.test(revision))) {
    return fail(400, '需求单版本无效，请重新保存')
  }
  if (body.answers != null && (typeof body.answers !== 'object' || Array.isArray(body.answers))) {
    return fail(400, '需求答案格式不正确')
  }

  const limited = rateLimitResponse(consumeRateLimit(`need:save:${token}`, 8, 10_000))
  if (limited) return limited

  const rawAnswers = (body.answers ?? {}) as Record<string, unknown>
  const answers = Object.fromEntries(
    ANSWER_KEYS.filter((key) => Object.hasOwn(rawAnswers, key)).map((key) => [
      key,
      rawAnswers[key],
    ]),
  )
  const source =
    body.source === 'scene' || body.source === 'budget' || body.source === 'wizard'
      ? body.source
      : undefined
  const phone = text(body.phone, 30) || undefined
  const payload = await getPayloadClient()

  return withNeedDraft(payload, token, async (lead, req) => {
    if (!lead) {
      if (revision || !isIssuedNeedToken(token, payload.secret))
        return fail(404, '需求单不存在或已过期')
      const limited = rateLimitResponse(consumeRateLimit('need:create', 120, 60_000))
      if (limited) return limited
      const created = await payload.create({
        collection: 'need-leads',
        data: {
          token,
          answers,
          status: 'draft',
          ...(source ? { source } : {}),
          ...(phone ? { phone } : {}),
        },
        overrideAccess: true,
        depth: 0,
        req,
      })
      return ok({
        token,
        id: String(created.id),
        status: created.status,
        revision: needRevision(created),
      })
    }

    const current = needRevision(lead)
    const saved = needAnswers(lead)
    const merged = { ...saved, ...answers }
    const sameWrite =
      isDeepStrictEqual(merged, saved) &&
      (!source || source === lead.source) &&
      (!phone || phone === lead.phone)
    if (sameWrite) return ok({ token, id: String(lead.id), status: lead.status, revision: current })
    if (lead.status !== 'draft') return fail(409, '需求单已提交，无法继续保存', 'DRAFT_SUBMITTED')
    if (revision !== current) return fail(409, '需求单已更新，请确认后重试', 'DRAFT_CHANGED')

    const updated = await payload.update({
      collection: 'need-leads',
      id: lead.id,
      data: { answers: merged, ...(source ? { source } : {}), ...(phone ? { phone } : {}) },
      overrideAccess: true,
      req,
    })
    return ok({
      token,
      id: String(updated.id),
      status: updated.status,
      revision: needRevision(updated),
    })
  })
})
