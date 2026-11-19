import { getPayloadClient } from '@/lib/payload'
import { fail, mpPublicRoute, ok, readJson } from '@/lib/mp/http'
import { findNeedDraft, needAnswers, needRevision } from '@/lib/services/need-draft'
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
  const lead = await findNeedDraft(payload, token)
  if (!lead) return fail(404, '需求单不存在或已过期')

  const body = await readJson<{ answers?: Record<string, unknown>; revision?: string }>(request)
  if (body.revision !== undefined && body.revision !== needRevision(lead)) {
    return fail(409, '答案已更新，请重新生成清单', 'DRAFT_CHANGED')
  }
  const answers =
    body.revision === undefined ? (body.answers ?? needAnswers(lead)) : needAnswers(lead)
  return ok(await buildNeedResult(answers))
})
