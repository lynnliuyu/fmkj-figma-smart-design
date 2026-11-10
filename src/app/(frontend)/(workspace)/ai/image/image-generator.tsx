'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Sparkles } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { cn } from '@/lib/utils'

type Model = { id: string; name: string; description: string; sizes: string[]; cost: number }
type Result = {
  mediaId: string
  url: string
  width: number
  height: number
  model: string
  size: string
  cost: number
  balance: number | null
}

const EXAMPLES = [
  '现代简约全屋智能客厅，暖白墙面、浅木地板、无主灯设计、隐藏灯带，真实室内摄影，16:9',
  '新中式别墅客厅，青瓷绿点缀、原木家具、智能面板与灯带，柔和自然光，真实摄影',
  '深色科技感全屋智能中控墙，黑色岩板、品牌紫光效、隐藏式屏幕，高端住宅，电影感',
  '小红书风格智能卧室，奶油色床品、悬浮床头灯、智能窗帘，清晨自然光，干净明亮',
]

export function ImageGenerator({ models, configured }: { models: Model[]; configured: boolean }) {
  const [modelId, setModelId] = useState(models[0]?.id ?? '')
  const model = useMemo(() => models.find((m) => m.id === modelId) ?? models[0], [modelId, models])
  const [size, setSize] = useState(model?.sizes[0] ?? '1024*1024')
  const [prompt, setPrompt] = useState(EXAMPLES[0])
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setElapsed((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setElapsed(0)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/ai/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: modelId, size }),
      })
      const data = (await res.json().catch(() => null)) as
        | (Result & { ok?: boolean; error?: string })
        | null
      if (!res.ok || !data?.ok) throw new Error(data?.error || '生成失败')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs">
        <div>
          <label className="text-xs font-medium text-muted-foreground">画面描述</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            maxLength={2000}
            className="mt-1.5 w-full resize-y rounded-xl border bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:ring-3 focus:ring-ring/20"
            placeholder="描述空间、风格、材质、光线、镜头……"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{prompt.length}/2000</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">模型</label>
            <select
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value)
                const m = models.find((x) => x.id === e.target.value)
                setSize(m?.sizes[0] ?? size)
              }}
              className="mt-1.5 h-9 w-full rounded-lg border bg-background px-2 text-sm"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.cost} 积分
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">尺寸</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="mt-1.5 h-9 w-full rounded-lg border bg-background px-2 text-sm"
            >
              {(model?.sizes ?? ['1024*1024']).map((s) => (
                <option key={s} value={s}>
                  {s.replace('*', ' × ')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              示例 {i + 1}
            </button>
          ))}
        </div>
        {!configured ? (
          <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            服务器未配置 AI_BAILIAN_TOKEN_PLAN_KEY，暂时不能生成。
          </p>
        ) : null}
        <Button
          type="button"
          onClick={() => void generate()}
          isDisabled={!configured || busy || !prompt.trim()}
          className="h-11 w-full gap-2"
          icon={<Loader2 />}
          label="{busy ? `生成中… $ s` : `生成图片 · $ 积分`}"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          生图通常需要 30–90 秒。生成成功后才扣积分，失败不扣。
        </p>
      </div>

      <div className="flex min-h-[420px] flex-col rounded-2xl border bg-muted/25 p-4">
        {busy ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p>正在生成，已等待 {elapsed}s</p>
            <p className="text-xs">qwen-image 通常需要 1–3 分钟，请勿关闭页面</p>
          </div>
        ) : result ? (
          <div className="flex h-full flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.url}
              alt="AI 生成图片"
              className="max-h-[420px] w-full rounded-xl border bg-white object-contain"
            />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {result.width}×{result.height} · {result.size.replace('*', ' × ')}
              </span>
              <span>
                {result.balance != null ? `余额 ${result.balance} 积分` : `扣 ${result.cost} 积分`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                href={result.url}
                icon={<Download />}
                label="下载原图"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResult(null)}
                label="再生成一张"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-8 text-muted-foreground/60" />
            <p>生成结果会在这里显示</p>
            <p className="text-xs">建议描述空间、风格、材质、光线和镜头</p>
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
