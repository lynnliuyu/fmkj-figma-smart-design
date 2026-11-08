'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { CopyPlus, Loader2, MessageSquareQuote } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { feedbackDecisionLabel, type DeferredItem } from '@/lib/client-feedback'
import { yuan } from '@/lib/quotes'

import { createQuoteFromFeedbackAction, setFeedbackStatusAction } from './feedback-actions'

export type FeedbackItem = {
  id: string
  quoteId: string | null
  quoteTitle: string
  decision: 'confirm' | 'revise'
  customerName: string
  customerPhone: string
  message: string
  deferred: DeferredItem[]
  quoteTotal: number
  intentTotal: number
  signature: string | null
  status: 'new' | 'handled'
  createdLabel: string
}

/** 报价页顶部：业主在分享页提交的意向反馈（确认意向 / 希望调整、暂缓的设备、留言与手写签名） */
export function ClientFeedbackList({
  projectId,
  items,
  readOnly,
  canCreateQuote,
}: {
  projectId: string
  items: FeedbackItem[]
  readOnly: boolean
  canCreateQuote: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const pending = items.filter((f) => f.status === 'new').length

  const toggle = (f: FeedbackItem) => {
    setBusy(f.id)
    startTransition(async () => {
      const res = await setFeedbackStatusAction(f.id, f.status === 'new' ? 'handled' : 'new')
      setBusy(null)
      if (!res.ok) return void toast.error(res.error)
      router.refresh()
    })
  }
  const adjust = (f: FeedbackItem) => {
    setBusy(`q:${f.id}`)
    startTransition(async () => {
      const res = await createQuoteFromFeedbackAction(f.id)
      setBusy(null)
      if (!res.ok) return void toast.error(res.error)
      toast.success('已按业主意向生成调整版报价（原报价未改动）')
      router.push(`/projects/${projectId}/quotes/${res.quoteId}`)
    })
  }

  return (
    <section
      aria-labelledby="feedback-title"
      className="overflow-hidden rounded-[var(--radius-container)] bg-card shadow-xs ring-1 ring-border"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <h3 id="feedback-title" className="flex items-center gap-2 text-base font-semibold">
          <MessageSquareQuote className="size-4 text-muted-foreground" />
          业主意向反馈
          {pending ? <Badge variant="warning">{pending} 条待处理</Badge> : null}
        </h3>
        <span className="text-xs text-muted-foreground">来自业主分享页 · 不会改动原报价</span>
      </div>
      <ul className="divide-y">
        {items.map((f) => (
          <li key={f.id} className={f.status === 'handled' ? 'px-5 py-4 opacity-75' : 'px-5 py-4'}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.customerName}</span>
                  <Badge variant={f.decision === 'confirm' ? 'success' : 'warning'}>
                    {feedbackDecisionLabel(f.decision)}
                  </Badge>
                  {f.status === 'handled' ? <Badge variant="outline">已处理</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    f.createdLabel,
                    f.quoteTitle ? `方案「${f.quoteTitle}」` : null,
                    f.customerPhone || null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums">{yuan(f.intentTotal)}</p>
                {f.deferred.length ? (
                  <p className="text-xs text-muted-foreground">
                    原价 <span className="line-through">{yuan(f.quoteTotal)}</span> · 暂缓{' '}
                    {f.deferred.length} 项
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">按原方案</p>
                )}
              </div>
            </div>
            {f.message ? (
              <p className="mt-2.5 rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-line">
                {f.message}
              </p>
            ) : null}
            {f.deferred.length ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                暂缓：{f.deferred.map((d) => `${d.name} ×${d.quantity}`).join('、')}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              {f.signature ? (
                <Image
                  src={f.signature}
                  alt={`${f.customerName} 的手写签名`}
                  width={192}
                  height={64}
                  unoptimized
                  className="h-14 w-auto rounded-md border bg-white"
                />
              ) : (
                <span className="text-xs text-muted-foreground">未签名</span>
              )}
              {readOnly ? null : (
                <div className="flex flex-wrap gap-2">
                  {canCreateQuote && f.quoteId && f.deferred.length ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `q:${f.id}`}
                      onClick={() => adjust(f)}
                    >
                      {busy === `q:${f.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CopyPlus className="size-4" />
                      )}
                      按意向生成调整版
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={f.status === 'new' ? 'default' : 'ghost'}
                    disabled={busy === f.id}
                    onClick={() => toggle(f)}
                  >
                    {busy === f.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    {f.status === 'new' ? '标记已处理' : '设为待处理'}
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
