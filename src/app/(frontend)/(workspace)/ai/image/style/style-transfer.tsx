'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, ImagePlus, Loader2, Palette, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { STYLE_TRANSFER_HANDOFF_KEY, type StyleTransferHandoff } from '@/lib/style-templates'
import { cn } from '@/lib/utils'

type Template = { id: string; name: string; description: string; file: string }
type Result = {
  url: string
  width: number
  height: number
  cost: number
  balance: number | null
  usedStyle: string
}

export function StyleTransfer({
  templates,
  configured,
  cost,
}: {
  templates: Template[]
  configured: boolean
  cost: number
}) {
  const [source, setSource] = useState<string | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [styleId, setStyleId] = useState(templates[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = (file: File | null) => {
    if (!file) return
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError('请上传 PNG / JPG / WebP 户型图')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('户型图不能超过 12MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setSource(String(reader.result || ''))
      setSourceName(file.name)
      setError(null)
      setResult(null)
    }
    reader.readAsDataURL(file)
  }

  /**
   * 从点位图编辑器「带图跳转」过来时，自动把那张户型图放进上传位。
   *
   * 只在**首次挂载**读一次并立刻清掉 —— 否则用户回到本页会莫名其妙
   * 又被塞回上次那张图，覆盖掉他当前的选择。
   *
   * ⚠️ 交接过来的值**有两种形态**，都要认：
   *  - `data:image/...` —— 画布内存里的 base64（刚上传、还没保存过）
   *  - `/api/media/file/xxx.png` / `/demo-plans/xxx.png` —— 已保存过的底图，
   *    点位图保存时会把内嵌图传进媒体库、**把 dataURL 字段替换成这个地址**
   *    （见 point-map-editor 的 inlineFileIds 分支）。
   *    只认 base64 会把「已保存的项目」全部交接失败 —— 线上实测踩到过。
   *
   * 官方接口只吃 base64，所以 URL 形态要先取回再转。
   */
  useEffect(() => {
    let cancelled = false

    const load = async (raw: string) => {
      let parsed: Partial<StyleTransferHandoff>
      try {
        parsed = JSON.parse(raw) as Partial<StyleTransferHandoff>
      } catch {
        return
      }
      const image = typeof parsed?.image === 'string' ? parsed.image : ''
      if (!image) return
      const name = typeof parsed.name === 'string' ? parsed.name : '户型图'

      // 形态一：已经是 base64，直接用
      if (image.startsWith('data:image/')) {
        if (cancelled) return
        setSource(image)
        setSourceName(name)
        setError(null)
        setResult(null)
        return
      }

      // 形态二：站内地址（媒体库 / 示例图）→ 取回来转 base64
      if (!image.startsWith('/')) return
      try {
        const res = await fetch(image)
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        const dataURL = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('读取失败'))
          reader.readAsDataURL(blob)
        })
        if (cancelled || !dataURL.startsWith('data:image/')) return
        setSource(dataURL)
        setSourceName(name)
        setError(null)
        setResult(null)
      } catch {
        if (!cancelled) setError('没能读取点位置图里的户型底图，请手动上传')
      }
    }

    try {
      const raw = sessionStorage.getItem(STYLE_TRANSFER_HANDOFF_KEY)
      // 无论成败都先清掉，避免下次回本页又被塞一次
      if (raw) sessionStorage.removeItem(STYLE_TRANSFER_HANDOFF_KEY)
      if (raw) void load(raw)
    } catch {
      // 隐私模式下读不到：静默忽略，用户仍然可以手动上传
    }

    return () => {
      cancelled = true
    }
  }, [])

  const generate = async () => {
    if (!source || !styleId || busy) return
    setBusy(true)
    setElapsed(0)
    setError(null)
    setResult(null)
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000)
    try {
      const res = await fetch('/api/ai/images/style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceImage: source, styleId, note }),
      })
      const data = (await res.json().catch(() => null)) as
        | (Result & { ok?: boolean; error?: string })
        | null
      if (!res.ok || !data?.ok) throw new Error(data?.error || '生成失败')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请稍后重试')
    } finally {
      clearInterval(timer)
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs">
        <div>
          <label className="text-xs font-medium text-muted-foreground">源户型图</label>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1.5 flex min-h-[180px] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed bg-background p-3 text-center hover:bg-muted/40"
          >
            {source ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={source} alt="源户型图" className="max-h-[220px] w-full object-contain" />
            ) : (
              <>
                <ImagePlus className="size-8 text-muted-foreground" />
                <span className="text-sm font-medium">点击上传户型图</span>
                <span className="text-[11px] text-muted-foreground">
                  PNG / JPG / WebP，最多 12MB
                </span>
              </>
            )}
          </button>
          {sourceName ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{sourceName}</p>
          ) : null}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">风格模板</label>
          <div className="mt-2 grid max-h-[330px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStyleId(t.id)}
                className={cn(
                  'overflow-hidden rounded-xl border bg-background text-left transition hover:border-primary/50',
                  styleId === t.id && 'border-primary ring-2 ring-primary/20',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.file} alt={t.name} className="h-24 w-full object-cover" />
                <span className="block px-2 py-1.5">
                  <span className="block text-[11px] font-medium">{t.name}</span>
                  <span className="mt-0.5 line-clamp-1 block text-[10px] text-muted-foreground">
                    {t.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">补充要求（可选）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="例如：儿童房加书桌，主卧保留飘窗，不要改厨房位置"
            className="mt-1.5 w-full resize-y rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-3 focus:ring-ring/20"
          />
        </div>

        {!configured ? (
          <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            服务器未配置 AI_APIKEY_FAN_KEY，暂时不能生成。
          </p>
        ) : null}
        <Button
          type="button"
          onClick={() => void generate()}
          disabled={!configured || busy || !source || !styleId}
          className="h-11 w-full gap-2"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Palette className="size-4" />}
          {busy ? `风格化生成中… ${elapsed}s` : `生成风格化户型图 · ${cost} 积分`}
        </Button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          会保留原图墙体做 mask；通常 30–90 秒，成功后扣积分。
        </p>
      </div>

      <div className="flex min-h-[480px] flex-col rounded-2xl border bg-muted/25 p-4">
        {busy ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p>正在按模板风格重绘，已等待 {elapsed}s</p>
            <p className="text-xs">保留墙体 mask，生成后请检查布局</p>
          </div>
        ) : result ? (
          <div className="flex h-full flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.url}
              alt="风格化户型图"
              className="max-h-[560px] w-full rounded-xl border bg-white object-contain"
            />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {result.width}×{result.height}
              </span>
              <span>
                {result.balance != null ? `余额 ${result.balance} 积分` : `扣 ${result.cost} 积分`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={result.url} download>
                  <Download className="size-3.5" />
                  下载原图
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                再生成一张
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Upload className="size-8 text-muted-foreground/60" />
            <p>风格化结果会在这里显示</p>
            <p className="text-xs">上传户型图 → 选择模板 → 生成</p>
          </div>
        )}
        {error ? (
          <p
            className={cn(
              'mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive',
            )}
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
