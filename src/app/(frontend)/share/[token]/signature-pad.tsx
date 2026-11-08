'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 手写签名板：鼠标、触控笔与手指都可以签；每次落笔结束后把签名导出为 PNG data URL（空白时为 null） */
export function SignaturePad({
  onChange,
  invalid,
  className,
}: {
  onChange: (dataUrl: string | null) => void
  invalid?: boolean
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // 画布按显示尺寸 × 像素比（最多 2 倍）设置分辨率，导出的图片清晰又不会太大
  const setup = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.max(1, Math.round(rect.width * dpr))
    c.height = Math.max(1, Math.round(rect.height * dpr))
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = '#111827'
  }, [])
  useEffect(() => {
    setup()
  }, [setup])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx && last.current) {
      ctx.beginPath()
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = '#111827'
      ctx.fill()
    }
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    setEmpty(false)
    onChange(e.currentTarget.toDataURL('image/png'))
  }
  const clear = () => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (c && ctx) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.restore()
    }
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className={cn('relative', className)}>
      <canvas
        ref={canvasRef}
        aria-label="手写签名区域"
        className={cn(
          'h-32 w-full touch-none rounded-xl border bg-white',
          invalid ? 'border-destructive' : 'border-input',
        )}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {empty ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/70">
          请在此处手写签名
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="absolute top-1.5 right-1.5"
        onClick={clear}
        disabled={empty}
      >
        <Eraser />
        重签
      </Button>
    </div>
  )
}
