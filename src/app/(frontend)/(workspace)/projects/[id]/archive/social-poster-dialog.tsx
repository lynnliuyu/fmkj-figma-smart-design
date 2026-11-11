'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileArchive,
  ImageDown,
  Loader2,
  Share2,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { ScaledFrame } from '@/components/scaled-frame'
import { SocialPoster, type SocialPosterTheme } from '@/components/social-poster'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Switch } from '@astryxdesign/core/Switch'
import { downloadBlob } from '@/lib/export-pdf'
import {
  buildSocialPosterPages,
  socialPosterCaption,
  socialPosterFilename,
  SOCIAL_POSTER_HEIGHT,
  SOCIAL_POSTER_WIDTH,
  type SocialPosterData,
} from '@/lib/social-poster'
import { zipFiles } from '@/lib/zip'

export type { SocialPosterData } from '@/lib/social-poster'

const pngBytes = (url: string) =>
  Uint8Array.from(atob(url.split(',')[1] ?? ''), (char) => char.charCodeAt(0))

async function waitForPosterImages(node: HTMLElement) {
  await document.fonts.ready
  await Promise.all(
    [...node.querySelectorAll('img')].map(async (image) => {
      if (!image.complete)
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error('图片加载失败，请检查场景图或二维码'))
        })
      if (!image.naturalWidth) throw new Error('图片加载失败，请检查场景图或二维码')
      await image.decode().catch(() => {})
    }),
  )
}

export function SocialPosterDialog({ data }: { data: SocialPosterData }) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<SocialPosterTheme>('qixu')
  const [hideExactPrice, setHideExactPrice] = useState(true)
  const [showQr, setShowQr] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [current, setCurrent] = useState(0)
  const [generated, setGenerated] = useState<Record<string, string>>({})
  const [copiedText, setCopiedText] = useState(false)
  const exportNodes = useRef<(HTMLDivElement | null)[]>([])
  const pages = useMemo(() => buildSocialPosterPages(data), [data])
  const active = Math.min(current, pages.length - 1)
  const socialCaption = socialPosterCaption(data, hideExactPrice)

  useEffect(() => {
    setGenerated({})
    setCurrent(0)
  }, [data, theme, hideExactPrice, showQr])

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(socialCaption)
      setCopiedText(true)
      toast.success('已复制图组配套文案')
      setTimeout(() => setCopiedText(false), 2000)
    } catch {
      toast.error('复制失败，请手动选中文案复制')
    }
  }

  const renderPoster = async (index: number) => {
    const node = exportNodes.current[index]
    if (!node) throw new Error('海报画布尚未准备好，请稍后重试')
    await waitForPosterImages(node)
    const { toPng } = await import('html-to-image')
    return toPng(node, {
      pixelRatio: 3,
      width: SOCIAL_POSTER_WIDTH,
      height: SOCIAL_POSTER_HEIGHT,
      cacheBust: false,
    })
  }

  const downloadCurrent = async () => {
    if (busy) return
    setBusy(true)
    try {
      const url = await renderPoster(active)
      setGenerated((prev) => ({ ...prev, [pages[active].key]: url }))
      downloadBlob(
        new Blob([pngBytes(url)], { type: 'image/png' }),
        `${socialPosterFilename(data.title)}-${String(active + 1).padStart(2, '0')}-${pages[active].label}.png`,
      )
      toast.success('当前图片已生成，手机端也可长按下方图片保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成图片失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const downloadGroup = async () => {
    if (busy) return
    setBusy(true)
    setProgress(0)
    const rendered: Record<string, string> = {}
    try {
      const entries = []
      for (let i = 0; i < pages.length; i++) {
        const url = await renderPoster(i)
        rendered[pages[i].key] = url
        entries.push({
          name: `${String(i + 1).padStart(2, '0')}-${socialPosterFilename(pages[i].label)}.png`,
          data: pngBytes(url),
        })
        setProgress(i + 1)
      }
      entries.push({ name: '配套文案.txt', data: new TextEncoder().encode(socialCaption) })
      setGenerated(rendered)
      downloadBlob(
        zipFiles(entries),
        `${socialPosterFilename(data.title)}-小红书图组-${pages.length}张.zip`,
      )
      toast.success(`已打包 ${pages.length} 张独立图片与配套文案`)
    } catch (error) {
      setGenerated((prev) => ({ ...prev, ...rendered }))
      toast.error(error instanceof Error ? error.message : '图组生成失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const posterProps = { data, theme, hideExactPrice, showQr, totalPages: pages.length }
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<Share2 />}
        label="生成小红书 / 朋友圈图组"
        onClick={() => setOpen(true)}
      />
      <Dialog
        isOpen={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value)
        }}
        width="min(96vw,1024px)"
        maxHeight="92vh"
      >
        <Layout
          header={
            <DialogHeader
              title={
                <span className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  小红书 / 朋友圈多图分享
                </span>
              }
              subtitle="每张都是独立的 3:4 图片，按封面、楼层点位、配置、预算与方案确认分开讲。只使用公开案例简称，隐藏业主姓名、电话和门牌。"
              onOpenChange={(value) => {
                if (!busy) setOpen(value)
              }}
            />
          }
          content={
            <LayoutContent padding={4}>
              <div className="grid min-w-0 gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
                <div className="min-w-0 space-y-3">
                  <div className="overflow-hidden rounded-xl border bg-muted/20 p-2">
                    <ScaledFrame
                      width={SOCIAL_POSTER_WIDTH}
                      height={SOCIAL_POSTER_HEIGHT}
                      label={`第${active + 1}张：${pages[active].label}`}
                    >
                      <SocialPoster {...posterProps} page={pages[active]} pageNumber={active + 1} />
                    </ScaledFrame>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <IconButton
                      variant="secondary"

                      aria-label="上一张"
                      isDisabled={busy || active === 0}
                      onClick={() => setCurrent(active - 1)}
                      label="上一张"
                      icon={<ChevronLeft />}
                      size="sm"
                    />
                    <span className="text-xs tabular-nums" aria-live="polite">
                      {active + 1} / {pages.length} · {pages[active].label}
                    </span>
                    <IconButton
                      variant="secondary"

                      aria-label="下一张"
                      isDisabled={busy || active === pages.length - 1}
                      onClick={() => setCurrent(active + 1)}
                      label="下一张"
                      icon={<ChevronRight />}
                      size="sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" aria-label="图组内容">
                    {pages.map((page, i) => (
                      <Button
                        key={page.key}
                        type="button"
                        variant={i === active ? 'secondary' : 'ghost'}
                        size="sm"
                        isDisabled={busy}
                        aria-pressed={i === active}
                        onClick={() => setCurrent(i)}
                        className="h-auto min-w-0 justify-start whitespace-normal py-1.5 text-left leading-snug"
                        label={''}
                      />
                    ))}
                  </div>
                </div>
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral" label={`${pages.length} 张独立图片`} />
                    <Badge variant="neutral" label={'1080 × 1440 / 张'} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">图组风格</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={theme === 'qixu' ? 'primary' : 'secondary'}
                        isDisabled={busy}
                        onClick={() => setTheme('qixu')}
                        label="栖序雅致"
                      />
                      <Button
                        size="sm"
                        variant={theme === 'noir' ? 'primary' : 'secondary'}
                        isDisabled={busy}
                        onClick={() => setTheme('noir')}
                        label="墨金臻选"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-3 text-xs">
                    <label className="flex items-center justify-between gap-3">
                      <span>隐藏具体金额，使用预算区间</span>
                      <Switch
                        label={'开关'}
                        isLabelHidden
                        value={hideExactPrice}
                        isDisabled={busy}
                        onChange={setHideExactPrice}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span>
                        {data.miniAppCodeUrl ? '收尾页附带小程序码' : '收尾页附带服务方联系二维码'}
                      </span>
                      <Switch
                        label={'开关'}
                        isLabelHidden
                        value={showQr}
                        isDisabled={busy}
                        onChange={setShowQr}
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">配套分享文案</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyCaption()}
                        icon={<Check />}
                        endContent={<Copy />}
                        label={'栖序雅致'}
                      />
                    </div>
                    <pre className="whitespace-pre-wrap break-words rounded-xl border bg-muted/20 p-3 font-sans text-xs leading-relaxed">
                      {socialCaption}
                    </pre>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      isDisabled={busy}
                      onClick={() => void downloadCurrent()}
                      icon={<Loader2 />}
                      label="保存当前图片"
                    />
                    <Button
                      variant="secondary"
                      isDisabled={busy}
                      onClick={() => void downloadGroup()}
                      icon={<Loader2 />}
                      label="下载整组 ZIP"
                    />
                  </div>
                  {busy ? (
                    <p className="text-xs text-muted-foreground" role="status">
                      正在生成高清图组{progress > 0 ? `：${progress}/${pages.length}` : '…'}
                    </p>
                  ) : null}
                  {generated[pages[active].key] ? (
                    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">
                        当前高清图已生成，手机端可长按保存。
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={generated[pages[active].key]}
                        alt={`高清分享图：${pages[active].label}`}
                        className="mx-auto max-h-56 w-auto rounded-lg"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none fixed top-0 left-[-20000px] w-[360px]"
              >
                {pages.map((page, i) => (
                  <div
                    key={page.key}
                    ref={(node) => {
                      exportNodes.current[i] = node
                    }}
                    className="h-[480px] w-[360px]"
                  >
                    <SocialPoster {...posterProps} page={page} pageNumber={i + 1} />
                  </div>
                ))}
              </div>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  )
}
