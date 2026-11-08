import { inferAreaType, isAreaType } from '@/lib/area-types'
import { getCatalog } from '@/lib/cached-data'
import { categoryOfType, isDeviceType } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import {
  analyzeScene,
  buildAreaElements,
  buildPointElements,
  buildSheetElements,
  compactScene,
  isPointElement,
  nextPointCode,
  normalizeScene,
  type SceneEl,
  type SceneFile,
  type StoredScene,
} from '@/lib/point-scene'
import { ARCHIVED_MESSAGE, readableError } from '@/lib/project-guards'
import type { User } from '@/payload-types'

/**
 * 点位图的服务端编辑（微信小程序、AI 工具共用）。
 * 保存规则与网页编辑器的 /point-map/data 接口一致：压缩场景、不再使用的图片键写成 null、限制 190KB。
 * 注意：网页编辑器打开期间保存会覆盖服务端的修改，多端同时编辑同一项目时以最后保存的为准。
 */
const MAX_BYTES = 190 * 1024

export type PointMapResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; status: number }
type Scene = {
  elements: SceneEl[]
  files: Record<string, SceneFile>
  appState?: Record<string, unknown>
}
type DetectedPoint = { type: unknown; x: unknown; y: unknown }
type DetectedArea = { name?: unknown; type?: unknown; rect?: unknown }

async function loadScene(user: User, projectId: string) {
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id: projectId,
      depth: 0,
      user,
      overrideAccess: false,
      select: { status: true, pointMap: true },
    })
    .catch(() => null)
  if (!project) return { error: { ok: false as const, error: '项目不存在或已被删除', status: 404 } }
  if (project.status === 'archived')
    return { error: { ok: false as const, error: ARCHIVED_MESSAGE, status: 403 } }
  const norm = normalizeScene(project.pointMap as Partial<StoredScene> | null)
  const storedFiles = ((project.pointMap as { files?: Record<string, unknown> } | null)?.files ??
    {}) as Record<string, unknown>
  return {
    scene: {
      elements: [...norm.elements],
      files: { ...norm.files },
      appState: norm.appState,
    } as Scene,
    storedFiles,
  }
}

async function persistScene(
  user: User,
  projectId: string,
  scene: Scene,
  storedFiles: Record<string, unknown>,
): Promise<PointMapResult> {
  const pointMap = compactScene(scene.elements, scene.files, scene.appState)
  const bytes = Buffer.byteLength(JSON.stringify(pointMap))
  if (bytes > MAX_BYTES)
    return {
      ok: false,
      error: `点位图数据 ${Math.round(bytes / 1024)}KB，超过 ${MAX_BYTES / 1024}KB 上限`,
      status: 413,
    }
  const filesToSave: Record<string, SceneFile | null> = { ...pointMap.files }
  for (const key of Object.keys(storedFiles)) if (!(key in filesToSave)) filesToSave[key] = null
  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'projects',
      id: projectId,
      data: { pointMap: { ...pointMap, files: filesToSave } as never },
      user,
      overrideAccess: false,
      depth: 0,
      select: { updatedAt: true },
    })
    return { ok: true }
  } catch (error) {
    const status = (error as { status?: number })?.status
    return {
      ok: false,
      error: readableError(error, '保存点位图失败，请稍后重试'),
      status: typeof status === 'number' && status >= 400 ? status : 500,
    }
  }
}

const ratio = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null
}

/** 校验指定产品：存在、在售、设备类型一致。 */
async function checkProduct(
  productId: unknown,
  deviceType: string,
): Promise<{ id: string | null } | { error: string }> {
  if (productId === null || productId === undefined || productId === '') return { id: null }
  if (typeof productId !== 'string') return { error: '产品无效' }
  const product = (await getCatalog()).find((p) => p.id === productId)
  if (!product || product.status !== 'active') return { error: '该产品不存在或已下架' }
  if (product.deviceType !== deviceType) return { error: '产品的设备类型与点位类型不一致' }
  return { id: product.id }
}

/** 在图纸上放置一个点位（rx / ry 是相对图纸的 0–1 比例坐标）。 */
export async function addPoint(
  user: User,
  projectId: string,
  input: {
    sheetId?: unknown
    rx?: unknown
    ry?: unknown
    deviceType?: unknown
    productId?: unknown
  },
): Promise<PointMapResult<{ pointId: string; code: string }>> {
  if (!isDeviceType(input.deviceType)) return { ok: false, error: '设备类型无效', status: 400 }
  const rx = ratio(input.rx)
  const ry = ratio(input.ry)
  if (rx === null || ry === null) return { ok: false, error: '点位坐标无效', status: 400 }
  const loaded = await loadScene(user, projectId)
  if ('error' in loaded) return loaded.error!
  const { sheets, points } = analyzeScene(loaded.scene)
  const sheet = sheets.find((s) => s.id === input.sheetId) ?? sheets[0]
  if (!sheet) return { ok: false, error: '请先上传户型图', status: 400 }
  const product = await checkProduct(input.productId, input.deviceType)
  if ('error' in product) return { ok: false, error: product.error, status: 400 }
  const code = nextPointCode(
    input.deviceType,
    points.map((p) => p.code),
  )
  const built = buildPointElements({
    deviceType: input.deviceType,
    cx: sheet.x + rx * sheet.width,
    cy: sheet.y + ry * sheet.height,
    code,
    productId: product.id,
  })
  loaded.scene.elements.push(...built)
  const saved = await persistScene(user, projectId, loaded.scene, loaded.storedFiles)
  return saved.ok ? { ok: true, pointId: built[0].id, code } : saved
}

function findPoint(scene: Scene, pointId: string) {
  const el = scene.elements.find((e) => e.id === pointId && !e.isDeleted && isPointElement(e))
  if (!el) return null
  const group = el.groupIds?.[0]
  const label = group
    ? scene.elements.find(
        (e) =>
          e !== el && !e.isDeleted && e.groupIds?.includes(group) && e.customData?.kind === 'label',
      )
    : undefined
  return { el, label, group }
}

/** 修改点位：换设备类型、指定 / 清除产品、移动位置（同一张图纸内）。点位 ID 保持不变。 */
export async function updatePoint(
  user: User,
  projectId: string,
  pointId: string,
  patch: { deviceType?: unknown; productId?: unknown; rx?: unknown; ry?: unknown },
): Promise<PointMapResult<{ pointId: string; code: string }>> {
  const loaded = await loadScene(user, projectId)
  if ('error' in loaded) return loaded.error!
  const found = findPoint(loaded.scene, pointId)
  if (!found) return { ok: false, error: '点位不存在或已被删除', status: 404 }
  const { el, label, group } = found
  const { sheets, points } = analyzeScene(loaded.scene)
  const info = points.find((p) => p.id === pointId)
  const sheet = sheets.find((s) => s.id === info?.sheetId) ?? null

  const currentType = String(el.customData?.deviceType ?? 'other')
  const nextType = patch.deviceType === undefined ? currentType : patch.deviceType
  if (!isDeviceType(nextType)) return { ok: false, error: '设备类型无效', status: 400 }

  let productId =
    typeof el.customData?.productId === 'string' ? (el.customData.productId as string) : null
  if (patch.productId !== undefined) {
    const checked = await checkProduct(patch.productId, nextType)
    if ('error' in checked) return { ok: false, error: checked.error, status: 400 }
    productId = checked.id
  } else if (nextType !== currentType && productId) {
    const checked = await checkProduct(productId, nextType)
    productId = 'error' in checked ? null : checked.id
  }

  let cx = el.x + el.width / 2
  let cy = el.y + el.height / 2
  const rx = ratio(patch.rx)
  const ry = ratio(patch.ry)
  if (rx !== null && ry !== null && sheet) {
    cx = sheet.x + rx * sheet.width
    cy = sheet.y + ry * sheet.height
  }

  let code = String(el.customData?.pointCode ?? '')
  if (!code || categoryOfType(nextType)?.code !== categoryOfType(currentType)?.code) {
    code = nextPointCode(
      nextType,
      points.filter((p) => p.id !== pointId).map((p) => p.code),
    )
  }

  const built = buildPointElements({ deviceType: nextType, cx, cy, code, productId })
  built[0].id = el.id
  if (label) built[1].id = label.id
  if (group) for (const b of built) b.groupIds = [group]
  const drop = new Set([el.id, label?.id].filter(Boolean) as string[])
  loaded.scene.elements = [...loaded.scene.elements.filter((e) => !drop.has(e.id)), ...built]
  const saved = await persistScene(user, projectId, loaded.scene, loaded.storedFiles)
  return saved.ok ? { ok: true, pointId: el.id, code } : saved
}

export async function deletePoint(
  user: User,
  projectId: string,
  pointId: string,
): Promise<PointMapResult> {
  const loaded = await loadScene(user, projectId)
  if ('error' in loaded) return loaded.error!
  const found = findPoint(loaded.scene, pointId)
  if (!found) return { ok: false, error: '点位不存在或已被删除', status: 404 }
  const drop = new Set([found.el.id, found.label?.id].filter(Boolean) as string[])
  loaded.scene.elements = loaded.scene.elements.filter((e) => !drop.has(e.id))
  return persistScene(user, projectId, loaded.scene, loaded.storedFiles)
}

/**
 * 添加一张标准图纸（图片已在媒体库里）。
 * 项目只有一张「空白示意图」且上面没有任何点位和区域时直接替换它，否则追加为新图纸，不会丢失已有点位。
 * 只有真正识别出的点位（detectedPoints）才会生成图标，没有识别结果就保持 0 个点位。
 */
export async function addSheetImage(
  user: User,
  projectId: string,
  input: {
    url: string
    mediaId: string | null
    name: string
    detectedPoints?: DetectedPoint[]
    detectedAreas?: DetectedArea[]
  },
): Promise<
  PointMapResult<{
    sheetId: string
    sheetName: string
    recognizedPoints: number
    recognizedAreas: number
  }>
> {
  const loaded = await loadScene(user, projectId)
  if ('error' in loaded) return loaded.error!
  const scene = loaded.scene
  const fileId = input.mediaId ? `sheet-${input.mediaId}` : `sheet-${Date.now().toString(36)}`
  scene.files[fileId] = { id: fileId, dataURL: input.url, mimeType: 'image/png' }

  const before = analyzeScene(scene)
  const onlyEmptyBlank =
    before.sheets.length === 1 &&
    before.sheets[0].fileId === 'blank-sheet' &&
    before.points.length === 0 &&
    before.areas.length === 0
  const name = input.name.trim().slice(0, 40) || `图纸 ${before.sheets.length + 1}`
  const sheetEls = buildSheetElements({
    index: onlyEmptyBlank ? 0 : before.sheets.length,
    name,
    fileId,
    mediaId: input.mediaId,
  })
  scene.elements = onlyEmptyBlank
    ? [
        ...sheetEls,
        ...scene.elements.filter(
          (e) => e.customData?.kind !== 'sheet' && e.customData?.kind !== 'sheet-title',
        ),
      ]
    : [...sheetEls, ...scene.elements]
  const sheetId = String(sheetEls[0].customData?.sheetId)

  const after = analyzeScene(scene)
  const sheet = after.sheets.find((s) => s.id === sheetId)!
  let recognizedAreas = 0
  for (const a of input.detectedAreas ?? []) {
    const rect = Array.isArray(a.rect) ? a.rect.map(Number) : []
    if (rect.length < 4 || rect.some((n) => !Number.isFinite(n))) continue
    const [rx, ry, rw, rh] = rect
    if (rw <= 0.02 || rh <= 0.02) continue
    const areaName =
      typeof a.name === 'string' && a.name.trim() ? a.name.trim().slice(0, 24) : '房间'
    const areaType = isAreaType(a.type) ? a.type : inferAreaType(areaName)
    scene.elements.push(
      ...buildAreaElements({
        name: areaName,
        areaType,
        x: sheet.x + rx * sheet.width,
        y: sheet.y + ry * sheet.height,
        width: rw * sheet.width,
        height: rh * sheet.height,
      }),
    )
    recognizedAreas++
  }
  const codes = after.points.map((p) => p.code)
  let recognized = 0
  for (const p of input.detectedPoints ?? []) {
    const rx = ratio(p.x)
    const ry = ratio(p.y)
    if (rx === null || ry === null || !isDeviceType(p.type)) continue
    const code = nextPointCode(p.type, codes)
    codes.push(code)
    scene.elements.push(
      ...buildPointElements({
        deviceType: p.type,
        cx: sheet.x + rx * sheet.width,
        cy: sheet.y + ry * sheet.height,
        code,
      }),
    )
    recognized++
  }
  const saved = await persistScene(user, projectId, scene, loaded.storedFiles)
  return saved.ok
    ? { ok: true, sheetId, sheetName: name, recognizedPoints: recognized, recognizedAreas }
    : saved
}
