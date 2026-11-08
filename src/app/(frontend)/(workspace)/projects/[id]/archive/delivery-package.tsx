'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileArchive, FileStack, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { COLLECT_MESSAGE, type CollectResult } from '@/lib/doc-collect'
import { buildPdfFromJpegs, downloadBlob, renderPagesToJpegs, type PageJpeg } from '@/lib/export-pdf'
import { cn } from '@/lib/utils'
import { zipFiles } from '@/lib/zip'

import { setDeliverables } from './actions'

export type DeliveryDoc = {
  key: 'plans' | 'checklist' | 'quote' | 'proposal' | 'contract' | 'construction' | 'wiring' | 'procurement' | 'survey' | 'handover' | 'after-sales'
  title: string
  note: string
  /** 打印页地址；null = 还不能生成（例如没有点位、没有合同） */
  url: string | null
  defaultOn: boolean
}

type Option = { value: string; label: string }

const DOC_TIMEOUT = 180_000

/** 用隐藏框架打开打印页，等它把 PDF 页发回来 */
function collectDoc(url: string, key: string): Promise<PageJpeg[]> {
  return new Promise((resolve, reject) => {
    const holder = document.createElement('div')
    holder.setAttribute('aria-hidden', 'true')
    holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:1200px;overflow:hidden;pointer-events:none'
    const frame = document.createElement('iframe')
    frame.style.cssText = 'width:1600px;height:1200px;border:0'
    frame.src = `${url}${url.includes('?') ? '&' : '?'}auto=collect&collect=${encodeURIComponent(key)}`
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      holder.remove()
    }
    const onMessage = (e: MessageEvent<CollectResult>) => {
      if (e.origin !== window.location.origin || e.data?.type !== COLLECT_MESSAGE || e.data.key !== key) return
      cleanup()
      if (e.data.ok) resolve(e.data.pages)
      else reject(new Error(e.data.error))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('生成超时，请单独打开预览导出'))
    }, DOC_TIMEOUT)
    window.addEventListener('message', onMessage)
    holder.appendChild(frame)
    document.body.appendChild(holder)
  })
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

export function DeliveryPackage({
  projectId,
  projectName,
  editable,
  docs,
  quotes,
  finalQuote,
  proposalPicker,
  betaDoc,
  cover,
}: {
  projectId: string
  projectName: string
  /** 能否修改定稿 / 模板（归档或只读协作时为 false） */
  editable: boolean
  docs: DeliveryDoc[]
  quotes: Option[]
  finalQuote: { id: string | null; sourceLabel: string | null; locked: boolean }
  /** 方案行里的模板选择器（带缩略图，见 template-picker-field.tsx） */
  proposalPicker?: React.ReactNode
  /** 还不进资料包的 Beta 单据（场景移交），单独打开打印页 */
  betaDoc?: React.ReactNode
  cover: { company: string; customer: string; address: string; date: string }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(docs.map((d) => [d.key, d.defaultOn && Boolean(d.url)])))
  const [saving, startSaving] = useTransition()
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [toc, setToc] = useState<{ title: string; pages: string }[] | null>(null)
  const coverRef = useRef<HTMLDivElement>(null)
  const busy = progress !== null
  const chosen = docs.filter((d) => d.url && selected[d.key])

  const save = (patch: { finalQuote?: string | null }, ok: string) =>
    startSaving(async () => {
      const res = await setDeliverables(projectId, patch)
      if (!res.ok) return void toast.error(res.error)
      toast.success(ok)
      router.refresh()
    })

  async function build(mode: 'zip' | 'pdf') {
    if (!chosen.length || busy) return
    const results: { doc: DeliveryDoc; pages: PageJpeg[] }[] = []
    try {
      for (const [i, doc] of chosen.entries()) {
        setProgress({ done: i, total: chosen.length + 1, label: `正在生成「${doc.title}」` })
        results.push({ doc, pages: await collectDoc(doc.url!, `${doc.key}-${Date.now()}`) })
      }
      // 封面与目录：合并 PDF 时写页码范围，ZIP 时写文件名
      setProgress({ done: chosen.length, total: chosen.length + 1, label: '正在生成封面与目录' })
      let page = 2
      setToc(
        results.map(({ doc, pages }, i) => {
          const range = pages.length > 1 ? `第 ${page}–${page + pages.length - 1} 页` : `第 ${page} 页`
          page += pages.length
          return { title: doc.title, pages: mode === 'pdf' ? range : `${String(i + 1).padStart(2, '0')}-${doc.title}.pdf · ${pages.length} 页` }
        }),
      )
      await nextFrame()
      const coverPages = coverRef.current ? (await renderPagesToJpegs([coverRef.current])).slice(0, 1) : []
      const base = `${projectName}-交付资料包`
      if (mode === 'pdf') {
        downloadBlob(buildPdfFromJpegs([...coverPages, ...results.flatMap((r) => r.pages)]), `${base}.pdf`)
      } else {
        const files = [
          ...(coverPages.length ? [{ name: '00-封面与目录.pdf', pages: coverPages }] : []),
          ...results.map((r, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${r.doc.title}.pdf`, pages: r.pages })),
        ]
        const entries = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await buildPdfFromJpegs(f.pages).arrayBuffer()) })))
        downloadBlob(zipFiles(entries), `${base}.zip`)
      }
      toast.success(mode === 'pdf' ? `已生成交付资料包 PDF（${results.length} 份资料）` : `已生成交付资料包 ZIP（${results.length} 份资料）`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败，请稍后重试')
    } finally {
      setProgress(null)
      setToc(null)
    }
  }

  return (
    <section aria-labelledby="package-title" className="rounded-xl bg-card shadow-xs ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id="package-title" className="text-base font-semibold">交付资料包</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy || !chosen.length} onClick={() => void build('zip')}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />}
            下载 ZIP
          </Button>
          <Button size="sm" disabled={busy || !chosen.length} onClick={() => void build('pdf')}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileStack className="size-4" />}
            合并为一份 PDF
          </Button>
        </div>
      </div>

      {progress ? (
        <div className="space-y-1.5 border-b px-5 py-3" role="status" aria-live="polite">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.label}…</span>
            <span className="tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </div>
          <Progress value={(progress.done / progress.total) * 100} />
          <p className="text-xs text-muted-foreground">方案页较多时需要几十秒，请保持页面打开。</p>
        </div>
      ) : null}

      <ul className="divide-y">
        {docs.map((d) => (
          <li key={d.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
            <Checkbox
              id={`pkg-${d.key}`}
              checked={Boolean(d.url && selected[d.key])}
              disabled={!d.url || busy}
              onCheckedChange={(v) => setSelected((s) => ({ ...s, [d.key]: v === true }))}
              aria-label={`资料包包含${d.title}`}
            />
            <label htmlFor={`pkg-${d.key}`} className={cn('flex min-w-44 flex-1 items-center gap-2', !d.url && 'text-muted-foreground')}>
              <span className="text-sm font-medium">{d.title}</span>
              {d.note ? <span className="text-xs text-muted-foreground tabular-nums">{d.note}</span> : null}
            </label>
            {d.key === 'quote' && quotes.length > 1 ? (
              <Select
                value={finalQuote.id ?? undefined}
                disabled={!editable || finalQuote.locked || saving || busy}
                onValueChange={(v) => save({ finalQuote: v }, '已设为定稿报价')}
              >
                <SelectTrigger size="sm" className="ml-7 max-w-56 sm:ml-0" aria-label="选择定稿报价">
                  <SelectValue placeholder="选择定稿报价" />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {d.key === 'proposal' && proposalPicker && !busy ? proposalPicker : null}
            {d.url ? (
              <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
                <Link href={d.url}>
                  预览
                  <ExternalLink className="size-3" />
                </Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {/* 交付资料区里的 Beta 单据：单独打开打印页，不打勾进资料包 */}
      {betaDoc ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed px-5 py-3">
          <span className="text-sm font-medium text-muted-foreground">其他交付单据</span>
          {betaDoc}
        </div>
      ) : null}

      {/* 封面与目录（导出时才渲染，放在屏幕外，只用于生成 PDF） */}
      {toc ? (
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[20000px]">
          <div ref={coverRef} className="flex h-[297mm] w-[210mm] flex-col bg-white px-[18mm] py-[20mm] text-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
              <span className="text-lg font-semibold">{cover.company}</span>
              <span className="text-xs tracking-[0.3em] text-neutral-500">DELIVERY PACKAGE</span>
            </div>
            <div className="mt-[30mm]">
              <p className="text-sm tracking-[0.2em] text-neutral-500">交付资料包</p>
              <h1 className="mt-4 text-4xl leading-tight font-bold">{projectName}</h1>
              <p className="mt-4 text-base text-neutral-600">{[cover.customer, cover.address].filter(Boolean).join(' · ') || '—'}</p>
              <p className="mt-1 text-sm text-neutral-500">出具日期 {cover.date}</p>
            </div>
            <div className="mt-[22mm]">
              <p className="mb-3 text-sm font-semibold">资料目录</p>
              <ol className="divide-y divide-neutral-200 border-y border-neutral-200">
                {toc.map((t, i) => (
                  <li key={t.title} className="flex items-baseline gap-4 py-3 text-sm">
                    <span className="w-6 text-neutral-400 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span className="flex-1 font-medium">{t.title}</span>
                    <span className="text-xs text-neutral-500">{t.pages}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-auto text-xs text-neutral-400">本资料包由 {cover.company} 出具。报价与方案以定稿版本为准，历史版本不作为交付依据。</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
