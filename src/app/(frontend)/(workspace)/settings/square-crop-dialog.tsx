'use client'

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const STAGE = 360
/** 裁剪框边长与它在画布中的偏移 */
const BOX = 240
const OFF = (STAGE - BOX) / 2
const OUT_MAX = 1024

/** 正方形裁剪：拖动调整位置、滑块缩放，确认后输出 PNG 文件 */
export function SquareCropDialog({
  file,
  onCancel,
  onDone,
}: {
  file: File | null
  onCancel: () => void
  onDone: (file: File) => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    setImg(null)
    setZoom(1)
    setPos({ x: 0, y: 0 })
    const el = new Image()
    el.onload = () => {
      const s0 = BOX / Math.min(el.naturalWidth || 1, el.naturalHeight || 1)
      setPos({
        x: (STAGE - (el.naturalWidth || 1) * s0) / 2,
        y: (STAGE - (el.naturalHeight || 1) * s0) / 2,
      })
      setImg(el)
    }
    el.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const w = img?.naturalWidth || 1
  const h = img?.naturalHeight || 1
  // zoom = 1 时图片短边刚好铺满裁剪框
  const scale = (BOX / Math.min(w, h)) * zoom
  const dw = w * scale
  const dh = h * scale
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(OFF, Math.max(OFF + BOX - dw, p.x)),
    y: Math.min(OFF, Math.max(OFF + BOX - dh, p.y)),
  })
  const view = img ? clamp(pos) : pos

  const setZoomCentered = (z: number) => {
    const nz = Math.min(4, Math.max(1, z))
    const ns = (BOX / Math.min(w, h)) * nz
    const cx = (STAGE / 2 - view.x) / scale
    const cy = (STAGE / 2 - view.y) / scale
    setZoom(nz)
    setPos({ x: STAGE / 2 - cx * ns, y: STAGE / 2 - cy * ns })
  }

  const confirm = () => {
    if (!img || !file) return
    const side = Math.min(OUT_MAX, Math.round(BOX / scale))
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, side, side)
    ctx.drawImage(
      img,
      (OFF - view.x) / scale,
      (OFF - view.y) / scale,
      BOX / scale,
      BOX / scale,
      0,
      0,
      side,
      side,
    )
    canvas.toBlob((blob) => {
      if (!blob) return
      const name = file.name.replace(/\.[^.]+$/, '') + '-square.png'
      onDone(new File([blob], name, { type: 'image/png' }))
    }, 'image/png')
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => (o ? null : onCancel())}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>裁剪为正方形</DialogTitle>
          <DialogDescription>
            拖动图片、用滑块缩放，让二维码完整落在亮色方框内；方框外的暗色部分会被裁掉。
          </DialogDescription>
        </DialogHeader>
        <div
          className="relative mx-auto size-[360px] cursor-grab touch-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drag.current = { x: e.clientX, y: e.clientY, px: view.x, py: view.y }
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }))
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => setZoomCentered(zoom - e.deltaY * 0.002)}
        >
          {src && img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt="待裁剪图片"
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ left: view.x, top: view.y, width: dw, height: dh }}
            />
          ) : null}
          {/* 方框外压暗（大阴影），方框白色粗边 + 三分线 + 中心十字 */}
          <div className="pointer-events-none absolute top-[60px] left-[60px] size-[240px] rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] ring-2 ring-white">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/35" />
              ))}
            </div>
            <div className="absolute top-1/2 left-1/2 h-5 w-px -translate-1/2 bg-white" />
            <div className="absolute top-1/2 left-1/2 h-px w-5 -translate-1/2 bg-white" />
            {[
              'top-[-3px] left-[-3px] border-t-4 border-l-4',
              'top-[-3px] right-[-3px] border-t-4 border-r-4',
              'bottom-[-3px] left-[-3px] border-b-4 border-l-4',
              'bottom-[-3px] right-[-3px] border-b-4 border-r-4',
            ].map((c) => (
              <div key={c} className={`absolute size-5 border-white ${c}`} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="缩小"
            onClick={() => setZoomCentered(zoom - 0.25)}
          >
            <Minus className="size-4" />
          </Button>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            aria-label="缩放"
            onChange={(e) => setZoomCentered(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="放大"
            onClick={() => setZoomCentered(zoom + 0.25)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="button" onClick={confirm} disabled={!img}>
            确认裁剪
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
