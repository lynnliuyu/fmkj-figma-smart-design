import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok, readJson, text } from '@/lib/mp/http'

/** 允许业主提交的 answers 字段白名单（防注入/防塞垃圾） */
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

/** 简单限流：同 token 每 10 秒最多 1 次写入（进程内，够用） */
const lastWrite = new Map<string, number>()

function pickAnswers(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of ANSWER_KEYS) if (k in src) out[k] = src[k]
  return out
}

/**
 * 创建/更新需求草稿（免登录，凭 token）。
 * body: { token?: string; source?: 'scene'|'budget'|'wizard'; answers?: object; phone?: string }
 * 返回 { token, id, status }
 */
export const POST = mpPublicRoute(async (request) => {
  const body = await readJson<{
    token?: string
    source?: string
    answers?: Record<string, unknown>
    phone?: string
  }>(request)

  const raw = JSON.stringify(body)
  if (raw.length > MAX_BYTES) return fail(413, '提交内容过大，请精简后重试')

  const token = text(body.token, 64)
  const now = Date.now()
  const key = token || 'new'
  const prev = lastWrite.get(key) ?? 0
  if (now - prev < 10_000) return fail(429, '提交太快了，请稍后再试')
  lastWrite.set(key, now)

  const payload = await getPayloadClient()
  const answers = pickAnswers(body.answers)
  const source =
    body.source === 'scene' || body.source === 'budget' || body.source === 'wizard'
      ? body.source
      : undefined
  const phone = text(body.phone, 30) || undefined

  if (token) {
    const found = await payload.find({
      collection: 'need-leads',
      where: { token: { equals: token } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = found.docs[0]
    if (!doc) return fail(404, '需求单不存在或已过期')
    // 增量合并：新答案覆盖同名键，其余保留（切换入口不丢已答）
    const merged = { ...((doc.answers as Record<string, unknown>) ?? {}), ...answers }
    const updated = await payload.update({
      collection: 'need-leads',
      id: doc.id,
      data: {
        answers: merged,
        ...(source ? { source } : {}),
        ...(phone ? { phone } : {}),
      },
      overrideAccess: true,
    })
    return ok({ token, id: String(updated.id), status: updated.status })
  }

  const created = await payload.create({
    collection: 'need-leads',
    data: {
      answers,
      status: 'draft',
      ...(source ? { source } : {}),
      ...(phone ? { phone } : {}),
    },
    overrideAccess: true,
    depth: 0,
  })
  const doc = created as unknown as { id: string | number; token?: string; status?: string }
  return ok({ token: doc.token, id: String(doc.id), status: doc.status ?? 'draft' })
})
