'use client'

import '@excalidraw/excalidraw/index.css'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { AlertTriangle, ChevronLeft, Download, FileUp, ImagePlus, Loader2, MousePointerClick, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

import { BrandLogo } from '@/components/brand-logo'
import { DeviceSymbol } from '@/components/device-symbol'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { categoryOf, categoryOfType, DEVICE_GROUPS, DEVICE_TYPE_ORDER, deviceTypeLabel, deviceTypeOf, symbolUrl, type DeviceType } from '@/lib/device-types'
import { isPointData, pointDeviceType, resolvePoint, summarizePoints, type PointCustomData, type ProjectDefaults } from '@/lib/point-map-items'
import { cn } from '@/lib/utils'

const Excalidraw = dynamic(async () => (await import('@excalidraw/excalidraw')).Excalidraw, {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />
      正在加载画布…
    </div>
  ),
})

export type PointProduct = {
  id: string
  name: string
  sku: string
  price: number
  unit: string
  status: string
  deviceType: string | null
  brand: string
  brandLogo: string | null
  image: string | null
}

type SceneElement = {
  id: string
  type: string
  isDeleted?: boolean
  version: number
  groupIds?: readonly string[]
  customData?: PointCustomData & { pointCode?: string }
}
type StoredScene = { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> }

const DEFAULT_VALUE = '__default'
const NONE_VALUE = '__none'
const yuan = (n: number) => `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`

/** 读取符号 SVG 并按类别颜色着色，转成 Excalidraw 可用的 dataURL；同一符号同一颜色只取一次。 */
const symbolCache = new Map<string, Promise<string>>()
function symbolDataURL(type: DeviceType, color: string) {
  const id = `${type.symbol}-${color}`
  let hit = symbolCache.get(id)
  if (!hit) {
    hit = fetch(symbolUrl(type.symbol))
      .then((r) => {
        if (!r.ok) throw new Error('symbol')
        return r.text()
      })
      .then((svg) => `data:image/svg+xml;base64,${btoa(svg.replace('fill="currentColor"', `fill="${color}"`))}`)
    hit.catch(() => symbolCache.delete(id))
    symbolCache.set(id, hit)
  }
  return hit
}

/** 户型图压缩到最长边 2400px，避免点位图数据过大。 */
async function readFloorPlan(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  return { dataURL: canvas.toDataURL('image/jpeg', 0.85), width, height }
}

function ProductLine({ product, hint }: { product: PointProduct; hint?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <BrandLogo name={product.brand} logo={product.brandLogo} className="h-3.5 max-w-12 shrink-0" />
      <span className="min-w-0 truncate">{product.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{yuan(product.price)}</span>
      {hint ? <span className="shrink-0 text-xs text-muted-foreground">{hint}</span> : null}
    </span>
  )
}

export function PointMapEditor({
  projectId,
  projectName,
  initialScene,
  products,
  initialDefaults,
  readOnly,
  dwgEnabled = false,
}: {
  projectId: string
  projectName: string
  initialScene: StoredScene | null
  products: PointProduct[]
  initialDefaults: ProjectDefaults
  readOnly: boolean
  dwgEnabled?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [points, setPoints] = useState<SceneElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<ProjectDefaults>(initialDefaults)
  const [savingDefault, setSavingDefault] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const savedVersion = useRef<number | null>(null)
  const pointsKey = useRef('')
  const fileInput = useRef<HTMLInputElement>(null)
  const dwgInput = useRef<HTMLInputElement>(null)
  const [converting, setConverting] = useState(false)
  const insertOffset = useRef(0)

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const activeByType = useMemo(() => {
    const map = new Map<string, PointProduct[]>()
    for (const p of products) {
      if (p.status !== 'active' || !p.deviceType) continue
      map.set(p.deviceType, [...(map.get(p.deviceType) ?? []), p])
    }
    return map
  }, [products])

  const initialData = useMemo(
    () => ({
      elements: (initialScene?.elements ?? []) as never,
      files: (initialScene?.files ?? {}) as never,
      appState: {
        viewBackgroundColor: (initialScene?.appState?.viewBackgroundColor as string) ?? '#ffffff',
        currentItemRoughness: 0,
        currentItemFontFamily: 2,
        currentItemStrokeWidth: 1,
      },
      scrollToContent: true,
    }),
    [initialScene],
  )

  const handleChange = useCallback((elements: readonly unknown[], appState: { selectedElementIds: Record<string, boolean> }) => {
    const list = elements as SceneElement[]
    const live = list.filter((e) => !e.isDeleted && isPointData(e.customData))
    const key = live.map((e) => `${e.id}:${String(e.customData?.deviceType ?? '')}:${String(e.customData?.productId ?? '')}`).join('|')
    if (key !== pointsKey.current) {
      pointsKey.current = key
      setPoints(live)
    }
    // 选中符号或它的代号文字都算选中这个点位
    const selected = list.filter((e) => !e.isDeleted && appState.selectedElementIds[e.id])
    const direct = selected.find((e) => isPointData(e.customData))
    const viaGroup = direct ?? live.find((p) => p.groupIds?.length && selected.some((s) => s.groupIds?.some((g) => p.groupIds!.includes(g))))
    setSelectedId(viaGroup?.id ?? null)

    // 用元素版本号之和判断是否有未保存的修改；首次回调记为已保存基线。
    const version = list.reduce((sum, e) => sum + e.version, 0)
    if (savedVersion.current === null) savedVersion.current = version
    setDirty(version !== savedVersion.current)
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const summary = useMemo(() => summarizePoints(points.map((p) => p.customData ?? {}), productById, defaults), [points, productById, defaults])
  const total = useMemo(() => [...summary.products.entries()].reduce((s, [id, r]) => s + (productById.get(id)?.price ?? 0) * r.count, 0), [summary, productById])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DEVICE_GROUPS
    return DEVICE_GROUPS.map((g) => ({
      ...g,
      types: g.types.filter((t) => `${g.category.name}${t.name}`.toLowerCase().includes(q) || (activeByType.get(t.value) ?? []).some((p) => `${p.name} ${p.sku} ${p.brand}`.toLowerCase().includes(q))),
    })).filter((g) => g.types.length)
  }, [query, activeByType])

  /** 在当前视野中心放一个点位：设备符号 + 代号文字，customData 只记录设备类型，产品后选。 */
  const addPoint = useCallback(
    async (type: DeviceType) => {
      if (!api || readOnly) return
      const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
      const category = categoryOf(type.category)!
      const existing = api.getSceneElements() as unknown as SceneElement[]
      const used = existing.filter((e) => !e.isDeleted && isPointData(e.customData) && categoryOfType(pointDeviceType(e.customData!, productById))?.slug === category.slug).length
      const code = `${category.code}${used + 1}`
      const label = type.category === 'switch' ? `${code} ${type.name}` : code

      const s = api.getAppState()
      const zoom = s.zoom.value
      const box = 40
      const offset = (insertOffset.current++ % 6) * 14
      const x = s.width / 2 / zoom - s.scrollX - box / 2 + offset
      const y = s.height / 2 / zoom - s.scrollY - box / 2 + offset
      try {
        const dataURL = await symbolDataURL(type, category.color)
        const fileId = `sym-${type.symbol}-${category.color.slice(1)}`
        if (!api.getFiles()[fileId]) api.addFiles([{ id: fileId as never, dataURL: dataURL as never, mimeType: 'image/svg+xml', created: Date.now() }])
        const groupId = `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        // 只有符号图片带 deviceType，代号文字不参与统计，避免重复计数。
        const created = convertToExcalidrawElements([
          { type: 'image', fileId, x, y, width: box, height: box, customData: { deviceType: type.value, productId: null, pointCode: code, categorySlug: category.slug } },
          { type: 'text', x: x - 20, y: y + box + 2, width: box + 40, text: label, fontSize: 12, fontFamily: 2, textAlign: 'center', strokeColor: category.color, customData: { pointCode: code } },
        ] as never).map((el) => ({ ...el, groupIds: [groupId] }))
        api.updateScene({
          elements: [...api.getSceneElementsIncludingDeleted(), ...created] as never,
          appState: { selectedElementIds: { [created[0].id]: true } } as never,
        })
      } catch {
        toast.error('设备符号加载失败，请重试')
      }
    },
    [api, readOnly, productById],
  )

  /** 修改点位的 customData（例如指定产品），保留其他属性并提升版本号 */
  const updatePoint = useCallback(
    (id: string, patch: Partial<PointCustomData>) => {
      if (!api) return
      const elements = (api.getSceneElementsIncludingDeleted() as unknown as (SceneElement & { versionNonce: number })[]).map((el) =>
        el.id === id
          ? { ...el, customData: { ...el.customData, ...patch }, version: el.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() }
          : el,
      )
      api.updateScene({ elements: elements as never })
    },
    [api],
  )

  const saveDefault = useCallback(
    async (deviceType: string, productId: string | null) => {
      setSavingDefault(deviceType)
      try {
        const res = await fetch(`/projects/${projectId}/point-map/defaults`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceType, productId }) })
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; defaults?: ProjectDefaults }
        if (!res.ok || !data.ok || !data.defaults) throw new Error(data.error ?? '保存失败，请稍后重试')
        setDefaults(data.defaults)
        toast.success(productId ? `已设为「${deviceTypeLabel(deviceType)}」的默认型号` : '已清除默认型号')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
      } finally {
        setSavingDefault(null)
      }
    },
    [projectId],
  )

  const uploadFloorPlan = useCallback(
    async (file: File) => {
      if (!api) return
      if (!file.type.startsWith('image/')) return toast.error('请选择图片文件')
      try {
        const { dataURL, width, height } = await readFloorPlan(file)
        const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
        const fileId = `floor-${Date.now()}`
        api.addFiles([{ id: fileId as never, dataURL: dataURL as never, mimeType: 'image/jpeg', created: Date.now() }])
        const scale = Math.min(1, 1600 / width)
        const [image] = convertToExcalidrawElements([
          { type: 'image', fileId, x: 0, y: 0, width: width * scale, height: height * scale, locked: true },
        ] as never)
        // 户型图放在最底层并锁定，避免误拖动；需要调整时右键解锁。
        api.updateScene({ elements: [image, ...api.getSceneElementsIncludingDeleted()] })
        api.scrollToContent(image, { fitToContent: true })
        toast.success('户型图已插入并锁定，右键可解锁调整')
      } catch {
        toast.error('图片读取失败，请换一张试试')
      }
    },
    [api],
  )

  const importDwg = useCallback(
    async (file: File) => {
      if (!api || converting) return
      if (!/\.dwg$/i.test(file.name)) return toast.error('请选择 .dwg 文件')
      setConverting(true)
      const pending = toast.loading('正在转换 DWG，可能需要几十秒…')
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await fetch(`/projects/${projectId}/point-map/dwg`, { method: 'POST', body })
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; url?: string; name?: string }
        if (!res.ok || !data.ok || !data.url) throw new Error(data.error ?? '转换失败，请稍后重试')
        const img = await fetch(data.url)
        if (!img.ok) throw new Error('户型图已生成，但读取失败')
        const blob = await img.blob()
        toast.dismiss(pending)
        await uploadFloorPlan(new File([blob], data.name ?? 'floor.png', { type: blob.type || 'image/png' }))
      } catch (error) {
        toast.dismiss(pending)
        toast.error(error instanceof Error ? error.message : '转换失败，请稍后重试')
      } finally {
        setConverting(false)
      }
    },
    [api, converting, projectId, uploadFloorPlan],
  )

  const save = useCallback(async () => {
    if (!api || saving) return
    setSaving(true)
    try {
      const { serializeAsJSON } = await import('@excalidraw/excalidraw')
      const elements = api.getSceneElements()
      const body = serializeAsJSON(elements, api.getAppState(), api.getFiles(), 'database')
      const res = await fetch(`/projects/${projectId}/point-map/data`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '保存失败，请稍后重试')
      savedVersion.current = (api.getSceneElementsIncludingDeleted() as unknown as { version: number }[]).reduce((s, e) => s + e.version, 0)
      setDirty(false)
      toast.success('点位图已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }, [api, projectId, saving])

  const exportPng = useCallback(async () => {
    if (!api) return
    const { exportToBlob } = await import('@excalidraw/excalidraw')
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
      files: api.getFiles(),
      mimeType: 'image/png',
      exportPadding: 24,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}-点位图.png`
    a.click()
    URL.revokeObjectURL(url)
  }, [api, projectName])

  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, readOnly])

  const selected = selectedId ? points.find((p) => p.id === selectedId) : undefined
  const selectedResolved = selected ? resolvePoint(selected.customData ?? {}, productById, defaults) : null
  const selectedType = selectedResolved ? deviceTypeOf(selectedResolved.deviceType) : undefined
  const selectedOwn = selected && typeof selected.customData?.productId === 'string' ? productById.get(selected.customData.productId) : undefined
  const typesInUse = DEVICE_TYPE_ORDER.filter((t) => summary.byType.has(t))

  return (
    <div className="-m-4 flex h-[calc(100svh-4rem)] flex-col md:-m-8">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href={`/projects/${projectId}`}><ChevronLeft className="size-4" />返回项目</Link>
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <h1 className="truncate text-sm font-semibold">{projectName} · 点位图</h1>
        {readOnly ? <Badge variant="secondary">只读</Badge> : dirty ? <Badge variant="outline">未保存</Badge> : null}
        <div className="ml-auto flex items-center gap-2">
          {readOnly ? null : (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadFloorPlan(f)
                  e.target.value = ''
                }}
              />
              <Button variant="outline" size="sm" disabled={!api} onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" />上传户型图
              </Button>
              {dwgEnabled ? (
                <>
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
                  <Button variant="outline" size="sm" disabled={!api || converting} onClick={() => dwgInput.current?.click()}>
                    {converting ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}导入 DWG
                  </Button>
                </>
              ) : null}
            </>
          )}
          <Button variant="outline" size="sm" disabled={!api} onClick={() => void exportPng()}>
            <Download className="size-4" />导出图片
          </Button>
          {readOnly ? null : (
            <Button size="sm" disabled={!api || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData}
            onChange={handleChange as never}
            langCode="zh-CN"
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            viewModeEnabled={readOnly}
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false, saveAsImage: false, clearCanvas: !readOnly },
              tools: { image: !readOnly },
            }}
          />
        </div>

        <aside className="hidden w-84 shrink-0 flex-col border-l bg-background lg:flex">
          {selected && selectedResolved ? (
            <div className="space-y-3 border-b bg-muted/40 p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MousePointerClick className="size-3.5" />选中的点位</div>
              <div className="flex items-center gap-3">
                <DeviceSymbol type={selectedResolved.deviceType} framed className="size-10" />
                <div className="min-w-0">
                  <div className="font-semibold">{String(selected.customData?.pointCode ?? '')} · {selectedType?.name ?? '其他设备'}</div>
                  <div className="text-xs text-muted-foreground">{deviceTypeLabel(selectedResolved.deviceType)}</div>
                </div>
              </div>
              <div className="grid gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">产品</div>
                <Select
                  value={selectedOwn ? selectedOwn.id : DEFAULT_VALUE}
                  disabled={readOnly}
                  onValueChange={(v) => updatePoint(selected.id, { productId: v === DEFAULT_VALUE ? null : v, deviceType: selectedResolved.deviceType })}
                >
                  <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_VALUE}>
                      {defaults[selectedResolved.deviceType] && productById.get(defaults[selectedResolved.deviceType])
                        ? `使用项目默认型号（${productById.get(defaults[selectedResolved.deviceType])!.name}）`
                        : '使用项目默认型号（未设置）'}
                    </SelectItem>
                    {selectedOwn && selectedOwn.status !== 'active' ? (
                      <SelectItem value={selectedOwn.id}><ProductLine product={selectedOwn} hint="已下架" /></SelectItem>
                    ) : null}
                    {(activeByType.get(selectedResolved.deviceType) ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}><ProductLine product={p} /></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedResolved.source === 'pending' ? (
                  <p className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3.5" />待选型：报价时不计入金额</p>
                ) : selectedOwn && selectedOwn.status !== 'active' ? (
                  <p className="text-xs text-warning">指定的产品已下架，报价将使用项目默认型号</p>
                ) : null}
                {(activeByType.get(selectedResolved.deviceType) ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">产品库里还没有这个设备类型的在售产品</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <Tabs defaultValue={readOnly ? 'summary' : 'place'} className="min-h-0 flex-1 gap-0">
            <TabsList className="mx-4 mt-3 grid w-auto grid-cols-2">
              {readOnly ? null : <TabsTrigger value="place">放置设备</TabsTrigger>}
              <TabsTrigger value="summary" className={readOnly ? 'col-span-2' : undefined}>
                统计与默认型号
                {summary.pendingTotal ? <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px] text-warning tabular-nums">{summary.pendingTotal}</Badge> : null}
              </TabsTrigger>
            </TabsList>

            {readOnly ? null : (
              <TabsContent value="place" className="flex min-h-0 flex-col">
                <div className="space-y-2 p-4 pb-2">
                  <p className="text-xs text-muted-foreground">点击设备，点位会出现在画布中央，再拖到对应位置；产品可稍后指定。</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索设备或产品" aria-label="搜索设备" className="pl-9" />
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-4 p-4 pt-2">
                    {filteredGroups.map(({ category, types }) => {
                      const placed = types.reduce((s, t) => s + (summary.byType.get(t.value) ?? 0), 0)
                      return (
                        <section key={category.slug}>
                          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
                            <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
                            {category.name}
                            {placed ? <span className="font-normal text-muted-foreground tabular-nums">{placed}</span> : null}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {types.map((t) => {
                              const n = summary.byType.get(t.value) ?? 0
                              return (
                                <button
                                  key={t.value}
                                  type="button"
                                  disabled={!api}
                                  onClick={() => void addPoint(t)}
                                  className="relative flex flex-col items-center gap-1 rounded-lg border bg-background px-1 py-2 text-xs transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-50"
                                  title={`放置${deviceTypeLabel(t.value)}`}
                                >
                                  <span className="size-7"><DeviceSymbol type={t.value} /></span>
                                  <span className="leading-tight">{t.name}</span>
                                  {n ? <span className="absolute top-1 right-1 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums">{n}</span> : null}
                                </button>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
                    {filteredGroups.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">没有匹配的设备</p> : null}
                  </div>
                </ScrollArea>
              </TabsContent>
            )}

            <TabsContent value="summary" className="flex min-h-0 flex-col">
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-2 p-4">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold">设备统计</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">共 {points.length} 个点位</span>
                  </div>
                  {typesInUse.length === 0 ? <p className="text-xs text-muted-foreground">还没有放置设备</p> : null}
                  {typesInUse.map((t) => {
                    const count = summary.byType.get(t) ?? 0
                    const pending = summary.pending.get(t) ?? 0
                    const options = activeByType.get(t) ?? []
                    const def = defaults[t]
                    return (
                      <div key={t} className="rounded-lg border p-2.5">
                        <div className="flex items-center gap-2">
                          <DeviceSymbol type={t} framed className="size-7" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{deviceTypeLabel(t)}</span>
                          <span className="text-sm text-muted-foreground tabular-nums">× {count}</span>
                        </div>
                        <div className="mt-2 grid gap-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>项目默认型号</span>
                            {savingDefault === t ? <Loader2 className="size-3 animate-spin" /> : null}
                          </div>
                          <Select value={def && productById.get(def) ? def : NONE_VALUE} disabled={readOnly || savingDefault === t} onValueChange={(v) => void saveDefault(t, v === NONE_VALUE ? null : v)}>
                            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE_VALUE}>未设置</SelectItem>
                              {options.map((p) => <SelectItem key={p.id} value={p.id}><ProductLine product={p} /></SelectItem>)}
                            </SelectContent>
                          </Select>
                          {options.length === 0 ? <p className="text-[11px] text-muted-foreground">产品库暂无此类在售产品</p> : null}
                          {pending ? <p className="flex items-center gap-1 text-[11px] text-warning"><AlertTriangle className="size-3" />{pending} 个点位待选型</p> : null}
                        </div>
                      </div>
                    )
                  })}

                  {summary.products.size ? (
                    <div className="mt-4 space-y-1.5 border-t pt-3">
                      <h3 className="text-xs font-semibold text-muted-foreground">报价预览</h3>
                      {[...summary.products.entries()].map(([id, r]) => {
                        const p = productById.get(id)
                        return (
                          <div key={id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">
                              {p?.name ?? '已删除产品'}
                              {r.fromDefault ? <span className="ml-1 text-[11px] text-muted-foreground">默认 {r.fromDefault}</span> : null}
                            </span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">× {r.count}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
              <div className="space-y-1 border-t p-4 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">设备合计（售价）</span>
                  <span className="font-semibold tabular-nums">{yuan(total)}</span>
                </div>
                {summary.pendingTotal ? <p className="text-xs text-warning">另有 {summary.pendingTotal} 个点位待选型，未计入金额</p> : null}
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  )
}
