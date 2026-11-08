import { appAuth } from '@/lib/app-auth'
import { readableError } from '@/lib/project-guards'
import { getPayloadClient } from '@/lib/payload'
import { compactScene, type SceneEl, type SceneFile } from '@/lib/point-scene'

/**
 * 点位图只存元素和图片地址（图纸图片在媒体库里），一般几十 KB。
 * Figma 托管数据库单条记录上限约 200KB，这里留出余量给项目的其他字段。
 */
const MAX_BYTES = 190 * 1024
/** 内嵌在场景里的小图（例如旧版本的符号）允许的最大长度 */
const MAX_INLINE = 24 * 1024
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/** 保存点位图（压缩后的 Excalidraw 场景）。只接受 elements / appState / files 三部分。 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')

  const raw = await request.text()
  if (raw.length > 4 * 1024 * 1024) return fail(413, '点位图数据过大，请删除不需要的元素后重试')

  let scene: { elements?: unknown; appState?: Record<string, unknown>; files?: unknown }
  try {
    scene = JSON.parse(raw)
  } catch {
    return fail(400, '点位图数据格式无效')
  }
  if (!scene || !Array.isArray(scene.elements)) return fail(400, '点位图数据格式无效')
  const elements = (scene.elements as unknown[]).filter(
    (e): e is SceneEl =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as SceneEl).id === 'string' &&
      typeof (e as SceneEl).type === 'string',
  )
  const files: Record<string, SceneFile> = {}
  if (scene.files && typeof scene.files === 'object' && !Array.isArray(scene.files)) {
    for (const [key, f] of Object.entries(scene.files as Record<string, unknown>)) {
      const file = f as Partial<SceneFile> | null
      if (!file || typeof file.dataURL !== 'string' || typeof file.mimeType !== 'string') continue
      if (file.dataURL.startsWith('data:') && file.dataURL.length > MAX_INLINE)
        return fail(400, '有图片还没有上传到媒体库，请重新保存')
      files[key] = { id: key, dataURL: file.dataURL, mimeType: file.mimeType }
    }
  }
  // 服务端再压缩一次，保证存进数据库的格式统一
  const pointMap = compactScene(
    elements,
    files,
    scene.appState && typeof scene.appState === 'object' ? scene.appState : {},
  )
  const bytes = Buffer.byteLength(JSON.stringify(pointMap))
  if (bytes > MAX_BYTES) {
    return fail(
      413,
      `点位图数据 ${Math.round(bytes / 1024)}KB，超过 ${Math.round(MAX_BYTES / 1024)}KB 上限。请删除不用的元素，或把不同楼层拆到新项目里`,
    )
  }

  const { id } = await params
  const payload = await getPayloadClient()
  // 托管数据库更新 JSON 时会合并对象：不再使用的图片键显式写成 null，避免旧文件一直留在场景里
  const stored = await payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { pointMap: true },
    })
    .catch(() => null)
  const oldFiles = (stored?.pointMap as { files?: Record<string, unknown> } | null)?.files
  const filesToSave: Record<string, SceneFile | null> = { ...pointMap.files }
  if (oldFiles && typeof oldFiles === 'object')
    for (const key of Object.keys(oldFiles)) if (!(key in filesToSave)) filesToSave[key] = null
  try {
    const doc = await payload.update({
      collection: 'projects',
      id,
      data: { pointMap: { ...pointMap, files: filesToSave } as never },
      user,
      overrideAccess: false,
      depth: 0,
      select: { updatedAt: true },
    })
    return Response.json({ ok: true, savedAt: doc.updatedAt, bytes })
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status === 404) return fail(404, '项目不存在或已被删除')
    if (status === 403) return fail(403, readableError(error, '没有权限修改该项目'))
    console.error('[point-map] save failed', error)
    return fail(500, '保存失败，请稍后重试')
  }
}
