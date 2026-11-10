'use client'

/* eslint-disable @next/next/no-img-element -- 1440×960 方案画布同源静态图片直接渲染以保持与打印导出完全一致 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'

import { PointMarker } from '@/components/point-marker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { brandLatin, DocCheckbox, DocRoot } from '@/documents/parts'
import { DEFAULT_PAYMENTS, paymentAmounts } from '@/lib/contracts'
import { categoryOfType, DEVICE_CATEGORIES, deviceTypeOf } from '@/lib/device-types'
import type { CompanyInfo } from '@/lib/cached-data'
import type { LandingShowcase } from '@/lib/landing-showcase'
import { markerSrc } from '@/lib/point-marker-data'
import { yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'
import {
  DECK_THEMES,
  deckVars,
  type DeckTheme,
  type DeckThemeId,
} from '@/plugins/proposal/deck/themes'

import { money } from './section'

const SLIDE_W = 1440
const SLIDE_H = 960
const CARD_W = 604
const CARD_H = 428

const THEME_IDS: DeckThemeId[] = ['qixu', 'noir', 'grove', 'jade', 'azure', 'dawn', 'mono']

type ChapterId = 'cover' | 'plan' | 'system' | 'zone' | 'service'

const FRAMEWORKS: {
  value: 'full' | 'story' | 'budget'
  label: string
  description: string
  chapters: ChapterId[]
}[] = [
  {
    value: 'full',
    label: '完整提案',
    description: '封面 → 住宅平面 → 网络与中控拓扑 → 空间场景 → 服务交付',
    chapters: ['cover', 'plan', 'system', 'zone', 'service'],
  },
  {
    value: 'story',
    label: '场景故事',
    description: '封面 → 空间场景 → 住宅平面 → 网络与中控拓扑 → 服务交付',
    chapters: ['cover', 'zone', 'plan', 'system', 'service'],
  },
  {
    value: 'budget',
    label: '精简汇报',
    description: '封面 → 网络与中控拓扑 → 服务交付，快速讲清核心架构与预算',
    chapters: ['cover', 'system', 'service'],
  },
]

type TopoBox = { title: string; sub: string; badge?: string }
type TopoApRoom = { room: string; codes: string; sub: string; count: number }

const byCode = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

/** 主平台对应的联动协议（与方案模型 deck/model.ts 保持一致） */
const PROTOCOL: Record<string, string> = {
  米家: 'Zigbee / 蓝牙 Mesh',
  'Aqara Home': 'Zigbee 3.0',
  'Apple Home': 'Thread / Matter',
  华为鸿蒙智家: 'PLC / 星闪',
  KNX: 'KNX 总线',
  Control4: 'Zigbee Pro / IP',
  '网络/弱电': 'PoE / 以太网',
}
const SWITCH_TYPES = ['switch-1', 'switch-2', 'switch-3', 'switch-4']
const AP_TYPES = ['ap-node', 'ceiling-ap']

/** 示例项目的点位事实：所有方案页的文字都只从这里推导，不写死设备 */
function useDemoFacts(data: LandingShowcase) {
  return useMemo(() => {
    const points = data.sheets.flatMap((sh) =>
      sh.points.map((pt) => ({
        ...pt,
        floor: sh.floor,
        displayRoom: pt.room ? `${sh.floor} · ${pt.room}` : `${sh.floor} · 公共区域`,
      })),
    )
    const types = new Set(points.map((p) => p.type))
    const count = (list: string[]) => points.filter((p) => list.includes(p.type)).length
    const has = (...list: string[]) => list.some((t) => types.has(t))
    const bedrooms = new Set(points.filter((p) => p.room?.includes('卧')).map((p) => p.displayRoom))
      .size
    const protocol = PROTOCOL[data.project.platform] ?? '无线协议'
    return { points, count, has, bedrooms, protocol }
  }, [data.sheets, data.project.platform])
}

/** 「客厅、餐厅等 3 处」 */
const joinRooms = (rooms: string[], max = 2) => {
  const list = [...new Set(rooms)]
  return list.length > max ? `${list.slice(0, max).join('、')}等${list.length}处` : list.join('、')
}

function codeRange(codes: string[]) {
  const c = [...new Set(codes.filter(Boolean))].sort(byCode)
  if (c.length <= 2) return c.join(' / ')
  const parts = c.map((x) => /^(\D*)(\d+)$/.exec(x))
  const contiguous = parts.every(
    (m, i) =>
      m && m[1] === parts[0]![1] && (i === 0 || Number(m[2]) === Number(parts[i - 1]![2]) + 1),
  )
  if (contiguous) return `${c[0]}～${c[c.length - 1]}`
  return c.length <= 3 ? c.join(' / ') : `${c.slice(0, 3).join(' / ')} 等${c.length}个`
}

/**
 * 首页「方案演示」模块：与下方「报价单」模块保持一致的交互体验——
 * 左侧吸顶切换「方案结构」与「视觉主题」，右侧将整套横版方案页面纵向排开，直接向下滚动浏览全部章节。
 */
export function ProposalShowcase({
  data,
  company,
}: {
  data: LandingShowcase
  company: CompanyInfo
}) {
  const [themeId, setThemeId] = useState<DeckThemeId>('qixu')
  const [frameworkId, setFrameworkId] = useState<'full' | 'story' | 'budget'>('full')
  const [zoomOpen, setZoomOpen] = useState(false)
  /** 首页预览只显示一页（其余用缩略图条切换）；放大弹窗仍显示全部页 */
  const [page, setPage] = useState(0)
  const theme = DECK_THEMES[themeId] ?? DECK_THEMES.qixu
  const activeFramework = FRAMEWORKS.find((f) => f.value === frameworkId) ?? FRAMEWORKS[0]!
  const activeChapters = useMemo(
    () =>
      data.sheets.length
        ? activeFramework.chapters
        : activeFramework.chapters.filter((c) => c !== 'plan' && c !== 'zone'),
    [activeFramework.chapters, data.sheets.length],
  )

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.55)
  const modalViewportRef = useRef<HTMLDivElement | null>(null)
  const [modalScale, setModalScale] = useState(0.85)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / SLIDE_W)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!zoomOpen) return
    const timer = setTimeout(() => {
      const el = modalViewportRef.current
      if (!el) return
      const update = () => {
        const w = el.clientWidth
        if (w > 0) setModalScale(w / SLIDE_W)
      }
      update()
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }, 20)
    return () => clearTimeout(timer)
  }, [zoomOpen])

  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start xl:col-span-4">
        <h2 id="proposal-title" className="text-headline font-medium">
          方案演示
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          一套点位，出三种结构的方案；四种视觉主题，对应不同业主的偏好。
        </p>

        {/* 方案结构：改成「分段选择器」——三种结构并排、当前项实心，一眼看出有几个选择 */}
        <div className="mt-7">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-medium text-foreground">方案结构</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {activeChapters.length} 页
            </span>
          </div>
          <Tabs
            value={frameworkId}
            onValueChange={(v) => setFrameworkId(v as 'full' | 'story' | 'budget')}
          >
            <TabsList
              aria-label="方案结构"
              className="grid h-auto w-full grid-cols-3 gap-0.5 rounded-[var(--radius-element)] bg-muted p-0.5 group-data-horizontal/tabs:h-auto"
            >
              {FRAMEWORKS.map((f) => (
                <TabsTrigger
                  key={f.value}
                  value={f.value}
                  aria-controls="proposal-slide-preview"
                  className="h-8 justify-center rounded-[calc(var(--radius-element)-2px)] px-2 text-xs font-normal text-muted-foreground data-[state=active]:bg-background data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                >
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* 视觉主题：色点 + 名字，两列。当前项用左侧竖线 + 实心标记，比下划线更清楚 */}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-medium text-foreground">视觉主题</span>
            <span className="text-xs text-muted-foreground">{theme.label}</span>
          </div>
          <div role="radiogroup" aria-label="方案视觉主题" className="grid grid-cols-2 gap-1.5">
            {THEME_IDS.map((id) => {
              const t = DECK_THEMES[id]
              const active = id === themeId
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setThemeId(id as DeckThemeId)}
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--radius-element)] border px-2.5 py-2 text-left text-xs transition-colors',
                    active
                      ? 'border-foreground/25 bg-background font-medium text-foreground shadow-xs'
                      : 'border-transparent text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full ring-1 ring-foreground/15 dark:ring-foreground/40"
                    style={{ backgroundColor: t.style.colors.accent }}
                  />
                  <span className="truncate">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="relative min-w-0 lg:col-span-8 xl:col-span-8">
        {/* 主视图：只显示当前一页，一屏看完整页（原来把 5 页竖排堆了 2.5 屏，每页只露一小段） */}
        <div className="relative overflow-hidden rounded-[var(--radius-container)] border bg-muted/40 p-2 sm:p-4">
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            title="放大查看"
            aria-label="放大查看方案"
            className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-[var(--radius-element)] bg-background/90 text-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur transition-colors hover:bg-background"
          >
            <Maximize2 className="size-4" />
          </button>

          <div
            id="proposal-slide-preview"
            ref={viewportRef}
            role="region"
            aria-label={`方案演示样张（${activeFramework.label} · ${theme.label}）第 ${page + 1} 页，共 ${activeChapters.length} 页`}
            className="relative aspect-3/2 w-full overflow-hidden rounded-[var(--radius-element)] bg-doc-paper shadow-sm ring-1 ring-foreground/10"
          >
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              title="点击放大查看"
              className="absolute inset-0 z-[1] cursor-zoom-in"
              aria-label="点击放大查看整套方案"
            />
            <DocRoot style={theme.style} className="size-full">
              {[activeChapters[Math.min(page, activeChapters.length - 1)]!].map((chapterId, i) => (
                <div
                  key={`${chapterId}-${page}`}
                  data-export-page="slide"
                  style={{
                    ...deckVars(theme),
                    width: SLIDE_W,
                    height: SLIDE_H,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                  className="bg-doc-paper text-doc-ink select-none"
                >
                  <ShowcaseSlide
                    data={data}
                    company={company}
                    theme={theme}
                    chapterId={chapterId}
                    pageNo={String(page + 1).padStart(2, '0')}
                    pageTotal={String(activeChapters.length).padStart(2, '0')}
                  />
                </div>
              ))}
            </DocRoot>
          </div>
        </div>

        {/* 缩略图条：直接点某一页跳过去，比滚动找更快 */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((n) => Math.max(0, n - 1))}
            disabled={page === 0}
            aria-label="上一页"
            className="shrink-0"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {activeChapters.map((chapterId, index) => {
              const active = index === Math.min(page, activeChapters.length - 1)
              return (
                <button
                  key={chapterId}
                  type="button"
                  onClick={() => setPage(index)}
                  aria-label={`第 ${index + 1} 页`}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'group relative shrink-0 overflow-hidden rounded-[var(--radius-inner)] ring-1 transition-all',
                    active
                      ? 'ring-2 ring-foreground/60'
                      : 'opacity-60 ring-foreground/10 hover:opacity-100',
                  )}
                  style={{ width: 84, height: 56 }}
                >
                  <div
                    style={{
                      ...deckVars(theme),
                      width: SLIDE_W,
                      height: SLIDE_H,
                      transform: `scale(${84 / SLIDE_W})`,
                      transformOrigin: 'top left',
                      pointerEvents: 'none',
                    }}
                    className="bg-doc-paper text-doc-ink"
                  >
                    <ShowcaseSlide
                      data={data}
                      company={company}
                      theme={theme}
                      chapterId={chapterId}
                      pageNo={String(index + 1).padStart(2, '0')}
                      pageTotal={String(activeChapters.length).padStart(2, '0')}
                    />
                  </div>
                </button>
              )
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((n) => Math.min(activeChapters.length - 1, n + 1))}
            disabled={page >= activeChapters.length - 1}
            aria-label="下一页"
            className="shrink-0"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          第 {Math.min(page, activeChapters.length - 1) + 1} / {activeChapters.length} 页 ·
          点击画面放大
        </p>
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="flex h-[92vh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,1360px)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-5 py-3 pr-14">
            <div>
              <DialogTitle className="text-sm font-medium">
                方案演示 · {data.project.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                高清放大浏览整套横版智能家居方案，支持切换方案结构与视觉主题
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                value={frameworkId}
                onValueChange={(v) => setFrameworkId(v as 'full' | 'story' | 'budget')}
              >
                <TabsList className="h-8 p-0.5">
                  {FRAMEWORKS.map((f) => (
                    <TabsTrigger key={f.value} value={f.value} className="h-7 px-2.5 text-xs">
                      {f.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Tabs value={themeId} onValueChange={(v) => setThemeId(v as DeckThemeId)}>
                <TabsList className="h-8 p-0.5">
                  {THEME_IDS.map((id) => {
                    const t = DECK_THEMES[id]
                    return (
                      <TabsTrigger key={id} value={id} className="h-7 gap-1.5 px-2.5 text-xs">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: t.style.colors.accent }}
                        />
                        {t.label}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </Tabs>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/60 p-4 sm:p-8">
            <div ref={modalViewportRef} className="mx-auto max-w-[1240px]">
              <DocRoot style={theme.style} className="space-y-6 overflow-hidden">
                {activeChapters.map((chapterId, index) => {
                  const pageNo = String(index + 1).padStart(2, '0')
                  const pageTotal = String(activeChapters.length).padStart(2, '0')
                  return (
                    <div
                      key={chapterId}
                      className="relative aspect-3/2 w-full overflow-hidden rounded-lg shadow-md ring-1 ring-foreground/10"
                    >
                      <div
                        style={{
                          ...deckVars(theme),
                          width: SLIDE_W,
                          height: SLIDE_H,
                          transform: `scale(${modalScale})`,
                          transformOrigin: 'top left',
                        }}
                        className="bg-doc-paper text-doc-ink select-none"
                      >
                        <ShowcaseSlide
                          data={data}
                          company={company}
                          theme={theme}
                          chapterId={chapterId}
                          pageNo={pageNo}
                          pageTotal={pageTotal}
                        />
                      </div>
                    </div>
                  )
                })}
              </DocRoot>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ShowcaseSlide({
  data,
  company,
  theme,
  chapterId,
  pageNo,
  pageTotal,
}: {
  data: LandingShowcase
  company: CompanyInfo
  theme: DeckTheme
  chapterId: ChapterId
  pageNo: string
  pageTotal: string
}) {
  const facts = useDemoFacts(data)
  const { points: allPoints, protocol } = facts

  const topology = useMemo(() => {
    const acPts = allPoints.filter((p) => p.type === 'ac-router')
    const apPts = allPoints.filter((p) => AP_TYPES.includes(p.type))
    const acLine = data.quote?.lines.find((l) => l.type === 'ac-router')
    const ac: TopoBox = acPts.length
      ? {
          title: `${codeRange(acPts.map((p) => p.code))} AC 控制器 / PoE 核心交换`,
          badge: `AC 控制 · ${acPts.length}台`,
          sub: `统一管控 ${apPts.length} 台 AP 漫游与千兆 PoE 供电 · ${joinRooms(acPts.map((p) => p.displayRoom))}${acLine?.name ? ` · ${acLine.name}` : ''}`,
        }
      : {
          title: 'AC 控制器 / PoE 核心交换机',
          badge: '弱电箱核心',
          sub: apPts.length
            ? `统一管控全屋 ${apPts.length} 台 AP 漫游与 PoE 供电`
            : '宽带光猫 → AC 路由 / PoE 交换机',
        }

    const roomBuckets = new Map<string, typeof apPts>()
    for (const p of apPts) {
      const key = p.displayRoom
      roomBuckets.set(key, [...(roomBuckets.get(key) ?? []), p])
    }
    const apRooms: TopoApRoom[] = [...roomBuckets.entries()].map(([room, rAps]) => {
      const hasCeiling = rAps.some((p) => p.type === 'ceiling-ap')
      const hasPanel = rAps.some((p) => p.type === 'ap-node')
      const kind = hasCeiling && hasPanel ? '吸顶+面板AP' : hasCeiling ? '吸顶AP' : '面板AP'
      return {
        room,
        codes: codeRange(rAps.map((p) => p.code)),
        sub: `${kind}${rAps.length > 1 ? ` ×${rAps.length}` : ''} · PoE 漫游`,
        count: rAps.length,
      }
    })

    const gwPts = allPoints.filter((p) => p.type === 'gateway')
    const tp = allPoints.filter((p) => p.type === 'touch-panel').length
    const sp = allPoints.filter((p) => p.type === 'speaker').length
    const vrf = allPoints.filter((p) => p.type === 'vrf-controller').length
    const ctrlPts = allPoints.filter(
      (p) => p.type === 'touch-panel' || p.type === 'speaker' || p.type === 'vrf-controller',
    )
    const hubs: TopoBox[] = []
    if (gwPts.length) {
      hubs.push({
        title: `${codeRange(gwPts.map((p) => p.code))} 智能中枢网关`,
        badge: `网关 ×${gwPts.length}`,
        sub: `${joinRooms(gwPts.map((p) => p.displayRoom))} · LAN 接入 · ${protocol}`,
      })
    }
    if (ctrlPts.length) {
      hubs.push({
        title: `${codeRange(ctrlPts.map((p) => p.code))} 中控与语音交互`,
        badge: [tp ? `中控屏×${tp}` : '', sp ? `音箱×${sp}` : '', vrf ? `空调网关×${vrf}` : '']
          .filter(Boolean)
          .join(' / '),
        sub: `${joinRooms(ctrlPts.map((p) => p.displayRoom))} · 场景触控与语音控制`,
      })
    }
    if (!hubs.length)
      hubs.push({
        title: '手机 App / 语音中控',
        badge: '直连控制',
        sub: 'Wi-Fi 设备直连局域网 · 无独立网关',
      })

    const leaves: TopoBox[] = DEVICE_CATEGORIES.filter(
      (c) => c.slug !== 'gateway' && c.slug !== 'network',
    )
      .map((c) => {
        const pts = allPoints.filter((p) => categoryOfType(p.type)?.slug === c.slug)
        return { c, pts }
      })
      .filter((x) => x.pts.length > 0)
      .sort((a, b) => b.pts.length - a.pts.length)
      .slice(0, 4)
      .map(({ c, pts }) => ({
        title: codeRange(pts.map((p) => p.code)) || c.name,
        badge: `${pts.length}处${c.name}`,
        sub: `${c.name}系统联动 · 覆盖 ${new Set(pts.map((p) => p.displayRoom)).size} 个空间`,
      }))

    return {
      ac,
      apRooms,
      apLink: `PoE 供电 + AC 漫游 · ${apRooms.length} 房间（${apPts.length} 台 AP）`,
      hubs,
      leaves,
      link: `${protocol} · 中控联动总线`,
    }
  }, [allPoints, data.quote?.lines, protocol])

  const systemNotes = [
    `同为${protocol}不代表必然兼容；设备接入、场景指令与状态回传均以清单及联调结果确认。`,
    [
      facts.has(...SWITCH_TYPES) ? '开关仅开关灯，不默认支持调光调色' : '',
      facts.has('curtain-track') ? '电动窗帘须复核轨道匹配、行程与窗帘盒供电' : '',
      facts.has(...AP_TYPES) ? 'AP 漫游与无线覆盖须到场实测调优' : '',
    ]
      .filter(Boolean)
      .join('；'),
    '全部设备位置与供电条件以现场勘测复核为准。',
  ].filter(Boolean)

  const totalAmount = data.quote?.total ?? 0
  const place =
    [data.project.community, data.project.address].filter(Boolean).join('') || data.project.name
  const customer = data.project.customer || '业主'
  const layoutText = `${data.sheets.length}层 · ${data.roomCount}个空间`
  const tagline = [brandLatin(company.name), theme.tagline].filter(Boolean).join('  /  ')

  if (chapterId === 'cover') {
    return (
      <CoverSlide
        company={company}
        theme={theme}
        place={place}
        customer={customer}
        layoutText={layoutText}
        pointCount={data.pointCount}
        roomCount={data.roomCount}
        totalAmount={totalAmount}
        tagline={tagline}
        pageNo={pageNo}
        pageTotal={pageTotal}
      />
    )
  }

  return (
    <div className="relative flex size-full flex-col gap-[24px] overflow-hidden px-[56px] pt-[36px] pb-[72px]">
      {/* 页眉 */}
      <div className="flex h-[32px] w-full shrink-0 items-center justify-between">
        <SlideBrand company={company} theme={theme} />
        <p
          className={cn(
            'doc-latin text-[11px] text-doc-muted',
            theme.trackedTagline && 'tracking-[0.18em]',
          )}
        >
          {tagline}
        </p>
      </div>

      {chapterId === 'system' ? (
        <>
          <SlideChapter
            theme={theme}
            no={pageNo}
            title="连接有章法，能力有边界。"
            subtitle="网络、中控与设备架构 / 先确认兼容，再联调场景"
            tag="SYSTEM & DEVICES"
          />
          <div className="flex min-h-0 w-full flex-1 items-start gap-[32px] overflow-hidden">
            <div className="flex w-[604px] shrink-0 flex-col gap-[16px]">
              <div className="flex items-baseline justify-between">
                <p className="doc-display text-[20px]">网络与中控拓扑</p>
                <p className="doc-body text-[13px] text-doc-accent">
                  AC 控制 + {topology.apRooms.length} 间 AP 房间拓扑 / 中控架构
                </p>
              </div>
              <TopologyDiagram topology={topology} />
              <div className="flex flex-col gap-[6px] rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-(--deck-panel) px-[20px] py-[14px]">
                <p className="doc-strong text-[14px]">本地执行 ≠ 无条件断网可用</p>
                <p className="doc-body text-[12.5px] leading-[1.6] text-doc-muted">
                  本地场景能否执行取决于网关、设备及规则支持，须在现场断网实测后写入验收记录。远程访问与推送依赖可用网络；不作绝对离线承诺。
                </p>
              </div>
            </div>

            <div className="flex w-[692px] shrink-0 flex-col gap-[16px] overflow-hidden">
              <div className="flex items-baseline justify-between">
                <p className="doc-display text-[20px]">本次设备清单</p>
                <p className="doc-body text-[13px] text-doc-accent">
                  按类别汇总 / 共 {data.pointCount} 台/只设备
                </p>
              </div>
              <div className="overflow-hidden rounded-(--deck-radius-sm) border border-doc-rule">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-doc-head text-left text-doc-head-fg">
                      <th className="w-[88px] px-3 py-2.5 font-medium">条目</th>
                      <th className="w-[160px] px-3 py-2.5 font-medium">系统类别 / 数量</th>
                      <th className="px-3 py-2.5 font-medium">代表产品与品牌</th>
                      <th className="w-[150px] px-3 py-2.5 text-right font-medium">系统小计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEVICE_CATEGORIES.map((c, idx) => {
                      const lines = (data.quote?.lines ?? []).filter(
                        (l) => categoryOfType(l.type)?.slug === c.slug,
                      )
                      if (!lines.length) return null
                      const count = lines.reduce((s, l) => s + l.qty, 0)
                      const sub = lines.reduce((s, l) => s + l.price * l.qty, 0)
                      return (
                        <tr
                          key={c.slug}
                          className={cn(
                            'h-[42px] border-b border-doc-rule',
                            idx % 2 === 1 && 'bg-(--deck-box)/50',
                          )}
                        >
                          <td className="doc-latin px-3 text-doc-accent">Q0{idx + 1}</td>
                          <td className="doc-body px-3">
                            {c.name} ×{count}
                          </td>
                          <td className="doc-body truncate px-3 text-doc-ink/90">
                            {lines[0]?.name}
                            {lines.length > 1 ? ` 等 ${lines.length} 款` : ''}
                          </td>
                          <td className="doc-latin px-3 text-right tabular-nums">{yuan(sub)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="doc-display mt-[4px] text-[18px]">实施前，逐项确认</p>
              <ol className="doc-body flex flex-col gap-[8px] text-[13.5px] leading-[1.6] text-doc-muted">
                {systemNotes.map((n, i) => (
                  <li key={n}>
                    {'①②③'[i]} {n.endsWith('。') ? n : `${n}。`}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      ) : chapterId === 'plan' ? (
        <PlanSlide data={data} theme={theme} no={pageNo} />
      ) : chapterId === 'zone' ? (
        <ZoneSlide data={data} theme={theme} no={pageNo} />
      ) : (
        <ServiceSlide
          data={data}
          company={company}
          theme={theme}
          totalAmount={totalAmount}
          no={pageNo}
        />
      )}

      {/* 页脚 */}
      <div className="absolute inset-x-[56px] top-[906px] flex flex-col gap-[12px]">
        <div className="h-px w-full bg-doc-rule" />
        <div className="flex w-full items-start justify-between text-[11px] text-doc-muted">
          <p>{`${place} / ${customer}　 ·　 ${data.project.platform ? `${data.project.platform} · ` : ''}全屋智能设计方案`}</p>
          <p className="doc-latin">QX-DEMO / V1.0</p>
          <p className="doc-latin text-[12px] text-doc-ink">{`${pageNo} / ${pageTotal}`}</p>
        </div>
      </div>
    </div>
  )
}

function TopologyDiagram({
  topology,
}: {
  topology: {
    ac: TopoBox
    apRooms: TopoApRoom[]
    apLink: string
    hubs: TopoBox[]
    leaves: TopoBox[]
    link: string
  }
}) {
  const { ac, apRooms, apLink, hubs, leaves, link } = topology
  const coreX = 28
  const coreY = 12
  const coreW = CARD_W - 56
  const coreH = 52
  const coreBottom = coreY + coreH
  const pillTop = 74
  const pillBottom = 94

  const leftBusX = 166
  const shownRooms = apRooms.slice(0, 8)
  const twoColAp = shownRooms.length >= 4
  const apRows = twoColAp ? Math.ceil(shownRooms.length / 2) : Math.max(1, shownRooms.length)
  const apStartY = 104
  const apAvailH = CARD_H - apStartY - 14
  const apGapY = apRows >= 4 ? 10 : 12
  const apCardH = Math.min(
    62,
    Math.max(46, Math.floor((apAvailH - (apRows - 1) * apGapY) / apRows)),
  )

  const apPlacements = shownRooms.map((item, idx) => {
    const row = Math.floor(idx / 2)
    const col = idx % 2
    const y = apStartY + row * (apCardH + apGapY)
    const w = 138
    const x = col === 0 ? 16 : 178
    return {
      item,
      x,
      y,
      w,
      h: apCardH,
      cy: y + apCardH / 2,
      side: col === 0 ? ('left' as const) : ('right' as const),
    }
  })
  const apLastCy = apPlacements.length ? apPlacements[apPlacements.length - 1]!.cy : apStartY + 32

  const rightTrunkX = 460
  const hubX = 332
  const hubW = 256
  const hubH = 48
  const hubGap = 8
  const hubStartY = 104
  const hubPlacements = hubs.slice(0, 2).map((h, i) => {
    const y = hubStartY + i * (hubH + hubGap)
    return { box: h, x: hubX, y, w: hubW, h: hubH, cy: y + hubH / 2 }
  })
  const lastHubBottom = hubPlacements.length
    ? hubPlacements[hubPlacements.length - 1]!.y + hubH
    : hubStartY

  const leafSpineX = 344
  const leafX = 358
  const leafW = 230
  const leafStartY = lastHubBottom + 28
  const leafAvailH = CARD_H - leafStartY - 12
  const shownLeaves = leaves.slice(0, 4)
  const leafGap = shownLeaves.length >= 4 ? 6 : 8
  const leafH = shownLeaves.length
    ? Math.min(
        48,
        Math.max(
          36,
          Math.floor((leafAvailH - (shownLeaves.length - 1) * leafGap) / shownLeaves.length),
        ),
      )
    : 44
  const leafPlacements = shownLeaves.map((l, i) => {
    const y = leafStartY + i * (leafH + leafGap)
    return { box: l, x: leafX, y, w: leafW, h: leafH, cy: y + leafH / 2 }
  })
  const leafLastCy = leafPlacements.length
    ? leafPlacements[leafPlacements.length - 1]!.cy
    : lastHubBottom

  return (
    <div className="relative h-[428px] w-[604px] shrink-0 overflow-hidden rounded-(--deck-radius) border border-(--deck-card-border) bg-(--deck-diagram)">
      <svg className="absolute inset-0" width={CARD_W} height={CARD_H} aria-hidden>
        <g fill="none" strokeWidth={1.5} className="stroke-(--deck-marker)">
          <path d={`M${leftBusX} ${coreBottom} V${pillTop}`} />
          <path d={`M${rightTrunkX} ${coreBottom} V${pillTop}`} />
          <path d={`M${leftBusX} ${pillBottom} V${apLastCy}`} />
          {apPlacements.map((p, i) => (
            <path
              key={i}
              d={
                p.side === 'left'
                  ? `M${p.x + p.w} ${p.cy} H${leftBusX}`
                  : `M${leftBusX} ${p.cy} H${p.x}`
              }
            />
          ))}
          <path d={`M${rightTrunkX} ${pillBottom} V${hubStartY}`} />
          {hubPlacements.length > 1 ? (
            <path d={`M${rightTrunkX} ${hubPlacements[0]!.y + hubH} V${hubPlacements[1]!.y}`} />
          ) : null}
          {leafPlacements.length ? (
            <>
              <path d={`M${leafSpineX} ${lastHubBottom} V${leafLastCy}`} />
              {leafPlacements.map((p, i) => (
                <path key={i} d={`M${leafSpineX} ${p.cy} H${p.x}`} />
              ))}
            </>
          ) : null}
        </g>
        <g className="fill-(--deck-marker)">
          <circle cx={leftBusX} cy={coreBottom} r={3} />
          <circle cx={rightTrunkX} cy={coreBottom} r={3} />
          {apPlacements.map((p, i) => (
            <circle key={`ap-dot-${i}`} cx={leftBusX} cy={p.cy} r={2.5} />
          ))}
          {apPlacements.map((p, i) => (
            <circle key={`ap-port-${i}`} cx={p.side === 'left' ? p.x + p.w : p.x} cy={p.cy} r={2} />
          ))}
          {leafPlacements.map((p, i) => (
            <circle key={`leaf-dot-${i}`} cx={leafSpineX} cy={p.cy} r={2.5} />
          ))}
          {leafPlacements.map((p, i) => (
            <circle key={`leaf-port-${i}`} cx={p.x} cy={p.cy} r={2} />
          ))}
        </g>
      </svg>

      <TopoNodeCard box={ac} x={coreX} y={coreY} w={coreW} h={coreH} tone="core" />
      <div className="doc-body absolute top-[74px] left-[16px] flex h-[20px] w-[298px] items-center justify-center rounded-full border border-doc-rule bg-(--deck-box) px-[10px] text-[10.5px] leading-none text-doc-accent">
        <span className="truncate">{apLink}</span>
      </div>
      <div className="doc-body absolute top-[74px] left-[332px] flex h-[20px] w-[256px] items-center justify-center rounded-full border border-doc-rule bg-(--deck-box) px-[10px] text-[10.5px] leading-none text-doc-accent">
        <span className="truncate">LAN 局域网 · 中控网关接入</span>
      </div>

      {apPlacements.map((p, i) => (
        <div
          key={`${p.item.room}-${i}`}
          className="absolute flex flex-col justify-center gap-[2px] overflow-hidden rounded-[calc(var(--deck-radius-sm)/2)] border border-doc-accent/75 bg-(--deck-panel) px-[10px]"
          style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
        >
          <div className="flex items-center justify-between gap-[4px]">
            <p className="doc-strong min-w-0 truncate text-[12px] leading-tight">{p.item.room}</p>
            {p.item.codes ? (
              <span className="doc-latin shrink-0 rounded bg-(--deck-badge) px-[5px] py-[1px] text-[10px] leading-tight text-doc-accent">
                {p.item.codes}
              </span>
            ) : null}
          </div>
          <p className="doc-body truncate text-[10px] leading-tight text-doc-muted">{p.item.sub}</p>
        </div>
      ))}

      {hubPlacements.map((p) => (
        <TopoNodeCard key={p.box.title} box={p.box} x={p.x} y={p.y} w={p.w} h={p.h} tone="hub" />
      ))}
      <p
        className="doc-body absolute truncate text-[10.5px] leading-none text-doc-accent"
        style={{ left: leafSpineX + 8, top: lastHubBottom + 9, width: 236 }}
      >
        {link}
      </p>
      {leafPlacements.map((p, i) => (
        <TopoNodeCard
          key={`${p.box.title}-${i}`}
          box={p.box}
          x={p.x}
          y={p.y}
          w={p.w}
          h={p.h}
          tone="leaf"
        />
      ))}
    </div>
  )
}

function TopoNodeCard({
  box,
  x,
  y,
  w,
  h,
  tone,
}: {
  box: TopoBox
  x: number
  y: number
  w: number
  h: number
  tone: 'core' | 'hub' | 'leaf'
}) {
  return (
    <div
      className={cn(
        'absolute flex flex-col justify-center gap-[2px] overflow-hidden rounded-[calc(var(--deck-radius-sm)/2)] border px-[12px]',
        tone === 'core' ? 'border-doc-accent bg-(--deck-box)' : 'bg-(--deck-panel)',
        tone === 'hub' && 'border-doc-accent',
        tone === 'leaf' && 'border-doc-accent/65',
      )}
      style={{ left: x, top: y, width: w, height: h }}
    >
      <div className="flex items-center justify-between gap-[6px]">
        <p
          className={cn(
            'doc-strong min-w-0 truncate leading-tight',
            tone === 'core' ? 'text-[14.5px]' : 'text-[13px]',
          )}
        >
          {box.title}
        </p>
        {box.badge ? (
          <span className="doc-latin shrink-0 rounded bg-(--deck-badge) px-[6px] py-[1px] text-[10px] leading-tight text-doc-accent">
            {box.badge}
          </span>
        ) : null}
      </div>
      <p className="doc-body truncate text-[10.5px] leading-tight text-doc-muted">{box.sub}</p>
    </div>
  )
}

function SlideBrand({
  company,
  theme,
  large = false,
}: {
  company: CompanyInfo
  theme: DeckTheme
  large?: boolean
}) {
  return (
    <div className="flex items-center gap-[10px]">
      {company.logo ? (
        <img
          src={company.logo.url}
          alt={company.name}
          className={cn('w-auto object-contain', large ? 'h-[28px]' : 'h-[22px]')}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'shrink-0',
            large ? 'size-[26px]' : 'size-[22px]',
            theme.brandMark === 'outline'
              ? 'border border-doc-accent'
              : 'bg-linear-to-r from-doc-soft to-doc-soft-to',
            theme.rounded && 'rounded-full',
          )}
        />
      )}
      <p
        className={cn(
          'doc-display leading-normal whitespace-nowrap',
          large ? 'text-[21px]' : 'text-[17px]',
        )}
      >
        {company.name}
      </p>
    </div>
  )
}

function SlideChapter({
  theme,
  no,
  title,
  subtitle,
  tag,
}: {
  theme: DeckTheme
  no: string
  title: string
  subtitle: string
  tag: string
}) {
  if (theme.chapter === 'eyebrow') {
    return (
      <div className="flex h-[92px] w-full shrink-0 items-end gap-[24px] overflow-hidden">
        <div className="flex min-w-px flex-1 flex-col gap-[4px] overflow-hidden">
          <p className="doc-latin text-[11px] tracking-[0.32em] text-doc-accent">{`CHAPTER ${no}  ·  ${tag}`}</p>
          <p className="doc-display truncate text-[36px] leading-[1.3]">{title}</p>
          <p className="doc-body truncate text-[14px] text-doc-muted">{subtitle}</p>
        </div>
        <p className="doc-numeral text-[96px] leading-[0.8] text-doc-accent/25">{no}</p>
      </div>
    )
  }
  if (theme.chapter === 'badge') {
    return (
      <div className="flex h-[92px] w-full shrink-0 items-end gap-[22px] overflow-hidden">
        <span className="doc-numeral mb-[2px] flex size-[72px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-doc-accent text-[28px] text-doc-accent">
          {no}
        </span>
        <div className="flex min-w-px flex-1 flex-col gap-[6px] overflow-hidden">
          <p className="doc-display truncate text-[38px] leading-[1.25]">{title}</p>
          <p className="doc-body truncate text-[14px] text-doc-muted">{subtitle}</p>
        </div>
        <p className="doc-latin text-[11px] tracking-[0.22em] text-doc-accent">{tag}</p>
      </div>
    )
  }
  return (
    <div className="flex h-[92px] w-full shrink-0 items-end gap-[24px] overflow-hidden">
      <p className="doc-numeral text-[88px] leading-[0.85] text-doc-accent">{no}</p>
      <div className="flex min-w-px flex-1 flex-col gap-[6px] overflow-hidden">
        <p className="doc-display truncate text-[38px] leading-[1.25]">{title}</p>
        <p className="doc-body truncate text-[14px] text-doc-muted">{subtitle}</p>
      </div>
      <p className="doc-latin text-[11px] tracking-[0.18em] text-doc-muted">{tag}</p>
    </div>
  )
}

function CoverSlide({
  company,
  theme,
  place,
  customer,
  layoutText,
  pointCount,
  roomCount,
  totalAmount,
  tagline,
  pageNo,
  pageTotal,
}: {
  company: CompanyInfo
  theme: DeckTheme
  place: string
  customer: string
  layoutText: string
  pointCount: number
  roomCount: number
  totalAmount: number
  tagline: string
  pageNo: string
  pageTotal: string
}) {
  const tags = ['生活场景', `${pointCount}点位设计`, '透明报价', '安心交付']
  if (theme.cover === 'immersive') {
    return (
      <div className="relative size-full overflow-hidden">
        <img src={theme.coverPhoto} alt="" className="absolute inset-0 size-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-r from-doc-paper via-doc-paper/80 to-doc-paper/10"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[420px] bg-linear-to-t from-doc-paper via-doc-paper/85 to-transparent"
        />
        <div className="absolute inset-x-[56px] top-[36px] flex h-[34px] items-center justify-between">
          <SlideBrand company={company} theme={theme} large />
          <p className="doc-latin text-[11px] tracking-[0.28em] text-doc-accent">
            {theme.coverTagline}
          </p>
        </div>
        <div className="absolute top-[250px] left-[56px] w-[760px]">
          <p className="doc-latin text-[12px] tracking-[0.36em] text-doc-accent">
            SMART LIVING PROPOSAL
          </p>
          <h1 className="doc-display mt-[24px] text-[64px] leading-[1.2]">{theme.headline}</h1>
          <span aria-hidden className="mt-[28px] block h-px w-[120px] bg-doc-accent" />
          <p className="doc-body mt-[24px] text-[22px]">全屋智能 · 点位设计与服务报价</p>
          <p className="doc-body mt-[10px] text-[14px] text-doc-muted">{tags.join('　·　')}</p>
        </div>
        <div className="absolute inset-x-[56px] top-[748px] grid grid-cols-4 gap-[32px] border-t border-doc-accent/40 pt-[22px]">
          {[
            ['PROJECT', place],
            ['CLIENT', `${customer} / ${layoutText}`],
            ['SCALE', `${roomCount}个空间 · ${pointCount}个点位`],
            ['INVESTMENT', money(totalAmount)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="doc-latin text-[10.5px] tracking-[0.3em] text-doc-accent">{k}</p>
              <p
                className={
                  k === 'INVESTMENT'
                    ? 'doc-numeral mt-[8px] text-[24px] text-doc-accent'
                    : 'doc-body mt-[10px] text-[16px]'
                }
              >
                {v}
              </p>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-[56px] top-[906px] flex justify-between text-[11px] text-doc-muted">
          <p className="doc-latin">{tagline}</p>
          <p className="doc-latin text-[12px] text-doc-ink">{`${pageNo} / ${pageTotal}`}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative size-full overflow-hidden">
      <div className="absolute inset-x-[56px] top-[28px] flex h-[34px] items-center justify-between">
        <SlideBrand company={company} theme={theme} large />
        <p className="doc-latin text-[12px] text-doc-muted">{theme.coverTagline}</p>
      </div>
      <div className="absolute inset-x-0 top-[90px] h-[520px] overflow-hidden">
        <img src={theme.coverPhoto} alt="" className="size-full object-cover" />
        <span className="doc-body absolute bottom-[26px] left-[56px] bg-white px-[12px] py-[5px] text-[11px] text-[#252523]">
          {theme.photoNote}
        </span>
      </div>
      <div className="absolute top-[648px] left-[56px] w-[830px]">
        <h1 className="doc-display text-[56px] leading-[1.25]">{theme.headline}</h1>
        <p className="doc-body mt-[14px] text-[24px]">全屋智能 · 点位设计与服务报价</p>
        <div className="mt-[16px] flex items-center gap-[20px]">
          <span
            aria-hidden
            className="h-[3px] w-[100px] bg-linear-to-r from-doc-soft to-doc-soft-to"
          />
          <p className="doc-body text-[14px] text-doc-muted">{tags.join('　 /　 ')}</p>
        </div>
      </div>
      <div className="absolute top-[650px] left-[930px] flex w-[454px] flex-col gap-[6px] border-l border-doc-rule pl-[28px]">
        <p className="doc-strong truncate text-[24px]">{place}</p>
        <p className="doc-body truncate text-[17px] text-doc-muted">{`${customer}　/　${layoutText}`}</p>
        <p className="doc-latin text-[13px] text-doc-muted">{`QX-DEMO · V1.0 · 预算 ${money(totalAmount)}`}</p>
        <p className="doc-body truncate text-[13px] text-doc-accent">{`${pointCount} 个智能点位 · 全屋智能设计方案`}</p>
      </div>
      <div className="absolute inset-x-[56px] top-[906px] flex justify-between">
        <p className="doc-latin text-[11px] text-doc-muted">{tagline}</p>
        <p className="doc-latin text-[12px] text-doc-ink">{`${pageNo} / ${pageTotal}`}</p>
      </div>
    </div>
  )
}

function PlanSlide({ data, theme, no }: { data: LandingShowcase; theme: DeckTheme; no: string }) {
  const facts = useDemoFacts(data)
  const sheet = data.sheets[0]
  const needs: [string, string][] = [
    [
      '生活需求',
      facts.has('smart-lock', 'contact-sensor', 'doorbell')
        ? '回家有光，离家少牵挂'
        : facts.has('curtain-track')
          ? '灯光窗帘，一键随心'
          : '常用灯光，触手可及',
    ],
    [
      '休息需求',
      facts.bedrooms
        ? `${facts.bedrooms > 1 ? `${facts.bedrooms} 间卧室` : '卧室'}一键关灯入睡`
        : '夜间起居更安心',
    ],
    ['网络底座', facts.has(...AP_TYPES) ? 'AC 管控 + 全屋 AP 漫游' : '路由覆盖，按需扩展 AP'],
    ['配置原则', '够用、可维护、边界清楚'],
  ]
  const roomSummary = useMemo(() => {
    if (!sheet) return []
    const map = new Map<
      string,
      { name: string; deviceTypes: string[]; types: Set<string>; count: number }
    >()
    for (const p of sheet.points) {
      const r = p.room || '公共区域'
      const cur = map.get(r) ?? { name: r, deviceTypes: [], types: new Set<string>(), count: 0 }
      cur.count += 1
      if (!cur.deviceTypes.includes(p.type)) cur.deviceTypes.push(p.type)
      cur.types.add(deviceTypeOf(p.type)?.name ?? '设备')
      map.set(r, cur)
    }
    return [...map.values()].slice(0, 8)
  }, [sheet])

  if (!sheet) return null
  return (
    <>
      <SlideChapter
        theme={theme}
        no={no}
        title={`${sheet.floor} · 住宅平面与点位索引`}
        subtitle={`${sheet.name} / 本层共 ${sheet.points.length} 个点位，图面代号与设备清单、报价单一一对应`}
        tag="RESIDENTIAL PLAN"
      />
      <div className="grid h-[74px] w-full shrink-0 grid-cols-4 overflow-hidden rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-linear-to-r from-doc-soft to-doc-soft-to">
        {needs.map(([k, v]) => (
          <div key={k} className="flex flex-col justify-center gap-[4px] px-[22px]">
            <p className="doc-body text-[12px] text-doc-muted">{k}</p>
            <p className="doc-strong truncate text-[17px]">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-[28px] overflow-hidden">
        <div className="relative flex-1 overflow-hidden rounded-(--deck-radius) border border-(--deck-card-border) bg-white p-4">
          <img src={sheet.url} alt={sheet.name} className="size-full object-contain opacity-75" />
          <div className="pointer-events-none absolute inset-0">
            {sheet.points.map((p) => (
              <img
                key={p.id}
                src={markerSrc(p.type)}
                alt=""
                className=" absolute size-[22px] -translate-x-1/2 -translate-y-1/2 object-contain"
                style={{ left: `${(p.rx * 100).toFixed(2)}%`, top: `${(p.ry * 100).toFixed(2)}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex w-[520px] shrink-0 flex-col gap-[12px]">
          <div className="flex items-baseline justify-between">
            <p className="doc-display text-[19px]">分房间点位索引</p>
            <p className="doc-body text-[12.5px] text-doc-accent">
              {roomSummary.length} 个主要空间
            </p>
          </div>
          <div className="overflow-hidden rounded-(--deck-radius-sm) border border-doc-rule">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-doc-head text-left text-doc-head-fg">
                  <th className="w-[96px] px-3 py-2 font-medium">空间</th>
                  <th className="w-[110px] px-3 py-2 font-medium">设备图标</th>
                  <th className="px-3 py-2 font-medium">包含设备</th>
                  <th className="w-[64px] px-3 py-2 text-right font-medium">数量</th>
                </tr>
              </thead>
              <tbody>
                {roomSummary.map((r, i) => (
                  <tr
                    key={r.name}
                    className={cn(
                      'h-[38px] border-b border-doc-rule',
                      i % 2 === 1 && 'bg-(--deck-box)/50',
                    )}
                  >
                    <td className="doc-strong px-3">{r.name}</td>
                    <td className="px-3">
                      <span className="flex items-center -space-x-1">
                        {r.deviceTypes.slice(0, 4).map((dt) => (
                          <PointMarker
                            key={dt}
                            type={dt}
                            className="size-5 rounded-full ring-1 ring-white"
                          />
                        ))}
                      </span>
                    </td>
                    <td className="doc-body truncate px-3 text-doc-muted">
                      {[...r.types].slice(0, 3).join('、')}
                    </td>
                    <td className="doc-latin px-3 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

/** 进门章节：一层玄关 / 客厅 / 餐厅里点位最多的两间，只列真实设备与报价型号 */
function ZoneSlide({ data, theme, no }: { data: LandingShowcase; theme: DeckTheme; no: string }) {
  const sheet = data.sheets[0]
  const rooms = useMemo(() => {
    const byRoom = new Map<string, NonNullable<typeof sheet>['points']>()
    for (const p of sheet?.points ?? [])
      if (p.room) byRoom.set(p.room, [...(byRoom.get(p.room) ?? []), p])
    const prefer = ['玄关', '客厅', '餐厅']
    const rank = (name: string) => {
      const i = prefer.findIndex((k) => name.includes(k))
      return i === -1 ? prefer.length : i
    }
    return [...byRoom.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length)
      .slice(0, 2)
      .map(([name, pts]) => ({ name, pts }))
  }, [sheet])
  const lineByType = useMemo(
    () => new Map((data.quote?.lines ?? []).map((l) => [l.type, l])),
    [data.quote?.lines],
  )
  const composition = useMemo(() => {
    const byType = new Map<string, string[]>()
    for (const r of rooms)
      for (const p of r.pts) byType.set(p.type, [...(byType.get(p.type) ?? []), p.code])
    return [...byType.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)
  }, [rooms])
  if (!sheet || !rooms.length) return null
  const floor = sheet.floor
  return (
    <>
      <SlideChapter
        theme={theme}
        no={no}
        title="进门的那一刻，生活开始切换。"
        subtitle={`${floor} · ${rooms.map((r) => r.name).join('、')} / 共 ${rooms.reduce((s, r) => s + r.pts.length, 0)} 个点位`}
        tag="ARRIVE & LIVING"
      />
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-[28px] overflow-hidden">
        <div className="col-span-7 flex flex-col gap-[16px]">
          <div className="relative h-[440px] shrink-0 overflow-hidden rounded-(--deck-radius)">
            <img src="/proposal/photos/living.jpg" alt="" className="size-full object-cover" />
            <span className="doc-body absolute bottom-4 left-4 bg-white/90 px-3 py-1 text-[11px] text-[#252523]">
              {theme.photoNote}
            </span>
          </div>
          <div className="grid grid-cols-2 items-start gap-[16px]">
            {rooms.map((r) => {
              const types = new Map<string, number>()
              for (const p of r.pts) types.set(p.type, (types.get(p.type) ?? 0) + 1)
              return (
                <div
                  key={r.name}
                  className="flex flex-col gap-[12px] rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-card) p-[18px]"
                >
                  <div className="flex items-baseline justify-between border-b border-doc-rule pb-2">
                    <span className="doc-strong text-[16px]">
                      {floor} · {r.name}
                    </span>
                    <span className="doc-latin text-[12px] text-doc-accent">
                      {r.pts.length} 个点位
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[12px] text-doc-muted">
                    {[...types.entries()].map(([type, n]) => (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1 rounded bg-(--deck-box) px-2 py-0.5"
                      >
                        <PointMarker type={type} className="size-3.5" />
                        <span>{deviceTypeOf(type)?.name ?? '设备'}</span>
                        <span className="doc-latin text-doc-accent">×{n}</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-doc-muted">
                    点位代号：{codeRange(r.pts.map((p) => p.code))}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
        <div className="col-span-5 flex flex-col gap-[16px]">
          <p className="doc-display text-[20px]">本空间设备与型号</p>
          {composition.map(([type, codes]) => {
            const line = lineByType.get(type)
            return (
              <div
                key={type}
                className="flex items-center gap-[14px] rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-(--deck-panel) px-[18px] py-[14px]"
              >
                <PointMarker type={type} className="size-[28px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="doc-strong truncate text-[15px]">
                    {deviceTypeOf(type)?.name ?? '设备'} ×{codes.length}
                  </p>
                  <p className="doc-body truncate text-[12.5px] text-doc-muted">
                    {line?.name ?? '待选型'}
                  </p>
                </div>
                <span className="doc-latin shrink-0 text-[12px] text-doc-accent">
                  {codeRange(codes)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function ServiceSlide({
  data,
  company,
  theme,
  totalAmount,
  no,
}: {
  data: LandingShowcase
  company: CompanyInfo
  theme: DeckTheme
  totalAmount: number
  no: string
}) {
  const facts = useDemoFacts(data)
  const amounts = paymentAmounts(totalAmount, DEFAULT_PAYMENTS)
  // 共同验收清单：与方案「服务交付」页同一套规则（lib/project-docs acceptanceChecks），按示例项目实际设备生成
  const switches = facts.count(SWITCH_TYPES)
  const curtains = facts.count(['curtain-track'])
  const tests = [
    switches ? `${switches}只开关` : null,
    curtains ? `${curtains}处窗帘行程` : null,
    facts.count(['contact-sensor']) ? '门磁开合状态' : null,
    facts.count(['smart-lock']) ? '门锁开锁与告警' : null,
  ].filter(Boolean)
  const checks = [
    `核对${data.pointCount}台/只设备的编号、型号、位置与数量。`,
    tests.length ? `测试${tests.join('、')}。` : '测试全部设备的手动与手机控制。',
    facts.has(...AP_TYPES) ? '实测 AC 控制器与各房间 AP 的漫游切换。' : null,
    facts.count(['water-sensor'])
      ? '模拟水浸、复位及手机通知，记录网络依赖。'
      : facts.count(['smoke-sensor'])
        ? '模拟烟雾报警、复位及手机通知，记录网络依赖。'
        : facts.count(['motion-sensor'])
          ? '模拟人体传感器触发、复位及手机通知。'
          : null,
    '测试网络覆盖与断网表现，明确本地可用范围。',
    '账号绑定业主，移交清单、配置备份与维护说明。',
  ].filter((v): v is string => Boolean(v))
  return (
    <>
      <SlideChapter
        theme={theme}
        no={no}
        title="交付有标准，验收有记录。"
        subtitle="四步标准服务流程 / 现场逐项打勾验收 / 合同付款节点清晰透明"
        tag="SERVICE & DELIVERY"
      />
      <div className="grid grid-cols-4 gap-[16px]">
        {[
          ['01', '现场勘测', '复核户型、零火线供电、弱电箱六类网线与安装条件'],
          ['02', '方案确认', `核对 ${data.pointCount} 个点位、网络拓扑、产品型号及报价边界`],
          ['03', '安装联调', '设备到场开箱核验，按图逐点安装、配网与场景联调'],
          ['04', '验收培训', '双方现场逐项打勾测试，移交账号、点位图与质保凭证'],
        ].map(([no, title, sub]) => (
          <div
            key={no}
            className="rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-card) p-[18px]"
          >
            <p className="doc-latin text-[12px] text-doc-accent">STEP {no}</p>
            <p className="doc-strong mt-1 text-[17px]">{title}</p>
            <p className="doc-body mt-1.5 text-[12.5px] leading-relaxed text-doc-muted">{sub}</p>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-[28px]">
        <div className="col-span-6 flex flex-col gap-[12px]">
          <p className="doc-display text-[19px]">共同验收清单</p>
          <div className="flex flex-col gap-[16px] rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-card) p-[20px] text-[13px]">
            {checks.map((line) => (
              <div key={line} className="flex items-start gap-3">
                <DocCheckbox className="text-doc-accent" />
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-6 flex flex-col gap-[12px]">
          <div className="flex items-baseline justify-between">
            <p className="doc-display text-[19px]">付款节点</p>
            <p className="doc-body text-[13px] text-doc-accent">方案总计 {yuan(totalAmount)}</p>
          </div>
          <div className="overflow-hidden rounded-(--deck-radius-sm) border border-doc-rule">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-doc-head text-left text-doc-head-fg">
                  <th className="px-3 py-2 font-medium">阶段</th>
                  <th className="w-[80px] px-3 py-2 text-right font-medium">比例</th>
                  <th className="w-[140px] px-3 py-2 text-right font-medium">应付金额</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_PAYMENTS.map((p, i) => (
                  <tr key={p.name} className="h-[42px] border-b border-doc-rule">
                    <td className="px-3">{p.name}</td>
                    <td className="doc-latin px-3 text-right tabular-nums">{p.percent}%</td>
                    <td className="doc-latin px-3 text-right font-medium tabular-nums text-doc-accent">
                      {yuan(amounts[i] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {company.phone || company.address ? (
            <div className="rounded-(--deck-radius-sm) bg-linear-to-r from-doc-soft to-doc-soft-to p-[20px]">
              <p className="doc-strong text-[15px]">{company.name}</p>
              <p className="doc-body mt-1 text-[12.5px] text-doc-muted">
                {[company.phone, company.address].filter(Boolean).join('　·　')}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
