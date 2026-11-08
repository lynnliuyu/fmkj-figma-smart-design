import { appAuth } from '@/lib/app-auth'
import { handleAiUpload, recognitionStatusPayload } from '@/plugins/ai-copilot/upload-handler'

/** AI 对话框上传图片（逻辑见 upload-handler，微信小程序共用）。 */
export async function POST(request: Request) {
  const user = await appAuth.getCurrentUser()
  if (!user) return Response.json({ ok: false, error: '登录已过期，请重新登录' }, { status: 401 })
  return handleAiUpload(request)
}

/** 查询上传图纸的视觉复核进度：GET /ai/upload?mediaId=xxx */
export async function GET(request: Request) {
  const user = await appAuth.getCurrentUser()
  if (!user) return Response.json({ ok: false, error: '登录已过期，请重新登录' }, { status: 401 })
  return Response.json(
    { ok: true, ...recognitionStatusPayload(request) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
