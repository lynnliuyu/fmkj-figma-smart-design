'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, FileDown, FolderDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { downloadBlob, exportPagesAsPdfBundle } from '@/lib/export-pdf'

type ExportState = {
  fileName: string
  pageCount: number
  sizeKb: number
  blob: Blob
  downloadUrl: string | null
  previewUrl: string | null
  previewImages: string[]
}

export function ShareExportButton({ projectName }: { projectName: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportState | null>(null)
  const [copied, setCopied] = useState(false)

  const handleExport = async () => {
    if (busy) return
    setBusy(true)
    try {
      const explicit = [...document.querySelectorAll<HTMLElement>('[data-export-page]')]
      const pages = explicit.length
        ? explicit
        : [
            ...document.querySelectorAll<HTMLElement>(
              '#proposal-slide-preview [style*="1440px"], #quote-preview .bg-doc-paper',
            ),
          ]
      if (!pages.length) {
        toast.error('未找到可导出的方案或报价页面')
        return
      }
      const baseName = `${projectName}-方案与报价`
      const bundle = await exportPagesAsPdfBundle(pages, baseName)
      const fullFileName = `${baseName}.pdf`
      let downloadUrl: string | null = null
      let previewUrl: string | null = null
      try {
        const res = await fetch(`/print/export-file?name=${encodeURIComponent(fullFileName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: bundle.blob,
        })
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean
          url?: string
          previewUrl?: string
        } | null
        if (res.ok && data?.ok && data.url) {
          downloadUrl = new URL(data.url, window.location.origin).toString()
          previewUrl = data.previewUrl
            ? new URL(data.previewUrl, window.location.origin).toString()
            : downloadUrl
        }
      } catch {
        // ignore upload fallback error
      }
      setCopied(false)
      setResult({
        fileName: fullFileName,
        pageCount: bundle.pageCount,
        sizeKb: Math.max(1, Math.round(bundle.blob.size / 1024)),
        blob: bundle.blob,
        downloadUrl,
        previewUrl,
        previewImages: bundle.previewDataUrls,
      })
      toast.success(`已生成 PDF（共 ${bundle.pageCount} 页）`)
    } catch {
      toast.error('导出失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const saveWithPicker = async () => {
    if (!result) return
    const picker = (
      window as unknown as {
        showSaveFilePicker?: (opts: unknown) => Promise<{
          createWritable: () => Promise<{
            write: (b: Blob) => Promise<void>
            close: () => Promise<void>
          }>
        }>
      }
    ).showSaveFilePicker
    if (typeof picker === 'function') {
      try {
        const handle = await picker({
          suggestedName: result.fileName,
          types: [{ description: 'PDF 文档', accept: { 'application/pdf': ['.pdf'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(result.blob)
        await writable.close()
        toast.success('已保存到您选择的文件夹')
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    if (result.downloadUrl) {
      window.location.assign(result.downloadUrl)
    } else {
      downloadBlob(result.blob, result.fileName)
    }
  }

  const copyLink = async () => {
    if (!result?.downloadUrl) return
    try {
      await navigator.clipboard.writeText(result.downloadUrl)
      setCopied(true)
      toast.success('已复制 PDF 下载链接，可在手机浏览器或微信中打开保存')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="default"
        className="h-8 gap-1.5 text-xs"
        disabled={busy}
        onClick={() => void handleExport()}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
        {busy ? '生成 PDF 中…' : '下载方案与报价 PDF'}
      </Button>

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-h-[88vh] max-w-lg gap-4 overflow-y-auto p-5 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">方案与报价 PDF 已生成</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {result?.fileName}（共 {result?.pageCount} 页 · 约 {result?.sizeKb} KB）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-xl border bg-muted/35 p-3.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">电脑浏览器</strong>：已自动保存到浏览器的「下载
              (Downloads)」文件夹，也可点击下方「选择位置另存为」。
            </p>
            <p>
              <strong className="text-foreground">手机 / 微信端</strong>：可点击「复制 PDF
              下载链接」到手机系统浏览器打开保存，或直接
              <strong className="text-foreground">长按下方高清图片</strong>保存到手机相册。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void saveWithPicker()}>
              <FolderDown className="size-4" />
              下载 / 选择位置另存为
            </Button>
            {result?.downloadUrl ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyLink()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? '已复制下载链接' : '复制 PDF 下载链接'}
              </Button>
            ) : null}
            {result?.previewUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={result.previewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  新窗口打开 PDF
                </a>
              </Button>
            ) : null}
          </div>

          {result?.previewImages.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                页面高清图预览（手机端可长按图片直接保存到相册）：
              </p>
              <div className="max-h-64 space-y-2.5 overflow-y-auto rounded-xl border bg-muted/20 p-2.5">
                {result.previewImages.map((src, idx) => (
                  <div key={idx} className="overflow-hidden rounded-lg border bg-white shadow-2xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`第 ${idx + 1} 页预览`} className="block h-auto w-full" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
