'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Columns3, ExternalLink, Eye, Loader2, X } from 'lucide-react'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import type { ProposalKind } from './framework'
import type { PickerTemplate } from './picker-data'

const KIND_TABS: { value: ProposalKind; label: string; hint: string }[] = [
  { value: 'owner', label: '业主方案', hint: '给业主看的横版提案，含场景、平面与预算' },
  { value: 'construction', label: '施工交底', hint: '给安装团队，点位代号与清单，不含价格' },
]
const MAX_COMPARE = 3
const pad = (n: number) => String(n).padStart(2, '0')

/** 主题色板：纸色、主色、强调色、浅色面板 */
export function Swatches({ colors, className }: { colors: string[]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 overflow-hidden rounded-sm ring-1 ring-foreground/10',
        className,
      )}
    >
      {colors.map((c, i) => (
        <span key={i} className="size-3" style={{ backgroundColor: c }} />
      ))}
    </span>
  )
}

/** 把 1440px 宽的打印页按容器宽度缩放显示（只读预览） */
function FramePreview({
  src,
  nativeWidth,
  title,
}: {
  src: string
  nativeWidth: number
  title: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => setLoaded(false), [src])
  const scale = size.w ? size.w / nativeWidth : 0
  return (
    <div
      ref={box}
      className="relative min-h-0 flex-1 overflow-hidden bg-neutral-200/70 dark:bg-neutral-900"
    >
      {scale ? (
        <iframe
          title={title}
          src={src}
          onLoad={() => setLoaded(true)}
          className="absolute top-0 left-0 border-0 bg-transparent"
          style={{
            width: nativeWidth,
            height: size.h / scale,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      ) : null}
      {loaded ? null : (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在生成样张…
        </div>
      )}
    </div>
  )
}

type Row = { label: string; render: (t: PickerTemplate) => React.ReactNode }
const COMPARE_ROWS: Row[] = [
  { label: '版式框架', render: (t) => t.frameworkLabel },
  {
    label: '章节',
    render: (t) =>
      t.sections.length
        ? t.sections.map((s) => s.label).join(' → ')
        : '房间配置、设备清单与逐点核对表',
  },
  { label: '页数', render: (t) => (t.pages ? `约 ${t.pages} 页` : '随项目变化') },
  { label: '封面', render: (t) => t.coverStyle },
  { label: '画面', render: (t) => t.mood },
  { label: '价格', render: (t) => (t.priceShown ? '含预算与明细' : '不含价格') },
  { label: '适合客户', render: (t) => t.audience },
  { label: '什么时候用', render: (t) => t.occasion },
  { label: '外观特点', render: (t) => t.highlights.join('、') || '—' },
]

/**
 * 方案模板选择器：缩略图（真实封面）、适合客户与使用时机、章节与页数、会员等级前置提示、
 * 完整样张预览、最多 3 套并排对比；业主方案与施工交底分开展示。
 */
export function TemplatePicker({
  templates,
  thumbs,
  value,
  previewHref,
  onSelect,
  trigger,
  selectLabel = '使用此模板',
  kinds = ['owner', 'construction'],
  pageNote = '按示例别墅项目计算',
  disabled = false,
}: {
  templates: PickerTemplate[]
  thumbs: Record<string, React.ReactNode>
  value: string | null
  /** 每个模板的完整样张地址（iframe 预览） */
  previewHref: Record<string, string>
  onSelect?: (value: string) => void | Promise<void>
  trigger: React.ReactNode
  selectLabel?: string
  kinds?: ProposalKind[]
  pageNote?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const current = templates.find((t) => t.value === value)
  const tabs = KIND_TABS.filter(
    (k) => kinds.includes(k.value) && templates.some((t) => t.kind === k.value),
  )
  const [kind, setKind] = useState<ProposalKind>(current?.kind ?? tabs[0]?.value ?? 'owner')
  const [framework, setFramework] = useState<string>('all')
  const [active, setActive] = useState<string | null>(value)
  const [view, setView] = useState<'grid' | 'preview' | 'compare'>('grid')
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const inKind = useMemo(() => templates.filter((t) => t.kind === kind), [templates, kind])
  const frameworks = useMemo(
    () => [...new Map(inKind.map((t) => [t.framework, t.frameworkLabel])).entries()],
    [inKind],
  )
  const shown = framework === 'all' ? inKind : inKind.filter((t) => t.framework === framework)
  const activeT =
    templates.find((t) => t.value === active && t.kind === kind) ?? shown[0] ?? inKind[0]

  function reset(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setKind(current?.kind ?? tabs[0]?.value ?? 'owner')
      setActive(value)
      setFramework('all')
      setView('grid')
      setCompareMode(false)
      setCompareIds([])
    }
  }

  async function choose(v: string) {
    const t = templates.find((x) => x.value === v)
    if (!t || !onSelect || busy) return
    setBusy(true)
    try {
      await onSelect(v)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const toggleCompare = (v: string) =>
    setCompareIds((ids) =>
      ids.includes(v) ? ids.filter((x) => x !== v) : ids.length >= MAX_COMPARE ? ids : [...ids, v],
    )

  const canChoose = (t: PickerTemplate) => Boolean(onSelect) && !disabled && t.value !== value
  const chooseLabel = (t: PickerTemplate) => (t.value === value ? '当前使用中' : selectLabel)
  const compared = compareIds
    .map((id) => templates.find((t) => t.value === id))
    .filter((t): t is PickerTemplate => Boolean(t))

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(880px,94vh)] w-[min(1220px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">选择方案模板</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              同一份点位与报价，换个模板就是另一种提案。缩略图是真实封面，页数{pageNote}。
            </DialogDescription>
          </div>
          {tabs.length > 1 ? (
            <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="方案用途">
              {tabs.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="tab"
                  aria-selected={kind === k.value}
                  title={k.hint}
                  onClick={() => {
                    setKind(k.value)
                    setFramework('all')
                    setView('grid')
                    setCompareIds([])
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    kind === k.value
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {k.label}
                  <span className="ml-1 text-muted-foreground tabular-nums">
                    {templates.filter((t) => t.kind === k.value).length}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {inKind.length > 1 && view !== 'preview' ? (
            <Button
              type="button"
              size="sm"
              variant={compareMode ? 'secondary' : 'secondary'}
              onClick={() => {
                setCompareMode((m) => !m)
                setView('grid')
                setCompareIds([])
              }}
              icon={<Columns3 />}
              label={compareMode ? '退出对比' : '对比模板'}
            />
          ) : null}
          <IconButton
            type="button"
            variant="ghost"

            onClick={() => setOpen(false)}
            aria-label="关闭"
            label="关闭"
            icon={<X />}
            size="sm"
          />
        </header>

        {view === 'preview' && activeT ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setView('grid')}
                icon={<ChevronLeft />}
                label="返回模板列表"
              />
              <span className="text-sm font-medium">{activeT.label}</span>
              <span className="hidden text-xs text-muted-foreground md:inline">
                {activeT.pages ? `约 ${activeT.pages} 页 · ` : ''}
                {pageNote}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  href={previewHref[activeT.value]}
                  icon={<ExternalLink />}
                  label="新窗口打开"
                />
                {onSelect ? (
                  <Button
                    type="button"
                    size="sm"
                    isDisabled={!canChoose(activeT) || busy}
                    onClick={() => void choose(activeT.value)}
                    icon={<Loader2 />}
                    label="应用模板"
                  />
                ) : null}
              </div>
            </div>
            <FramePreview
              src={previewHref[activeT.value]}
              nativeWidth={activeT.kind === 'construction' ? 1180 : 1500}
              title={`${activeT.label}完整样张`}
            />
          </div>
        ) : view === 'compare' && compared.length ? (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="mb-3 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setView('grid')}
                icon={<ChevronLeft />}
                label="返回挑选"
              />
              <span className="text-xs text-muted-foreground">
                并排对比 {compared.length} 套模板
              </span>
            </div>
            <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="w-28" />
                  {compared.map((t) => (
                    <th key={t.value} className="px-2 pb-3 text-left align-top font-normal">
                      <div className="overflow-hidden rounded-lg border bg-muted/40">
                        {thumbs[t.value]}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{t.label}</span>
                        <Swatches colors={t.swatches} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((r) => (
                  <tr key={r.label}>
                    <th
                      scope="row"
                      className="border-t py-2.5 pr-3 text-left align-top text-xs font-medium text-muted-foreground"
                    >
                      {r.label}
                    </th>
                    {compared.map((t) => (
                      <td
                        key={t.value}
                        className="border-t px-2 py-2.5 align-top text-xs leading-relaxed"
                      >
                        {r.render(t)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td />
                  {compared.map((t) => (
                    <td key={t.value} className="space-y-1.5 px-2 pt-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setActive(t.value)
                          setView('preview')
                        }}
                        icon={<Eye />}
                        label="预览样张"
                      />
                      {onSelect ? (
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          isDisabled={!canChoose(t) || busy}
                          onClick={() => void choose(t.value)}
                          label={'预览样张'}
                        />
                      ) : null}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col">
              {frameworks.length > 1 ? (
                <div
                  className="flex flex-wrap items-center gap-1.5 px-5 pt-4"
                  role="radiogroup"
                  aria-label="版式框架"
                >
                  {[['all', '全部'] as const, ...frameworks].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={framework === v}
                      onClick={() => setFramework(v)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        framework === v
                          ? 'border-foreground bg-foreground text-background'
                          : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                      )}
                    >
                      {label}
                      <span className="ml-1 opacity-60 tabular-nums">
                        {v === 'all'
                          ? inKind.length
                          : inKind.filter((t) => t.framework === v).length}
                      </span>
                    </button>
                  ))}
                  {compareMode ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      勾选 2–3 套模板后点「开始对比」
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((t) => {
                    const isActive = !compareMode && activeT?.value === t.value
                    const checked = compareIds.includes(t.value)
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => (compareMode ? toggleCompare(t.value) : setActive(t.value))}
                        onDoubleClick={() => !compareMode && canChoose(t) && void choose(t.value)}
                        aria-pressed={compareMode ? checked : isActive}
                        className={cn(
                          'group flex flex-col overflow-hidden rounded-[var(--radius-container)] border bg-card text-left transition-[border-color,box-shadow] outline-none hover:border-foreground/25 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring',
                          (isActive || checked) &&
                            'border-primary ring-1 ring-primary/40 hover:border-primary',
                        )}
                      >
                        <div className="relative border-b bg-muted/40">
                          {thumbs[t.value]}
                          {t.value === value ? (
                            <Badge className="absolute top-2 left-2 shadow-sm" label={'当前使用'} />
                          ) : null}
                          {compareMode ? (
                            <span
                              className={cn(
                                'absolute top-2 right-2 flex size-5 items-center justify-center rounded-md border-2 bg-background shadow-sm',
                                checked
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-foreground/30',
                              )}
                            >
                              {checked ? <Check className="size-3.5" /> : null}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{t.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t.frameworkLabel}
                            {t.sections.length ? ` · ${t.sections.length} 章` : ''}
                            {t.pages ? ` · 约 ${t.pages} 页` : ''}
                            {t.priceShown ? '' : ' · 不含价格'}
                          </p>
                          <p className="line-clamp-2 text-xs leading-relaxed">
                            <span className="text-muted-foreground">适合 </span>
                            {t.audience}
                          </p>
                          <p className="line-clamp-1 text-xs leading-relaxed">
                            <span className="text-muted-foreground">时机 </span>
                            {t.occasion}
                          </p>
                          <div className="mt-auto flex flex-wrap gap-1 pt-1">
                            {t.highlights.map((h) => (
                              <span
                                key={h}
                                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              >
                                {h}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              {compareMode ? (
                <div className="flex items-center justify-between gap-3 border-t bg-background px-5 py-3">
                  <span className="text-xs text-muted-foreground">
                    已选{' '}
                    <span className="font-medium text-foreground tabular-nums">
                      {compareIds.length}
                    </span>{' '}
                    / {MAX_COMPARE}
                    {compared.length ? `：${compared.map((t) => t.label).join('、')}` : ''}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    isDisabled={compareIds.length < 2}
                    onClick={() => setView('compare')}
                    icon={<Columns3 />}
                    label="开始对比"
                  />
                </div>
              ) : activeT ? (
                <div className="flex items-center gap-2 border-t px-4 py-3 lg:hidden">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {activeT.label}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setView('preview')}
                    icon={<Eye />}
                    label="预览"
                  />
                  {onSelect ? (
                    <Button
                      type="button"
                      size="sm"
                      isDisabled={!canChoose(activeT) || busy}
                      onClick={() => void choose(activeT.value)}
                      label={'预览'}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            {activeT && !compareMode ? (
              <aside
                className="hidden w-[350px] shrink-0 flex-col border-l bg-muted/20 lg:flex"
                aria-label={`${activeT.label}详情`}
              >
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                  <div className="overflow-hidden rounded-lg border bg-background shadow-xs">
                    {thumbs[activeT.value]}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold tracking-tight">{activeT.label}</h3>
                      <Swatches colors={activeT.swatches} />
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {activeT.description}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">适合什么客户</dt>
                      <dd className="mt-0.5 font-medium">{activeT.audience}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">什么时候用</dt>
                      <dd className="mt-0.5 font-medium">{activeT.occasion}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">版式</dt>
                      <dd className="mt-0.5">{activeT.frameworkLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">页数</dt>
                      <dd className="mt-0.5 tabular-nums">
                        {activeT.pages ? `约 ${activeT.pages} 页` : '随项目变化'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">封面</dt>
                      <dd className="mt-0.5">{activeT.coverStyle}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">价格</dt>
                      <dd className="mt-0.5">{activeT.priceShown ? '含预算与明细' : '不含价格'}</dd>
                    </div>
                  </dl>
                  {activeT.sections.length ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">章节顺序</p>
                      <ol className="divide-y rounded-lg border bg-background">
                        {activeT.sections.map((s, i) => (
                          <li
                            key={s.value}
                            className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-xs"
                          >
                            <span>
                              <span className="mr-2 text-muted-foreground tabular-nums">
                                {pad(i + 1)}
                              </span>
                              {s.label}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {s.pages}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2 border-t bg-background p-4">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setView('preview')}
                    icon={<Eye />}
                    label="预览样张"
                  />
                  {onSelect ? (
                    <Button
                      type="button"
                      className="flex-1"
                      isDisabled={!canChoose(activeT) || busy}
                      onClick={() => void choose(activeT.value)}
                      icon={<Loader2 />}
                      label={'预览样张'}
                    />
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
