'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  FileCheck2,
  FileText,
  FolderKanban,
  Info,
  Keyboard,
  Layers,
  MapPinned,
  Menu,
  ReceiptText,
  Search,
  Smartphone,
  Sparkles,
  Terminal,
  TriangleAlert,
  X,
} from 'lucide-react'

import { AppearanceMenuItems } from '@/components/appearance-menu'
import { BrandLogo } from '@/components/landing/landing-chrome'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { getManualSnapshot } from '@/lib/user-manual'
import { cn } from '@/lib/utils'

type ManualData = ReturnType<typeof getManualSnapshot>

type DocSectionId =
  | 'overview'
  | 'quickstart'
  | 'multiplatform'
  | 'projects'
  | 'point-map'
  | 'auto-points'
  | 'quotes'
  | 'contracts'
  | 'archive'
  | 'membership'
  | 'ai-models'
  | 'ai-billing'
  | 'plugins'
  | 'templates'
  | 'devices'
  | 'shortcuts'

type NavGroup = {
  group: string
  items: {
    id: DocSectionId
    title: string
    badge?: string
    keywords: string
    headings: { id: string; label: string }[]
  }[]
}

const DOC_GROUPS: NavGroup[] = [
  {
    group: '开始使用',
    items: [
      {
        id: 'overview',
        title: '平台架构与总览',
        keywords: '介绍 概览 架构 核心链路 繁梦空间',
        headings: [
          { id: 'overview-intro', label: '产品定位' },
          { id: 'overview-loop', label: '五步核心闭环' },
          { id: 'overview-principles', label: '核心设计原则' },
        ],
      },
      {
        id: 'quickstart',
        title: '5 分钟快速上手',
        badge: '推荐',
        keywords: '快速上手 新手 入门 教程 流程',
        headings: [
          { id: 'qs-step1', label: '步骤 1：创建项目与主平台' },
          { id: 'qs-step2', label: '步骤 2：上传户型图与布点' },
          { id: 'qs-step3', label: '步骤 3：一键生成报价与提案' },
        ],
      },
      {
        id: 'multiplatform',
        title: '多端协同（Web / 小程序 / 桌面）',
        keywords: '微信小程序 桌面客户端 扫码登录 竖版 分屏 协同',
        headings: [
          { id: 'mp-qr', label: '微信扫码免密登录电脑端' },
          { id: 'mp-mobile', label: '小程序竖版大视野点位工作区' },
          { id: 'mp-desktop', label: '桌面客户端与离线草稿保护' },
        ],
      },
    ],
  },
  {
    group: '核心工作流',
    items: [
      {
        id: 'projects',
        title: '01. 项目管理与多人协作',
        keywords: '新建项目 客户 预算 主平台 分享链接 协作邀请',
        headings: [
          { id: 'proj-create', label: '项目信息与自动命名' },
          { id: 'proj-share', label: '业主只读分享与团队协作' },
        ],
      },
      {
        id: 'point-map',
        title: '02. 点位图画板（fmkj-board）',
        keywords: '点位图 画板 户型图 DWG 标定比例 网格 多边形 区域 灯光',
        headings: [
          { id: 'pm-sheet', label: '上传户型图与 DWG 转换' },
          { id: 'pm-calibrate', label: '比例标定与 25cm 网格' },
          { id: 'pm-area', label: '多边形房间区域划分' },
          { id: 'pm-place', label: '设备与灯光放置、导出规范' },
        ],
      },
      {
        id: 'auto-points',
        title: '03. 智能生成点位与一键撤销',
        badge: '新功能',
        keywords: '智能生成点位 覆盖 撤销 Ctrl+Z 自动布点 房间规则',
        headings: [
          { id: 'ap-trigger', label: '入口与覆盖确认机制' },
          { id: 'ap-rules', label: '各房间类型智能配点规则' },
          { id: 'ap-undo', label: '三种一键撤销恢复方式' },
        ],
      },
      {
        id: 'quotes',
        title: '04. 报价台与双向无缝联动',
        keywords: '报价单 同步 替换型号 改单价 折扣 附加费 双向定位',
        headings: [
          { id: 'qt-sync', label: '点位同步与手动改价保留' },
          { id: 'qt-swap', label: '替换产品库型号与优惠设置' },
          { id: 'qt-locate', label: '从报价单反跳画布定位' },
        ],
      },
      {
        id: 'contracts',
        title: '05. 施工合同与分期收款',
        keywords: '合同 分期付款 40% 50% 10% 质保 签约 收款',
        headings: [
          { id: 'ct-stages', label: '三阶段付款比例与金额联动' },
          { id: 'ct-terms', label: '默认条款复用与状态流转' },
        ],
      },
      {
        id: 'archive',
        title: '06. 归档导出与交付资料包',
        keywords: '归档 导出 PDF ZIP 方案演示 交底清单 布线表 资料包',
        headings: [
          { id: 'ar-docs', label: '全套交付单据矩阵' },
          { id: 'ar-bundle', label: '一键合并 PDF 与 ZIP 资料包' },
        ],
      },
    ],
  },
  {
    group: '会员与 AI 计费',
    items: [
      {
        id: 'membership',
        title: 'AI 积分与充值',
        keywords: '积分 充值 兑换码 余额 流水 任务奖励 绑定邮箱 绑定微信',
        headings: [
          { id: 'mb-balance', label: '积分余额与流水' },
          { id: 'mb-redeem', label: '兑换码充值' },
          { id: 'mb-tasks', label: '绑定与成长任务奖励' },
        ],
      },
      {
        id: 'ai-models',
        title: '纯国产 AI 大模型矩阵',
        keywords: '国产模型 DeepSeek 通义千问 Qwen 豆包 智谱 GLM Kimi R1 QwQ QVQ',
        headings: [
          { id: 'am-policy', label: '模型分级与后台管控说明' },
          { id: 'am-table', label: '当前可用国产模型与倍率表' },
        ],
      },
      {
        id: 'ai-billing',
        title: 'AI 积分计费公式与工具费率',
        keywords: '积分 计费 Token 倍率 工具调用 扣费 公式 明细',
        headings: [
          { id: 'ab-formula', label: 'Token 与倍率计费公式' },
          { id: 'ab-tools', label: '14 项系统工具调用附加费率' },
        ],
      },
    ],
  },
  {
    group: '扩展与参考手册',
    items: [
      {
        id: 'plugins',
        title: '能力中心全览（12 项能力）',
        keywords: '能力中心 房间分析 智能选型 AI识图 DWG 勘测 布线 采购 移交 售后',
        headings: [{ id: 'pl-list', label: '全平台插件功能与挂载位置' }],
      },
      {
        id: 'templates',
        title: '方案演示模板与报价风格',
        keywords: '方案模板 栖序雅致 墨金臻选 原木自然 东方雅韵 报价风格',
        headings: [
          { id: 'tp-proposal', label: '8 章横版方案演示模板' },
          { id: 'tp-styles', label: '报价与合同视觉风格包' },
        ],
      },
      {
        id: 'devices',
        title: '设备图例分类与编号规则',
        keywords: '图例 符号 编号 前缀 开关 灯光 传感器 窗帘 网关 AP',
        headings: [{ id: 'dv-table', label: '设备大类与点位代号前缀' }],
      },
      {
        id: 'shortcuts',
        title: '点位图画板快捷键速查',
        keywords: '快捷键 键盘 V H A C G R Ctrl+Z 撤销 复制 缩放',
        headings: [{ id: 'sc-table', label: '全套画板键盘快捷键' }],
      },
    ],
  },
]

const FLAT_ITEMS = DOC_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, group: g.group })))

function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: 'note' | 'tip' | 'warning'
  title: string
  children: React.ReactNode
}) {
  const styles = {
    note: 'border-border bg-muted/30 text-foreground',
    tip: 'border-primary/30 bg-primary/[0.03] text-foreground',
    warning: 'border-amber-500/30 bg-amber-500/[0.04] text-foreground',
  }[type]
  const Icon = type === 'warning' ? TriangleAlert : type === 'tip' ? Sparkles : Info
  return (
    <div className={cn('my-4 flex gap-3 rounded-xl border p-4 text-xs leading-relaxed', styles)}>
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          type === 'warning' ? 'text-amber-500' : 'text-primary',
        )}
      />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

export function DocsClient({ manual }: { manual: ManualData }) {
  const [activeId, setActiveId] = useState<DocSectionId>('overview')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 支持 URL hash 定位章节（如 /docs#ai-billing）
  useEffect(() => {
    const applyHash = () => {
      const raw = window.location.hash.replace(/^#/, '') as DocSectionId
      if (raw && FLAT_ITEMS.some((i) => i.id === raw)) {
        setActiveId(raw)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  // 支持 ⌘K / Ctrl+K 呼出文档搜索
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const selectSection = (id: DocSectionId) => {
    setActiveId(id)
    setMobileNavOpen(false)
    setSearchOpen(false)
    window.history.replaceState(null, '', `/docs#${id}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const currentIndex = FLAT_ITEMS.findIndex((i) => i.id === activeId)
  const currentItem = FLAT_ITEMS[currentIndex] ?? FLAT_ITEMS[0]
  const prevItem = currentIndex > 0 ? FLAT_ITEMS[currentIndex - 1] : null
  const nextItem = currentIndex < FLAT_ITEMS.length - 1 ? FLAT_ITEMS[currentIndex + 1] : null

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return FLAT_ITEMS
    return FLAT_ITEMS.filter((item) =>
      `${item.group} ${item.title} ${item.keywords} ${item.headings.map((h) => h.label).join(' ')}`
        .toLowerCase()
        .includes(q),
    )
  }, [searchQuery])

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* 顶部吸顶大厂文档导航栏 */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="打开文档目录"
          >
            {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>

          <div className="flex items-center gap-2.5">
            <Link href="/" className="shrink-0">
              <BrandLogo className="h-6 w-auto" />
            </Link>
            <span aria-hidden className="text-muted-foreground/60">
              /
            </span>
            <button
              type="button"
              onClick={() => selectSection('overview')}
              className="flex items-center gap-1.5 text-sm font-semibold tracking-tight hover:text-primary"
            >
              <BookOpen className="size-4 text-primary" />
              <span>Docs</span>
            </button>
            <Badge variant="secondary" className="hidden font-mono text-[10px] sm:inline-flex">
              {manual.lastUpdated} · 实时同步
            </Badge>
          </div>

          {/* 全局文档搜索框（⌘K） */}
          <div className="ml-auto flex flex-1 items-center justify-end gap-2 sm:max-w-xs md:max-w-sm">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-8 w-full items-center justify-between rounded-lg border bg-muted/40 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="size-3.5 shrink-0" />
                <span>搜索功能、用法、计费或快捷键…</span>
              </span>
              <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
                ⌘K
              </kbd>
            </button>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/catalog">产品与图例库</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/membership">会员与积分</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  外观
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <AppearanceMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild size="sm" className="ml-1 h-8 rounded-lg text-xs">
              <Link href="/projects">
                进入工作台
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* 三栏式文档主体：左侧目录树 + 中央正文 + 右侧 On this page */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:gap-8">
          {/* 左侧分组目录树 */}
          <aside
            className={cn(
              'shrink-0 border-r py-6 pr-4 lg:sticky lg:top-14 lg:block lg:h-[calc(100svh-3.5rem)] lg:w-64 lg:overflow-y-auto',
              mobileNavOpen ? 'block border-b border-r-0 pb-4' : 'hidden',
            )}
          >
            <nav aria-label="文档目录" className="space-y-6">
              {DOC_GROUPS.map((group) => (
                <div key={group.group} className="space-y-1.5">
                  <p className="px-2.5 text-xs font-semibold tracking-wider text-foreground uppercase">
                    {group.group}
                  </p>
                  <ul className="space-y-0.5 border-l pl-2">
                    {group.items.map((item) => {
                      const active = item.id === activeId
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => selectSection(item.id)}
                            className={cn(
                              '-ml-[9px] flex w-full items-center justify-between border-l-2 py-1.5 pr-2 pl-3 text-left text-xs transition-colors',
                              active
                                ? 'border-primary bg-primary/[0.06] font-semibold text-primary rounded-r-md'
                                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                            )}
                          >
                            <span className="truncate">{item.title}</span>
                            {item.badge ? (
                              <Badge
                                variant={active ? 'default' : 'secondary'}
                                className="ml-1.5 h-4 shrink-0 px-1 text-[10px]"
                              >
                                {item.badge}
                              </Badge>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {/* 中央文档正文区 */}
          <main className="min-w-0 flex-1 py-8 lg:py-10">
            <div className="mx-auto max-w-3xl">
              {/* 面包屑 */}
              <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Docs</span>
                <ChevronRight className="size-3.5" />
                <span>{currentItem.group}</span>
                <ChevronRight className="size-3.5" />
                <span className="font-medium text-foreground">{currentItem.title}</span>
              </div>

              {/* 渲染当前选中章节 */}
              {activeId === 'overview' && (
                <SectionOverview manual={manual} onNavigate={selectSection} />
              )}
              {activeId === 'quickstart' && <SectionQuickstart onNavigate={selectSection} />}
              {activeId === 'multiplatform' && <SectionMultiplatform />}
              {activeId === 'projects' && <SectionProjects />}
              {activeId === 'point-map' && <SectionPointMap onNavigate={selectSection} />}
              {activeId === 'auto-points' && <SectionAutoPoints />}
              {activeId === 'quotes' && <SectionQuotes />}
              {activeId === 'contracts' && <SectionContracts />}
              {activeId === 'archive' && <SectionArchive />}
              {activeId === 'membership' && <SectionMembership />}
              {activeId === 'ai-models' && <SectionAiModels manual={manual} />}
              {activeId === 'ai-billing' && <SectionAiBilling manual={manual} />}
              {activeId === 'plugins' && <SectionPlugins manual={manual} />}
              {activeId === 'templates' && <SectionTemplates manual={manual} />}
              {activeId === 'devices' && <SectionDevices manual={manual} />}
              {activeId === 'shortcuts' && <SectionShortcuts manual={manual} />}

              {/* 底部上一篇 / 下一篇翻页导航 */}
              <div className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2">
                {prevItem ? (
                  <button
                    type="button"
                    onClick={() => selectSection(prevItem.id)}
                    className="group flex flex-col items-start rounded-xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-0.5" />
                      上一章 · {prevItem.group}
                    </span>
                    <span className="mt-1 text-sm font-semibold text-foreground group-hover:text-primary">
                      {prevItem.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}
                {nextItem ? (
                  <button
                    type="button"
                    onClick={() => selectSection(nextItem.id)}
                    className="group flex flex-col items-end rounded-xl border p-4 text-right transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      下一章 · {nextItem.group}
                      <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-1 text-sm font-semibold text-foreground group-hover:text-primary">
                      {nextItem.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </div>
          </main>

          {/* 右侧 On this page 页内锚点导航 */}
          <aside className="hidden w-56 shrink-0 py-10 xl:block">
            <div className="sticky top-22 space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">本页目录（On this page）</p>
                <ul className="space-y-1.5 border-l pl-3 text-xs text-muted-foreground">
                  {currentItem.headings.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        className="block py-0.5 transition-colors hover:text-foreground"
                      >
                        {h.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2 rounded-xl border bg-muted/20 p-3.5 text-xs">
                <p className="font-semibold text-foreground">快速入口</p>
                <div className="flex flex-col gap-1.5 text-muted-foreground">
                  <Link href="/projects" className="hover:text-foreground">
                    → 打开项目工作台
                  </Link>
                  <Link href="/membership" className="hover:text-foreground">
                    → 会员兑换与积分明细
                  </Link>
                  <Link href="/plugins" className="hover:text-foreground">
                    → 能力中心
                  </Link>
                  <Link href="/catalog" className="hover:text-foreground">
                    → 728 款产品与图例库
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ⌘K 全局文档搜索弹窗 */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogHeader className=" pb-1">
            <DialogTitle className="text-sm font-medium">搜索繁梦空间文档</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入关键词，如：智能生成点位、撤销、计费公式、DeepSeek、快捷键…"
              className="pl-9 text-xs"
            />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {searchResults.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                没有找到匹配的文档章节
              </p>
            ) : (
              searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectSection(item.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                >
                  <div>
                    <span className="font-semibold text-foreground">{item.title}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{item.group}</span>
                  </div>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================================================================
 * 各章节结构化文档内容组件
 * ========================================================================== */

function SectionOverview({
  manual,
  onNavigate,
}: {
  manual: ManualData
  onNavigate: (id: DocSectionId) => void
}) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          繁梦空间（FMKJ）平台架构与文档总览
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          面向个人全屋智能设计师、设计工作室与工程集成商的一体化方案设计、点位绘制、自动选型报价、合同与多模板交付平台。
        </p>
      </div>

      <section id="overview-intro" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">产品定位</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          繁梦空间将传统智能家居方案中割裂的「CAD 看图描点 → Excel 统计数量查价格 → PPT 排版做方案 →
          Word 拟合同 →
          施工交底表」整合为单一数据源驱动的闭环工作台。您在户型图上布置的每一个设备或灯具点位，都会实时同步驱动报价单、8
          章 A4 横版客户提案、施工合同与现场交底清单。
        </p>
      </section>

      <section id="overview-loop" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">五步核心业务闭环</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              id: 'projects' as const,
              step: '01',
              title: '项目信息与协作',
              desc: '录入客户、楼盘、预算与主生态平台，支持分享链接与团队协同',
            },
            {
              id: 'point-map' as const,
              step: '02',
              title: '点位图工作台',
              desc: '多边形房间划分、标准 SVG 图标落图、一键智能生成点位（可撤销）',
            },
            {
              id: 'quotes' as const,
              step: '03',
              title: '报价台双向联动',
              desc: '点位实时同步报价、728 款产品库替换型号、单价修改与反向定位',
            },
            {
              id: 'contracts' as const,
              step: '04',
              title: '施工合同管理',
              desc: '自动继承报价金额、三阶段分期付款比例校验与收款状态追踪',
            },
            {
              id: 'archive' as const,
              step: '05',
              title: '归档与资料包导出',
              desc: '8 章横版提案、多风格报价、合同、交底单与一键合并 PDF / ZIP',
            },
            {
              id: 'ai-billing' as const,
              step: 'AI',
              title: '国产大模型助手',
              desc: '侧边栏 AI 对话、户型图视觉识图、多步工具调用与透明积分计费',
            },
          ].map((card) => (
            <button
              key={card.step}
              type="button"
              onClick={() => onNavigate(card.id)}
              className="group flex flex-col justify-between rounded-xl border p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/20"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary">
                    {card.step}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="text-sm font-semibold">{card.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{card.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section id="overview-principles" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">核心设计原则与实时同步机制</h2>
        <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">直接展示标准设备图标：</strong>
              全站画布、导出的 PNG 点位图与 8 章方案演示平面图统一直接显示标准化 SVG
              设备与灯具图标，直观易读。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">核心极简 + 外围插件化：</strong>
              主导航只保留最核心的「信息 → 点位 → 报价 → 合同 → 归档」五步，DWG
              转换、强弱电布线表、采购核验单等进阶工具全部收录在「能力中心」（共{' '}
              {manual.plugins.length} 项）里，点开即用。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">文档与系统配置实时同步：</strong>
              本文档中心（<code className="font-mono">/docs</code>）直接绑定系统的 AI
              计费常量、后台启用的国产大模型列表与插件注册表，任何配置调整均会自动反映在文档表格中。
            </span>
          </li>
        </ul>
      </section>
    </article>
  )
}

function SectionQuickstart({ onNavigate }: { onNavigate: (id: DocSectionId) => void }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">5 分钟快速上手指南</h1>
        <p className="text-sm text-muted-foreground">
          从拿到业主的户型图到导出整套可汇报的 8 章提案与正式报价单，只需以下 3 个步骤。
        </p>
      </div>

      <section id="qs-step1" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">步骤 1：新建项目并选定主生态平台</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          点击左侧导航栏顶部醒目的 <strong>「+ 新建项目」</strong>
          ，填写客户姓名、小区楼盘与房号（项目名称留空会自动按「小区 +
          房号」生成），并选择客户意向的主生态平台（如 <code className="font-mono">米家</code>、
          <code className="font-mono">Aqara Home</code>、
          <code className="font-mono">Apple Home</code>、
          <code className="font-mono">华为鸿蒙智家</code> 或 <code className="font-mono">KNX</code>
          ）。
        </p>
      </section>

      <section id="qs-step2" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">步骤 2：上传户型图、划分房间并布置点位</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          进入项目的 <strong>「点位图」</strong> 工作台：
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            点击右上角 <strong>「添加图纸」</strong> 上传 PNG/JPG
            户型图（系统会自动识别并裁切图框适配标准画幅）。
          </li>
          <li>
            按快捷键 <kbd className="rounded border bg-muted px-1 font-mono">A</kbd>{' '}
            切换到「画区域」工具，沿着客厅、主卧、厨房、卫生间等房间轮廓点击描出区域。
          </li>
          <li>
            您可以从右侧面板手动点选「智能设备」或「灯光设计」放置点位；也可以直接点击顶部的{' '}
            <strong>「智能生成点位」</strong> 按钮，一键按房间类型自动排布全屋点位（如不满意可按{' '}
            <kbd className="rounded border bg-muted px-1 font-mono">Ctrl/⌘ + Z</kbd> 一键撤销）。
          </li>
        </ol>
      </section>

      <section id="qs-step3" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">步骤 3：生成报价单并导出客户提案</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          点位布置完成后，点击点位图右上角 <strong>「生成报价」</strong>：
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            系统会自动按点位统计数量并匹配对应型号与单价，您可在报价台随时替换品牌型号或设置整单优惠。
          </li>
          <li>
            切换到项目顶部的 <strong>「归档」</strong> 标签页，即可一键预览并导出 PDF 格式的《8
            章横版方案演示》《报价单》《施工合同》与《施工交底核对清单》。
          </li>
        </ul>
      </section>

      <Callout type="tip" title="想了解智能生成点位的具体规则？">
        点击查看{' '}
        <button
          type="button"
          onClick={() => onNavigate('auto-points')}
          className="font-semibold text-primary underline underline-offset-2"
        >
          03. 智能生成点位与一键撤销
        </button>{' '}
        章节，了解各房间自动配置的设备清单。
      </Callout>
    </article>
  )
}

function SectionMultiplatform() {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          多端协同（Web / 微信小程序 / 桌面客户端）
        </h1>
        <p className="text-sm text-muted-foreground">
          同一套云端账号与 PostgreSQL
          数据库，支持办公室大屏精细设计与工地现场手机端改点核对无缝衔接。
        </p>
      </div>

      <section id="mp-qr" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">1. 微信扫码免密登录电脑端</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          在电脑浏览器或桌面客户端打开 <code className="font-mono">/login</code> 登录页，切换到{' '}
          <strong>「微信扫码」</strong> 标签；打开手机微信小程序进入「我的 →
          扫码登录电脑端」，扫描屏幕二维码并点击确认，电脑端即可在 1 秒内完成自动登录。
        </p>
      </section>

      <section id="mp-mobile" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">2. 微信小程序：竖版上下分屏大视野工作区</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          针对工地现场单手握持手机的操作习惯，小程序端点位图页面采用
          <strong>竖版上下分屏大高度工作区</strong>
          设计：上半屏为可双指缩放平移的高清点位画布，下半屏为房间筛选、设备点选放置与一键智能选型面板，在现场与业主或水电工沟通时可即时增删点位并同步刷新报价。
        </p>
      </section>

      <section id="mp-desktop" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">3. 桌面客户端与本地草稿防丢保护</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          可在公开导航栏{' '}
          <Link href="/download" className="font-medium text-primary underline">
            /download
          </Link>{' '}
          下载 macOS 与 Windows 桌面客户端。同时，点位图工作台内置{' '}
          <strong>1 秒级 LocalStorage 本地草稿保护</strong>
          ：当发生断网或意外关闭标签页时，重新打开项目会自动弹出草稿恢复提示条，点击「恢复」即可找回未保存的改动。
        </p>
      </section>
    </article>
  )
}

function SectionProjects() {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          01. 项目管理与多人团队协作
        </h1>
        <p className="text-sm text-muted-foreground">
          管理进行中与已归档项目，支持业主只读分享链接与团队成员协同编辑。
        </p>
      </div>

      <section id="proj-create" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">项目信息与自动命名规则</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>自动生成项目名称：</strong>新建项目时若不手填项目名称，系统会自动组合「小区/楼盘
            + 房号」（如 <code className="font-mono">西溪壹号·3幢1201</code>）或「客户姓名 +
            全屋智能项目」。
          </li>
          <li>
            <strong>主平台与预算：</strong>选定主平台（米家 / Aqara Home / Apple Home / 华为鸿蒙智家
            / KNX / Control4 / 网络弱电）后，智能选型插件会以此为依据自动过滤兼容型号。
          </li>
          <li>
            <strong>归档与检索：</strong>
            完工交付后的项目可在「归档」页设为「已归档」，项目列表默认只展示进行中的项目，已归档项目随时可恢复为进行中。
          </li>
        </ul>
      </section>

      <section id="proj-share" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">业主只读分享与团队协作</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          在项目概览页右上角点击 <strong>「分享 / 协作」</strong>：
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>
              业主只读分享链接（<code className="font-mono">/share/[token]</code>）：
            </strong>
            开启后任何人凭链接可在线查看项目的点位图、报价单与方案演示，无法修改数据；您可随时重置或关闭分享链接。
          </li>
          <li>
            <strong>
              团队成员协作链接（<code className="font-mono">/join/[id]</code>）：
            </strong>
            发送给团队其他设计师或安装工程师，对方登录并接受邀请后即可共同编辑该项目的点位图、报价与合同。
          </li>
        </ul>
      </section>
    </article>
  )
}

function SectionPointMap({ onNavigate }: { onNavigate: (id: DocSectionId) => void }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          02. 点位图画板（fmkj-board-system）
        </h1>
        <p className="text-sm text-muted-foreground">
          专为全屋智能与灯光设计打造的矢量画板引擎，支持多图纸、比例标定、任意多边形房间区域与标准图例导出。
        </p>
      </div>

      <section id="pm-sheet" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">1. 上传户型图与 DWG 转换</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          支持一个项目内添加多张楼层图纸（如「地下室」「一层平面图」「二层平面图」）。上传
          PNG/JPG/WebP 图片时，内置裁剪器可自动去除 CAD 图框留白并归一化为 3:2 标准图纸；启用「DWG
          转户型图」插件后可直接上传 <code className="font-mono">.dwg</code>{' '}
          文件自动转换为高清底图。
        </p>
      </section>

      <section id="pm-calibrate" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">2. 比例标定与 25cm 真实网格</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          点击画布左上角工具栏的 <strong>「标定比例（快捷键 C）」</strong>
          ，在图纸上沿着一段已知长度的门洞或墙体拖拽画一条线段，松开鼠标后输入真实米数（例如{' '}
          <code className="font-mono">3.6</code> 米）。标定完成后，画布网格将精确按现实{' '}
          <strong>25cm × 25cm</strong>{' '}
          显示，且磁吸轨道灯、灯带等灯具支持开启「按比例」以真实物理尺寸落图。
        </p>
      </section>

      <section id="pm-area" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">3. 多边形房间区域划分</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          点击左上角工具栏 <strong>「画区域（快捷键 A）」</strong>：
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>多边形描边：</strong>
            依次点击房间各个拐角顶点，最后点回起点或双击即可生成任意多边形房间（非常适合 L
            形玄关、异形客厅或斜角阳台）。
          </li>
          <li>
            <strong>矩形拖拽：</strong>在画布空白处直接按住鼠标拖拽即可快速拉出矩形区域。
          </li>
          <li>
            <strong>自动归属统计：</strong>所有落在区域内部的设备点位（含贴墙 16px
            内的开关插座）会自动归属到该房间，用于分房间报价与区域完整度审查。
          </li>
        </ul>
      </section>

      <section id="pm-place" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">4. 设备与灯光放置、导出规范</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          右侧侧栏提供「智能设备」与「灯光设计」两大符号库。点击任意图标即可在画布上连续点击放置（按右键或{' '}
          <kbd className="rounded border bg-muted px-1 font-mono">Esc</kbd>{' '}
          结束放置），也可直接拖拽图标到画布。导出 PNG 点位图时，图纸底部自动附带标准项目图例栏，且
          <strong>图上统一直接展示设备图标而非纯数字编号</strong>。
        </p>
      </section>

      <Callout type="tip" title="想一键排布整张图纸的点位？">
        查看下一章{' '}
        <button
          type="button"
          onClick={() => onNavigate('auto-points')}
          className="font-semibold text-primary underline underline-offset-2"
        >
          03. 智能生成点位与一键撤销
        </button>
        。
      </Callout>
    </article>
  )
}

function SectionAutoPoints() {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            03. 智能生成点位与一键撤销
          </h1>
          <Badge>核心功能</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          根据图纸上的房间区域一键排布全屋智能设备与照明灯具点位，自带覆盖前确认提示与多入口无损撤销。
        </p>
      </div>

      <section id="ap-trigger" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">1. 按钮位置与覆盖确认提示</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          在点位图工作台顶部操作栏（以及画布左上角浮动工具栏）点击带星光图标的{' '}
          <strong>「智能生成点位」</strong> 按钮，系统会弹出确认对话框：
        </p>
        <Callout type="warning" title="覆盖提示与数据安全保证">
          弹窗会明确提示：
          <strong>
            「注意：此操作会覆盖目标图纸上的当前点位（生成后可随时点击『撤销』或按 Ctrl/⌘ + Z
            恢复）」
          </strong>
          ，并实时显示将覆盖的现有设备点位数与已划分的房间区域数。
        </Callout>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>生成范围选择：</strong>
            当项目包含多层图纸时，可选择仅生成「当前图纸」或一次生成「全部图纸」。
          </li>
          <li>
            <strong>照明灯具开关：</strong>
            默认同时生成智能设备与照明灯具（吸顶灯、筒射灯、灯带）；若只需排布弱电与智能控制点位，可关闭「同时生成照明灯具点位」开关。
          </li>
        </ul>
      </section>

      <section id="ap-rules" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">2. 各房间类型智能配点规则</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          若图纸上已划分了房间区域（含多边形或矩形区域），系统会保留您的房间区域并在区域内部自动排布对应点位；若当前图纸尚未划分任何区域，系统会自动创建一套标准户型房间区域（玄关、客厅、餐厅、厨房、主卧、次卧、主卫）并排布点位：
        </p>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">房间类型</th>
                <th className="px-3.5 py-2.5 font-semibold">自动生成的智能设备点位</th>
                <th className="px-3.5 py-2.5 font-semibold">照明灯具点位（开启灯光时）</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3.5 py-2 font-medium">玄关 / 入户</td>
                <td className="px-3.5 py-2 text-muted-foreground">
                  智能门锁、二键开关、人体传感器、入户摄像头
                </td>
                <td className="px-3.5 py-2 text-muted-foreground">筒灯 × 1</td>
              </tr>
              <tr>
                <td className="px-3.5 py-2 font-medium">客厅</td>
                <td className="px-3.5 py-2 text-muted-foreground">
                  智能网关（每层1台）、中控屏、电动窗帘、VRF空调控制（每层1台）、AP、网口、三键开关、客厅摄像头
                </td>
                <td className="px-3.5 py-2 text-muted-foreground">
                  吸顶主灯 × 1、筒灯 × 4、灯带 × 1
                </td>
              </tr>
              <tr>
                <td className="px-3.5 py-2 font-medium">餐厅</td>
                <td className="px-3.5 py-2 text-muted-foreground">二键开关、智能音箱</td>
                <td className="px-3.5 py-2 text-muted-foreground">主灯 × 1、筒灯 × 2</td>
              </tr>
              <tr>
                <td className="px-3.5 py-2 font-medium">厨房</td>
                <td className="px-3.5 py-2 text-muted-foreground">
                  一键开关、烟雾报警器、水浸传感器
                </td>
                <td className="px-3.5 py-2 text-muted-foreground">筒灯 × 2</td>
              </tr>
              <tr>
                <td className="px-3.5 py-2 font-medium">主卧 / 次卧</td>
                <td className="px-3.5 py-2 text-muted-foreground">
                  二键开关 × 2（双控）、电动窗帘、人体传感器、AP、温湿度传感器
                </td>
                <td className="px-3.5 py-2 text-muted-foreground">吸顶灯 × 1、筒灯 × 2</td>
              </tr>
              <tr>
                <td className="px-3.5 py-2 font-medium">书房 / 儿童房</td>
                <td className="px-3.5 py-2 text-muted-foreground">
                  二键开关、电动窗帘、智能音箱/温湿度、网络面板
                </td>
                <td className="px-3.5 py-2 text-muted-foreground">吸顶灯 × 1、筒灯 × 2</td>
              </tr>
              <tr>
                <td className="px-3.5 py-2 font-medium">卫生间</td>
                <td className="px-3.5 py-2 text-muted-foreground">
                  一键开关、人体传感器、水浸传感器
                </td>
                <td className="px-3.5 py-2 text-muted-foreground">筒灯 × 2</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="ap-undo" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">3. 三种一键撤销恢复方式</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          生成操作完整推入画板历史栈（History
          Stack），您可以通过以下任意一种方式立即无损恢复覆盖前的所有点位：
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            生成后页面右下角弹出的成功通知（Toast）上直接点击 <strong>「撤销」</strong> 按钮；
          </li>
          <li>
            点击点位图顶部操作栏或画布左上角浮动工具栏的 <strong>「撤销（Undo）」</strong> 按钮；
          </li>
          <li>
            直接按下键盘快捷键{' '}
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">Ctrl + Z</kbd>（macOS
            为 <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">⌘ + Z</kbd>）。
          </li>
        </ol>
      </section>
    </article>
  )
}

function SectionQuotes() {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          04. 报价台与点位图双向无缝联动
        </h1>
        <p className="text-sm text-muted-foreground">
          点位数量变动一键同步至报价单，支持 728 款产品库快速换型、自由改价与反向定位。
        </p>
      </div>

      <section id="qt-sync" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">1. 点位同步与手动改价保留机制</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          在点位图修改点位后，点击右上角 <strong>「同步到报价」</strong>
          ，系统会自动重新统计各类设备的最新数量与所属房间分布；同时，您在报价单里
          <strong>已经手动替换过的具体产品型号、修改过的单价以及填写的行备注会自动保留</strong>
          ，不会被默认值冲掉。
        </p>
      </section>

      <section id="qt-swap" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">2. 替换产品型号、修改单价与整单优惠</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>替换型号：</strong>点击报价行右侧的「更换产品」，可在 728
            款内置产品库中按品牌（Aqara、小米、华为、易来、领普等）、生态平台或关键词筛选替换。
          </li>
          <li>
            <strong>直接改价：</strong>支持直接在表格内修改任意设备的销售单价、数量与行说明。
          </li>
          <li>
            <strong>优惠与附加费：</strong>
            支持设置整单减免优惠金额，以及按固定金额或百分比添加「安装调试费」「线材辅料费」等附加服务费。
          </li>
        </ul>
      </section>

      <section id="qt-locate" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">3. 从报价单反跳点位图定位</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          在报价单中核对某间房或某个点位代号（如 <code className="font-mono">K1</code>、
          <code className="font-mono">L12</code>
          ）时，点击对应代号即可一键跳回点位图工作台，画布会自动平滑缩放并高亮聚焦到该点位或房间区域。
        </p>
      </section>
    </article>
  )
}

function SectionContracts() {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          05. 施工合同与分期收款管理
        </h1>
        <p className="text-sm text-muted-foreground">
          基于确认报价单自动生成正式施工合同，规范管理三阶段付款比例与收款进度。
        </p>
      </div>

      <section id="ct-stages" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">1. 三阶段付款比例与金额自动核算</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          新建合同时自动关联项目最新确认的报价单总金额。默认提供三阶段付款节点（例如：
          <strong>签约首付 40% → 设备进场 50% → 完工验收 10%</strong>
          ），系统强制校验各期比例之和必须等于 100%，并自动折算每期应付人民币金额与大写金额。
        </p>
      </section>

      <section id="ct-terms" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">2. 默认条款复用与签约收款状态流转</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          您可以在工作台左侧「设置」中预先配置贵司的标准合同条款、质保月数（默认 12
          个月）与工期天数（默认 15 天）。合同支持「草稿 → 已签署 → 履行中 →
          已完结」状态流转，并可逐期勾选「已收款」。
        </p>
      </section>
    </article>
  )
}

function SectionArchive() {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          06. 归档导出与一键业主交付资料包
        </h1>
        <p className="text-sm text-muted-foreground">
          在项目「归档」中心统一管理面向业主汇报与面向施工团队交底的全套 PDF 文档。
        </p>
      </div>

      <section id="ar-docs" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">1. 全套交付单据矩阵</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>
              8 章 A4 横版方案演示（<code className="font-mono">/print/projects/[id]/proposal</code>
              ）：
            </strong>
            包含封面、设计理念、楼层点位平面图（直接显示设备图标）、AC+AP
            网络与中控拓扑图、各房间配置清单、全屋智能联动场景、预算投资汇总与服务验收确认。
          </li>
          <li>
            <strong>
              多风格报价单（<code className="font-mono">/print/quotes/[id]</code>）：
            </strong>
            支持 6 种排版版式 × 7 套视觉风格一键切换并导出 PDF。
          </li>
          <li>
            <strong>
              正式施工合同（<code className="font-mono">/print/contracts/[id]</code>）：
            </strong>
            含甲乙方信息、设备汇总、分期付款表、质保条款与签字盖章区。
          </li>
          <li>
            <strong>
              A4 横版点位布置图（<code className="font-mono">/print/projects/[id]/plans</code>）：
            </strong>
            按楼层分页输出高清点位平面图与图例统计表。
          </li>
          <li>
            <strong>
              施工交底核对清单（<code className="font-mono">/print/projects/[id]/checklist</code>
              ）：
            </strong>
            专为现场安装团队生成，<strong>自动隐去所有单价与总价信息</strong>
            ，仅保留房间、点位代号、型号规格與安装打勾核对栏。
          </li>
          <li>
            <strong>工程扩展单据（需开启对应插件）：</strong>
            现场勘测单、强弱电布线与空开回路表、采购与备货核验单、场景与账号移交单。
          </li>
        </ul>
      </section>

      <section id="ar-bundle" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">2. 业主交付资料包（合并 PDF / ZIP 打包下载）</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          在归档页勾选任意几份交付单据，点击 <strong>「合并导出单份 PDF」</strong> 或{' '}
          <strong>「打包下载 ZIP 资料包」</strong>
          ，系统会自动在服务端渲染并合成为标准命名的完整交付包。
        </p>
      </section>
    </article>
  )
}

function SectionMembership() {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AI 积分与充值</h1>
        <p className="text-sm text-muted-foreground">
          平台已取消会员分级：项目数、协作成员、AI 模型、方案模板与插件全部对所有账号开放，使用 AI
          能力时统一按积分扣除。
        </p>
      </div>

      <section id="mb-balance" className="scroll-mt-20 space-y-3">
        <h2 className="text-base font-semibold">1. 积分余额与流水</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          前往工作台{' '}
          <Link href="/membership" className="font-medium text-primary underline">
            /membership
          </Link>{' '}
          页面，或在左下角头像菜单点击「积分与账单」，即可查看当前 AI 积分余额与最近 30
          条积分流水。每次 AI 对话会按「模型倍率 × Token 用量 +
          工具调用附加积分」扣减，并记入流水（余额与流水见{' '}
          <code className="font-mono">src/collections/AiCreditLedger.ts</code>）。
        </p>
      </section>

      <section id="mb-redeem" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">2. 兑换码充值</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          在「积分与账单」页或头像菜单的兑换弹窗中，输入格式如{' '}
          <code className="font-mono">FMKJ-XXXX-XXXX-XXXX</code> 的兑换码即可直接充值 AI
          积分，余额实时到账，您已创建的所有项目、点位图与报价数据不受影响。
        </p>
      </section>

      <section id="mb-tasks" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">3. 绑定与成长任务奖励</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          「积分与账单」页还提供一次性任务奖励：绑定电子邮箱赠 10 积分、绑定微信小程序赠 10
          积分、关注官方公众号赠 5 积分、完善报价抬头赠 5 积分、生成首份报价单赠 5
          积分。每项任务每个账号终生仅可领取一次，达成条件后自动或点击领取记入积分流水。
        </p>
      </section>
    </article>
  )
}

function SectionAiModels({ manual }: { manual: ManualData }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">纯国产 AI 大模型矩阵</h1>
        <p className="text-sm text-muted-foreground">
          全站仅选用国内合规优质大模型（DeepSeek、阿里通义千问 Qwen、字节豆包、智谱 GLM、月之暗面
          Kimi），所有模型对所有账号开放，按计费倍率扣减 AI 积分。
        </p>
      </div>

      <section id="am-policy" className="scroll-mt-20 space-y-2">
        <h2 className="text-base font-semibold">1. 模型倍率与后台统一管控说明</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>高速档（1x 倍率）：</strong>面向日常高速对话、产品库检索与基础点位规划。
          </li>
          <li>
            <strong>视觉多模态与长文本档（2x 倍率）：</strong>面向复杂
            CAD/户型图点位视觉识别、高定提案话术润色与长清单核对。
          </li>
          <li>
            <strong>深度推理旗舰档（3x 倍率）：</strong>
            面向多层别墅全案点位回路审查、跨生态协议架构规划与整案预算精算优化。
          </li>
        </ul>
        <Callout type="note" title="后台统一管控（客户不可自行修改模型配置）">
          平台上开放给客户使用的模型列表、接口渠道与计费倍率，均由平台超级管理员在 Payload
          管理后台（<code className="font-mono">/admin/globals/ai-settings</code>
          ）统一维护，下表实时同步自后台当前配置。
        </Callout>
      </section>

      <section id="am-table" className="scroll-mt-20 space-y-3">
        <h2 className="text-base font-semibold">2. 当前可用国产模型与计费倍率表</h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-semibold">模型名称</th>
                <th className="px-3 py-2.5 font-semibold">接入渠道</th>
                <th className="px-3 py-2.5 text-center font-semibold">计费倍率</th>
                <th className="px-4 py-2.5 font-semibold">适用场景说明</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {manual.models.map((m) => (
                <tr key={`${m.provider}-${m.apiModel}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{m.name}</span>
                    <code className="ml-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {m.apiModel}
                    </code>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{m.provider}</td>
                  <td className="px-3 py-2.5 text-center font-mono font-semibold tabular-nums">
                    {m.cost}x
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}

function SectionAiBilling({ manual }: { manual: ManualData }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          AI 积分计费公式与工具调用费率
        </h1>
        <p className="text-sm text-muted-foreground">
          本章节直接引用计费引擎常量（
          <code className="font-mono">src/plugins/ai-copilot/billing.ts</code>
          ），透明公示每一分积分的计算方式。
        </p>
      </div>

      <section id="ab-formula" className="scroll-mt-20 space-y-3">
        <h2 className="text-base font-semibold">1. Token 与模型倍率计费公式</h2>
        <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4 space-y-3">
          <p className="font-mono text-xs font-semibold text-foreground">
            单次对话扣除积分 = 向上取整( 模型计费倍率 × [ (输入 Tokens ÷ 1000) ×{' '}
            {manual.billing.inputPer1k} + (输出 Tokens ÷ 1000) × {manual.billing.outputPer1k} ] + Σ
            工具调用附加积分 )
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">输入 Token 单价（1x 基准）</p>
              <p className="mt-1 text-sm font-bold tabular-nums">
                {manual.billing.inputPer1k} 积分 / 1K Tokens
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">输出 Token 单价（含深度思考链）</p>
              <p className="mt-1 text-sm font-bold tabular-nums">
                {manual.billing.outputPer1k} 积分 / 1K Tokens
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">最低扣费与失败保护</p>
              <p className="mt-1 text-sm font-bold">单次最少 1 积分 · 失败 0 扣费</p>
            </div>
          </div>
        </div>
      </section>

      <section id="ab-tools" className="scroll-mt-20 space-y-3">
        <h2 className="text-base font-semibold">2. 14 项系统工具调用附加费率表</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          当 AI
          助手替您执行系统操作（如查询产品库、上传户型图识别、一键选型或生成报价单）时，会按所调用的工具累加以下附加积分：
        </p>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-semibold">工具名称與标识</th>
                <th className="px-3 py-2.5 font-semibold">分类</th>
                <th className="px-3 py-2.5 text-center font-semibold">每次调用附加积分</th>
                <th className="px-4 py-2.5 font-semibold">操作说明</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {manual.billing.tools.map((t) => (
                <tr key={t.toolName}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{t.label}</span>
                    <code className="ml-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {t.toolName}
                    </code>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {t.category}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-semibold text-primary tabular-nums">
                    +{t.cost}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{t.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}

function SectionPlugins({ manual }: { manual: ManualData }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          能力中心全览（共 {manual.plugins.length} 项）
        </h1>
        <p className="text-sm text-muted-foreground">
          外围能力统一收录在「能力中心」（<code className="font-mono">/plugins</code>
          ），点开即用、按 AI 积分计费，不需要安装或启停。
        </p>
      </div>

      <section id="pl-list" className="scroll-mt-20">
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-semibold">插件名称</th>
                <th className="px-3 py-2.5 font-semibold">挂载位置</th>
                <th className="px-4 py-2.5 font-semibold">功能说明</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {manual.plugins.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.where}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}

function SectionTemplates({ manual }: { manual: ManualData }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          方案演示模板与报价视觉风格
        </h1>
        <p className="text-sm text-muted-foreground">
          同一份项目数据可随时切换不同的提案主题与报价单视觉风格，满足从现代极简到顶奢新中式别墅的汇报需求。
        </p>
      </div>

      <section id="tp-proposal" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            1. 方案演示模板与施工交底（共 {manual.proposalTemplates.length} 套）
          </h2>
          <Button asChild variant="outline" size="xs">
            <Link href="/templates">
              打开方案模板库（看封面与整套样张）
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-semibold">模板名称</th>
                <th className="px-3 py-2.5 font-semibold">适合什么客户</th>
                <th className="px-4 py-2.5 font-semibold">什么时候用 / 外观特点</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {manual.proposalTemplates.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/templates/${t.id}`} className="font-semibold hover:underline">
                      {t.name}
                    </Link>
                    <code className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      {t.id}
                    </code>
                  </td>
                  <td className="px-3 py-2.5">{t.audience}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <span>{t.occasion}</span>
                    {t.highlights.length ? (
                      <span className="mt-0.5 block text-[11px]">
                        特点：{t.highlights.join(' · ')}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="tp-styles" className="scroll-mt-20 space-y-3">
        <h2 className="text-base font-semibold">
          2. 报价单与合同视觉风格包（共 {manual.docStyles.length} 套）
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {manual.docStyles.map((s) => (
            <div key={s.id} className="rounded-xl border p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{s.name}</span>
                <Badge variant={s.isBuiltin ? 'secondary' : 'outline'} className="text-[10px]">
                  {s.isBuiltin ? '内置风格' : '扩展风格包'}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}

function SectionDevices({ manual }: { manual: ManualData }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          设备图例分类与点位编号规则
        </h1>
        <p className="text-sm text-muted-foreground">
          画布放置点位时会自动按所属设备大类的字母前缀递增生成唯一点位代号（删掉中间点位也不会重号）。
        </p>
      </div>

      <section id="dv-table" className="scroll-mt-20">
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-semibold">设备大类</th>
                <th className="px-3 py-2.5 text-center font-semibold">编号前缀</th>
                <th className="px-4 py-2.5 font-semibold">包含的标准设备类型</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {manual.deviceCategories.map((cat) => (
                <tr key={cat.categoryName}>
                  <td className="px-4 py-2.5 font-semibold">{cat.categoryName}</td>
                  <td className="px-3 py-2.5 text-center">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold text-primary">
                      {cat.codePrefix}1, {cat.codePrefix}2…
                    </code>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{cat.types.join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}

function SectionShortcuts({ manual }: { manual: ManualData }) {
  return (
    <article className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">点位图画板快捷键速查表</h1>
        <p className="text-sm text-muted-foreground">
          在点位图工作台（<code className="font-mono">/projects/[id]/point-map</code>
          ）中使用键盘快捷键可大幅提升绘图效率。
        </p>
      </div>

      <section id="sc-table" className="scroll-mt-20">
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="w-48 px-4 py-2.5 font-semibold">快捷键</th>
                <th className="px-4 py-2.5 font-semibold">功能说明</th>
                <th className="px-4 py-2.5 text-right font-semibold">生效范围</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {manual.shortcuts.map((s) => (
                <tr key={s.keys}>
                  <td className="px-4 py-2.5">
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">
                      {s.keys}
                    </kbd>
                  </td>
                  <td className="px-4 py-2.5">{s.action}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{s.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}
