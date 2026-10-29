import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'

import { canEditProjects } from '../../../data'

const MAX_BYTES = 12 * 1024 * 1024
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/** 保存点位图（Excalidraw 场景 JSON）。只接受 elements / appState / files 三部分。 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')
  if (!canEditProjects(user.role)) return fail(403, '只读账号不能修改点位图')

  const raw = await request.text()
  if (raw.length > MAX_BYTES) return fail(413, '点位图太大（超过 12MB），请压缩户型图后重试')

  let scene: { elements?: unknown; appState?: Record<string, unknown>; files?: unknown }
  try {
    scene = JSON.parse(raw)
  } catch {
    return fail(400, '点位图数据格式无效')
  }
  if (!scene || !Array.isArray(scene.elements)) return fail(400, '点位图数据格式无效')
  const files = scene.files && typeof scene.files === 'object' && !Array.isArray(scene.files) ? scene.files : {}
  const appState = scene.appState && typeof scene.appState === 'object' ? scene.appState : {}

  const pointMap = {
    elements: scene.elements,
    appState: { viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff', gridSize: appState.gridSize ?? null },
    files,
  }

  const { id } = await params
  const payload = await getPayloadClient()
  try {
    const doc = await payload.update({ collection: 'projects', id, data: { pointMap }, user, overrideAccess: false, depth: 0, select: { updatedAt: true } })
    return Response.json({ ok: true, savedAt: doc.updatedAt })
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status === 404) return fail(404, '项目不存在或已被删除')
    if (status === 403) return fail(403, '没有权限修改该项目')
    console.error('[point-map] save failed', error)
    return fail(500, '保存失败，请稍后重试')
  }
}
