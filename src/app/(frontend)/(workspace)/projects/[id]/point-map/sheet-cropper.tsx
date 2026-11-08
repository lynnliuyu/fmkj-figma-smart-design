'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Crop, Loader2, Maximize, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clampRect, detectPlanBounds, fitIntoSheet, type Rect } from '@/lib/floor-plan-crop'
import { SHEET } from '@/lib/sheet-spec'
import { cn } from '@/lib/utils'

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: { h: Handle; className: string }[] = [
  { h: 'nw', className: '-top-1.5 -left-1.5 cursor-nwse-resize' },
  { h: 'n', className: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { h: 'ne', className: '-top-1.5 -right-1.5 cursor-nesw-resize' },
  { h: 'e', className: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize' },
  { h: 'se', className: '-right-1.5 -bottom-1.5 cursor-nwse-resize' },
  { h: 's', className: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { h: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
  { h: 'w', className: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize' },
]
const MIN = 60

/** 「03-一层开关布置图 1F.PM-10.png」→「一层开关布置图」 */
export function sheetNameFromFile(name: string) {
  const base = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d+[\s._-]*/, '')
    .replace(/\s+[A-Z0-9][A-Z0-9.\-]*$/i, '')
    .trim()
  return (base || '图纸').slice(0, 40)
}

/** 把裁切区域画进标准图纸（白底 3:2，居中留白）。 */
function renderSheet(
  bitmap: ImageBitmap,
  crop: Rect,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  const { target } = fitIntoSheet(crop, width, height, SHEET.padding)
  ctx.drawImage(
    bitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    target.x,
    target.y,
    target.width,
    target.height,
  )
}

export function SheetCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File
  onCancel: () => void
  onConfirm: (png: Blob, name: string) => Promise<void>
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [auto, setAuto] = useState<Rect | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [name, setName] = useState(() => sheetNameFromFile(file.name))
  const [busy, setBusy] = useState(false)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const stage = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ h: Handle; x: number; y: number; start: Rect } | null>(null)

  useEffect(() => {
    let alive = true
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    createImageBitmap(file)
      .then((bmp) => {
        if (!alive) return
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width
        canvas.height = bmp.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(bmp, 0, 0)
        const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height)
        const detected = detectPlanBounds({
          data,
          width: bmp.width,
          height: bmp.height,
          channels: 4,
        })
        setBitmap(bmp)
        setAuto(detected)
        setCrop(detected)
      })
      .catch(() => {
        toast.error('图片读取失败，请换一张试试')
        onCancel()
      })
    return () => {
      alive = false
      URL.revokeObjectURL(objectUrl)
    }
  }, [file, onCancel])

  // 图片按舞台大小等比显示
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = bitmap && box.w ? Math.min(box.w / bitmap.width, box.h / bitmap.height) : 0

  useEffect(() => {
    if (!bitmap || !crop || !preview.current) return
    const id = requestAnimationFrame(() => renderSheet(bitmap, crop, preview.current!, 480, 320))
    return () => cancelAnimationFrame(id)
  }, [bitmap, crop])

  const onPointerDown = (h: Handle) => (e: React.PointerEvent) => {
    if (!crop) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { h, x: e.clientX, y: e.clientY, start: crop }
  }
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || !bitmap || !scale) return
      const dx = (e.clientX - d.x) / scale
      const dy = (e.clientY - d.y) / scale
      let { x, y, width, height } = d.start
      const right = x + width
      const bottom = y + height
      if (d.h === 'move') {
        x = Math.min(Math.max(0, x + dx), bitmap.width - width)
        y = Math.min(Math.max(0, y + dy), bitmap.height - height)
      } else {
        if (d.h.includes('w')) x = Math.min(Math.max(0, x + dx), right - MIN)
        if (d.h.includes('n')) y = Math.min(Math.max(0, y + dy), bottom - MIN)
        if (d.h.includes('w')) width = right - x
        if (d.h.includes('n')) height = bottom - y
        if (d.h.includes('e')) width = Math.min(Math.max(MIN, width + dx), bitmap.width - x)
        if (d.h.includes('s')) height = Math.min(Math.max(MIN, height + dy), bitmap.height - y)
      }
      setCrop(clampRect({ x, y, width, height }, bitmap.width, bitmap.height))
    },
    [bitmap, scale],
  )
  const onPointerUp = () => {
    drag.current = null
  }

  const confirm = async () => {
    if (!bitmap || !crop || busy) return
    if (!name.trim()) return toast.error('请填写图纸名称')
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      renderSheet(bitmap, crop, canvas, SHEET.pixelWidth, SHEET.pixelHeight)
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!png) throw new Error('图纸生成失败，请重试')
      await onConfirm(png, name.trim())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图纸生成失败，请重试')
      setBusy(false)
    }
  }

  const ratio = crop ? (crop.width / crop.height).toFixed(2) : null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1 bg-muted/50 p-6">
        <div ref={stage} className="relative size-full">
          {bitmap && url && crop && scale ? (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 touch-none select-none"
              style={{ width: bitmap.width * scale, height: bitmap.height * scale }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="待裁切的户型图"
                draggable={false}
                className="size-full bg-background shadow-sm"
              />
              {/* 裁切框外变暗 */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/45"
                style={{ height: crop.y * scale }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-foreground/45"
                style={{ height: (bitmap.height - crop.y - crop.height) * scale }}
              />
              <div
                className="pointer-events-none absolute left-0 bg-foreground/45"
                style={{ top: crop.y * scale, height: crop.height * scale, width: crop.x * scale }}
              />
              <div
                className="pointer-events-none absolute right-0 bg-foreground/45"
                style={{
                  top: crop.y * scale,
                  height: crop.height * scale,
                  width: (bitmap.width - crop.x - crop.width) * scale,
                }}
              />
              <div
                role="presentation"
                className="absolute cursor-move border-2 border-primary"
                style={{
                  left: crop.x * scale,
                  top: crop.y * scale,
                  width: crop.width * scale,
                  height: crop.height * scale,
                }}
                onPointerDown={onPointerDown('move')}
              >
                {HANDLES.map(({ h, className }) => (
                  <span
                    key={h}
                    role="presentation"
                    onPointerDown={onPointerDown(h)}
                    className={cn(
                      'absolute size-3 rounded-sm border-2 border-primary bg-background',
                      className,
                    )}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在识别图框和标题栏…
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-84 shrink-0 flex-col border-l bg-background">
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Crop className="size-4" />
              裁切图纸
            </h2>
            <p className="text-xs text-muted-foreground">
              已自动去掉图框和标题栏，可拖动边框微调。
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sheet-name">图纸名称</Label>
            <Input
              id="sheet-name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：一层开关布置图"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!auto}
              onClick={() => auto && setCrop(auto)}
            >
              <ScanSearch className="size-4" />
              自动识别
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!bitmap}
              onClick={() =>
                bitmap && setCrop({ x: 0, y: 0, width: bitmap.width, height: bitmap.height })
              }
            >
              <Maximize className="size-4" />
              整张图
            </Button>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">标准图纸预览</div>
            <canvas ref={preview} className="aspect-[3/2] w-full rounded-md border bg-background" />
          </div>
          {bitmap && crop ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">原图</dt>
              <dd className="tabular-nums">
                {bitmap.width} × {bitmap.height}
              </dd>
              <dt className="text-muted-foreground">裁切</dt>
              <dd className="tabular-nums">
                {crop.width} × {crop.height}（{ratio}:1）
              </dd>
              <dt className="text-muted-foreground">输出</dt>
              <dd className="tabular-nums">
                {SHEET.pixelWidth} × {SHEET.pixelHeight} PNG
              </dd>
            </dl>
          ) : null}
        </div>
        <div className="mt-auto flex gap-2 border-t p-4">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button className="flex-1" disabled={!crop || busy} onClick={() => void confirm()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}确认并添加
          </Button>
        </div>
      </aside>
    </div>
  )
}
