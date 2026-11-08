import { inferAreaType, isAreaType } from '@/lib/area-types'
import { getCatalog, getCompanyInfo } from '@/lib/cached-data'
import {
  DEFAULT_CONTRACT_TERMS,
  DEFAULT_DURATION_DAYS,
  DEFAULT_PAYMENTS,
  DEFAULT_WARRANTY_MONTHS,
  isContractStatus,
  paymentPercentTotal,
} from '@/lib/contracts'
import {
  CAMERA_PER_FLOOR,
  DESIGN_RULE_TEXT,
  isDrawingOnlyType,
  isSpeakerArea,
  NEEDS_SWITCH_TYPES,
  ONE_PER_AREA_TYPES,
  VRF_PER_FLOOR,
} from '@/lib/design-rules'
import { DEVICE_TYPE_ORDER, deviceTypeOf, isDeviceType } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import {
  fillDefaultProducts,
  isPointData,
  parseDefaults,
  pointDeviceType,
  summarizePoints,
  type PointCustomData,
} from '@/lib/point-map-items'
import {
  analyzeScene,
  buildAreaElements,
  buildPointElements,
  buildSheetElements,
  compactScene,
  nextPointCode,
  normalizeScene,
  type StoredScene,
} from '@/lib/point-scene'
import { inPointScope } from '@/lib/point-scopes'
import { DEFAULT_PLATFORM, isProjectPlatform } from '@/lib/projects'
import { QUOTE_STATUSES, type QuoteStatus } from '@/lib/quotes'
import type { Project } from '@/payload-types'
import {
  parsePointImport,
  planToElements,
  resolveDeviceType,
} from '@/plugins/ai-import/point-import'
import { IMAGE_MODELS, generateImage } from '../image-generation'
import { callVision, encodeImageForVision, extractJson, loadImageDataUrlForVision } from '../vision'

import {
  awaitRecognition,
  getRecognitionStatus,
  IMAGE_KIND_LABEL,
  redetectFloorPlanFromUrl,
} from '../upload-handler'
import { refreshContextProject, type AiToolHandler } from './context'

const parseQuoteStatus = (v: unknown): QuoteStatus | null => {
  if (v === 'confirmed') return 'accepted'
  return QUOTE_STATUSES.some((s) => s.value === v) ? (v as QuoteStatus) : null
}

export const coreToolHandlers: Record<string, AiToolHandler> = {
  async list_projects(args, ctx) {
    if (typeof args.switchToProjectId === 'string' && args.switchToProjectId.trim()) {
      await refreshContextProject(ctx, args.switchToProjectId.trim())
      if (ctx.project) {
        return {
          result: { switchedTo: ctx.project.project.name, projectId: ctx.projectId },
          summary: `已切换到项目「${ctx.project.project.name}」`,
          href: `/projects/${ctx.projectId}`,
          hrefLabel: '打开项目',
        }
      }
    }
    const payload = await getPayloadClient()
    const status = args.status === 'archived' || args.status === 'all' ? args.status : 'active'
    const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
    const res = await payload.find({
      collection: 'projects',
      ...(status !== 'all' ? { where: { status: { equals: status } } } : {}),
      sort: '-updatedAt',
      limit: 30,
      depth: 0,
      user: ctx.user,
      overrideAccess: false,
      select: {
        name: true,
        customerName: true,
        customerPhone: true,
        community: true,
        address: true,
        platform: true,
        budget: true,
        status: true,
        pointCount: true,
      },
    })
    const list = res.docs
      .filter((p) =>
        !q
          ? true
          : `${p.name} ${p.customerName ?? ''} ${p.community ?? ''} ${p.address ?? ''}`
              .toLowerCase()
              .includes(q),
      )
      .slice(0, 15)
      .map((p) => ({
        id: String(p.id),
        name: p.name,
        customerName: p.customerName ?? null,
        community: p.community ?? null,
        address: p.address ?? null,
        platform: p.platform ?? null,
        budget: p.budget ?? null,
        status: p.status,
        pointCount: p.pointCount ?? 0,
      }))
    return {
      result: { count: list.length, projects: list },
      summary: `查找到 ${list.length} 个项目`,
      href: '/projects',
      hrefLabel: '项目列表',
    }
  },
  async create_project(args, ctx) {
    const payload = await getPayloadClient()
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const platformRaw = str(args.platform, 40)
    const platform = (
      isProjectPlatform(platformRaw) ? platformRaw : DEFAULT_PLATFORM
    ) as Project['platform']
    const budget =
      typeof args.budget === 'number' && Number.isFinite(args.budget) && args.budget >= 0
        ? Math.round(args.budget)
        : null

    const doc = await payload.create({
      collection: 'projects',
      data: {
        name: str(args.name, 120),
        customerName: str(args.customerName, 60) || null,
        customerPhone: str(args.customerPhone, 30) || null,
        community: str(args.community, 80) || null,
        address: str(args.address, 200) || null,
        platform,
        budget,
        notes: str(args.notes, 2000) || null,
        owner: ctx.user.id,
        status: 'active',
      },
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, String(doc.id))
    return {
      result: {
        projectId: String(doc.id),
        name: doc.name,
        customerName: doc.customerName ?? null,
        community: doc.community ?? null,
        address: doc.address ?? null,
        platform: doc.platform ?? null,
        budget: doc.budget ?? null,
      },
      summary: `已创建项目「${doc.name}」`,
      href: `/projects/${doc.id}`,
      hrefLabel: '打开新项目',
    }
  },
  async update_project(args, ctx) {
    const targetId =
      typeof args.projectId === 'string' && args.projectId.trim()
        ? args.projectId.trim()
        : ctx.projectId
    if (!targetId) return { result: { error: '没有指定或关联项目' }, summary: '未指定项目' }

    const patch: Record<string, unknown> = {}
    if (typeof args.name === 'string' && args.name.trim())
      patch.name = args.name.trim().slice(0, 120)
    if (typeof args.customerName === 'string')
      patch.customerName = args.customerName.trim().slice(0, 60) || null
    if (typeof args.customerPhone === 'string')
      patch.customerPhone = args.customerPhone.trim().slice(0, 30) || null
    if (typeof args.community === 'string')
      patch.community = args.community.trim().slice(0, 80) || null
    if (typeof args.address === 'string') patch.address = args.address.trim().slice(0, 200) || null
    if (typeof args.platform === 'string' && isProjectPlatform(args.platform))
      patch.platform = args.platform
    if (typeof args.budget === 'number' && Number.isFinite(args.budget) && args.budget >= 0)
      patch.budget = Math.round(args.budget)
    if (typeof args.notes === 'string') patch.notes = args.notes.trim().slice(0, 2000) || null
    if (args.status === 'active' || args.status === 'archived') patch.status = args.status

    const payload = await getPayloadClient()
    const updated = await payload.update({
      collection: 'projects',
      id: targetId,
      data: patch as never,
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, String(updated.id))
    return {
      result: {
        projectId: String(updated.id),
        name: updated.name,
        status: updated.status,
        platform: updated.platform,
        budget: updated.budget,
      },
      summary: `已更新项目「${updated.name}」`,
      href: `/projects/${updated.id}`,
      hrefLabel: '查看项目',
    }
  },
  async add_floor_sheet(args, ctx) {
    if (!ctx.projectId)
      return { result: { error: '没有关联项目，请先新建或关联项目' }, summary: '未关联项目' }

    const payload = await getPayloadClient()
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { status: true, pointMap: true },
      })
      .catch(() => null)
    if (!project) return { result: { error: '项目不存在或无权限' }, summary: '项目不可用' }
    if (project.status === 'archived')
      return { result: { error: '项目已归档，无法修改点位图' }, summary: '项目已归档' }

    const norm = normalizeScene(project.pointMap as Partial<StoredScene> | null)
    let elements = [...norm.elements]
    const files = { ...norm.files }
    let analyzed = analyzeScene({ elements, files })

    // 如果大模型没有传 url（例如用户说「重新生成 / 重新识别刚才的图」），自动从当前项目已有的最后一张真实图纸中提取 url 和 mediaId
    const existingRealSheets = analyzed.sheets.filter((s) => s.fileId !== 'blank-sheet' && s.url)
    const lastRealSheet = existingRealSheets[existingRealSheets.length - 1] ?? null
    const url =
      (typeof args.url === 'string' && args.url.trim() ? args.url.trim() : lastRealSheet?.url) ?? ''
    if (!url)
      return {
        result: { error: '当前项目还没有上传过户型图纸，请先拖入或上传户型图' },
        summary: '缺少户型图纸',
      }

    const inferredMediaId = lastRealSheet?.fileId?.startsWith('sheet-')
      ? lastRealSheet.fileId.slice(6)
      : null
    const mediaId =
      typeof args.mediaId === 'string' && args.mediaId.trim()
        ? args.mediaId.trim()
        : inferredMediaId
    const name =
      typeof args.sheetName === 'string' && args.sheetName.trim()
        ? args.sheetName.trim().slice(0, 40)
        : lastRealSheet?.name || '一层平面图'

    const fileId = mediaId ? `sheet-${mediaId}` : `sheet-${Date.now().toString(36)}`
    files[fileId] = { id: fileId, dataURL: url, mimeType: 'image/png' }

    // 检查是否已经存在同一张图纸（按 fileId 或 url 匹配），或者用户明确要求 replaceExisting
    const sameSheet = analyzed.sheets.find((s) => s.fileId === fileId || (s.url && s.url === url))
    const shouldReplace = Boolean(sameSheet) || Boolean(args.replaceExisting)

    if (sameSheet && shouldReplace) {
      // 原地清理该图纸范围内的旧点位与旧区域，不重复新建第 2 张图纸
      const sx0 = sameSheet.x
      const sy0 = sameSheet.y
      const sx1 = sameSheet.x + sameSheet.width
      const sy1 = sameSheet.y + sameSheet.height
      const inSheetRect = (el: { x: number; y: number; width?: number; height?: number }) => {
        const cx = el.x + (el.width ?? 0) / 2
        const cy = el.y + (el.height ?? 0) / 2
        return cx >= sx0 && cx <= sx1 && cy >= sy0 && cy <= sy1
      }
      elements = elements.filter((el) => {
        const k = el.customData?.kind
        if (k === 'sheet' || k === 'sheet-title') return true
        return !inSheetRect(el)
      })
    } else if (
      analyzed.sheets.length === 1 &&
      analyzed.sheets[0].fileId === 'blank-sheet' &&
      analyzed.points.length === 0 &&
      analyzed.areas.length === 0
    ) {
      elements = [
        ...buildSheetElements({ index: 0, name, fileId, mediaId }),
        ...elements.filter(
          (e) => e.customData?.kind !== 'sheet' && e.customData?.kind !== 'sheet-title',
        ),
      ]
    } else {
      elements.push(...buildSheetElements({ index: analyzed.sheets.length, name, fileId, mediaId }))
    }

    analyzed = analyzeScene({ elements, files })
    const targetSheet =
      analyzed.sheets.find((s) => s.fileId === fileId || (s.url && s.url === url)) ??
      analyzed.sheets[analyzed.sheets.length - 1]
    const requestedMode =
      args.importMode === 'all'
        ? 'all'
        : args.importMode === 'none'
          ? 'none'
          : args.importMode === 'switches'
            ? 'switches'
            : null
    // 上传后视觉复核在后台进行：落图前等待复核完成，保证写入的是「本地几何识别 + 视觉复核」后的结果
    if (getRecognitionStatus(mediaId, url).status === 'pending')
      ctx.notify?.('正在等待视觉模型复核图纸点位…')
    let bundle = await awaitRecognition(mediaId, url, 60_000)
    if (bundle?.imageKind && bundle.imageKind !== 'floor-plan') {
      return {
        result: {
          error: `这张图片是「${IMAGE_KIND_LABEL[bundle.imageKind]}」，不是户型图纸，不能添加到点位图；请结合视觉识图结论直接回答用户`,
        },
        summary: '非户型图纸，未添加',
      }
    }
    // 用户要求重新识别（redetect=true）或缓存已失效：从图纸重新执行一次完整识别（本地几何识别 + 视觉复核）
    if (
      args.redetect === true ||
      !bundle ||
      (bundle.points.length === 0 && requestedMode !== 'none')
    ) {
      ctx.notify?.('正在重新识别图纸（本地几何识别 + 视觉复核）…')
      const freshBundle = await redetectFloorPlanFromUrl({
        mediaId,
        url,
        sheetName: name,
        userId: ctx.user.id,
      })
      if (freshBundle) bundle = freshBundle
    }
    // 未指定导入范围时：灯具布置图（或图上只有灯具）导入全部，其余默认只导入开关面板
    const importMode: 'switches' | 'all' | 'none' =
      requestedMode ??
      (bundle?.vision?.drawingType === 'lighting-layout' ||
      (!bundle?.switchPoints.length && (bundle?.lightPoints.length ?? 0) > 0)
        ? 'all'
        : 'switches')
    let rawPts =
      Array.isArray(args.detectedPoints) && args.detectedPoints.length > 0
        ? (args.detectedPoints as Record<string, unknown>[])
        : []
    if (importMode === 'none') {
      rawPts = []
    } else if (rawPts.length === 0) {
      if (bundle) {
        rawPts =
          importMode === 'switches'
            ? bundle.switchPoints
            : [...bundle.switchPoints, ...bundle.lightPoints, ...bundle.points].filter(
                (p, i, all) =>
                  all.findIndex(
                    (q) =>
                      q.type === p.type &&
                      Math.abs(q.x - p.x) < 0.004 &&
                      Math.abs(q.y - p.y) < 0.004,
                  ) === i,
              )
      }
    }

    // 自动创建识别出的房间区域（避免点位全部落入「公共区」）
    let createdAreas = 0
    if (targetSheet && importMode !== 'none' && bundle?.areas?.length) {
      const onSheetAreas = analyzed.areas.filter((a) => a.sheetId === targetSheet.id)
      if (onSheetAreas.length === 0) {
        for (const a of bundle.areas) {
          const [rx, ry, rw, rh] = a.rect
          if (rw <= 0.02 || rh <= 0.02) continue
          const areaName = a.name || '房间'
          const areaType = isAreaType(a.type) ? a.type : inferAreaType(areaName)
          elements.push(
            ...buildAreaElements({
              name: areaName,
              areaType,
              x: targetSheet.x + rx * targetSheet.width,
              y: targetSheet.y + ry * targetSheet.height,
              width: rw * targetSheet.width,
              height: rh * targetSheet.height,
            }),
          )
          createdAreas++
        }
      }
    }

    let recognizedCount = 0
    if (targetSheet && rawPts.length > 0) {
      const usedCodes = new Set(analyzed.points.map((p) => p.code).filter(Boolean))
      for (const p of rawPts) {
        const rx = typeof p.x === 'number' ? p.x : Number(p.x)
        const ry = typeof p.y === 'number' ? p.y : Number(p.y)
        if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0 || rx > 1 || ry < 0 || ry > 1)
          continue
        const dt = resolveDeviceType(p.type) ?? (isDeviceType(p.type) ? String(p.type) : 'switch-2')
        const code = nextPointCode(dt, usedCodes)
        usedCodes.add(code)
        elements.push(
          ...buildPointElements({
            deviceType: dt,
            cx: targetSheet.x + rx * targetSheet.width,
            cy: targetSheet.y + ry * targetSheet.height,
            code,
          }),
        )
        recognizedCount++
      }
    }

    const compacted = compactScene(elements, files, norm.appState)
    await payload.update({
      collection: 'projects',
      id: ctx.projectId,
      data: { pointMap: compacted as never },
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, ctx.projectId)
    return {
      result: {
        sheetName: name,
        url,
        importMode,
        recognizedPoints: recognizedCount,
        recognizedAreas: createdAreas,
        detectedSummary: bundle?.summary ?? null,
        recognition: bundle?.summary?.confirmText ?? null,
        vision: bundle?.vision
          ? {
              status: bundle.vision.status,
              model: bundle.vision.model,
              legend: bundle.vision.legend,
              annotatedCounts: bundle.vision.annotatedCounts,
              issues: bundle.vision.issues,
              stats: bundle.vision.stats,
            }
          : null,
        localBeforeVision: bundle?.local ?? null,
        totalSheets: ctx.project?.sheets.length ?? 1,
        note: recognizedCount
          ? `已在图纸上生成 ${recognizedCount} 个点位（模式：${importMode === 'switches' ? '仅开关' : '全部'}）与 ${createdAreas} 个房间分区`
          : '图纸已添加（未检测到标准 CAD 点位符号，按规则保持 0 默认点位，可在画布手动放置或导入识别 JSON）',
      },
      summary: recognizedCount
        ? `已添加图纸「${name}」（${recognizedCount} 个点位 · ${createdAreas} 个房间${bundle?.vision?.status === 'done' ? ' · 已视觉复核' : ''}）`
        : `已添加户型图「${name}」（无默认点位）`,
      href: `/projects/${ctx.projectId}/point-map`,
      hrefLabel: '查看点位图',
    }
  },
  async import_points_json(args, ctx) {
    if (!ctx.projectId)
      return { result: { error: '没有关联项目，请先新建或关联项目' }, summary: '未关联项目' }
    const jsonText = typeof args.jsonText === 'string' ? args.jsonText.trim() : ''
    if (!jsonText) return { result: { error: '缺少 jsonText 内容' }, summary: '缺少 JSON 内容' }

    const payload = await getPayloadClient()
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { status: true, pointMap: true },
      })
      .catch(() => null)
    if (!project) return { result: { error: '项目不存在或无权限' }, summary: '项目不可用' }
    if (project.status === 'archived')
      return { result: { error: '项目已归档，无法修改点位图' }, summary: '项目已归档' }

    const norm = normalizeScene(project.pointMap as Partial<StoredScene> | null)
    const elements = [...norm.elements]
    const files = { ...norm.files }
    let analyzed = analyzeScene({ elements, files })
    if (!analyzed.sheets.length) {
      const blankFileId = 'blank-sheet'
      files[blankFileId] = {
        id: blankFileId,
        dataURL: '/blank-sheet.svg',
        mimeType: 'image/svg+xml',
      }
      elements.push(...buildSheetElements({ index: 0, name: '一层平面图', fileId: blankFileId }))
      analyzed = analyzeScene({ elements, files })
    }

    const parsed = parsePointImport(jsonText, analyzed.sheets)
    if (!parsed.ok) return { result: { error: parsed.error }, summary: `导入失败：${parsed.error}` }

    const usedCodes = new Set(analyzed.points.map((p) => p.code).filter(Boolean))
    const built = planToElements(parsed.plan, usedCodes)
    elements.push(...built.areas, ...built.points)

    const compacted = compactScene(elements, files, norm.appState)
    await payload.update({
      collection: 'projects',
      id: ctx.projectId,
      data: { pointMap: compacted as never },
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, ctx.projectId)
    return {
      result: {
        addedAreas: parsed.plan.areaCount,
        addedPoints: parsed.plan.pointCount,
        warnings: parsed.plan.warnings,
        totalPoints: ctx.project?.points.length ?? parsed.plan.pointCount,
      },
      summary: `已导入 ${parsed.plan.areaCount} 个区域、${parsed.plan.pointCount} 个点位`,
      href: `/projects/${ctx.projectId}/point-map`,
      hrefLabel: '查看点位图',
    }
  },
  async setup_rooms_and_points(args, ctx) {
    if (!ctx.projectId)
      return { result: { error: '没有关联项目，请先新建或选择项目' }, summary: '未关联项目' }
    const rawRooms = Array.isArray(args.rooms) ? (args.rooms as Record<string, unknown>[]) : []
    if (!rawRooms.length)
      return { result: { error: '请提供 rooms 房间列表' }, summary: '未提供房间列表' }

    const payload = await getPayloadClient()
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { status: true, pointMap: true },
      })
      .catch(() => null)
    if (!project) return { result: { error: '项目不存在或无权限' }, summary: '项目不可用' }
    if (project.status === 'archived')
      return { result: { error: '项目已归档，无法修改点位图' }, summary: '项目已归档' }

    const norm = normalizeScene(project.pointMap as Partial<StoredScene> | null)
    let elements = [...norm.elements]
    const files = { ...norm.files }
    const existingSheets = analyzeScene({ elements, files }).sheets
    const hasRealFloorPlan = existingSheets.some((s) => s.fileId && s.fileId !== 'blank-sheet')
    if (hasRealFloorPlan) {
      return {
        result: {
          skipped: true,
          reason:
            '当前项目已包含真实上传的户型图。按系统规则，点位图打开时不生成网格默认点位，只有真实识别到的点位（add_floor_sheet 的 detectedPoints 或 import_points_json）才会生成图标。',
        },
        summary: '已保持真实户型图干净（不生成网格默认点位）',
        href: `/projects/${ctx.projectId}/point-map`,
        hrefLabel: '打开点位图',
      }
    }

    const sheetName =
      typeof args.sheetName === 'string' && args.sheetName.trim()
        ? args.sheetName.trim().slice(0, 40)
        : '一层平面图'
    const replace = args.mode === 'replace'

    if (replace) {
      elements = []
    }

    let analyzed = analyzeScene({ elements, files })
    let sheet = analyzed.sheets.find((s) => s.name === sheetName) ?? analyzed.sheets[0]
    if (!sheet) {
      const blankFileId = 'blank-sheet'
      files[blankFileId] = {
        id: blankFileId,
        dataURL: '/blank-sheet.svg',
        mimeType: 'image/svg+xml',
      }
      elements.push(...buildSheetElements({ index: 0, name: sheetName, fileId: blankFileId }))
      analyzed = analyzeScene({ elements, files })
      sheet = analyzed.sheets[0]!
    }

    const usedCodes = new Set(analyzed.points.map((p) => p.code).filter(Boolean))
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(rawRooms.length))))
    const rows = Math.ceil(rawRooms.length / cols)
    const padX = 48
    const padY = 48
    const gapX = 24
    const gapY = 24
    const cellW = Math.floor((sheet.width - padX * 2 - gapX * (cols - 1)) / cols)
    const cellH = Math.floor((sheet.height - padY * 2 - gapY * (rows - 1)) / rows)

    let addedAreas = 0
    let addedPoints = 0
    let ruleSkipped = 0
    let vrfCount = 0
    let cameraCount = 0
    for (const [idx, r] of rawRooms.entries()) {
      const rName =
        typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 30) : `房间 ${idx + 1}`
      const rType = isAreaType(r.type) ? r.type : inferAreaType(rName)
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const rx = sheet.x + padX + col * (cellW + gapX)
      const ry = sheet.y + padY + row * (cellH + gapY)

      elements.push(
        ...buildAreaElements({
          name: rName,
          areaType: rType,
          x: rx,
          y: ry,
          width: cellW,
          height: cellH,
        }),
      )
      addedAreas++

      const devs = Array.isArray(r.devices) ? (r.devices as Record<string, unknown>[]) : []
      const flatTypes: string[] = []
      for (const d of devs) {
        const dt =
          resolveDeviceType(d.deviceType ?? d.type) ??
          (isDeviceType(d.deviceType) ? String(d.deviceType) : null)
        if (!dt) continue
        // 设计规范：没有图纸就没有准确的开关 / 灯光点位，这类设备不生成
        // 空白图没有开关点位：中控屏不加入；音箱只放客厅、书房
        if (
          isDrawingOnlyType(dt) ||
          NEEDS_SWITCH_TYPES.has(dt) ||
          (dt === 'speaker' &&
            !isSpeakerArea(
              typeof r.type === 'string' ? r.type : null,
              typeof r.name === 'string' ? r.name : '',
            ))
        ) {
          ruleSkipped++
          continue
        }
        let c = Math.min(20, Math.max(1, Math.round(Number(d.count) || 1)))
        // 数量规范：VRF 每层 1 个、摄像头每层 2 个、音箱 / 中控屏每个区域只放一种一个
        if (dt === 'vrf-controller') c = Math.min(c, VRF_PER_FLOOR - vrfCount)
        if (dt === 'camera') c = Math.min(c, CAMERA_PER_FLOOR - cameraCount)
        if (ONE_PER_AREA_TYPES.has(dt)) c = flatTypes.some((t) => ONE_PER_AREA_TYPES.has(t)) ? 0 : 1
        if (c <= 0) {
          ruleSkipped++
          continue
        }
        if (dt === 'vrf-controller') vrfCount += c
        if (dt === 'camera') cameraCount += c
        for (let i = 0; i < c; i++) flatTypes.push(dt)
      }
      if (!flatTypes.length) continue

      const pCols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(flatTypes.length))))
      const pRows = Math.ceil(flatTypes.length / pCols)
      for (const [pIdx, dt] of flatTypes.entries()) {
        const pc = pIdx % pCols
        const pr = Math.floor(pIdx / pCols)
        const cx = rx + ((pc + 0.6) / (pCols + 0.2)) * cellW
        const cy = ry + 26 + ((pr + 0.5) / (pRows + 0.2)) * (cellH - 36)
        const code = nextPointCode(dt, usedCodes)
        usedCodes.add(code)
        elements.push(...buildPointElements({ deviceType: dt, cx, cy, code }))
        addedPoints++
      }
    }

    const compacted = compactScene(elements, files, norm.appState)
    await payload.update({
      collection: 'projects',
      id: ctx.projectId,
      data: { pointMap: compacted as never },
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, ctx.projectId)
    return {
      result: {
        sheetName: sheet.name,
        addedAreas,
        addedPoints,
        totalPoints: ctx.project?.points.length ?? addedPoints,
        ...(ruleSkipped ? { skippedDrawingOnly: ruleSkipped, rule: DESIGN_RULE_TEXT } : {}),
      },
      summary: `已布置 ${addedAreas} 个房间、${addedPoints} 个点位${ruleSkipped ? `（按设计规范跳过 ${ruleSkipped} 项）` : ''}`,
      href: `/projects/${ctx.projectId}/point-map`,
      hrefLabel: '查看点位图',
    }
  },
  async search_products(args) {
    const catalog = await getCatalog()
    const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
    const dt = typeof args.deviceType === 'string' ? args.deviceType.trim() : ''
    const brand = typeof args.brand === 'string' ? args.brand.trim().toLowerCase() : ''
    const platform = typeof args.platform === 'string' ? args.platform.trim().toLowerCase() : ''
    const maxPrice = typeof args.maxPrice === 'number' && args.maxPrice > 0 ? args.maxPrice : null

    const matched = catalog
      .filter((p) => (p.status ?? 'active') === 'active')
      .filter((p) => (!dt ? true : p.deviceType === dt))
      .filter((p) => (!brand ? true : (p.brand?.name ?? '').toLowerCase().includes(brand)))
      .filter((p) =>
        !platform ? true : p.platforms.some((pl) => pl.toLowerCase().includes(platform)),
      )
      .filter((p) => (maxPrice === null ? true : p.price <= maxPrice))
      .filter((p) =>
        !q
          ? true
          : `${p.name} ${p.sku} ${p.brand?.name ?? ''} ${deviceTypeOf(p.deviceType ?? '')?.name ?? ''}`
              .toLowerCase()
              .includes(q),
      )
      .slice(0, 15)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        brand: p.brand?.name ?? null,
        deviceType: p.deviceType,
        deviceTypeLabel: deviceTypeOf(p.deviceType ?? '')?.name ?? p.deviceType,
        platforms: p.platforms,
        price: p.price,
        cost: p.cost,
        unit: p.unit,
      }))

    return {
      result: { count: matched.length, products: matched },
      summary: `检索到 ${matched.length} 款产品`,
      href: '/products',
      hrefLabel: '打开产品库',
    }
  },
  async set_project_defaults(args, ctx) {
    if (!ctx.projectId) return { result: { error: '没有关联项目' }, summary: '未关联项目' }
    const payload = await getPayloadClient()
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { status: true, defaultProducts: true },
      })
      .catch(() => null)
    if (!project || project.status === 'archived')
      return { result: { error: '项目不可用或已归档' }, summary: '项目不可修改' }

    const catalog = await getCatalog()
    const byId = new Map(catalog.map((p) => [p.id, p]))
    const defaults = parseDefaults(project.defaultProducts)
    const rawItems = Array.isArray(args.items)
      ? (args.items as { deviceType?: unknown; productId?: unknown }[])
      : []
    const updated: { deviceType: string; productName: string; price: number }[] = []

    for (const it of rawItems) {
      const dt =
        typeof it.deviceType === 'string' && isDeviceType(it.deviceType) ? it.deviceType : null
      const pid = typeof it.productId === 'string' ? it.productId : null
      const prod = pid ? byId.get(pid) : null
      if (!dt || !prod) continue
      defaults[dt] = prod.id
      updated.push({
        deviceType: deviceTypeOf(dt)?.name ?? dt,
        productName: prod.name,
        price: prod.price,
      })
    }
    if (!updated.length)
      return { result: { error: '未匹配到有效的设备类型或产品 ID' }, summary: '未更新型号' }

    await payload.update({
      collection: 'projects',
      id: ctx.projectId,
      data: { defaultProducts: defaults },
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, ctx.projectId)
    return {
      result: { updated },
      summary: `已更新 ${updated.length} 类设备的默认型号`,
      href: `/projects/${ctx.projectId}/point-map`,
      hrefLabel: '查看点位图',
    }
  },
  async get_project_details(_args, ctx) {
    if (!ctx.project || !ctx.projectId) {
      return { result: { error: '没有关联项目，请先新建或关联项目' }, summary: '未关联项目' }
    }
    const payload = await getPayloadClient()
    const quotes = await payload.find({
      collection: 'quotes',
      where: { project: { equals: ctx.projectId } },
      sort: '-updatedAt',
      limit: 5,
      depth: 0,
      user: ctx.user,
      overrideAccess: false,
      select: {
        title: true,
        status: true,
        discount: true,
        total: true,
        items: true,
        fees: true,
        notes: true,
      },
    })
    return {
      result: {
        project: {
          id: ctx.projectId,
          name: ctx.project.project.name,
          customerName: ctx.project.project.customerName,
          customerPhone: ctx.project.project.customerPhone,
          community: ctx.project.project.community,
          address: ctx.project.project.address,
          platform: ctx.project.project.platform,
          budget: ctx.project.project.budget,
          totalPoints: ctx.project.points.length,
          pendingPoints: ctx.project.pending,
          equipmentTotal: ctx.project.total,
        },
        products: ctx.project.products.map((r) => ({
          deviceType: deviceTypeOf(r.deviceType)?.name ?? r.deviceType,
          name: r.product.name,
          brand: r.product.brand?.name ?? null,
          price: r.product.price,
          count: r.count,
          subtotal: r.subtotal,
          rooms: r.rooms,
        })),
        quotes: quotes.docs.map((q) => ({
          id: String(q.id),
          title: q.title,
          status: q.status,
          discount: q.discount,
          total: q.total,
          fees: q.fees ?? [],
          itemCount: (q.items ?? []).length,
        })),
        contract: ctx.project.contract
          ? {
              id: String(ctx.project.contract.id),
              number: ctx.project.contract.number,
              amount: ctx.project.contract.amount,
              status: ctx.project.contract.status,
              payments: ctx.project.contract.payments ?? [],
            }
          : null,
      },
      summary: `读取了 ${ctx.project.products.length} 项设备与 ${quotes.docs.length} 份报价`,
      href: `/projects/${ctx.projectId}`,
      hrefLabel: '查看项目',
    }
  },
  async create_or_update_quote(args, ctx) {
    if (!ctx.projectId)
      return { result: { error: '没有关联项目，请先新建或选择项目' }, summary: '未关联项目' }
    const payload = await getPayloadClient()
    const fees = Array.isArray(args.fees)
      ? (args.fees as { name?: unknown; amount?: unknown }[])
          .map((f) => ({
            name: typeof f.name === 'string' ? f.name.trim().slice(0, 60) : '',
            amount:
              typeof f.amount === 'number' && Number.isFinite(f.amount) && f.amount >= 0
                ? Math.round(f.amount * 100) / 100
                : 0,
          }))
          .filter((f) => f.name && f.amount > 0)
      : undefined

    // 修改已有报价单
    if (typeof args.quoteId === 'string' && args.quoteId.trim()) {
      const qid = args.quoteId.trim()
      const patch: Record<string, unknown> = {}
      if (typeof args.title === 'string' && args.title.trim())
        patch.title = args.title.trim().slice(0, 60)
      const nextStatus = parseQuoteStatus(args.status)
      if (nextStatus) patch.status = nextStatus
      if (typeof args.discount === 'number' && args.discount >= 0)
        patch.discount = Math.round(args.discount * 100) / 100
      if (fees !== undefined) patch.fees = fees
      if (typeof args.notes === 'string') patch.notes = args.notes.trim().slice(0, 2000) || null

      const updated = await payload.update({
        collection: 'quotes',
        id: qid,
        data: patch as never,
        user: ctx.user,
        overrideAccess: false,
        depth: 0,
      })
      ctx.mutated = true
      await refreshContextProject(ctx, ctx.projectId)
      return {
        result: {
          quoteId: String(updated.id),
          title: updated.title,
          status: updated.status,
          total: updated.total,
          discount: updated.discount,
        },
        summary: `已更新「${updated.title}」（合计 ¥${updated.total}）`,
        href: `/projects/${ctx.projectId}/quotes/${updated.id}`,
        hrefLabel: '查看报价单',
      }
    }

    // 新建报价单
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { name: true, status: true, platform: true, pointMap: true, defaultProducts: true },
      })
      .catch(() => null)
    if (!project) return { result: { error: '项目不存在或无权限' }, summary: '项目不可用' }
    if (project.status === 'archived')
      return { result: { error: '项目已归档，不能新建报价' }, summary: '项目已归档' }

    const elements = ((project.pointMap as { elements?: unknown[] } | null)?.elements ?? []) as {
      isDeleted?: boolean
      customData?: PointCustomData
    }[]
    const allPoints = elements
      .filter((el) => !el?.isDeleted && isPointData(el?.customData))
      .map((el) => el.customData!)
    const catalog = await getCatalog()
    const byId = new Map(catalog.map((p) => [p.id, p]))
    const points = allPoints.filter((cd) => inPointScope(pointDeviceType(cd, byId), 'all'))
    const summary = summarizePoints(
      points,
      byId,
      fillDefaultProducts(parseDefaults(project.defaultProducts), catalog, project.platform),
    )
    const items = [...summary.products.entries()]
      .map(([id, row]) => ({ p: byId.get(id)!, row }))
      .sort(
        (a, b) =>
          DEVICE_TYPE_ORDER.indexOf(a.p.deviceType ?? a.row.deviceType) -
          DEVICE_TYPE_ORDER.indexOf(b.p.deviceType ?? b.row.deviceType),
      )
      .map(({ p, row }) => ({
        product: p.id,
        deviceType: (p.deviceType ?? row.deviceType) as never,
        image: p.image?.id ?? null,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        price: p.price,
        quantity: row.count,
      }))

    if (items.length === 0) {
      return {
        result: {
          error:
            '当前项目还没有已选型的点位。请先调用 setup_rooms_and_points 布置点位，并调用 smart_select(apply=true) 配好默认型号后再生成报价。',
        },
        summary: '点位尚未选型',
        href: `/projects/${ctx.projectId}/point-map`,
      }
    }

    const company = await getCompanyInfo(ctx.user.id)
    const existing = await payload.count({
      collection: 'quotes',
      where: { project: { equals: ctx.projectId } },
      user: ctx.user,
      overrideAccess: false,
    })
    const title =
      typeof args.title === 'string' && args.title.trim()
        ? args.title.trim().slice(0, 60)
        : `报价 ${existing.totalDocs + 1}`
    const discount =
      typeof args.discount === 'number' && args.discount >= 0
        ? Math.round(args.discount * 100) / 100
        : 0
    const notes =
      typeof args.notes === 'string' && args.notes.trim()
        ? args.notes.trim().slice(0, 2000)
        : (company.quoteNotes ?? null)
    const status = parseQuoteStatus(args.status) ?? 'draft'

    const quote = await payload.create({
      collection: 'quotes',
      data: { title, project: ctx.projectId, status, items, fees: fees ?? [], discount, notes },
      user: ctx.user,
      overrideAccess: false,
      depth: 0,
    })
    ctx.mutated = true
    await refreshContextProject(ctx, ctx.projectId)
    return {
      result: {
        quoteId: String(quote.id),
        title: quote.title,
        status: quote.status,
        itemCount: items.length,
        pendingPoints: summary.pendingTotal,
        total: quote.total,
      },
      summary: `已生成「${quote.title}」（合计 ¥${quote.total}）`,
      href: `/projects/${ctx.projectId}/quotes/${quote.id}`,
      hrefLabel: '打开报价单',
    }
  },
  async create_or_update_contract(args, ctx) {
    if (!ctx.projectId)
      return { result: { error: '没有关联项目，请先新建或选择项目' }, summary: '未关联项目' }
    const payload = await getPayloadClient()
    const [project, existingContracts, quotesRes, company] = await Promise.all([
      payload
        .findByID({
          collection: 'projects',
          id: ctx.projectId,
          depth: 0,
          user: ctx.user,
          overrideAccess: false,
        })
        .catch(() => null),
      payload.find({
        collection: 'contracts',
        where: { project: { equals: ctx.projectId } },
        limit: 1,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'quotes',
        where: { project: { equals: ctx.projectId } },
        sort: '-updatedAt',
        limit: 5,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
      }),
      getCompanyInfo(ctx.user.id),
    ])
    if (!project) return { result: { error: '项目不存在或无权限' }, summary: '项目不可用' }

    let contract = existingContracts.docs[0] ?? null
    const targetQuoteId =
      typeof args.quoteId === 'string' && args.quoteId.trim() ? args.quoteId.trim() : null
    const quote =
      (targetQuoteId ? quotesRes.docs.find((q) => String(q.id) === targetQuoteId) : null) ??
      quotesRes.docs[0] ??
      null

    if (!contract) {
      if (!quote) {
        return {
          result: {
            error: '该项目还没有报价单，请先调用 create_or_update_quote 生成报价单后再创建合同',
          },
          summary: '缺少报价单',
          href: `/projects/${ctx.projectId}/quotes`,
        }
      }
      contract = await payload.create({
        collection: 'contracts',
        data: {
          project: project.id,
          quote: quote.id,
          status: 'draft',
          amount: quote.total ?? 0,
          customerName: project.customerName ?? null,
          customerPhone: project.customerPhone ?? null,
          address: [project.community, project.address].filter(Boolean).join(' ') || null,
          durationDays: DEFAULT_DURATION_DAYS,
          warrantyMonths: DEFAULT_WARRANTY_MONTHS,
          payments: DEFAULT_PAYMENTS.map((p) => ({
            name: p.name,
            percent: p.percent,
            received: false,
          })),
          terms: company.contractTerms?.trim() || DEFAULT_CONTRACT_TERMS,
        } as never,
        user: ctx.user,
        overrideAccess: false,
        depth: 0,
      })
    }

    const patch: Record<string, unknown> = {}
    if (contract.status !== 'signed') {
      if (typeof args.amount === 'number' && args.amount >= 0)
        patch.amount = Math.round(args.amount * 100) / 100
      if (
        typeof args.durationDays === 'number' &&
        args.durationDays >= 1 &&
        args.durationDays <= 365
      )
        patch.durationDays = Math.round(args.durationDays)
      if (
        typeof args.warrantyMonths === 'number' &&
        args.warrantyMonths >= 0 &&
        args.warrantyMonths <= 120
      )
        patch.warrantyMonths = Math.round(args.warrantyMonths)
      if (typeof args.terms === 'string' && args.terms.trim())
        patch.terms = args.terms.trim().slice(0, 5000)
      if (Array.isArray(args.payments) && args.payments.length > 0 && args.payments.length <= 6) {
        const parsed = (
          args.payments as { name?: unknown; percent?: unknown; received?: unknown }[]
        )
          .map((p) => ({
            name: typeof p.name === 'string' ? p.name.trim().slice(0, 40) : '',
            percent: typeof p.percent === 'number' ? Math.round(p.percent * 100) / 100 : 0,
            received: Boolean(p.received),
          }))
          .filter((p) => p.name && p.percent >= 0 && p.percent <= 100)
        if (parsed.length && Math.abs(paymentPercentTotal(parsed) - 100) < 0.01) {
          patch.payments = parsed
        }
      }
    } else if (Array.isArray(args.payments)) {
      const receivedFlags = (args.payments as { received?: unknown }[]).map((p) =>
        Boolean(p?.received),
      )
      patch.payments = (contract.payments ?? []).map((p, i) => ({
        id: p.id,
        name: p.name,
        percent: p.percent,
        received: receivedFlags[i] ?? Boolean(p.received),
      }))
    }
    if (isContractStatus(args.status) && args.status !== contract.status) {
      patch.status = args.status
      if (args.status === 'signed') patch.signedAt = new Date().toISOString()
    }

    if (Object.keys(patch).length > 0) {
      contract = await payload.update({
        collection: 'contracts',
        id: contract.id,
        data: patch as never,
        user: ctx.user,
        overrideAccess: false,
        depth: 0,
      })
    }

    ctx.mutated = true
    await refreshContextProject(ctx, ctx.projectId)
    return {
      result: {
        contractId: String(contract.id),
        number: contract.number,
        status: contract.status,
        amount: contract.amount,
        payments: contract.payments ?? [],
      },
      summary: `合同「${contract.number}」（¥${contract.amount}，${contract.status === 'signed' ? '已签订' : '草稿'}）`,
      href: `/projects/${ctx.projectId}/contract`,
      hrefLabel: '打开合同页',
    }
  },
  async get_document_links(args, ctx) {
    if (!ctx.projectId || !ctx.project)
      return { result: { error: '没有关联项目' }, summary: '未关联项目' }
    const style =
      typeof args.style === 'string' &&
      ['qixu', 'business', 'oriental', 'tech', 'minimal'].includes(args.style)
        ? args.style
        : 'qixu'
    const pid = ctx.projectId
    const qid = ctx.project.quote ? String(ctx.project.quote.id) : null
    const cid = ctx.project.contract ? String(ctx.project.contract.id) : null
    const links = {
      plans: `/print/projects/${pid}/plans?style=${style}`,
      checklist: `/print/projects/${pid}/checklist?style=${style}`,
      proposalQixu: `/print/projects/${pid}/proposal?template=qixu`,
      quote: qid ? `/print/quotes/${qid}?style=${style}` : null,
      contract: cid ? `/print/contracts/${cid}?style=${style}` : null,
      archive: `/projects/${pid}/archive`,
    }
    return {
      result: { project: ctx.project.project.name, style, links },
      summary: `已生成「${ctx.project.project.name}」的文档打印链接`,
      href: `/projects/${pid}/archive`,
      hrefLabel: '打开项目归档与文档页',
    }
  },
  async generate_image(args, ctx) {
    const userPrompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
    if (!userPrompt) throw new Error('请提供图片描述')
    if (userPrompt.length > 2000) throw new Error('图片描述最多 2000 字')
    const model = IMAGE_MODELS[0]
    const size =
      typeof args.size === 'string' && (model.sizes as readonly string[]).includes(args.size)
        ? args.size
        : model.sizes[0]
    const payload = await getPayloadClient()
    const fresh = await payload.findByID({
      collection: 'users',
      id: ctx.user.id,
      depth: 0,
      overrideAccess: true,
      select: { aiCredits: true },
    })
    if ((fresh.aiCredits ?? 0) < model.cost)
      throw new Error(`积分不足，本模型需要 ${model.cost} 积分`)

    // 有参考图时：先由视觉模型理解参考图（空间、构图、风格），再写成生图提示词
    const wantsReference =
      (ctx.images?.length ?? 0) > 0 &&
      (args.useAttachedImage === true ||
        (args.useAttachedImage !== false &&
          /参考|这张|上传的|按照这|根据这|照着|基于/.test(userPrompt)))
    const reference = wantsReference ? ctx.images![0] : null
    let finalPrompt = userPrompt
    let referenceNote: string | null = null
    if (reference && ctx.visionModels?.length) {
      ctx.notify?.('视觉模型正在理解参考图…')
      const res = await callVision({
        images: [reference.dataUrl],
        system: '你是室内设计与 AI 绘图提示词专家，只描述参考图里能确认的内容。',
        prompt: [
          `用户想参考这张图生成图片，需求：「${userPrompt}」。`,
          '先理解参考图（空间类型、布局与构图、视角、风格、材质色调、灯光、关键家具与智能设备）；若参考图是户型平面图，则把它理解为对应户型的室内空间。',
          '再写一段给文生图模型的中文提示词（220 字以内）：保留参考图的空间布局与视角，融入用户需求，写清风格、材质、光线与镜头，不要出现文字水印。',
          '只返回 JSON：{"prompt":"...","reference":"一句话概括参考图"}',
        ].join('\n'),
        models: ctx.visionModels,
        maxTokens: 800,
        timeoutMs: 45_000,
      })
      if (res) {
        ctx.recordUsage?.(res.model, res.usage, { input: userPrompt, output: res.text })
        const parsed = extractJson<{ prompt?: string; reference?: string }>(res.text)
        if (parsed?.prompt?.trim()) finalPrompt = parsed.prompt.trim().slice(0, 1800)
        referenceNote = parsed?.reference?.trim() || null
      }
    }

    ctx.notify?.('正在生成图片…')
    const image = await generateImage({
      prompt: finalPrompt,
      model: model.id as never,
      size,
      userId: ctx.user.id,
      referenceImage: reference?.dataUrl ?? null,
    })
    let balance: number | null = null
    try {
      const entry = await payload.create({
        collection: 'ai-credit-ledger',
        data: {
          user: ctx.user.id,
          delta: -model.cost,
          reason: `AI 生图 · ${model.name} · ${userPrompt.slice(0, 40)}`,
        },
        overrideAccess: true,
        depth: 0,
      })
      balance = entry.balanceAfter ?? null
    } catch {
      // 图片已生成，扣费失败不影响返回
    }

    // 生成后由视觉模型质检：画面是否符合需求、有无畸形与乱码文字
    let qa: { score?: number; caption?: string; issues?: string[] } | null = null
    if (ctx.visionModels?.length) {
      ctx.notify?.('视觉模型正在质检生成结果…')
      const generated = await encodeImageForVision(image.buffer, {
        maxSide: 1024,
        quality: 82,
      }).catch(() => null)
      const res = generated
        ? await callVision({
            images: [generated],
            prompt: `请对照需求检查这张 AI 生成的图片。需求：「${userPrompt}」。只返回 JSON：{"score":0到10的整数,"caption":"30字以内描述画面","issues":["与需求不符或明显瑕疵（畸形、乱码文字、透视错误等），没有则为空数组"]}`,
            models: ctx.visionModels,
            maxTokens: 400,
            timeoutMs: 40_000,
          })
        : null
      if (res) {
        ctx.recordUsage?.(res.model, res.usage, { input: userPrompt, output: res.text })
        const parsed = extractJson<{ score?: unknown; caption?: unknown; issues?: unknown }>(
          res.text,
        )
        if (parsed) {
          const score = Math.round(Number(parsed.score))
          qa = {
            score: Number.isFinite(score) ? Math.min(10, Math.max(0, score)) : undefined,
            caption: typeof parsed.caption === 'string' ? parsed.caption.slice(0, 60) : undefined,
            issues: Array.isArray(parsed.issues)
              ? parsed.issues.filter((x): x is string => typeof x === 'string').slice(0, 5)
              : [],
          }
        }
      }
    }
    return {
      result: {
        mediaId: image.mediaId,
        url: image.url,
        width: image.width,
        height: image.height,
        model: image.model,
        cost: model.cost,
        balance,
        promptUsed: finalPrompt,
        referenceUsed: Boolean(reference),
        referenceSummary: referenceNote,
        visionQa: qa,
        tip:
          qa && (qa.score ?? 10) < 7
            ? '视觉质检分偏低，建议向用户说明问题并提供重新生成的选项'
            : undefined,
      },
      summary: `已生成图片（${model.cost} 积分${reference ? ' · 参考上传图片' : ''}${qa?.score != null ? ` · 视觉质检 ${qa.score}/10` : ''}${balance != null ? ` · 余额 ${balance}` : ''}）`,
      href: image.url,
      hrefLabel: '查看图片',
      imageUrl: image.url,
    }
  },
  async plan_points_with_vision(args, ctx) {
    if (!ctx.projectId)
      return { result: { error: '没有关联项目，请先新建或关联项目' }, summary: '未关联项目' }
    if (!ctx.visionModels?.length)
      return {
        result: { error: '后台尚未启用视觉模型，无法看图规划点位' },
        summary: '未配置视觉模型',
      }
    const payload = await getPayloadClient()
    const project = await payload
      .findByID({
        collection: 'projects',
        id: ctx.projectId,
        depth: 0,
        user: ctx.user,
        overrideAccess: false,
        select: { name: true, status: true, pointMap: true },
      })
      .catch(() => null)
    if (!project) return { result: { error: '项目不存在或无权限' }, summary: '项目不可用' }
    if (project.status === 'archived')
      return { result: { error: '项目已归档，无法修改点位图' }, summary: '项目已归档' }

    const norm = normalizeScene(project.pointMap as Partial<StoredScene> | null)
    let elements = [...norm.elements]
    const files = { ...norm.files }
    let analyzed = analyzeScene({ elements, files })
    const sheetFilter = typeof args.sheetName === 'string' ? args.sheetName.trim() : ''
    const sheets = analyzed.sheets
      .filter((s) => s.fileId !== 'blank-sheet' && s.url)
      .filter((s) => !sheetFilter || s.name.includes(sheetFilter))
      .slice(0, 3)
    if (!sheets.length)
      return {
        result: { error: '当前项目还没有上传户型图纸，请先上传户型图' },
        summary: '缺少户型图纸',
      }

    const DEFAULT_TYPES = [
      'ap-node',
      'ceiling-ap',
      'network-panel',
      'curtain-track',
      'gateway',
      'vrf-controller',
      'motion-sensor',
      'speaker',
      'touch-panel',
      'camera',
      'contact-sensor',
      'water-sensor',
      'smoke-sensor',
    ]
    const EXTRA_TYPES = ['temp-sensor', 'doorbell', 'smart-lock', 'ac-router']
    const requested = Array.isArray(args.deviceTypes)
      ? args.deviceTypes
          .map((t) => resolveDeviceType(t) ?? (isDeviceType(t) ? String(t) : ''))
          .filter(Boolean)
      : []
    const allowed = new Set(
      (requested.length ? requested : DEFAULT_TYPES).filter(
        (t) => [...DEFAULT_TYPES, ...EXTRA_TYPES].includes(t) && !isDrawingOnlyType(t),
      ),
    )
    if (!allowed.size)
      return {
        result: {
          error:
            '开关、插座、灯具只能照图识别，不能由 AI 规划；请指定 AP、窗帘、传感器、摄像头等智能设备',
        },
        summary: '设备类型不可规划',
      }
    const roomFilter = Array.isArray(args.rooms)
      ? args.rooms
          .filter((r): r is string => typeof r === 'string' && Boolean(r.trim()))
          .map((r) => r.trim())
      : []
    const requirements =
      typeof args.requirements === 'string' ? args.requirements.trim().slice(0, 500) : ''
    const replacePlanned = args.replacePlanned !== false

    // 先移除之前由本工具规划的点位（同组的代号文字一起移除），再重新规划
    if (replacePlanned) {
      const sheetIds = new Set(sheets.map((s) => s.id))
      const plannedGroups = new Set<string>()
      for (const p of analyzed.points) {
        if (!p.sheetId || !sheetIds.has(p.sheetId)) continue
        const el = elements.find((e) => e.id === p.id)
        if (el?.customData?.aiPlanned === true)
          for (const g of el.groupIds ?? []) plannedGroups.add(g)
      }
      if (plannedGroups.size) {
        elements = elements.filter((e) => !(e.groupIds ?? []).some((g) => plannedGroups.has(g)))
        analyzed = analyzeScene({ elements, files })
      }
    }

    const typeName = (t: string) => deviceTypeOf(t)?.name ?? t
    const usedCodes = new Set(analyzed.points.map((p) => p.code).filter(Boolean))
    const created: { deviceType: string; room: string; reason: string; sheet: string }[] = []
    const notes: string[] = []
    const cameraCap = /摄像|监控/.test(requirements) ? 8 : CAMERA_PER_FLOOR
    // 智能音箱默认只放客厅和书房；客户明确提出音箱需求时按要求放
    const speakerAnywhere = /音箱|音响|背景音乐/.test(requirements)

    for (const sheet of sheets) {
      ctx.notify?.(`视觉模型正在看图规划「${sheet.name}」的智能设备点位…`)
      const dataUrl = await loadImageDataUrlForVision({ url: sheet.url }, 2048)
      if (!dataUrl) {
        notes.push(`「${sheet.name}」图纸读取失败，已跳过`)
        continue
      }
      const sheetAreas = analyzed.areas.filter((a) => a.sheetId === sheet.id)
      const rel = (v: number, o: number, len: number) => Math.round(((v - o) / len) * 1000) / 1000
      const areaList = sheetAreas.map((a) => ({
        name: a.name,
        type: a.areaType,
        rect: [
          rel(a.x, sheet.x, sheet.width),
          rel(a.y, sheet.y, sheet.height),
          Math.round((a.width / sheet.width) * 1000) / 1000,
          Math.round((a.height / sheet.height) * 1000) / 1000,
        ],
      }))
      const sheetPoints = analyzed.points.filter(
        (p) => p.sheetId === sheet.id && p.rx != null && p.ry != null,
      )
      const areaName = (id: string | null) => sheetAreas.find((a) => a.id === id)?.name ?? null
      const pointList = sheetPoints
        .slice(0, 160)
        .map((p) => ({ type: p.deviceType, x: p.rx, y: p.ry, room: areaName(p.areaId) }))
      const res = await callVision({
        images: [dataUrl],
        system:
          '你是资深全屋智能方案设计师，熟悉弱电与智能设备的安装位置规范。只依据图纸能确认的空间布局规划，严格输出 JSON。',
        prompt: [
          `这是项目「${project.name}」的图纸「${sheet.name}」，坐标为 0~1 归一化（左上角 (0,0)，右下角 (1,1)）。`,
          `已有房间：${areaList.length ? JSON.stringify(areaList) : '（图纸上还没有画房间区域，请根据图纸自行判断房间）'}`,
          `已有点位：${pointList.length ? JSON.stringify(pointList) : '（暂无）'}`,
          `平台设计规范：${DESIGN_RULE_TEXT}`,
          `本次只规划这些设备类型：${[...allowed].map((t) => `${t}（${typeName(t)}）`).join('、')}。`,
          roomFilter.length ? `只规划这些房间：${roomFilter.join('、')}。` : '规划范围：整张图纸。',
          requirements ? `客户额外要求：${requirements}` : '',
          '安装位置常识：AP/吸顶 AP 放在客厅、走廊、卧室等区域顶面开阔处，保证全屋覆盖且不重复；网络面板靠电视墙或书桌墙面；窗帘电轨沿窗户内侧；人体传感器在玄关、走廊、卫生间入口或吊顶中部；门磁在入户门与外窗；水浸在厨房水槽下、卫生间地漏旁；烟感在厨房顶面；摄像头在入户门口与客厅角落；中控屏在入户或客厅开关旁；智能音箱在客厅或书房；VRF 控制器在客厅墙面；网关在客厅电视柜或弱电箱附近。已有同类点位的房间不要重复规划。',
          '只返回 JSON：{"placements":[{"deviceType":"ap-node","x":0.452,"y":0.318,"room":"客厅","reason":"一句理由"}],"notes":"60 字以内的整体说明"}',
        ]
          .filter(Boolean)
          .join('\n'),
        models: ctx.visionModels,
        maxTokens: 3000,
        timeoutMs: 75_000,
      })
      if (!res) {
        notes.push(`「${sheet.name}」视觉模型暂时不可用，未规划`)
        continue
      }
      ctx.recordUsage?.(res.model, res.usage, { input: sheet.name, output: res.text })
      const parsed = extractJson<{ placements?: Array<Record<string, unknown>>; notes?: unknown }>(
        res.text,
      )
      if (typeof parsed?.notes === 'string' && parsed.notes.trim())
        notes.push(`「${sheet.name}」${parsed.notes.trim().slice(0, 120)}`)
      const hasSwitch = sheetPoints.some((p) => p.deviceType.startsWith('switch-'))
      const placed: { type: string; x: number; y: number; area: string | null }[] = sheetPoints.map(
        (p) => ({ type: p.deviceType, x: p.rx!, y: p.ry!, area: p.areaId }),
      )
      const areaAt = (x: number, y: number) =>
        sheetAreas.find((a) => {
          const ax = (a.x - sheet.x) / sheet.width
          const ay = (a.y - sheet.y) / sheet.height
          return (
            x >= ax &&
            x <= ax + a.width / sheet.width &&
            y >= ay &&
            y <= ay + a.height / sheet.height
          )
        }) ?? null
      for (const raw of (parsed?.placements ?? []).slice(0, 60)) {
        const t =
          resolveDeviceType(raw.deviceType) ??
          (isDeviceType(raw.deviceType) ? String(raw.deviceType) : '')
        const x = Number(raw.x)
        const y = Number(raw.y)
        if (
          !t ||
          !allowed.has(t) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0.02 ||
          x > 0.98 ||
          y < 0.02 ||
          y > 0.98
        )
          continue
        const area = areaAt(x, y)
        const roomName =
          (area?.name ?? (typeof raw.room === 'string' ? raw.room.trim().slice(0, 20) : '')) ||
          '公共区域'
        if (
          roomFilter.length &&
          !roomFilter.some((r) => roomName.includes(r) || r.includes(roomName))
        )
          continue
        if (NEEDS_SWITCH_TYPES.has(t) && !hasSwitch) continue
        if (t === 'speaker' && !speakerAnywhere && !isSpeakerArea(area?.areaType, roomName))
          continue
        if (
          ONE_PER_AREA_TYPES.has(t) &&
          area &&
          placed.some((p) => p.area === area.id && ONE_PER_AREA_TYPES.has(p.type))
        )
          continue
        if (t === 'vrf-controller' && placed.filter((p) => p.type === t).length >= VRF_PER_FLOOR)
          continue
        if (t === 'camera' && placed.filter((p) => p.type === t).length >= cameraCap) continue
        if (t === 'gateway' && placed.some((p) => p.type === t)) continue
        if (placed.some((p) => p.type === t && Math.hypot(p.x - x, p.y - y) < 0.03)) continue
        const code = nextPointCode(t, usedCodes)
        usedCodes.add(code)
        const [marker, label] = buildPointElements({
          deviceType: t,
          cx: sheet.x + x * sheet.width,
          cy: sheet.y + y * sheet.height,
          code,
        })
        marker.customData = { ...(marker.customData ?? {}), aiPlanned: true }
        elements.push(marker, label)
        placed.push({ type: t, x, y, area: area?.id ?? null })
        created.push({
          deviceType: t,
          room: roomName,
          reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 60) : '',
          sheet: sheet.name,
        })
      }
    }

    if (created.length) {
      const compacted = compactScene(elements, files, norm.appState)
      await payload.update({
        collection: 'projects',
        id: ctx.projectId,
        data: { pointMap: compacted as never },
        user: ctx.user,
        overrideAccess: false,
        depth: 0,
      })
      ctx.mutated = true
      await refreshContextProject(ctx, ctx.projectId)
    }
    const byType = new Map<string, number>()
    for (const c of created) byType.set(c.deviceType, (byType.get(c.deviceType) ?? 0) + 1)
    const typeText = [...byType].map(([t, n]) => `${typeName(t)}×${n}`).join('、')
    return {
      result: {
        created: created.length,
        byType: Object.fromEntries(byType),
        placements: created,
        notes,
        rulesApplied:
          '开关/插座/灯具不规划；中控屏需有开关点位；音箱与中控屏每区域只放一种；VRF 每层 1 个；摄像头默认每层 2 个',
      },
      summary: created.length
        ? `视觉布点完成：新增 ${created.length} 个点位（${typeText}）`
        : '视觉布点未新增点位（已有点位已满足或图纸无法判断）',
      href: `/projects/${ctx.projectId}/point-map`,
      hrefLabel: '查看点位图',
    }
  },
}
