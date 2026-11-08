import { fail, mpRoute, ok } from '@/lib/mp/http'
import { addSheetImage } from '@/lib/services/point-map-service'
import {
  getCachedDetectedBundle,
  prepareFloorPlanUpload,
} from '@/plugins/ai-copilot/upload-handler'

/**
 * 上传户型图（wx.uploadFile，字段 file，可带 name、mode=switches|all|none 或 recognize=1）：
 * 自动裁掉图框和标题栏，放进标准图纸；
 * - mode=switches（或 recognize=1）：仅导入识别出的开关点位 + 房间区域（推荐默认，避免将灯位误作开关）；
 * - mode=all：导入开关 + 筒灯/射灯全部识别点位 + 房间区域；
 * - mode=none（默认）：只添加干净图纸，不生成点位。
 * 需要导入点位时会等待视觉模型复核完成（整图理解 + 逐点放大核对），保证落图结果与网页 AI 对话一致。
 */
export const POST = mpRoute<{ id: string }>(async ({ request, user, params }) => {
  const sp = new URL(request.url).searchParams
  const rawMode = sp.get('mode')
  const recognize = sp.get('recognize') === '1'
  const mode: 'switches' | 'all' | 'none' =
    rawMode === 'all' ? 'all' : rawMode === 'switches' || recognize ? 'switches' : 'none'
  const prepared = await prepareFloorPlanUpload(request, {
    awaitVision: mode !== 'none',
    forceKind: 'floor-plan',
  })
  if (prepared.error) return prepared.error
  const up = prepared.upload!
  const bundle = getCachedDetectedBundle(up.mediaId, up.url)
  const pointsToImport =
    mode === 'none'
      ? []
      : mode === 'switches'
        ? (bundle?.switchPoints ??
          up.detectedPoints.filter((p) => p.type.startsWith('switch-') || p.type === 'touch-panel'))
        : (bundle?.points ?? up.detectedPoints)
  const areasToImport = mode === 'none' ? [] : (bundle?.areas ?? up.detectedAreas ?? [])
  const r = await addSheetImage(user, params.id, {
    url: up.url,
    mediaId: up.mediaId,
    name: up.name,
    detectedPoints: pointsToImport,
    detectedAreas: areasToImport,
  })
  return r.ok
    ? ok({
        sheetId: r.sheetId,
        sheetName: r.sheetName,
        recognizedPoints: r.recognizedPoints,
        recognizedAreas: r.recognizedAreas,
        detectedSummary: bundle?.summary ?? up.detectedSummary,
        vision: bundle?.vision ?? null,
        cropped: up.cropped,
        url: up.url,
      })
    : fail(r.status, r.error)
})
