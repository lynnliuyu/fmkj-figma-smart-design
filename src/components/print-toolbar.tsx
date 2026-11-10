'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  ExternalLink,
  FileDown,
  FolderDown,
  ImageDown,
  Loader2,
  Lock,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { COLLECT_MESSAGE, type CollectResult } from '@/lib/doc-collect'
import {
  downloadBlob,
  exportPagesAsPdfBundle,
  renderPagesToJpegs,
  renderPagesToPngDataUrls,
  waitForPageAssets,
} from '@/lib/export-pdf'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string; href: string }
type ExportResultState = {
  kind: 'pdf' | 'img'
  fileName: string
  pageCount: number
  sizeKb: number
  blob: Blob | null
  downloadUrl: string | null
  previewUrl: string | null
  previewImages: string[]
}

/**
 * 打印页顶部工具条：切换模板 / 选项、直接导出 PDF、导出图片。
 * - locked：当前内容需要更高会员等级（严格模式），可以预览但不能导出；
 * - note：右侧的小提示（例如「专业版模板」）；
 * - 网址带 auto=pdf 时自动导出；带 auto=collect 时把 PDF 页发回交付资料包页面（见 lib/doc-collect）。
 */
export function PrintToolbar({
  back,
  groups,
  exportName,
  wide = false,
  locked,
  note,
  picker,
}: {
  back: { href: string; label: string }
  groups: { label: string; value: string; options: Option[] }[]
  exportName: string
  /** 页面比 A4 宽（例如按 1440px 设计稿排版的方案）时，工具条跟着加宽 */
  wide?: boolean
  locked?: { message: string; href: string }
  note?: string
  /** 放在「版式与选项」前面的选择器（例如带缩略图的方案模板选择器） */
  picker?: React.ReactNode
}) {
  const [busy, setBusy] = useState<'pdf' | 'img' | null>(null)
  const [exportResult, setExportResult] = useState<ExportResultState | null>(null)
  const [copied, setCopied] = useState(false)
  const [inMiniProgram, setInMiniProgram] = useState(false)
  const searchParams = useSearchParams()
  const autoTriggered = useRef(false)
  const isMpView = searchParams.get('mp') === '1' || inMiniProgram

  useEffect(() => {
    const ua = navigator.userAgent || ''
    const wxEnv = (window as unknown as { __wxjs_environment?: string }).__wxjs_environment
    if (ua.includes('miniProgram') || wxEnv === 'miniprogram') {
      setInMiniProgram(true)
    }
  }, [])

  // 手机 / 小程序窄屏预览时：将固定宽度的 A4 纸张（210mm / 297mm）或 1440px 方案页等比缩放到屏幕宽度居中展示，
  // 避免在窄屏下被挤压变形或只能看局部；点击导出时 export-pdf.ts 会临时将 zoom 还原为 1 按原始高清尺寸渲染。
  useEffect(() => {
    const root = document.documentElement
    const applyMobileFit = () => {
      const vw = Math.min(
        window.innerWidth || 9999,
        document.documentElement.clientWidth || 9999,
        window.visualViewport?.width || 9999,
        window.screen?.width || 9999,
      )
      const fitFor = (w: number) =>
        vw > 0 && vw < w + 16 ? Math.max(0.22, (vw - 16) / w).toFixed(4) : '1'
      root.style.setProperty('--paper-zoom', fitFor(794))
      root.style.setProperty('--sheet-zoom', fitFor(1123))
      root.style.setProperty('--deck-zoom', fitFor(1440))
    }
    applyMobileFit()
    window.addEventListener('resize', applyMobileFit)
    return () => {
      window.removeEventListener('resize', applyMobileFit)
      root.style.removeProperty('--paper-zoom')
      root.style.removeProperty('--sheet-zoom')
      root.style.removeProperty('--deck-zoom')
    }
  }, [searchParams])

  const exportPdf = useCallback(async () => {
    setBusy('pdf')
    try {
      const pages = [...document.querySelectorAll<HTMLElement>('[data-export-page]')]
      if (!pages.length) return
      const bundle = await exportPagesAsPdfBundle(pages, exportName)
      const fullFileName = `${exportName}.pdf`
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
      setExportResult({
        kind: 'pdf',
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
      toast.error('PDF 导出失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }, [exportName])

  useEffect(() => {
    const auto = searchParams.get('auto')
    if (autoTriggered.current || (auto !== 'pdf' && auto !== 'collect')) return
    const t = setTimeout(() => {
      autoTriggered.current = true
      if (auto === 'pdf') {
        if (!locked) void exportPdf()
        return
      }
      // 交付资料包：渲染 PDF 页并发回打开这个页面的资料包页面
      const key = searchParams.get('collect') ?? ''
      const reply = (msg: CollectResult, transfer: Transferable[] = []) =>
        window.parent.postMessage(msg, window.location.origin, transfer)
      void (async () => {
        try {
          if (locked) throw new Error(locked.message)
          await waitForPageAssets()
          const pages = await renderPagesToJpegs([
            ...document.querySelectorAll<HTMLElement>('[data-export-page]'),
          ])
          if (!pages.length) throw new Error('页面没有可导出的内容')
          reply(
            { type: COLLECT_MESSAGE, key, ok: true, pages },
            pages.map((p) => p.bytes.buffer as ArrayBuffer),
          )
        } catch (e) {
          reply({
            type: COLLECT_MESSAGE,
            key,
            ok: false,
            error: e instanceof Error ? e.message : '生成失败',
          })
        }
      })()
    }, 500)
    return () => clearTimeout(t)
  }, [searchParams, exportPdf, locked])

  const exportImages = async () => {
    setBusy('img')
    try {
      const pages = [...document.querySelectorAll<HTMLElement>('[data-export-page]')]
      const urls = await renderPagesToPngDataUrls(pages)
      for (const [i, url] of urls.entries()) {
        const a = document.createElement('a')
        a.href = url
        a.download =
          urls.length > 1
            ? `${exportName}-${String(i + 1).padStart(2, '0')}.jpg`
            : `${exportName}.jpg`
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        a.remove()
        await new Promise((r) => setTimeout(r, 250))
      }
      setCopied(false)
      setExportResult({
        kind: 'img',
        fileName: `${exportName}.jpg`,
        pageCount: urls.length,
        sizeKb: 0,
        blob: null,
        downloadUrl: null,
        previewUrl: null,
        previewImages: urls,
      })
      toast.success(urls.length > 1 ? `已生成 ${urls.length} 页高清图片` : '已生成高清图片')
    } catch {
      toast.error('导出失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  const savePdfWithPicker = async () => {
    if (!exportResult?.blob) return
    if (isMpView && exportResult.downloadUrl) {
      await copyDownloadUrl()
      return
    }
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
          suggestedName: exportResult.fileName,
          types: [{ description: 'PDF 文档', accept: { 'application/pdf': ['.pdf'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(exportResult.blob)
        await writable.close()
        toast.success('已保存到您选择的文件夹')
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    if (exportResult.downloadUrl) {
      window.location.assign(exportResult.downloadUrl)
    } else {
      downloadBlob(exportResult.blob, exportResult.fileName)
    }
  }

  const copyDownloadUrl = async () => {
    if (!exportResult?.downloadUrl) return
    try {
      await navigator.clipboard.writeText(exportResult.downloadUrl)
      setCopied(true)
      toast.success('已复制 PDF 下载链接，可粘贴到微信或手机浏览器打开保存')
    } catch {
      toast.error('复制失败，请手动长按链接复制')
    }
  }

  // 提取当前选中项摘要（例如「栖序雅致 · 整装」），避免顶栏铺满几十个按钮
  const summaryParts = groups
    .filter((g) => g.label !== '项目')
    .map((g) => g.options.find((o) => o.value === g.value)?.label)
    .filter(Boolean)
    .slice(0, 2)

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xs print:hidden">
      <div
        className={cn(
          'mx-auto flex h-11 items-center justify-between gap-1.5 overflow-x-auto px-2.5 [scrollbar-width:none] sm:gap-2 sm:px-4',
          wide ? 'max-w-[1440px]' : 'max-w-[297mm]',
        )}
      >
        {isMpView ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 shrink-0 text-muted-foreground"
            href={back.href}
            as={Link}
            icon={<ChevronLeft />}
            label="操作"
          />
        )}

        <div
          className={cn(
            'flex min-w-0 items-center gap-1.5 sm:gap-2',
            isMpView && 'w-full justify-between',
          )}
        >
          {note && !locked ? (
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline-block">
              {note}
            </span>
          ) : null}
          {locked ? (
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Lock className="size-3.5" />
              <span className="hidden sm:inline">{locked.message}</span>
              <Link
                href={locked.href}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                升级
              </Link>
            </span>
          ) : null}

          {picker}

          {groups.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  icon={<SlidersHorizontal />}
                  label="版式与选项 {summaryParts.length > 0 ? ( · ) : null}"
                />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3.5 p-4">
                {groups.map((g) => (
                  <div key={g.label} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{g.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.options.map((o) => {
                        const active = o.value === g.value
                        return (
                          <Button
                            key={o.value}
                            size="sm"
                            variant={active ? 'primary' : 'secondary'}
                            className="h-7 rounded-md px-2.5 text-xs"
                            href={o.href}
                            as={Link}
                            label="操作"
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}

          {isMpView ? (
            <Button
              size="sm"
              className="ml-auto h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              isDisabled={busy !== null || Boolean(locked)}
              onClick={() => void exportPdf()}
              icon={<Loader2 />}
              endContent={<FileDown />}
              label="操作"
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="h-8"
                  isDisabled={busy !== null || Boolean(locked)}
                  icon={<Loader2 />}
                  endContent={<ChevronDown />}
                  label="操作"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => void exportPdf()}>
                  <FileDown className="size-4" />
                  导出 PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportImages()}>
                  <ImageDown className="size-4" />
                  导出图片
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Dialog open={exportResult !== null} onOpenChange={(open) => !open && setExportResult(null)}>
        <DialogContent className="max-h-[88vh] max-w-lg gap-4 overflow-y-auto p-5 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {exportResult?.kind === 'img' ? '高清图片已生成' : 'PDF 文档已生成'}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {exportResult?.fileName}（共 {exportResult?.pageCount} 页
              {exportResult?.sizeKb ? ` · 约 ${exportResult.sizeKb} KB` : ''}）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 rounded-xl border bg-muted/35 p-3.5 text-xs leading-relaxed">
            <p className="font-medium text-foreground">文件导出到哪里了？</p>
            <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
              {!isMpView ? (
                <li>
                  <strong className="text-foreground">电脑浏览器</strong>：已自动下载到系统默认的
                  <strong className="text-foreground">「下载 (Downloads)」文件夹</strong>
                  （可在浏览器右上角下载图标中查看，或点击下方「选择位置另存为」指定目录）。
                </li>
              ) : null}
              <li>
                <strong className="text-foreground">微信小程序 / 手机端</strong>
                ：受微信内置浏览器限制无法直接静默写入系统文件夹。您可以点击下方
                <strong className="text-foreground">「复制 PDF 下载链接」</strong>
                发到微信聊天/手机浏览器打开保存，或直接
                <strong className="text-foreground">长按下方预览图</strong>
                保存到手机相册、转发给客户。
              </li>
            </ul>
          </div>

          {exportResult?.kind === 'pdf' ? (
            <div className="flex flex-wrap gap-2">
              {!isMpView ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void savePdfWithPicker()}
                  icon={<FolderDown />}
                  label="下载 / 选择位置另存为"
                />
              ) : null}
              {exportResult.downloadUrl ? (
                <Button
                  type="button"
                  variant={isMpView ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => void copyDownloadUrl()}
                  icon={<Check />}
                  endContent={<Copy />}
                  label="操作"
                />
              ) : null}
              {!isMpView && exportResult.previewUrl ? (
                <Button
                  variant="secondary"
                  size="sm"
                  href={exportResult.previewUrl}
                  icon={<ExternalLink />}
                  label="新窗口打开 PDF"
                />
              ) : null}
            </div>
          ) : null}

          {exportResult?.previewImages.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                页面高清预览（手机 / 小程序内可直接长按下方图片保存到相册或转发给微信好友）：
              </p>
              <div
                className={cn(
                  'space-y-2.5 overflow-y-auto rounded-xl border bg-muted/20 p-2.5',
                  isMpView ? 'max-h-[48vh]' : 'max-h-64',
                )}
              >
                {exportResult.previewImages.map((src, idx) => (
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
    </div>
  )
}
