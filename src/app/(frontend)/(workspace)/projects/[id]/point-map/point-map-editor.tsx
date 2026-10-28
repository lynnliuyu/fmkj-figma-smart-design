'use client'

import '@excalidraw/excalidraw/index.css'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { ChevronLeft, Download, ImagePlus, Loader2, MousePointerClick, Plus, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { POINT_SYMBOLS, symbolUrl, type PointSymbolKey } from '@/lib/point-symbols'
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
  brand: string
  categorySlug: string
  categoryName: string
  symbol: PointSymbolKey | null
}

/** 每个分类一个点位代号和颜色，例如开关 K1、K2。 */
const CATEGORY_STYLE: Record<string, { code: string; color: string }> = {
  gateway: { code: 'GW', color: '#7c3aed' },
  switch: { code: 'K', color: '#2563eb' },
  lighting: { code: 'L', color: '#d97706' },
  sensor: { code: 'S', color: '#059669' },
  curtain: { code: 'C', color: '#db2777' },
  lock: { code: 'D', color: '#475569' },
  security: { code: 'A', color: '#dc2626' },
  network: { code: 'N', color: '#0891b2' },
}
const styleOf = (slug: string, name: string) => CATEGORY_STYLE[slug] ?? { code: name.slice(0, 1) || 'P', color: '#525252' }

type SceneElement = {
  id: string
  type: string
  isDeleted?: boolean
  customData?: { productId?: string; pointCode?: string; categorySlug?: string }
}
type StoredScene = { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> }

const yuan = (n: number) => `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`

/** 读取符号 SVG 并按分类颜色着色，转成 Excalidraw 可用的 dataURL；同一符号同一颜色只取一次。 */
const symbolCache = new Map<string, Promise<string>>()
function symbolDataURL(key: PointSymbolKey, color: string) {
  const id = `${key}-${color}`
  let hit = symbolCache.get(id)
  if (!hit) {
    hit = fetch(symbolUrl(key))
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

function SymbolMark({ symbol, code, color }: { symbol: PointSymbolKey | null; code: string; color: string }) {
  if (!symbol) {
    return (
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold"
        style={{ borderColor: color, color, backgroundColor: `${color}14` }}
      >
        {code}
      </span>
    )
  }
  const mask = `url(${symbolUrl(symbol)}) center / contain no-repeat`
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border" style={{ backgroundColor: `${color}0d` }} title={POINT_SYMBOLS[symbol]}>
      <span aria-hidden className="size-6" style={{ backgroundColor: color, mask, WebkitMask: mask }} />
    </span>
  )
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

export function PointMapEditor({
  projectId,
  projectName,
  initialScene,
  products,
  readOnly,
}: {
  projectId: string
  projectName: string
  initialScene: StoredScene | null
  products: PointProduct[]
  readOnly: boolean
}) {
  const { resolvedTheme } = useTheme()
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [points, setPoints] = useState<SceneElement[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const savedVersion = useRef<number | null>(null)
  const pointsKey = useRef('')
  const fileInput = useRef<HTMLInputElement>(null)
  const insertOffset = useRef(0)

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

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

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: { selectedElementIds: Record<string, boolean> }) => {
      const list = elements as SceneElement[]
      const live = list.filter((e) => !e.isDeleted && e.customData?.productId)
      const key = live.map((e) => `${e.id}:${e.customData?.productId}`).join('|')
      if (key !== pointsKey.current) {
        pointsKey.current = key
        setPoints(live)
      }
      const selected = live.find((e) => appState.selectedElementIds[e.id])
      setSelectedProductId(selected?.customData?.productId ?? null)

      // 用元素版本号之和判断是否有未保存的修改；首次回调记为已保存基线。
      const version = (list as unknown as { version: number }[]).reduce((sum, e) => sum + e.version, 0)
      if (savedVersion.current === null) savedVersion.current = version
      setDirty(version !== savedVersion.current)
    },
    [],
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of points) map.set(p.customData!.productId!, (map.get(p.customData!.productId!) ?? 0) + 1)
    return map
  }, [points])

  const summary = useMemo(
    () =>
      [...counts.entries()]
        .map(([id, count]) => ({ product: productById.get(id), id, count }))
        .sort((a, b) => (a.product?.categorySlug ?? '').localeCompare(b.product?.categorySlug ?? '')),
    [counts, productById],
  )
  const total = summary.reduce((s, r) => s + (r.product ? r.product.price * r.count : 0), 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? products.filter((p) => `${p.name} ${p.sku} ${p.brand} ${p.categoryName}`.toLowerCase().includes(q)) : products
  }, [products, query])

  /** 在当前视野中心放一个点位：设备符号 + 代号文字（无符号时用圆形），customData 记录关联的产品。 */
  const addPoint = useCallback(
    async (product: PointProduct) => {
      if (!api || readOnly) return
      const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
      const style = styleOf(product.categorySlug, product.categoryName)
      const existing = api.getSceneElements() as unknown as SceneElement[]
      const used = existing.filter((e) => !e.isDeleted && e.customData?.categorySlug === product.categorySlug).length
      const code = `${style.code}${used + 1}`

      const s = api.getAppState()
      const zoom = s.zoom.value
      const size = 34
      const offset = (insertOffset.current++ % 6) * 14
      const x = s.width / 2 / zoom - s.scrollX - size / 2 + offset
      const y = s.height / 2 / zoom - s.scrollY - size / 2 + offset
      const customData = { productId: product.id, pointCode: code, categorySlug: product.categorySlug }

      if (product.symbol) {
        try {
          const dataURL = await symbolDataURL(product.symbol, style.color)
          const fileId = `sym-${product.symbol}-${style.color.slice(1)}`
          if (!api.getFiles()[fileId]) {
            api.addFiles([{ id: fileId as never, dataURL: dataURL as never, mimeType: 'image/svg+xml', created: Date.now() }])
          }
          const groupId = `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
          const box = 40
          // 只有符号图片带 productId，代号文字不参与统计，避免重复计数。
          const created = convertToExcalidrawElements([
            { type: 'image', fileId, x, y, width: box, height: box, customData },
            { type: 'text', x: x - 10, y: y + box + 2, width: box + 20, text: code, fontSize: 12, fontFamily: 2, textAlign: 'center', strokeColor: style.color, customData: { pointCode: code } },
          ] as never).map((el) => ({ ...el, groupIds: [groupId] }))
          api.updateScene({
            elements: [...api.getSceneElementsIncludingDeleted(), ...created] as never,
            appState: { selectedElementIds: { [created[0].id]: true } } as never,
          })
          return
        } catch {
          // 符号加载失败时退回圆形点位
        }
      }

      const [shape, ...rest] = convertToExcalidrawElements([
        {
          type: 'ellipse',
          x,
          y,
          width: size,
          height: size,
          strokeColor: style.color,
          backgroundColor: `${style.color}22`,
          fillStyle: 'solid',
          strokeWidth: 2,
          roughness: 0,
          customData,
          label: { text: code, fontSize: 12, strokeColor: style.color, fontFamily: 2 },
        },
      ] as never)
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), shape, ...rest],
        appState: { selectedElementIds: { [shape.id]: true } } as never,
      })
    },
    [api, readOnly],
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

  const selectedProduct = selectedProductId ? productById.get(selectedProductId) : null

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

        <aside className="hidden w-80 shrink-0 flex-col border-l bg-background lg:flex">
          {readOnly ? null : (
            <div className="space-y-3 border-b p-4">
              <div>
                <h2 className="text-sm font-semibold">放置设备</h2>
                <p className="text-xs text-muted-foreground">点击产品，点位会出现在画布中央，再拖到对应位置</p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索产品" aria-label="搜索产品" className="pl-9" />
              </div>
            </div>
          )}
          {readOnly ? null : (
            <ScrollArea className="min-h-0 flex-1">
              <ul className="p-2">
                {filtered.map((p) => {
                  const style = styleOf(p.categorySlug, p.categoryName)
                  const count = counts.get(p.id) ?? 0
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={!api}
                        onClick={() => void addPoint(p)}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent disabled:opacity-50',
                          selectedProductId === p.id && 'bg-accent',
                        )}
                      >
                        <SymbolMark symbol={p.symbol} code={style.code} color={style.color} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{p.brand} · {p.sku}</span>
                        </span>
                        {count ? <Badge variant="secondary" className="tabular-nums">{count}</Badge> : <Plus className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />}
                      </button>
                    </li>
                  )
                })}
                {filtered.length === 0 ? <li className="px-2 py-6 text-center text-sm text-muted-foreground">没有匹配的产品</li> : null}
              </ul>
            </ScrollArea>
          )}

          <div className={cn('space-y-3 border-t p-4', readOnly && 'flex-1 border-t-0')}>
            {selectedProduct ? (
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MousePointerClick className="size-3.5" />选中的点位</div>
                <div className="mt-1 font-medium">{selectedProduct.name}</div>
                <div className="text-xs text-muted-foreground">{selectedProduct.brand} · {selectedProduct.sku} · {yuan(selectedProduct.price)}/{selectedProduct.unit}</div>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">设备统计</h2>
              <span className="text-xs text-muted-foreground tabular-nums">共 {points.length} 个点位</span>
            </div>
            {summary.length === 0 ? (
              <p className="text-xs text-muted-foreground">还没有放置设备</p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-auto text-sm">
                {summary.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{r.product?.name ?? '已下架产品'}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">× {r.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {summary.length ? (
              <div className="flex items-baseline justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">设备合计（售价）</span>
                <span className="font-semibold tabular-nums">{yuan(total)}</span>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
