'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  Eraser,
  FileJson,
  FilePlus2,
  FileUp,
  ImageDown,
  ImagePlus,
  Info,
  Layers,
  Loader2,
  MapPinned,
  Maximize2,
  Minimize2,
  MapPinPlus,
  Minus,
  PencilLine,
  Plus,
  Presentation,
  ReceiptText,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'

import { BetaDocLink } from '@/components/beta-doc-link'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import type { StyleTransferHandoff } from '@/lib/style-templates'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { useWorkspaceChrome } from '@/components/workspace-chrome'
import { Switch } from '@astryxdesign/core/Switch'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { useToast } from '@astryxdesign/core/Toast'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { BoardCanvas, type CanvasContext } from '@/board/canvas/board-canvas'
import { download, exportSheetPng } from '@/board/canvas/export'
import { useViewSettings } from '@/board/canvas/use-view-settings'
import { fromDeg, toDeg, unionBox } from '@/board/core/geometry'
import { useBoardHistory } from '@/board/core/history'
import { moveObjects, rawBox, removeObjects, rotateSymbols, sheetsOf } from '@/board/core/ops'
import type { CheckIssue } from '@/board/core/pack'
import type {
  BoardFile,
  BoardObj,
  BoardTool,
  Box,
  SheetObj,
  SymbolObj,
  SymbolTemplate,
  Vec,
  Viewport,
} from '@/board/core/types'
import { fitBox, lerpViewport, toScene, zoomAt, type Size } from '@/board/core/viewport'
import { smartHomePack } from '@/board/packs/smart-home'
import {
  analyzeDoc,
  decodeScene,
  encodeDoc,
  exportBoardJson,
  parseBoardJson,
} from '@/board/packs/smart-home/codec'
import { lightingVariant } from '@/board/packs/smart-home/look'
import {
  autoGenerateSheetPoints,
  changePointType,
  cloneObjects,
  createArea,
  createPoint,
  createSheet,
  removeSheet,
  setPointReal,
  setPointVariant,
  updateArea as updateAreaOp,
  updateSheet,
} from '@/board/packs/smart-home/ops'
import { analyzeAreas } from '@/lib/area-analysis'
import { areaTypeLabel } from '@/lib/area-types'
import { DEVICE_GROUPS, DEVICE_TYPE_ORDER, deviceTypeLabel } from '@/lib/device-types'
import { registerLeaveGuard } from '@/lib/leave-guard'
import { summarizePoints, type ProjectDefaults } from '@/lib/point-map-items'
import {
  inferScopeFromTitle,
  inPointScope,
  POINT_SCOPES,
  pointScopeLabel,
  type PointScope,
} from '@/lib/point-scopes'
import { compactScene, inlineFileIds, type SceneFile, type StoredScene } from '@/lib/point-scene'
import { cn } from '@/lib/utils'
import type { SelectionTier } from '@/plugins/smart-select/auto-select'
import { SmartSelect } from '@/plugins/smart-select/smart-select-panel'

import { createQuoteFromProject, syncQuoteFromPointMap } from '../quotes/actions'

import { BOARD_TOOLS, BoardViewPopover } from './board-toolbar'
import { DisplayProfilePicker } from './display-profile-picker'
import {
  AreasPanel,
  DRAG_TYPE,
  PlacePanel,
  PointMapContextMenu,
  SelectedArea,
  SelectedPoint,
  TypeDefaultRow,
  yuan,
  type CanvasContextMenuTarget,
  type PointProduct,
} from './editor-panels'
import { LightingPanel } from './lighting-panel'
import { SheetCropper } from './sheet-cropper'
import { AiStyleDialog } from './ai-style-dialog'

export type { PointProduct } from './editor-panels'

/** 图纸铺满画布时四周留一点边：这个状态显示为 100% */
const FIT = 0.96
/** 工具栏图标按钮：幽灵样式 + 悬停提示 */
function ToolbarIconButton({
  label,
  pressed,
  className,
  children,
  ...props
}: {
  label: string
  pressed?: boolean
  className?: string
  children: React.ReactNode
  onClick?: () => void
  isDisabled?: boolean
}) {
  return (
    <Tooltip content={label} placement="below">
      <IconButton
        variant="ghost"
        aria-pressed={pressed}
        className={cn('text-muted-foreground', pressed && 'bg-muted text-foreground', className)}
        onClick={props.onClick}
        isDisabled={props.isDisabled}
        label={label}
        icon={children as never}
        size="md"
      />
    </Tooltip>
  )
}

/**
 * 选中设备的旋转角度输入框。官方 TextInput 没有 `defaultValue`（必须受控），
 * 所以用本地 state 承接输入，失焦（或回车）时把合法数值提交出去。
 * 调用点用 `key` 在切换对象 / 角度变化时重挂载，保证显示值跟着选中对象走。
 */
function AngleInput({ value, onCommit }: { value: number; onCommit: (deg: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  return (
    <TextInput
      label="旋转角度"
      isLabelHidden
      value={draft}
      onChange={setDraft}
      inputMode="numeric"
      controlClassName="h-7 w-14 border-border bg-background text-xs tabular-nums"
      onBlur={() => {
        const v = Number(draft)
        if (Number.isFinite(v)) onCommit(v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
          const target = e.currentTarget as HTMLInputElement
          target.blur()
        }
      }}
    />
  )
}
const pack = smartHomePack

type ProjectQuoteSummary = { id: string; title: string; status: string; total: number }
/** 点位图里由插件提供的功能是否可用（服务端按「设置 → 插件」计算后传入）。 */
export type PointMapPlugins = {
  smartSelect: boolean
  dwg: boolean
  roomInsights: boolean
  proposal: boolean
}
type InitialFocus = {
  quoteId: string | null
  sheet: string | null
  area: string | null
  point: string | null
  scope: PointScope | null
}
type Draft = { v: 1; base: string | null; at: number; scene: StoredScene }
/** 右栏只有一层分段：设备 / 灯光 / 区域 / 统计（只读时只有区域与统计） */
type PanelTab = 'devices' | 'lighting' | 'areas' | 'summary'

const draftKey = (projectId: string) => `fmkj:pointmap:draft:${projectId}`
const deviceTpl = (deviceType: string): SymbolTemplate => ({
  symbolId: deviceType,
  sizeCm: null,
  real: false,
  data: { deviceType },
})
const boxOf = (o: BoardObj): Box | null =>
  o.kind === 'symbol'
    ? { x: o.x - 14, y: o.y - 14, w: 28, h: 28 }
    : o.kind === 'raw'
      ? rawBox(o.el)
      : { x: o.x, y: o.y, w: o.w, h: o.h }

function isTyping() {
  const el = document.activeElement as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  )
}

export function PointMapEditor({
  projectId,
  projectName,
  platform,
  initialScene,
  serverUpdatedAt = null,
  warnings,
  needsSave,
  products,
  initialDefaults,
  displayProfile,
  quotes = [],
  initialFocus,
  readOnly,
  plugins,
  aiCopilot = false,
}: {
  projectId: string
  projectName: string
  platform: string | null
  initialScene: StoredScene
  serverUpdatedAt?: string | null
  warnings: string[]
  needsSave: boolean
  products: PointProduct[]
  initialDefaults: ProjectDefaults
  /** 项目级的点位图显示方案（决定方案模板里怎么渲染），null 表示未设置 */
  displayProfile: string | null
  quotes?: ProjectQuoteSummary[]
  initialFocus?: InitialFocus
  readOnly: boolean
  plugins: PointMapPlugins
  /** 「AI 对话侧栏（高级）」插件是否开启：决定 AI 精装彩平弹窗是否可用 */
  aiCopilot?: boolean
}) {
  const dwgEnabled = plugins.dwg
  // 上传按钮右侧的下拉菜单：DWG 导入启用时显示
  const uploadMenuEnabled = dwgEnabled
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { sidebarCollapsed, setSidebarCollapsed } = useWorkspaceChrome()
  const showToast = useToast()
  const board = useBoardHistory(() => decodeScene(initialScene))
  const { doc, commit } = board
  const [files, setFiles] = useState<Record<string, BoardFile>>(() => ({ ...initialScene.files }))
  const filesRef = useRef(files)
  filesRef.current = files
  const [view, setView] = useViewSettings()
  const [viewport, setViewportState] = useState<Viewport>({ zoom: 1, scrollX: 0, scrollY: 0 })
  const viewportRef = useRef(viewport)
  const [size, setSize] = useState<Size>({ w: 0, h: 0 })
  const sizeRef = useRef(size)
  const [ready, setReady] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(() => new Set())
  const [tool, setTool] = useState<BoardTool>('select')
  const [armed, setArmed] = useState<SymbolTemplate | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobilePlaceOpen, setMobilePlaceOpen] = useState(false)
  const editorRootRef = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<CanvasContextMenuTarget | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [defaults, setDefaults] = useState<ProjectDefaults>(initialDefaults)
  /** 智能选型请求进行中 */
  const [selecting, setSelecting] = useState(false)
  const [query, setQuery] = useState('')
  const [savedVersion, setSavedVersion] = useState<number | null>(needsSave ? -1 : 0)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [notices, setNotices] = useState<string[]>(warnings)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [tab, setTab] = useState<PanelTab>(readOnly ? 'summary' : 'devices')
  const [calib, setCalib] = useState<{ sheetId: string; units: number; value: string } | null>(null)
  const [autoGenOpen, setAutoGenOpen] = useState(false)
  const [aiStyleOpen, setAiStyleOpen] = useState(false)
  const [autoGenScope, setAutoGenScope] = useState<'current' | 'all'>('current')
  const [autoGenIncludeLighting, setAutoGenIncludeLighting] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const activeQuote = useMemo(
    () =>
      (initialFocus?.quoteId ? quotes.find((q) => q.id === initialFocus.quoteId) : undefined) ??
      quotes[0] ??
      null,
    [quotes, initialFocus?.quoteId],
  )
  /** 显示范围：只看开关等。只改画面显示，不改图纸数据 */
  const [scope, setScope] = useState<PointScope>(
    () => initialFocus?.scope ?? (activeQuote ? inferScopeFromTitle(activeQuote.title) : 'all'),
  )
  const [syncingQuote, setSyncingQuote] = useState(false)
  const fitState = useRef<{ sheetId: string | null } | null>(null)
  const anim = useRef<number | null>(null)
  const clipboard = useRef<BoardObj[]>([])
  const lastPointer = useRef<Vec | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dwgInput = useRef<HTMLInputElement>(null)
  const jsonInput = useRef<HTMLInputElement>(null)
  const quoteForm = useRef<HTMLFormElement>(null)

  // 首次版本号为 0；needsSave 时用 -1 让页面一打开就处于「未保存」
  const dirty = !readOnly && savedVersion !== board.version
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  /** 产品照片查表：只有「实拍」图标风格用它，下架产品也保留照片（旧点位照常显示） */
  const productImage = useCallback(
    (id: string) => productById.get(id)?.image ?? null,
    [productById],
  )
  const activeByType = useMemo(() => {
    const map = new Map<string, PointProduct[]>()
    for (const p of products) {
      if (p.status !== 'active' || !p.deviceType) continue
      map.set(p.deviceType, [...(map.get(p.deviceType) ?? []), p])
    }
    return map
  }, [products])

  const snap = useMemo(() => analyzeDoc(doc, files), [doc, files])
  const sheetObjs = useMemo(() => sheetsOf(doc), [doc])
  const hidden = useMemo(() => {
    const set = new Set<string>()
    if (scope !== 'all')
      for (const p of snap.points) if (!inPointScope(p.deviceType, scope)) set.add(p.id)
    return set
  }, [snap.points, scope])

  /* ---------------- 视口 ---------------- */

  const setViewport = useCallback((v: Viewport, user = true) => {
    if (user) {
      fitState.current = null
      if (anim.current) cancelAnimationFrame(anim.current)
      anim.current = null
    }
    viewportRef.current = v
    setViewportState(v)
  }, [])

  const animateTo = useCallback(
    (target: Viewport, animate = true) => {
      if (anim.current) cancelAnimationFrame(anim.current)
      const from = viewportRef.current
      if (!animate || !sizeRef.current.w) return setViewport(target, false)
      const t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 280)
        const e = 1 - Math.pow(1 - k, 3)
        setViewport(lerpViewport(from, target, e, sizeRef.current), false)
        anim.current = k < 1 ? requestAnimationFrame(step) : null
      }
      anim.current = requestAnimationFrame(step)
    },
    [setViewport],
  )

  // 画布内边距：扣除左上标尺与底部轻量显示范围胶囊，保证彩平图和点位完全不被遮挡
  const insets = useMemo(
    () => ({
      top: (view.rulers ? 22 : 6) + 8,
      left: (view.rulers ? 22 : 6) + 10,
      right: 10,
      bottom: 12,
    }),
    [view.rulers],
  )
  const fitSheet = useCallback(
    (sheetId: string | null, animate = true) => {
      const d = board.current.current.doc
      const sheets = sheetsOf(d)
      const s = sheetId ? sheets.find((x) => x.sheetId === sheetId) : null
      const box = s
        ? { x: s.x, y: s.y - 50, w: s.w, h: s.h + 50 }
        : unionBox(
            sheets.length
              ? sheets.map((x) => ({ x: x.x, y: x.y - 50, w: x.w, h: x.h + 50 }))
              : d.objects.map(boxOf).filter((b): b is Box => !!b),
          )
      if (!box || !sizeRef.current.w) return
      animateTo(fitBox(box, sizeRef.current, FIT, insets), animate)
      fitState.current = { sheetId: s?.sheetId ?? null }
    },
    [animateTo, board, insets],
  )

  const focusBox = useCallback(
    (box: Box, factor: number) => {
      if (!sizeRef.current.w) return
      const pad = Math.max(box.w, box.h, 60)
      animateTo(
        fitBox(
          { x: box.x + box.w / 2 - pad / 2, y: box.y + box.h / 2 - pad / 2, w: pad, h: pad },
          sizeRef.current,
          factor,
          insets,
        ),
      )
    },
    [animateTo, insets],
  )

  const onSize = useCallback(
    (s: Size) => {
      sizeRef.current = s
      setSize(s)
      if (fitState.current) fitSheet(fitState.current.sheetId, false)
    },
    [fitSheet],
  )

  // 当前图纸 = 视野中心所在的图纸；缩放百分比以「图纸铺满画布」为 100%
  const center = size.w ? toScene(viewport, size.w / 2, size.h / 2) : null
  const activeSheet: SheetObj | null = useMemo(() => {
    if (!center) return sheetObjs[0] ?? null
    return (
      sheetObjs.find(
        (s) =>
          center.x >= s.x && center.x <= s.x + s.w && center.y >= s.y - 60 && center.y <= s.y + s.h,
      ) ??
      sheetObjs
        .slice()
        .sort(
          (a, b) =>
            Math.hypot(a.x + a.w / 2 - center.x, a.y + a.h / 2 - center.y) -
            Math.hypot(b.x + b.w / 2 - center.x, b.y + b.h / 2 - center.y),
        )[0] ??
      null
    )
  }, [center?.x, center?.y, sheetObjs]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeSheetId = activeSheet?.sheetId ?? null
  const zoomPct = useMemo(() => {
    if (!activeSheet || !size.w) return Math.round(viewport.zoom * 100)
    const fit = fitBox(
      { x: activeSheet.x, y: activeSheet.y - 50, w: activeSheet.w, h: activeSheet.h + 50 },
      size,
      FIT,
      insets,
    ).zoom
    return Math.round((viewport.zoom / fit) * 100)
  }, [activeSheet, size, viewport.zoom, insets])

  const zoomBy = useCallback(
    (factor: number) => {
      const v = viewportRef.current
      const s = sizeRef.current
      setViewport(zoomAt(v, s.w / 2, s.h / 2, v.zoom * factor))
    },
    [setViewport],
  )

  const toggleFullscreen = useCallback(async () => {
    const next = !isFullscreen
    setIsFullscreen(next)
    try {
      if (next && editorRootRef.current?.requestFullscreen) {
        await editorRootRef.current.requestFullscreen()
        const orientation = (
          screen as unknown as { orientation?: { lock?: (mode: string) => Promise<void> } }
        ).orientation
        await orientation?.lock?.('landscape').catch(() => undefined)
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // fallback to CSS fixed fullscreen when browser fullscreen API is restricted
    }
    setTimeout(() => fitSheet(activeSheetId, false), 80)
  }, [isFullscreen, fitSheet, activeSheetId])

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false)
        setTimeout(() => fitSheet(activeSheetId, false), 80)
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [isFullscreen, fitSheet, activeSheetId])

  /* ---------------- 初次定位：从报价单跳回时定位到点位 / 区域 / 楼层，否则铺满第一张图纸 ---------------- */

  const focusRef = useRef(initialFocus)
  useEffect(() => {
    if (ready || !size.w) return
    setReady(true)
    const f = focusRef.current
    const d = board.current.current.doc
    if (f?.point) {
      const pt = d.objects.find((o): o is SymbolObj => o.kind === 'symbol' && o.code === f.point)
      if (pt) {
        setSelection(new Set([pt.id]))
        animateTo(fitBox({ x: pt.x - 100, y: pt.y - 70, w: 200, h: 140 }, size, 1, insets), false)
        return
      }
    }
    if (f?.area) {
      const target = f.area.replace(/\s+/g, '')
      const ar = d.objects.find(
        (o) => o.kind === 'area' && (o.id === f.area || o.name.replace(/\s+/g, '') === target),
      )
      if (ar && ar.kind === 'area') {
        setSelection(new Set([ar.id]))
        animateTo(fitBox(ar, size, 0.7, insets), false)
        return
      }
    }
    fitSheet(f?.sheet ?? sheetsOf(d)[0]?.sheetId ?? null, false)
  }, [ready, size, board, animateTo, fitSheet, insets])

  // 侧边栏 AI 工具改了服务端点位图并 router.refresh() 时，没有未保存修改就直接换成最新内容
  const prevInitial = useRef(initialScene)
  useEffect(() => {
    if (prevInitial.current === initialScene) return
    prevInitial.current = initialScene
    if (dirty) return
    board.reset(decodeScene(initialScene))
    setFiles({ ...initialScene.files })
    setSelection(new Set())
    setSavedVersion(null)
    setTimeout(() => fitSheet(sheetsOf(decodeScene(initialScene))[0]?.sheetId ?? null), 60)
  }, [initialScene, dirty, board, fitSheet])
  // reset 后把当前版本记为已保存
  useEffect(() => {
    if (savedVersion === null) setSavedVersion(board.version)
  }, [savedVersion, board.version])

  // 画布页默认收起左侧导航；离开时恢复
  const chromeRef = useRef({ sidebarCollapsed, setSidebarCollapsed })
  chromeRef.current = { sidebarCollapsed, setSidebarCollapsed }
  useEffect(() => {
    const wasExpanded = !chromeRef.current.sidebarCollapsed
    if (wasExpanded) chromeRef.current.setSidebarCollapsed(true)
    return () => {
      if (wasExpanded) chromeRef.current.setSidebarCollapsed(false)
    }
  }, [])

  /* ---------------- 保存 / 本地草稿 ---------------- */

  const currentScene = useCallback(
    () =>
      compactScene(
        encodeDoc(board.current.current.doc),
        filesRef.current as Record<string, SceneFile>,
        { viewBackgroundColor: '#ffffff' },
      ),
    [board],
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // 有未保存修改时，停手 1 秒存一份本地草稿（浏览器崩溃、断网也不丢）
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey(projectId),
          JSON.stringify({
            v: 1,
            base: serverUpdatedAt,
            at: Date.now(),
            scene: currentScene(),
          } satisfies Draft),
        )
      } catch {
        /* 存储已满时跳过 */
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [dirty, doc, projectId, serverUpdatedAt, currentScene])

  // 打开时发现基于同一版本的草稿 → 提示恢复
  useEffect(() => {
    if (readOnly) return
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(projectId)) ?? 'null') as Draft | null
      if (!d || d.v !== 1 || !d.scene) return
      if (
        d.base !== serverUpdatedAt ||
        JSON.stringify(d.scene.elements) ===
          JSON.stringify(compactScene(initialScene.elements, initialScene.files).elements)
      ) {
        localStorage.removeItem(draftKey(projectId))
        return
      }
      setDraft(d)
    } catch {
      /* 忽略 */
    }
  }, [projectId, serverUpdatedAt, readOnly, initialScene])

  const uploadImage = useCallback(
    async (blob: Blob, name: string, kind: 'sheet' | 'asset') => {
      const body = new FormData()
      body.append(
        'file',
        blob,
        `${kind}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'}`,
      )
      body.append('name', name)
      body.append('kind', kind)
      const res = await fetch(`/projects/${projectId}/point-map/sheets`, { method: 'POST', body })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        url?: string
        mediaId?: string
      }
      if (!res.ok || !data.ok || !data.url)
        throw new Error(data.error ?? '图片上传失败，请稍后重试')
      return { url: data.url, mediaId: data.mediaId ?? null }
    },
    [projectId],
  )

  const save = useCallback(async () => {
    if (saving || readOnly) return false
    setSaving(true)
    const version = board.current.current.version
    try {
      const scene = currentScene()
      // 导入的 JSON 里内嵌的图片先存进媒体库，场景里只留地址
      for (const id of inlineFileIds(scene)) {
        const blob = await (await fetch(scene.files[id].dataURL)).blob()
        const { url } = await uploadImage(blob, '画布图片', 'asset')
        scene.files[id] = { ...scene.files[id], dataURL: url }
        setFiles((f) => ({ ...f, [id]: { ...f[id], dataURL: url } }))
      }
      const res = await fetch(`/projects/${projectId}/point-map/data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scene),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '保存失败，请稍后重试')
      setSavedVersion(version)
      try {
        localStorage.removeItem(draftKey(projectId))
      } catch {
        /* 忽略 */
      }
      setDraft(null)
      showToast({ body: '点位图已保存' })
      return true
    } catch (error) {
      showToast({
        body: error instanceof Error ? error.message : '保存失败，请稍后重试',
        type: 'error',
      })
      return false
    } finally {
      setSaving(false)
    }
  }, [saving, readOnly, board, currentScene, uploadImage, projectId, showToast])

  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    if (!dirty || readOnly) return
    return registerLeaveGuard(
      async () =>
        (await saveRef.current()) ||
        window.confirm('点位图保存失败，仍要离开吗？未保存的修改会丢失。'),
    )
  }, [dirty, readOnly])

  /** 接上智能选型插件的真实接口：先保存点位图，再按档次补全或重选默认型号 */
  const autoSelect = useCallback(
    async (tier: SelectionTier, overwrite: boolean) => {
      if (dirty && !(await save())) return
      setSelecting(true)
      try {
        const res = await fetch(`/projects/${projectId}/point-map/auto-defaults`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier, overwrite, scope }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          defaults?: ProjectDefaults
          changed?: unknown[]
          missing?: string[]
        }
        if (!res.ok || !data.ok || !data.defaults)
          throw new Error(data.error ?? '选型失败，请稍后重试')
        setDefaults(data.defaults)
        const n = data.changed?.length ?? 0
        const missing = data.missing?.length
          ? `；${data.missing.map((t) => deviceTypeLabel(t)).join('、')} 产品库里没有在售产品`
          : ''
        showToast({
          body: n ? `已为 ${n} 类设备设置默认型号${missing}` : `所有设备类型都已选型${missing}`,
        })
      } catch (error) {
        showToast({
          body: error instanceof Error ? error.message : '选型失败，请稍后重试',
          type: 'error',
        })
      } finally {
        setSelecting(false)
      }
    },
    [dirty, save, projectId, scope, showToast],
  )

  /** 跳转前先保存，避免把未保存的点位图带走 */
  const openLinkedPage = useCallback(
    async (href: string) => {
      if (dirty && !readOnly && !(await save())) return
      router.push(href)
    },
    [dirty, readOnly, save, router],
  )

  /* ---------------- 点位 ---------------- */

  const placePoint = useCallback(
    (tpl: SymbolTemplate, at: Vec) => {
      if (readOnly) return
      commit((d) => createPoint(d, tpl, at).doc)
    },
    [readOnly, commit],
  )

  const updatePointType = useCallback(
    (pointId: string, newType: string) => {
      commit((d) => changePointType(d, pointId, newType))
      showToast({ body: `已切换为「${deviceTypeLabel(newType)}」` })
    },
    [commit, showToast],
  )

  const duplicate = useCallback(
    (ids: string[]) => {
      if (readOnly) return
      const d = board.current.current.doc
      const src = d.objects.filter((o) => ids.includes(o.id) && o.kind !== 'sheet')
      if (!src.length) return
      const r = cloneObjects(d, src, { x: 28, y: 16 })
      commit(r.doc)
      setSelection(new Set(r.ids))
    },
    [readOnly, board, commit],
  )

  const removeIds = useCallback(
    (ids: Iterable<string>) => {
      if (readOnly) return
      const set = new Set(ids)
      commit((d) =>
        removeObjects(
          d,
          new Set(d.objects.filter((o) => set.has(o.id) && o.kind !== 'sheet').map((o) => o.id)),
        ),
      )
      setSelection(new Set())
    },
    [readOnly, commit],
  )

  const rotate = useCallback(
    (ids: Iterable<string>, deg: number) =>
      commit((d) => rotateSymbols(d, [...ids], { delta: fromDeg(deg) })),
    [commit],
  )

  /** 智能生成点位：覆盖目标图纸上的当前点位，推入 board 历史栈，支持一键撤销 */
  const runAutoGeneratePoints = useCallback(() => {
    if (readOnly) return
    const targetSheetId = autoGenScope === 'current' ? activeSheetId : null
    const res = autoGenerateSheetPoints(board.current.current.doc, {
      sheetId: targetSheetId,
      includeLighting: autoGenIncludeLighting,
    })
    setAutoGenOpen(false)
    if (!res.addedPoints) {
      showToast({ body: '当前还没有可生成点位的图纸，请先添加户型图', type: 'error' })
      return
    }
    commit(res.doc)
    setSelection(new Set())
    showToast({
      body: (
        <span>
          {`已智能生成 ${res.addedPoints} 个点位${res.removedPoints ? `（已覆盖原有 ${res.removedPoints} 个点位）` : ''}${res.addedAreas ? `，并自动划分 ${res.addedAreas} 个房间区域` : ''}`}
          <span className="mt-0.5 block text-xs opacity-80">
            可随时点击工具栏「撤销」按钮或按 Ctrl/⌘ + Z 恢复原有点位
          </span>
        </span>
      ),
      endContent: (
        <Button size="sm" variant="secondary" label="撤销" onClick={() => board.undo()} />
      ),
    })
  }, [readOnly, autoGenScope, activeSheetId, autoGenIncludeLighting, board, commit, showToast])

  /* ---------------- 图纸 ---------------- */

  const addSheet = useCallback(
    async (png: Blob, name: string) => {
      const { url, mediaId } = await uploadImage(png, name, 'sheet')
      const fileId = `sheet-${mediaId ?? Date.now().toString(36)}`
      setFiles((f) => ({
        ...f,
        [fileId]: { id: fileId, dataURL: url, mimeType: 'image/png', created: Date.now() },
      }))
      const r = createSheet(board.current.current.doc, { name, fileId, mediaId })
      commit(r.doc)
      setCropFile(null)
      setTimeout(() => fitSheet(r.obj.sheetId), 80)
      showToast({ body: `已添加图纸「${name}」` })
      // 图纸已经存进媒体库，立即保存，避免离开页面后丢失
      setTimeout(() => void saveRef.current(), 200)
    },
    [uploadImage, board, commit, fitSheet, showToast],
  )

  const renameSheet = useCallback(
    (sheetId: string, name: string) => {
      const v = name.trim().slice(0, 40)
      setRenaming(null)
      if (v) commit((d) => updateSheet(d, sheetId, { name: v }))
    },
    [commit],
  )

  const deleteSheet = useCallback(
    (sheetId: string) => {
      setConfirmDelete(null)
      const s = sheetsOf(board.current.current.doc).find((x) => x.sheetId === sheetId)
      if (!s) return
      commit((d) => removeSheet(d, s))
      setSelection(new Set())
      showToast({ body: `已删除图纸「${s.name}」，可按 Ctrl/⌘ + Z 撤销` })
    },
    [board, commit, showToast],
  )

  const importDwg = useCallback(
    async (file: File) => {
      if (converting) return
      if (!/\.dwg$/i.test(file.name)) return showToast({ body: '请选择 .dwg 文件', type: 'error' })
      setConverting(true)
      const dismissLoading = showToast({
        body: '正在转换 DWG，可能需要几十秒…',
        isAutoHide: false,
      })
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await fetch(`/projects/${projectId}/point-map/dwg`, { method: 'POST', body })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          url?: string
          name?: string
        }
        if (!res.ok || !data.ok || !data.url) throw new Error(data.error ?? '转换失败，请稍后重试')
        const img = await fetch(data.url)
        if (!img.ok) throw new Error('户型图已生成，但读取失败')
        const blob = await img.blob()
        setCropFile(
          new File([blob], data.name ?? file.name.replace(/\.dwg$/i, '.png'), {
            type: blob.type || 'image/png',
          }),
        )
      } catch (error) {
        showToast({
          body: error instanceof Error ? error.message : '转换失败，请稍后重试',
          type: 'error',
        })
      } finally {
        dismissLoading()
        setConverting(false)
      }
    },
    [converting, projectId, showToast],
  )
  const cancelCrop = useCallback(() => setCropFile(null), [])

  /** 标定：在图纸上拖一条线，输入真实长度 */
  const startCalibrate = useCallback(() => {
    if (readOnly) return
    setArmed(null)
    setTool('calibrate')
    showToast({ body: '在图纸上沿一段已知长度（如门洞、墙段尺寸）拖一条线，松开后输入真实长度' })
  }, [readOnly, showToast])

  const applyCalibration = useCallback(() => {
    if (!calib) return
    const m = Number(calib.value.replace(/[^\d.]/g, ''))
    if (!(m > 0)) return showToast({ body: '请输入大于 0 的长度（米）', type: 'error' })
    const mmPerUnit = (m * 1000) / calib.units
    commit((d) => updateSheet(d, calib.sheetId, { mmPerUnit }))
    setCalib(null)
    setTool('select')
    if (!view.grid) setView({ grid: true })
    showToast({ body: `已标定：1 米 ≈ ${Math.round(1000 / mmPerUnit)} 个单位，网格按 25cm 显示` })
  }, [calib, commit, view.grid, setView, showToast])

  /* ---------------- 区域 ---------------- */

  const addAreaAt = useCallback(
    (cx: number, cy: number, areaType = 'living') => {
      const r = createArea(
        board.current.current.doc,
        { x: cx - 110, y: cy - 75, w: 220, h: 150 },
        areaType,
      )
      commit(r.doc)
      setSelection(new Set([r.obj.id]))
      showToast({ body: '已添加区域：拖动顶点调整形状，拖动边的中点可以加顶点' })
    },
    [board, commit, showToast],
  )
  const addArea = useCallback(
    (areaType: string) => {
      const s = sizeRef.current
      const c = toScene(viewportRef.current, s.w / 2, s.h / 2)
      addAreaAt(c.x, c.y, areaType)
    },
    [addAreaAt],
  )
  const createAreaBox = useCallback(
    (box: Box, poly?: Vec[]) => {
      const r = createArea(board.current.current.doc, box, 'living', undefined, poly)
      commit(r.doc)
      setSelection(new Set([r.obj.id]))
      setTool('select')
    },
    [board, commit],
  )
  const updateArea = useCallback(
    (areaId: string, patch: { name?: string; areaType?: string }) =>
      commit((d) => updateAreaOp(d, areaId, patch)),
    [commit],
  )
  // 从区域列表定位前的视角；关闭选中卡片时回到这里（连续切换区域时保留最早的那个视角）
  const viewBeforeFocus = useRef<Viewport | null>(null)
  const focusArea = useCallback(
    (areaId: string) => {
      const a = board.current.current.doc.objects.find((o) => o.id === areaId)
      if (!a || a.kind !== 'area') return
      if (!viewBeforeFocus.current) viewBeforeFocus.current = viewportRef.current
      setSelection(new Set([areaId]))
      animateTo(fitBox(a, sizeRef.current, 0.7, insets))
    },
    [board, animateTo, insets],
  )
  const closeSelectedArea = useCallback(() => {
    setSelection(new Set())
    if (viewBeforeFocus.current) animateTo(viewBeforeFocus.current)
    viewBeforeFocus.current = null
  }, [animateTo])
  // 用 Esc 或点空白处取消选中时不还原视角，但要清掉记录，下次定位重新记
  useEffect(() => {
    if (selection.size === 0) viewBeforeFocus.current = null
  }, [selection])
  const focusTargets = useCallback(
    (ids: string[]) => {
      const d = board.current.current.doc
      const box = unionBox(
        d.objects
          .filter((o) => ids.includes(o.id))
          .map(boxOf)
          .filter((b): b is Box => !!b),
      )
      if (!box) return
      setSelection(new Set(ids))
      focusBox(box, 0.6)
    },
    [board, focusBox],
  )

  /* ---------------- 报价 ---------------- */

  const createNewQuote = useCallback(async () => {
    if (dirty && !(await save())) return
    quoteForm.current?.requestSubmit()
  }, [dirty, save])

  /** 无缝切换到报价单：已有报价单时自动同步最新点位，没有则新建 */
  const switchToQuote = useCallback(
    async (targetQuoteId?: string) => {
      if (syncingQuote || saving) return
      if (dirty && !(await save())) return
      const qid = targetQuoteId ?? activeQuote?.id
      if (!qid) return quoteForm.current?.requestSubmit()
      if (readOnly) return router.push(`/projects/${projectId}/quotes/${qid}`)
      setSyncingQuote(true)
      try {
        const res = await syncQuoteFromPointMap(qid, scope)
        if (!res.ok) return showToast({ body: res.error, type: 'error' })
        router.push(
          `/projects/${projectId}/quotes/${qid}${res.pending ? `?pending=${res.pending}` : ''}`,
        )
      } finally {
        setSyncingQuote(false)
      }
    },
    [syncingQuote, saving, dirty, save, activeQuote, readOnly, router, projectId, scope, showToast],
  )

  /* ---------------- 导入导出 ---------------- */

  const exportPng = useCallback(async () => {
    const sheet = activeSheet
    if (!sheet) return showToast({ body: '还没有图纸', type: 'error' })
    const dismissLoading = showToast({ body: '正在生成图片…', isAutoHide: false })
    try {
      const { blob, scale } = await exportSheetPng({
        doc: board.current.current.doc,
        files: filesRef.current,
        sheet,
        pack,
        view,
        hidden,
        project: projectName,
        productImage,
        defaults,
      })
      download(blob, `${projectName}-${sheet.name}-点位图.png`)
      showToast({
        body: scale
          ? `已导出（${pack.paper} · 1:${scale}，打印选「实际大小」）`
          : '已导出（图纸未标定，按纸张铺满）',
      })
    } catch (error) {
      showToast({ body: error instanceof Error ? error.message : '导出失败', type: 'error' })
    } finally {
      dismissLoading()
    }
  }, [activeSheet, board, view, hidden, projectName, showToast, productImage, defaults])

  const exportJson = useCallback(() => {
    download(
      new Blob([exportBoardJson(board.current.current.doc, filesRef.current, projectName)], {
        type: 'application/json',
      }),
      `${projectName}-画板.json`,
    )
  }, [board, projectName])

  const importJson = useCallback(
    async (file: File) => {
      try {
        const r = parseBoardJson(await file.text())
        setFiles((f) => ({ ...f, ...r.files }))
        commit(r.doc)
        setSelection(new Set())
        setTimeout(() => fitSheet(sheetsOf(r.doc)[0]?.sheetId ?? null), 60)
        showToast({ body: '已导入，可按 Ctrl/⌘ + Z 撤销；确认无误后保存' })
      } catch (error) {
        showToast({ body: error instanceof Error ? error.message : '导入失败', type: 'error' })
      }
    },
    [commit, fitSheet, showToast],
  )

  /* ---------------- 画布事件 ---------------- */

  const onContextMenu = useCallback(
    ({ hit, scene, local, wrap }: CanvasContext) => {
      if (readOnly) return
      if (armed) {
        setArmed(null)
        return
      }
      const base = { x: local.x, y: local.y, wrapW: wrap.w, wrapH: wrap.h }
      if (hit?.kind === 'symbol') {
        const p = snap.points.find((x) => x.id === hit.id)
        if (!p) return
        setCtxMenu({
          kind: 'point',
          pointId: p.id,
          code: p.code,
          deviceType: p.deviceType,
          areaName: snap.areas.find((a) => a.id === p.areaId)?.name ?? null,
          ...base,
        })
      } else if (hit?.kind === 'area') {
        const a = snap.areas.find((x) => x.id === hit.id)
        if (a)
          setCtxMenu({ kind: 'area', areaId: a.id, name: a.name, areaType: a.areaType, ...base })
      } else setCtxMenu({ kind: 'canvas', sceneX: scene.x, sceneY: scene.y, ...base })
    },
    [readOnly, armed, snap],
  )

  const onDrop = useCallback(
    (data: string, at: Vec) => {
      if (readOnly) return
      let tpl: SymbolTemplate
      try {
        tpl = data.startsWith('{') ? (JSON.parse(data) as SymbolTemplate) : deviceTpl(data)
      } catch {
        return
      }
      placePoint(tpl, at)
    },
    [readOnly, placePoint],
  )

  const onCalibrateLine = useCallback((sheet: SheetObj, a: Vec, b: Vec) => {
    setCalib({ sheetId: sheet.sheetId, units: Math.hypot(a.x - b.x, a.y - b.y), value: '' })
  }, [])

  // 记录鼠标位置，粘贴时贴到鼠标处
  useEffect(() => {
    const onMove = (e: PointerEvent) => (lastPointer.current = { x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  /* ---------------- 快捷键 ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || document.querySelector('[role=dialog],[role=menu]')) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const sel = [...selection]
      if (mod && key === 's') {
        e.preventDefault()
        if (!readOnly) void save()
        return
      }
      if (mod && key === '0') {
        e.preventDefault()
        return fitSheet(activeSheetId)
      }
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault()
        return zoomBy(1.2)
      }
      if (mod && key === '-') {
        e.preventDefault()
        return zoomBy(1 / 1.2)
      }
      if (key === 'escape') {
        if (armed) setArmed(null)
        else if (tool !== 'select') setTool('select')
        else setSelection(new Set())
        return
      }
      if (key === 'g' && !mod) return setView({ grid: !view.grid })
      if (key === 'r' && e.shiftKey && !mod) return setView({ rulers: !view.rulers })
      if (!mod && key === 'v') return setTool('select')
      if (!mod && key === 'h') return setTool('pan')
      if (readOnly) return
      if (mod && key === 'z') {
        e.preventDefault()
        return e.shiftKey ? board.redo() : board.undo()
      }
      if (mod && key === 'y') {
        e.preventDefault()
        return board.redo()
      }
      if (!mod && key === 'a') return setTool('area')
      if (!mod && key === 'c') return startCalibrate()
      if (mod && key === 'a') {
        e.preventDefault()
        return setSelection(
          new Set(
            doc.objects.filter((o) => o.kind === 'symbol' && !hidden.has(o.id)).map((o) => o.id),
          ),
        )
      }
      if (!sel.length) return
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault()
        return removeIds(sel)
      }
      if (mod && key === 'd') {
        e.preventDefault()
        return duplicate(sel)
      }
      if (mod && key === 'c') {
        clipboard.current = doc.objects.filter((o) => selection.has(o.id) && o.kind !== 'sheet')
        return showToast({ body: `已复制 ${clipboard.current.length} 个对象` })
      }
      if (key === 'r' && !mod && !e.shiftKey) return rotate(sel, 90)
      const nudge = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[
        key
      ]
      if (nudge) {
        e.preventDefault()
        const k = e.shiftKey ? 10 : 1
        commit((d) => moveObjects(d, sel, nudge[0] * k, nudge[1] * k))
      }
    }
    const onPaste = (e: KeyboardEvent) => {
      if (
        readOnly ||
        isTyping() ||
        !(e.metaKey || e.ctrlKey) ||
        e.key.toLowerCase() !== 'v' ||
        !clipboard.current.length
      )
        return
      e.preventDefault()
      const src = clipboard.current
      const box = unionBox(src.map(boxOf).filter((b): b is Box => !!b))
      let offset = { x: 24, y: 24 }
      const lp = lastPointer.current
      const wrap = document.querySelector('.point-map-canvas')?.getBoundingClientRect()
      if (
        box &&
        lp &&
        wrap &&
        lp.x >= wrap.left &&
        lp.x <= wrap.right &&
        lp.y >= wrap.top &&
        lp.y <= wrap.bottom
      ) {
        const p = toScene(viewportRef.current, lp.x - wrap.left, lp.y - wrap.top)
        offset = { x: p.x - (box.x + box.w / 2), y: p.y - (box.y + box.h / 2) }
      }
      const r = cloneObjects(board.current.current.doc, src, offset)
      commit(r.doc)
      setSelection(new Set(r.ids))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onPaste)
    }
  }, [
    selection,
    readOnly,
    save,
    fitSheet,
    activeSheetId,
    zoomBy,
    armed,
    tool,
    view.grid,
    view.rulers,
    setView,
    board,
    startCalibrate,
    doc,
    hidden,
    removeIds,
    duplicate,
    rotate,
    commit,
    showToast,
  ])

  /* ---------------- 派生数据 ---------------- */

  const scopedPoints = useMemo(
    () => snap.points.filter((p) => inPointScope(p.deviceType, scope)),
    [snap.points, scope],
  )
  const summary = useMemo(
    () =>
      summarizePoints(
        scopedPoints.map((p) => ({ deviceType: p.deviceType, productId: p.productId })),
        productById,
        defaults,
      ),
    [scopedPoints, productById, defaults],
  )
  const typesInUse = DEVICE_TYPE_ORDER.filter((t) => summary.byType.has(t))
  const analysis = useMemo(
    () => (plugins.roomInsights ? analyzeAreas(snap.areas, scopedPoints) : new Map()),
    [plugins.roomInsights, snap.areas, scopedPoints],
  )
  const unassigned = scopedPoints.filter((p) => !p.areaId).length
  const issues: CheckIssue[] = useMemo(() => pack.check(doc), [doc])
  // 灯具统一在「灯光设计」里放（按款式和尺寸），智能设备不再重复列出
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const groups = DEVICE_GROUPS.filter((g) => g.category.slug !== 'lighting')
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        types: g.types.filter(
          (t) =>
            `${g.category.name}${t.name}`.toLowerCase().includes(q) ||
            (activeByType.get(t.value) ?? []).some((p) =>
              `${p.name} ${p.sku} ${p.brand}`.toLowerCase().includes(q),
            ),
        ),
      }))
      .filter((g) => g.types.length)
  }, [query, activeByType])

  const selectedIds = [...selection]
  const selectedSymbol =
    selectedIds.length === 1
      ? doc.objects.find((o): o is SymbolObj => o.kind === 'symbol' && o.id === selectedIds[0])
      : undefined
  const selectedPoint = selectedSymbol
    ? snap.points.find((p) => p.id === selectedSymbol.id)
    : undefined
  const selectedArea =
    selectedIds.length === 1 ? snap.areas.find((a) => a.id === selectedIds[0]) : undefined
  const variant = selectedSymbol ? lightingVariant(selectedSymbol.symbolId) : undefined
  /** 灯具尺寸下拉的选项：提到 useMemo，避免每次渲染重建数组导致 Selector 重算选项。 */
  const variantOptions = useMemo(
    () => variant?.family.variants.map((v) => ({ value: v.id, label: v.label })) ?? [],
    [variant],
  )
  const missingSheets = snap.sheets.filter((s) => s.missing).length
  const armedDevice =
    armed && armed.symbolId === armed.data.deviceType ? String(armed.data.deviceType) : null
  const armedLabel = armed ? pack.look({ symbolId: armed.symbolId, data: armed.data }).name : ''
  /**
   * 顶部主操作状态机：没有图纸时突出「上传户型图」，有图纸后突出「生成点位」。
   * 本地渲染色「风格化」按钮组已下线，彩平统一走 AI 精装彩平弹窗。
   */
  const primaryAction: 'upload' | 'generate' = snap.sheets.length ? 'generate' : 'upload'

  /** 打开弹窗时把「当前楼层」底图带过去（原来带图跳转用的是 snap.sheets[0]，会带错楼层） */
  const aiStyleSource: StyleTransferHandoff | null = (() => {
    const image = activeSheet?.fileId ? files[activeSheet.fileId]?.dataURL : undefined
    // 底图可能还在上传中 / 媒体库读取失败：没图就不预载，让用户自己在弹窗里传
    return image ? { image, name: activeSheet?.name || '户型图' } : null
  })()

  return (
    <div
      ref={editorRootRef}
      className={cn(
        'full-bleed-page flex flex-col bg-canvas text-foreground',
        isFullscreen
          ? 'fixed inset-0 z-50 m-0 h-svh w-screen'
          : '-mx-4 -mt-6 -mb-5 h-[calc(100svh-5.5rem)] md:-mx-8 md:-mb-7 md:h-[calc(100svh-3rem)]',
      )}
    >
      <form ref={quoteForm} action={createQuoteFromProject} className="hidden">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="scope" value={scope} />
      </form>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setCropFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={dwgInput}
        type="file"
        accept=".dwg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importDwg(f)
          e.target.value = ''
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept=".json,.excalidraw,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importJson(f)
          e.target.value = ''
        }}
      />

      {/* ==================== 顶部工具栏（唯一的操作入口）：左（楼层 · 工具 · 历史）｜中（当前步骤的主操作）｜右（显示 · 缩放 · 导出 · 报价 · 保存状态） ==================== */}
      {/*
工具条放不下时换行，而不是横向滚动：多出 AI 右栏后，1440 下画布只剩 1072px，
        而这一排操作约需 1300px。原来的 overflow-x-auto 会把「生成报价」「已保存」
        滚到视口外，用户看不到主操作；换行保证每个按钮始终可见。
        高度用 min-h-12 而非固定 h-12，换行后画布 flex-1 自然少一点高度。

        光给外层 flex-wrap 不够：内部三组如果各自不可收缩（min-w-max / shrink-0），
        它们会作为一个整体溢出，外层根本没机会换行 —— 390 宽实测页面 scrollWidth
        489（右侧组单独 479）。所以三组都改成 flex-wrap，让「放不下」先在组内解决；
        组本身仍保持 min-width: auto，实在排不下时外层才把整组挪到下一行。
        这样不需要给任何按钮固定像素宽度，窄屏用折行换取「每个按钮都在视口内」。
        注意：组上**不要**加 min-w-0 —— 那会让组被压缩到小于内容宽度，两组的行
        互相重叠（1440 实测重叠 66px，按钮点不到）。
      */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-background px-2.5 py-1">
        {/* 左侧组（楼层 · 工具 · 历史）：可折行，窄屏不再把右侧操作顶出视口 */}
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {/* 楼层切换：切换 / 总览 / 当前图纸的重命名、清除标定、删除都在这一个菜单里；添加图纸用中间的「上传户型图」 */}
          {snap.sheets.length ? (
            <>
              <DropdownMenu
                placement="below"
                alignment="start"
                menuWidth="14.4rem"
                renderTrigger={(triggerProps) => (
                  <Tooltip content="楼层图纸" placement="below">
                    <Button
                      {...triggerProps}
                      variant="ghost"
                      className="h-8 max-w-44 shrink-0 gap-1.5 px-2 text-xs font-medium aria-expanded:bg-muted"
                      label={activeSheet?.name ?? '全部楼层'}
                      icon={<Layers />}
                      endContent={<ChevronDown />}
                    />
                  </Tooltip>
                )}
                items={(() => {
                  const items: DropdownMenuOption[] = [
                    {
                      type: 'section',
                      id: 'floors',
                      title: `楼层图纸 · ${snap.sheets.length} 张`,
                      items: snap.sheets.map((s, idx) => {
                        const obj = sheetObjs.find((o) => o.sheetId === s.id)
                        const active = s.id === activeSheetId
                        return {
                          id: s.id,
                          label: (
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded px-1 text-[10px] font-semibold tabular-nums',
                                  active
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {idx + 1}F
                              </span>
                              <span className={cn('min-w-0 truncate', active && 'font-semibold')}>
                                {s.name}
                              </span>
                            </span>
                          ),
                          endContent: (
                            <span className="flex items-center gap-1">
                              {s.missing ? (
                                <AlertTriangle
                                  className="size-3.5 text-warning"
                                  aria-label="图片丢失"
                                />
                              ) : null}
                              {obj?.mmPerUnit ? (
                                <Ruler
                                  className="size-3 text-muted-foreground"
                                  aria-label="已标定比例"
                                />
                              ) : null}
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {scopedPoints.filter((p) => p.sheetId === s.id).length}
                              </span>
                            </span>
                          ),
                          onClick: () => fitSheet(s.id),
                        }
                      }),
                    },
                  ]
                  if (snap.sheets.length > 1) {
                    items.push({
                      id: 'all',
                      label: (
                        <span className="flex items-center gap-2">
                          <Maximize2 className="size-4" />
                          查看全部楼层总览
                        </span>
                      ),
                      onClick: () => fitSheet(null),
                    })
                  }
                  if (!readOnly && activeSheet) {
                    items.push({ type: 'divider' })
                    items.push({
                      type: 'section',
                      id: 'current',
                      title: `当前图纸「${activeSheet.name}」`,
                      items: [
                        {
                          id: 'rename',
                          label: (
                            <span className="flex items-center gap-2">
                              <PencilLine className="size-4" />
                              重命名
                            </span>
                          ),
                          onClick: () =>
                            setRenaming({ id: activeSheet.sheetId, name: activeSheet.name }),
                        },
                        ...(activeSheet.mmPerUnit
                          ? [
                              {
                                id: 'clear-calib',
                                label: (
                                  <span className="flex items-center gap-2">
                                    <Eraser className="size-4" />
                                    清除比例标定
                                  </span>
                                ),
                                onClick: () =>
                                  commit((d) =>
                                    updateSheet(d, activeSheet.sheetId, { mmPerUnit: null }),
                                  ),
                              },
                            ]
                          : []),
                        {
                          id: 'delete',
                          variant: 'destructive',
                          label: (
                            <span className="flex items-center gap-2">
                              <Trash2 className="size-4" />
                              删除图纸
                            </span>
                          ),
                          onClick: () => setConfirmDelete(activeSheet.sheetId),
                        },
                      ],
                    })
                  }
                  return items
                })()}
              />
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
            </>
          ) : null}
          <div
            className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
            role="toolbar"
            aria-label="画布编辑工具"
          >
            {BOARD_TOOLS.filter((t) => !t.edit || !readOnly).map((t) => {
              const active = tool === t.id && !armed
              return (
                <Tooltip
                  key={t.id}
                  placement="below"
                  content={
                    <span className="inline-flex items-center gap-1.5">
                      {t.label}
                      <Kbd keys={t.key} />
                    </span>
                  }
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={t.label}
                    onClick={() => {
                      setArmed(null)
                      if (t.id === 'calibrate') startCalibrate()
                      else setTool(t.id)
                    }}
                    className={cn(
                      'inline-flex size-7 items-center justify-center rounded-md transition-[color,background-color,box-shadow] duration-150 ease-out-quart focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none',
                      active
                        ? 'bg-background text-foreground shadow-xs dark:bg-accent'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <t.icon className="size-4" />
                  </button>
                </Tooltip>
              )
            })}
          </div>
          {readOnly ? null : (
            <>
              <ToolbarIconButton
                label="撤销（Ctrl/⌘ + Z）"
                isDisabled={!board.canUndo}
                onClick={board.undo}
              >
                <Undo2 />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="重做（Ctrl/⌘ + Shift + Z）"
                isDisabled={!board.canRedo}
                onClick={board.redo}
              >
                <Redo2 />
              </ToolbarIconButton>
            </>
          )}
        </div>

        {/* 中：随当前状态只突出一个主操作——上传户型图 → 风格化 → 生成点位 */}
        {readOnly ? (
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <MapPinned className="size-3.5" />
            <span className="font-medium text-fg-secondary">{activeSheet?.name ?? '点位图'}</span>
            <Badge variant="neutral" label={'只读'} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 中间组（当前步骤的主操作）：同样允许折行，390 宽时单独 386px 也会顶出视口 */}
            <div className="flex items-center">
              {/* 还没有图纸时它是主操作，带文字；有图纸后退为图标（新增楼层），只让当前步骤带文字 */}
              <Tooltip
                placement="below"
                content={
                  snap.sheets.length
                    ? '上传户型图，新增一个楼层'
                    : '上传 PNG / JPG 户型图，自动裁切'
                }
              >
                <Button
                  variant={primaryAction === 'upload' ? 'primary' : 'secondary'}
                  size={snap.sheets.length ? 'sm' : 'md'}
                  isDisabled={!!cropFile}
                  onClick={() => fileInput.current?.click()}
                  label={snap.sheets.length ? '上传户型图' : '上传户型图'}
                  className={cn(uploadMenuEnabled && 'rounded-r-none')}
                  icon={<ImagePlus />}
                />
              </Tooltip>
              {uploadMenuEnabled ? (
                <DropdownMenu
                  placement="below"
                  alignment="center"
                  renderTrigger={(triggerProps) => (
                    <IconButton
                      {...triggerProps}
                      variant={primaryAction === 'upload' ? 'primary' : 'secondary'}
                      isDisabled={converting || !!cropFile}
                      isLoading={converting}
                      label="更多图纸导入方式"
                      className={cn(
                        'w-7 rounded-l-none',
                        primaryAction === 'upload' ? 'border-l-primary-foreground/20' : '-ml-px',
                      )}
                      icon={<ChevronDown />}
                      size="md"
                    />
                  )}
                  items={[
                    {
                      id: 'image',
                      label: (
                        <span className="flex items-center gap-2">
                          <ImagePlus className="size-4" />
                          上传图片户型图（PNG / JPG）
                        </span>
                      ),
                      onClick: () => fileInput.current?.click(),
                    },
                    ...(dwgEnabled
                      ? [
                          {
                            id: 'dwg',
                            label: (
                              <span className="flex items-center gap-2">
                                <FileUp className="size-4" />
                                导入 CAD 图纸（.dwg）
                              </span>
                            ),
                            onClick: () => dwgInput.current?.click(),
                          },
                        ]
                      : []),
                  ]}
                />
              ) : null}
            </div>

            {/* 彩平统一走 AI 出图：就地开弹窗，不跳页、不丢画布上下文 */}
            <Button
              variant="secondary"
              size="sm"
              isDisabled={!snap.sheets.length || !!cropFile}
              onClick={() => setAiStyleOpen(true)}
              tooltip="用 AI 把当前楼层户型图生成精装彩平图（消耗积分）"
              icon={<Sparkles />}
              label="AI 精装彩平"
            />

            <Button
              variant={primaryAction === 'generate' ? 'primary' : 'secondary'}
              isDisabled={!snap.sheets.length || !!cropFile}
              onClick={() => setAutoGenOpen(true)}
              tooltip="根据房间区域智能生成全屋点位（会覆盖当前点位，支持一键撤销）"
              icon={<Sparkles />}
              label="生成点位"
            />
          </div>
        )}

        {/*
          这一组含缩放/导出/生成报价，曾经是 min-w-0 flex-1，在窄画布下被压缩后内容
          （justify-end）向左侧溢出，压在「生成点位」按钮上（1440 三列并排时实测重叠 74px）。
          所以它不设 flex-1（不参与拉伸），也**不设 min-w-0**：min-width 保持 auto，
          组的最小宽度就是内容的最小可换行宽度，外层 flex-wrap 才有机会把它整体
          挪到下一行，而不是把它压缩到和左边组重叠（实测 1440 设 min-w-0 时两组
          重叠 66px，按钮被压住点不到）。同时组自己开 flex-wrap：窄屏内部先折行，
          390 宽时不会出现一整排 479px 溢出 —— 那正是 158da7f 想避免的情况。
        */}
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          {readOnly ? null : (
            <ToolbarIconButton
              label={mobilePlaceOpen ? '收起设备面板' : '放置设备'}
              pressed={mobilePlaceOpen}
              className="lg:hidden"
              onClick={() => setMobilePlaceOpen((v) => !v)}
            >
              <MapPinPlus />
            </ToolbarIconButton>
          )}
          <BoardViewPopover view={view} onView={setView} pack={pack} highlighted={scope !== 'all'}>
            {/*
              显示方案（随项目保存，决定方案模板怎么渲染）放在最上面，
              与下面那组「显示设置」（只改本机预览）明确分开。
              readOnly 时不显示 —— 只读协作成员不该改项目的交付形态。
            */}
            {readOnly ? null : (
              <DisplayProfilePicker projectId={projectId} initial={displayProfile} />
            )}
            <section className="space-y-2 border-b border-border px-3 py-3 text-xs">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  显示范围
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {scopedPoints.length} 个点位
                </span>
              </div>
              <SegmentedControl
                label="显示范围"
                value={scope}
                onChange={(v: string) => {
                  setScope(v as PointScope)
                  setSelection(new Set())
                }}
                size="sm"
                layout="fill"
              >
                {POINT_SCOPES.map(({ value: v, label }) => (
                  <SegmentedControlItem key={v} value={v} label={label} />
                ))}
              </SegmentedControl>
              <p className="px-1 text-[11px] text-muted-foreground">
                只显示所选专业的点位，同步报价也按这个范围。
              </p>
            </section>
          </BoardViewPopover>
          <div className="hidden items-center rounded-lg bg-muted p-0.5 md:flex">
            <IconButton
              variant="ghost"

              className="size-7 text-muted-foreground hover:bg-background"
              aria-label="缩小"
              onClick={() => zoomBy(1 / 1.2)}
              label="缩小"
              icon={<Minus />}
              size="sm"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fitSheet(activeSheetId)}
              label={`${zoomPct}%`}
              className="h-7 min-w-11 px-1 text-xs font-medium text-fg-secondary tabular-nums"
            />
            <IconButton
              variant="ghost"

              className="size-7 text-muted-foreground hover:bg-background"
              aria-label="放大"
              onClick={() => zoomBy(1.2)}
              label="放大"
              icon={<Plus />}
              size="sm"
            />
          </div>
          <ToolbarIconButton
            label={isFullscreen ? '退出全屏' : '全屏画布'}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </ToolbarIconButton>
          <DropdownMenu
            placement="below"
            alignment="end"
            menuWidth="13.5rem"
            renderTrigger={(triggerProps) => (
              <Tooltip content="导出 / 导入" placement="below">
                <IconButton
                  {...triggerProps}
                  variant="ghost"
                  className="text-muted-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
                  label="导出 / 导入"
                  icon={<Download />}
                  size="sm"
                />
              </Tooltip>
            )}
            items={[
              {
                id: 'png',
                label: (
                  <span className="flex items-center gap-2">
                    <ImageDown className="size-4" />
                    导出当前图纸 PNG（{pack.paper}，含图例）
                  </span>
                ),
                onClick: () => void exportPng(),
              },
              {
                id: 'json',
                label: (
                  <span className="flex items-center gap-2">
                    <FileJson className="size-4" />
                    导出画板 JSON
                  </span>
                ),
                onClick: exportJson,
              },
              ...(plugins.proposal
                ? [
                    {
                      id: 'proposal',
                      label: (
                        <span className="flex items-center gap-2">
                          <Presentation className="size-4" />
                          生成方案演示（业主版）
                        </span>
                      ),
                      onClick: () =>
                        void openLinkedPage(`/print/projects/${projectId}/proposal?scope=${scope}`),
                    },
                  ]
                : []),
              ...(readOnly
                ? []
                : [
                    {
                      id: 'import',
                      label: (
                        <span className="flex items-center gap-2">
                          <FileUp className="size-4" />
                          导入画板 JSON
                        </span>
                      ),
                      onClick: () => jsonInput.current?.click(),
                    },
                  ]),
            ]}
          />
          {/* 强弱电布线：和「导出 / 导入」同属图纸输出，是给施工队交底的单据（Beta） */}
          <BetaDocLink label="强弱电布线" href={`/print/projects/${projectId}/wiring`} />
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          {readOnly ? (
            activeQuote ? (
              <Button
                variant="secondary"
                onClick={() => void switchToQuote()}
                icon={<ReceiptText />}
                label="查看报价"
              />
            ) : null
          ) : (
            <>
              <div className="flex items-center">
                <Button
                  variant="secondary"
                  className={cn(quotes.length && 'rounded-r-none')}
                  isDisabled={saving || syncingQuote || !scopedPoints.length}
                  onClick={() => void switchToQuote()}
                  tooltip={
                    activeQuote
                      ? `把${scope === 'all' ? '全部' : `「${pointScopeLabel(scope)}」`}点位同步到「${activeQuote.title}」并打开`
                      : '按当前点位生成报价'
                  }
                  isLoading={syncingQuote}
                  icon={activeQuote ? <ArrowLeftRight /> : <FilePlus2 />}
                  label={activeQuote ? '同步报价' : '生成报价'}
                />
                {quotes.length ? (
                  <DropdownMenu
                    placement="below"
                    alignment="end"
                    menuWidth="16.2rem"
                    renderTrigger={(triggerProps) => (
                      <IconButton
                        {...triggerProps}
                        variant="secondary"
                        className="-ml-px w-7 rounded-l-none"
                        isDisabled={saving || syncingQuote}
                        label="选择要同步的报价，或新建报价"
                        icon={<ChevronDown />}
                        size="sm"
                      />
                    )}
                    items={[
                      ...quotes.map((q) => ({
                        id: q.id,
                        isDisabled: !scopedPoints.length,
                        label: (
                          <span
                            className={cn(
                              'min-w-0 truncate',
                              q.id === activeQuote?.id && 'font-semibold',
                            )}
                          >
                            同步到「{q.title}」
                          </span>
                        ),
                        endContent: (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {yuan(q.total)}
                          </span>
                        ),
                        onClick: () => void switchToQuote(q.id),
                      })),
                      { type: 'divider' as const },
                      {
                        id: 'new',
                        isDisabled: !scopedPoints.length,
                        label: (
                          <span className="flex items-center gap-2">
                            <FilePlus2 className="size-4" />
                            新建一份报价（{pointScopeLabel(scope)}）
                          </span>
                        ),
                        onClick: () => void createNewQuote(),
                      },
                    ]}
                  />
                ) : null}
              </div>
              <Button
                variant={dirty ? 'secondary' : 'ghost'}
                isDisabled={saving || (!dirty && !saving)}
                onClick={() => void save()}
                className={cn('min-w-20', !dirty && 'text-muted-foreground disabled:opacity-100')}
                tooltip={dirty ? '保存点位图（Ctrl/⌘ + S）' : '所有修改已保存'}
                label={saving ? '保存中' : dirty ? '保存' : '已保存'}
              >
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : dirty ? (
                  <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                ) : (
                  <Check className="text-success" />
                )}
                {saving ? '保存中' : dirty ? '保存' : '已保存'}
              </Button>
            </>
          )}
        </div>
      </div>

      {cropFile ? (
        <SheetCropper file={cropFile} onCancel={cancelCrop} onConfirm={addSheet} />
      ) : null}

      {/* ==================== 主体：户型图画布 + 右栏（设备与属性） ==================== */}
      <div className={cn('flex min-h-0 flex-1 flex-col lg:flex-row', cropFile && 'hidden')}>
        {/* 中央主视野：户型图画布 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="point-map-canvas relative min-h-0 flex-1">
            <BoardCanvas
              doc={doc}
              files={files}
              pack={pack}
              view={view}
              viewport={viewport}
              onViewport={setViewport}
              onSize={onSize}
              tool={tool}
              armed={armed}
              selection={selection}
              onSelection={(ids) => {
                setSelection(ids)
                setCtxMenu(null)
              }}
              hidden={hidden}
              readOnly={readOnly}
              dark={mounted && resolvedTheme === 'dark'}
              ready={ready}
              activeSheetId={activeSheetId}
              onCommit={commit}
              onPlace={(at) => armed && placePoint(armed, at)}
              onCreateArea={createAreaBox}
              onCalibrateLine={onCalibrateLine}
              onCalibrateRequest={readOnly ? undefined : startCalibrate}
              onContextMenu={onContextMenu}
              dropType={DRAG_TYPE}
              onDrop={onDrop}
              productImage={productImage}
              defaults={defaults}
            />
            {armed || tool === 'area' || tool === 'calibrate' ? (
              <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-primary/30 bg-background/95 px-3 py-1.5 text-xs shadow-sm">
                {armed
                  ? `点击图纸放置「${armedLabel}」，右键或 Esc 结束`
                  : tool === 'area'
                    ? '点击房间拐角描出轮廓，点回起点或双击完成；直接拖动画矩形'
                    : '沿已知长度拖一条线（按住 Shift 水平 / 垂直）'}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => {
                    setArmed(null)
                    setTool('select')
                  }}
                  label="结束"
                />
              </div>
            ) : null}
            {ctxMenu ? (
              <PointMapContextMenu
                target={ctxMenu}
                onClose={() => setCtxMenu(null)}
                onChangePointType={(pointId, dt) => updatePointType(pointId, dt)}
                onDuplicatePoint={(pointId) => duplicate([pointId])}
                onArmType={(dt) => setArmed(deviceTpl(dt))}
                onDeletePoint={(pointId) => removeIds([pointId])}
                onChangeAreaType={(areaId, areaType) =>
                  updateArea(areaId, { areaType, name: areaTypeLabel(areaType) })
                }
                onDeleteArea={(areaId) => removeIds([areaId])}
                onAddAreaAt={(sx, sy) => addAreaAt(sx, sy)}
                onFitSheet={() => fitSheet(activeSheetId)}
              />
            ) : null}
            {draft ? (
              <div className="absolute top-16 left-1/2 z-10 flex max-w-xl -translate-x-1/2 items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs shadow-sm">
                <Info className="size-4 shrink-0 text-primary" />
                <span>发现 {new Date(draft.at).toLocaleString('zh-CN')} 未保存的本地草稿</span>
                <Button
                  size="sm"
                  onClick={() => {
                    const r = decodeScene(draft.scene)
                    setFiles((f) => ({ ...f, ...draft.scene.files }))
                    commit(r)
                    setDraft(null)
                    showToast({ body: '已恢复本地草稿，确认无误后保存' })
                  }}
                  label="恢复"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    localStorage.removeItem(draftKey(projectId))
                    setDraft(null)
                  }}
                  label="丢弃"
                />
              </div>
            ) : notices.length || missingSheets ? (
              <div className="absolute top-16 left-1/2 z-10 flex max-w-xl -translate-x-1/2 items-start gap-2 rounded-lg border border-warning/30 bg-background px-3 py-2 text-xs shadow-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="space-y-0.5">
                  {(notices.length
                    ? notices
                    : [`有 ${missingSheets} 张图纸的图片丢失，请删除后重新添加`]
                  ).map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
                <IconButton
                  variant="ghost"

                  aria-label="关闭提示"
                  onClick={() => setNotices([])}
                  label="关闭提示"
                  icon={<X />}
                  size="sm"
                />
              </div>
            ) : null}
            {ready && !snap.sheets.length && !readOnly ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-background/95 p-6 text-center shadow-xs">
                  <ImagePlus className="size-8 text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">先添加户型图</p>
                    <p className="text-xs text-muted-foreground">
                      点顶部的「上传户型图」添加 PNG / JPG 户型图
                      {dwgEnabled ? '，或从旁边的箭头导入 DWG 图纸' : ''}，会自动裁切适配标准图纸。
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 右栏：设备与属性检查器 */}
        <aside
          className={cn(
            'point-map-aside flex w-full shrink-0 flex-col border-t border-border bg-background lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l',
            mobilePlaceOpen
              ? 'fixed inset-x-0 bottom-0 z-40 max-h-[70svh] rounded-t-2xl border shadow-xl lg:static lg:z-auto lg:rounded-none lg:shadow-none'
              : 'hidden lg:flex',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2 lg:hidden">
            <span className="text-xs font-semibold">选择要放置的设备</span>
            <IconButton
              variant="ghost"

              onClick={() => setMobilePlaceOpen(false)}
              aria-label="关闭放置面板"
              label="关闭放置面板"
              icon={<X />}
              size="sm"
            />
          </div>
          {/* 置顶上下文属性面板 */}
          {selectedPoint && selectedSymbol ? (
            <>
              <SelectedPoint
                code={selectedPoint.code}
                deviceType={selectedPoint.deviceType}
                areaName={snap.areas.find((a) => a.id === selectedPoint.areaId)?.name ?? null}
                readOnly={readOnly}
                onChangeType={(newType) => updatePointType(selectedPoint.id, newType)}
                onDuplicate={() => duplicate([selectedPoint.id])}
                onDelete={() => removeIds([selectedPoint.id])}
              />
              {readOnly ? null : (
                <div className="space-y-2.5 border-b border-border bg-subtle/80 px-3.5 pb-3.5">
                  {variant ? (
                    <div className="grid gap-1.5">
                      <div className="text-[11px] font-medium text-muted-foreground">
                        {variant.family.name} · 尺寸
                      </div>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <Selector
                            label="尺寸"
                            isLabelHidden
                            size="sm"
                            width="100%"
                            value={selectedSymbol.symbolId}
                            options={variantOptions}
                            onChange={(id) => {
                              const v = variant.family.variants.find((x) => x.id === id)
                              if (v)
                                commit((d) =>
                                  setPointVariant(d, selectedSymbol.id, v, selectedSymbol.real),
                                )
                            }}
                            controlClassName="h-8 border-border bg-background text-xs"
                          />
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          按比例
                          <Switch
                            label={'按真实尺寸落图'}
                            isLabelHidden
                            value={selectedSymbol.real}
                            isDisabled={!selectedSymbol.sizeCm}
                            onChange={(v) => commit((d) => setPointReal(d, [selectedSymbol.id], v))}
                            aria-label="按真实尺寸落图"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">旋转</span>
                    <IconButton
                      variant="secondary"

                      className="size-7 border-border bg-background"
                      aria-label="逆时针旋转 90°"
                      onClick={() => rotate([selectedSymbol.id], -90)}
                      label="逆时针旋转 90°"
                      icon={<RotateCcw />}
                      size="sm"
                    />
                    <IconButton
                      variant="secondary"

                      className="size-7 border-border bg-background"
                      aria-label="顺时针旋转 90°（R）"
                      tooltip="顺时针 90°（R）"
                      onClick={() => rotate([selectedSymbol.id], 90)}
                      label="顺时针旋转 90°（R）"
                      icon={<RotateCw />}
                      size="sm"
                    />
                    <AngleInput
                      key={`${selectedSymbol.id}-${selectedSymbol.angle}`}
                      value={toDeg(selectedSymbol.angle)}
                      onCommit={(v) =>
                        commit((d) =>
                          rotateSymbols(d, [selectedSymbol.id], { absolute: fromDeg(v) }),
                        )
                      }
                    />
                    <span className="text-xs text-muted-foreground">°</span>
                  </div>
                </div>
              )}
            </>
          ) : selectedArea ? (
            <SelectedArea
              area={selectedArea}
              analysis={analysis.get(selectedArea.id)}
              readOnly={readOnly}
              onChange={(patch) => updateArea(selectedArea.id, patch)}
              onDelete={() => removeIds([selectedArea.id])}
              onClose={closeSelectedArea}
            />
          ) : selectedIds.length > 1 ? (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-subtle/80 p-3.5 text-xs font-medium">
              <span className="text-primary">已选 {selectedIds.length} 个对象</span>
              {readOnly ? null : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => rotate(selectedIds, 90)}
                    icon={<RotateCw />}
                    label="旋转"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:text-destructive"
                    onClick={() => removeIds(selectedIds)}
                    icon={<Trash2 />}
                    label="删除"
                  />
                </div>
              )}
            </div>
          ) : null}

          {/* 右栏主体：一层分段（设备 / 灯光 / 区域 / 统计）；同步报价只在顶栏 */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-3 py-2.5">
              {/*
                官方 TabList：`layout="fill"` 让每个 tab 均分容器宽度，等价于原来的
                `grid w-full grid-cols-4`（readOnly 时只剩 2 个 tab，均分即 grid-cols-2）。
                `Tab.label` 只收字符串，所以「区域」后的点位数与「统计」的告警点走 `endContent`。
              */}
              <TabList
                value={tab}
                onChange={(v) => setTab(v as PanelTab)}
                size="sm"
                layout="fill"
                aria-label="设备与属性"
                role="tablist"
              >
                {readOnly ? null : (
                  <>
                    <Tab value="devices" label="设备" panelId="point-map-panel" />
                    <Tab value="lighting" label="灯光" panelId="point-map-panel" />
                  </>
                )}
                <Tab
                  value="areas"
                  label="区域"
                  panelId="point-map-panel"
                  endContent={
                    <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                      {snap.areas.length}
                    </span>
                  }
                />
                <Tab
                  value="summary"
                  label="统计"
                  panelId="point-map-panel"
                  endContent={
                    issues.some((i) => i.level !== 'info') ? (
                      <span
                        aria-label="有需要处理的检查项"
                        className="size-1.5 rounded-full bg-warning"
                      />
                    ) : null
                  }
                />
              </TabList>
            </div>

            {readOnly ? null : (
              <>
                {tab === 'devices' ? (
                  <div
                    id="point-map-panel"
                    role="tabpanel"
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <PlacePanel
                      groups={filteredGroups}
                      query={query}
                      onQuery={setQuery}
                      counts={summary.byType}
                      armed={armedDevice}
                      onArm={(t) => {
                        setTool('select')
                        setArmed(t ? deviceTpl(t) : null)
                        setMobilePlaceOpen(false)
                      }}
                      disabled={!snap.sheets.length}
                    />
                  </div>
                ) : null}
                {tab === 'lighting' ? (
                  <div
                    id="point-map-panel"
                    role="tabpanel"
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <LightingPanel
                      armedId={armed && !armedDevice ? armed.symbolId : null}
                      onArm={(tpl) => {
                        setTool('select')
                        setArmed(tpl)
                        setMobilePlaceOpen(false)
                      }}
                      disabled={!snap.sheets.length}
                      calibrated={!!activeSheet?.mmPerUnit}
                    />
                  </div>
                ) : null}
              </>
            )}

            {tab === 'areas' ? (
              <div
                id="point-map-panel"
                role="tabpanel"
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <AreasPanel
                  sheets={snap.sheets}
                  areas={snap.areas}
                  analysis={analysis}
                  unassigned={unassigned}
                  selectedAreaId={selectedArea?.id ?? null}
                  onAdd={addArea}
                  onFocus={focusArea}
                  readOnly={readOnly}
                />
              </div>
            ) : null}

            {tab === 'summary' ? (
              <div
                id="point-map-panel"
                role="tabpanel"
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <ScrollableArea label="图纸检查与设备统计" axis="block" className="min-h-0 flex-1">
                  <div className="space-y-2 p-3.5">
                    {readOnly || !plugins.smartSelect ? null : (
                      <SmartSelect
                        platform={platform}
                        busy={selecting}
                        disabled={!scopedPoints.length || saving}
                        onRun={(tier, overwrite) => void autoSelect(tier, overwrite)}
                      />
                    )}
                    {issues.length ? (
                      <section className="mb-3 space-y-1">
                        <h2 className="text-xs font-semibold text-fg-secondary">图纸检查</h2>
                        {issues.map((i) => (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => focusTargets(i.targets)}
                            className="flex w-full items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left text-xs transition-colors hover:bg-subtle"
                          >
                            {i.level === 'info' ? (
                              <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <CircleAlert
                                className={cn(
                                  'mt-0.5 size-3.5 shrink-0',
                                  i.level === 'error' ? 'text-destructive' : 'text-warning',
                                )}
                              />
                            )}
                            <span className="min-w-0">
                              <span className="block font-medium">{i.title}</span>
                              {i.detail ? (
                                <span className="block text-muted-foreground">{i.detail}</span>
                              ) : null}
                            </span>
                          </button>
                        ))}
                      </section>
                    ) : null}
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-xs font-semibold text-fg-secondary">
                        设备统计{scope !== 'all' ? ` · ${pointScopeLabel(scope)}` : ''}
                      </h2>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        共 {scopedPoints.length} 个点位
                      </span>
                    </div>
                    {typesInUse.length === 0 ? (
                      <p className="text-xs text-muted-foreground">还没有放置设备</p>
                    ) : null}
                    {typesInUse.map((t) => (
                      <TypeDefaultRow
                        key={t}
                        type={t}
                        count={summary.byType.get(t) ?? 0}
                        readOnly={readOnly}
                        onArm={(dt) => {
                          setArmed(deviceTpl(dt))
                          setTab('devices')
                        }}
                      />
                    ))}
                  </div>
                </ScrollableArea>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <Dialog isOpen={!!renaming} onOpenChange={(o) => !o && setRenaming(null)} width={384}>
        <Layout
          header={
            <DialogHeader
              title="重命名图纸"
              subtitle="名称显示在楼层菜单、导出图纸和报价的区域分组里。"
              onOpenChange={(o) => !o && setRenaming(null)}
            />
          }
          content={
            <LayoutContent padding={5}>
              <form
                id="rename-sheet"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (renaming) renameSheet(renaming.id, renaming.name)
                }}
              >
                <TextInput
                  label={'图纸名称'}
                  isLabelHidden
                  hasAutoFocus
                  value={renaming?.name ?? ''}
                  aria-label="图纸名称"
                  onChange={(v) => setRenaming((r) => (r ? { ...r, name: v } : r))}
                />
              </form>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" onClick={() => setRenaming(null)} label="取消" />
                <Button
                  type="submit"
                  form="rename-sheet"
                  isDisabled={!renaming?.name.trim()}
                  label="保存"
                />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>

      <Dialog
        isOpen={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        width={384}
      >
        <Layout
          header={
            <DialogHeader
              title={`删除图纸「${snap.sheets.find((x) => x.id === confirmDelete)?.name ?? ''}」？`}
              subtitle={`图纸上的 ${
                snap.points.filter((p) => p.sheetId === confirmDelete).length
              } 个点位会一起删除。删除后可以按 Ctrl/⌘ + Z 撤销。`}
              onOpenChange={(o) => !o && setConfirmDelete(null)}
            />
          }
          content={<LayoutContent padding={5} />}
          footer={
            <LayoutFooter hasDivider>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(null)} label="取消" />
                <Button
                  variant="destructive"
                  onClick={() => confirmDelete && deleteSheet(confirmDelete)}
                  icon={<Trash2 />}
                  label="删除图纸"
                />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>

      <Dialog isOpen={!!calib} onOpenChange={(o) => !o && setCalib(null)} width={384}>
        <Layout
          header={
            <DialogHeader
              title="标定图纸比例"
              subtitle={`刚才画的线在图纸上长 ${
                calib ? Math.round(calib.units) : 0
              } 个单位，它实际有多长？标定后网格按 25cm 显示，灯具可按真实尺寸落图。`}
              onOpenChange={(o) => !o && setCalib(null)}
            />
          }
          content={
            <LayoutContent padding={5}>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  applyCalibration()
                }}
                className="flex items-center gap-2"
              >
                <TextInput
                  label={'实际长度（米）'}
                  isLabelHidden
                  hasAutoFocus
                  inputMode="decimal"
                  placeholder="例如 3.6"
                  value={calib?.value ?? ''}
                  onChange={(v) => setCalib((c) => (c ? { ...c, value: v } : c))}
                  aria-label="实际长度（米）"
                />
                <span className="text-sm text-muted-foreground">米</span>
              </form>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" onClick={() => setCalib(null)} label="取消" />
                <Button onClick={applyCalibration} label="确定" />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>

      <Dialog isOpen={autoGenOpen} onOpenChange={setAutoGenOpen} width={448}>
        <Layout
          header={
            <DialogHeader
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  智能生成点位
                </span>
              }
              subtitle={
                <>
                  系统将根据图纸上的房间区域自动配置全屋智能设备与灯光点位。
                  <strong className="font-medium text-foreground">
                    注意：此操作会覆盖目标图纸上的当前点位（生成后可随时点击「撤销」或 Ctrl/⌘ + Z
                    恢复）。
                  </strong>
                </>
              }
              onOpenChange={setAutoGenOpen}
            />
          }
          content={
            <LayoutContent padding={5}>
              <div className="space-y-3 text-xs">
                {snap.sheets.length > 1 ? (
                  <div className="space-y-1.5">
                    <span className="font-medium text-muted-foreground">生成目标图纸</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={autoGenScope === 'current' ? 'primary' : 'secondary'}
                        onClick={() => setAutoGenScope('current')}
                        label={`当前图纸（${activeSheet?.name ?? '当前层'}）`}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant={autoGenScope === 'all' ? 'primary' : 'secondary'}
                        onClick={() => setAutoGenScope('all')}
                        label={`全部图纸（${snap.sheets.length} 张）`}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                  <div className="space-y-0.5 pr-3">
                    <div className="font-medium text-foreground">同时生成照明灯具点位</div>
                    <div className="text-[11px] text-muted-foreground">
                      开启后一并生成吸顶灯、筒射灯与灯带；关闭则仅生成智能开关、网关、AP、窗帘与传感器
                    </div>
                  </div>
                  <Switch
                    label={'开关'}
                    isLabelHidden
                    value={autoGenIncludeLighting}
                    onChange={setAutoGenIncludeLighting}
                  />
                </div>

                <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-muted-foreground">
                  {(() => {
                    const targetPts =
                      autoGenScope === 'current' && activeSheetId
                        ? snap.points.filter((p) => p.sheetId === activeSheetId).length
                        : snap.points.length
                    const targetAreas =
                      autoGenScope === 'current' && activeSheetId
                        ? snap.areas.filter((a) => a.sheetId === activeSheetId).length
                        : snap.areas.length
                    return (
                      <span>
                        {targetAreas > 0
                          ? `将按已划分的 ${targetAreas} 个房间区域重新排布点位`
                          : '当前图纸尚未划分房间区域，将自动生成标准户型房间区域并排布点位'}
                        {targetPts > 0 ? `，并覆盖现有的 ${targetPts} 个点位（可撤销）。` : '。'}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" onClick={() => setAutoGenOpen(false)} label="取消" />
                <Button
                  onClick={runAutoGeneratePoints}
                  icon={<Sparkles />}
                  label="确认覆盖并生成（可撤销）"
                />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>

      {aiStyleOpen ? (
        <AiStyleDialog
          open={aiStyleOpen}
          onOpenChange={setAiStyleOpen}
          source={aiStyleSource}
          enabled={aiCopilot}
        />
      ) : null}
    </div>
  )
}
