import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok, readJson } from '@/lib/mp/http'
import { buildNeedResult } from '@/lib/services/need-service'

/**
 * 归一化 + 默认值 + 计价预览（**不写库**）。
 * body 可带 answers 覆盖已存草稿，便于「边填边看清单」。
 * 与 submit 共用 `buildNeedResult`，保证预览价 = 提交价。
 */
export const POST = mpPublicRoute(async (request) => {
  const payload = await getPayloadClient()
  const url = new URL(request.url)
  const token = decodeURIComponent(url.pathname.split('/').slice(-2)[0] ?? '')

  // ⚠️ 无论是否带 answers，都必须先校验 token 存在（否则别人可以拿任意 token 算价）
  if (!token) return fail(400, '缺少需求单凭证')
  const found = await payload.find({
    collection: 'need-leads',
    where: { token: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const lead = found.docs[0]
  if (!lead) return fail(404, '需求单不存在或已过期')

  const body = await readJson<{ answers?: Record<string, unknown> }>(request)
  const answers: Record<string, unknown> =
    body.answers ?? (lead.answers as Record<string, unknown>) ?? {}

  return ok(await buildNeedResult(answers))
})
