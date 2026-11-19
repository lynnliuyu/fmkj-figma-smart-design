import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { lockRow } from '@/lib/pg-row-lock'
import type { NeedLead } from '@/payload-types'

const signedToken = /^d1_([\w-]{22})\.([\w-]{43})$/

function signature(nonce: string, secret: string) {
  return createHmac('sha256', secret).update(`need-draft:${nonce}`).digest('base64url')
}

export function issueNeedToken(secret: string) {
  const nonce = randomBytes(16).toString('base64url')
  return `d1_${nonce}.${signature(nonce, secret)}`
}

export function isIssuedNeedToken(token: string, secret: string) {
  const match = signedToken.exec(token)
  return Boolean(
    match && timingSafeEqual(Buffer.from(match[2]!), Buffer.from(signature(match[1]!, secret))),
  )
}

export function needAnswers(lead: NeedLead | undefined): Record<string, unknown> {
  return (lead?.answers ?? {}) as Record<string, unknown>
}

// The timestamp distinguishes successive edits that return to an earlier set of answers.
export function needRevision(lead: NeedLead) {
  const json = JSON.stringify(
    [lead.updatedAt, lead.source, lead.phone, lead.status, needAnswers(lead)],
    (_key, value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value
      const record = value as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, record[key]]),
      )
    },
  )
  return createHash('sha256').update(json).digest('base64url')
}

export async function findNeedDraft(
  payload: Payload,
  token: string,
  req?: Partial<PayloadRequest>,
) {
  const found = await payload.find({
    collection: 'need-leads',
    where: { token: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return found.docs[0]
}

export async function withNeedDraft<T>(
  payload: Payload,
  token: string,
  run: (lead: NeedLead | undefined, req: Partial<PayloadRequest>) => Promise<T>,
) {
  const transactionID = await payload.db.beginTransaction()
  if (transactionID == null) throw new Error('Need draft requires a database transaction')
  const req = { transactionID }
  try {
    // Also lock before the first insert, when there is no row to lock yet.
    await lockRow(
      payload,
      transactionID,
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`need-draft:${token}`}, 0))`,
    )
    const result = await run(await findNeedDraft(payload, token, req), req)
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
