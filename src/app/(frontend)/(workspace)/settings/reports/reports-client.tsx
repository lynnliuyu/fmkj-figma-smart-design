'use client'

import { EmptyState } from '@/components/empty-state'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FolderKanban,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CustomerUsageReport } from '@/lib/usage-diagnostics'
import { cn } from '@/lib/utils'

function formatDateTime(iso: string) {
  if (!iso || iso.startsWith('1970-')) return '暂无记录'
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function methodLabel(m?: string) {
  switch (m) {
    case 'dxf-vector':
      return {
        text: 'DXF 矢量提取',
        cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      }
    case 'vision-snap':
      return { text: '视觉模型 + 磁吸', cls: 'border-primary/30 bg-primary/10 text-primary' }
    case 'vision-fusion':
      return { text: '本地识别 + 视觉复核', cls: 'border-primary/30 bg-primary/10 text-primary' }
    case 'non-plan':
      return {
        text: '非图纸图片（仅看图）',
        cls: 'border-border bg-muted/60 text-muted-foreground',
      }
    case 'cad-color':
      return {
        text: 'CAD 彩色图层',
        cls: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
      }
    case 'cad-bw':
      return {
        text: 'CAD 黑白几何',
        cls: 'border-muted-foreground/30 bg-muted text-muted-foreground',
      }
    case 'empty':
      return {
        text: '0 点位（无符号）',
        cls: 'border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-400',
      }
    default:
      return { text: '标准识别', cls: 'border-border bg-muted/60 text-muted-foreground' }
  }
}

export function UsageReportsClient({ report }: { report: CustomerUsageReport }) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [onlyZeroSheet, setOnlyZeroSheet] = useState(false)
  const [previewImg, setPreviewImg] = useState<{ url: string; title: string } | null>(null)

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return report.customers
    return report.customers.filter((c) =>
      `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q),
    )
  }, [report.customers, customerQuery])

  const filteredSheets = useMemo(() => {
    if (!onlyZeroSheet) return report.sheetInspections
    return report.sheetInspections.filter((s) => s.pointCount === 0)
  }, [report.sheetInspections, onlyZeroSheet])

  function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 600)
  }

  function exportCsv() {
    const headers = [
      '客户姓名',
      '邮箱',
      '电话',
      '剩余积分',
      '已消耗积分',
      '创建项目数',
      '上传图纸数',
      '识别点位数',
      '生成报价数',
      '生成合同数',
      'AI对话数',
      'AI消息数',
      '最近活跃时间',
    ]
    const rows = report.customers.map((c) => [
      c.name,
      c.email,
      c.phone,
      c.aiCredits,
      c.creditsConsumed,
      c.projectCount,
      c.sheetCount,
      c.pointCount,
      c.quoteCount,
      c.contractCount,
      c.conversationCount,
      c.messageCount,
      formatDateTime(c.lastActiveAt),
    ])
    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `繁梦空间-客户使用报告-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('已导出 CSV 客户使用报表')
  }

  function copyMarkdownDigest() {
    const k = report.kpis
    const lines = [
      `# 繁梦空间 · 客户使用与运维巡检日报（${formatDateTime(report.generatedAt)}）`,
      `- 客户总数：${k.totalCustomers} 人（近 7 日活跃：${k.activeCustomers7d} 人）`,
      `- 业务转化：项目 ${k.totalProjects} 个 → 户型图纸 ${k.totalSheets} 张（其中 0 点位待确认 ${k.zeroPointSheets} 张） → 报价单 ${k.totalQuotes} 份 → 合同 ${k.totalContracts} 份`,
      `- AI 运行：累计消息 ${k.totalAiMessages} 条，消耗积分 ${k.totalCreditsConsumed}，捕获异常 ${k.aiErrorCount} 次`,
      '',
      '## 模型调用分布',
      ...(report.modelStats.length
        ? report.modelStats.map(
            (m) =>
              `- ${m.model}：调用 ${m.calls} 次（其中 Auto 自动路由 ${m.autoRoutedCount} 次），消耗 ${m.credits} 积分`,
          )
        : ['- 暂无记录']),
      '',
      '## 最近活跃客户 Top 5',
      ...report.customers
        .slice(0, 5)
        .map(
          (c) =>
            `- ${c.name}：项目 ${c.projectCount} / 图纸 ${c.sheetCount} / 报价 ${c.quoteCount} / 剩余积分 ${c.aiCredits}（最后活跃：${formatDateTime(c.lastActiveAt)}）`,
        ),
    ]
    if (report.errorLogs.length > 0) {
      lines.push(
        '',
        '## 最近 AI 报错记录',
        ...report.errorLogs
          .slice(0, 5)
          .map(
            (e) =>
              `- [${formatDateTime(e.createdAt)}] ${e.userName} (${e.modelName})：${e.errorMessage} | 指令：${e.promptPreview}`,
          ),
      )
    }
    void navigator.clipboard?.writeText(lines.join('\n'))
    setCopiedSummary(true)
    toast.success('已复制 Markdown 运维巡检日报')
    setTimeout(() => setCopiedSummary(false), 1500)
  }

  const { kpis } = report

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            href="/settings"
            as={Link}
            icon={<ArrowLeft />}
            label="返回设置"
          />
          <span className="text-xs text-muted-foreground">
            数据生成于 {formatDateTime(report.generatedAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            isDisabled={refreshing}
            icon={<RefreshCw />}
            label="刷新数据"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={copyMarkdownDigest}
            icon={<Check />}
            label="复制巡检日报"
          />
          <Button size="sm" onClick={exportCsv} icon={<Download />} label="导出 CSV 报表" />
        </div>
      </div>

      {/* 4 张核心运维指标卡 */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>客户总数与近 7 日活跃</span>
              <Users className="size-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.totalCustomers}{' '}
              <span className="text-sm font-normal text-muted-foreground">人</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            近 7 日活跃客户：
            <span className="font-medium text-foreground tabular-nums">
              {kpis.activeCustomers7d}
            </span>{' '}
            人
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>项目与户型图纸识别</span>
              <FileImage className="size-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.totalProjects}{' '}
              <span className="text-sm font-normal text-muted-foreground">项目</span> ·{' '}
              {kpis.totalSheets}{' '}
              <span className="text-sm font-normal text-muted-foreground">图纸</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            0 点位图纸预警：
            <span
              className={cn(
                'ml-1 font-medium tabular-nums',
                kpis.zeroPointSheets > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
              )}
            >
              {kpis.zeroPointSheets} 张
            </span>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>报价单与施工合同转化</span>
              <FolderKanban className="size-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.totalQuotes}{' '}
              <span className="text-sm font-normal text-muted-foreground">报价</span> ·{' '}
              {kpis.totalContracts}{' '}
              <span className="text-sm font-normal text-muted-foreground">合同</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            项目出单转化率：
            <span className="ml-1 font-medium text-foreground tabular-nums">
              {kpis.totalProjects > 0
                ? `${Math.min(100, Math.round((kpis.totalQuotes / kpis.totalProjects) * 100))}%`
                : '0%'}
            </span>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>AI 调用与异常监控</span>
              <Bot className="size-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.totalAiMessages}{' '}
              <span className="text-sm font-normal text-muted-foreground">条消息</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between pt-0 text-xs text-muted-foreground">
            <span>
              累计扣减：
              <strong className="font-medium text-foreground tabular-nums">
                {kpis.totalCreditsConsumed}
              </strong>{' '}
              积分
            </span>
            <span
              className={cn(
                'font-medium tabular-nums',
                kpis.aiErrorCount > 0
                  ? 'text-destructive'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {kpis.aiErrorCount > 0 ? `${kpis.aiErrorCount} 条异常` : '运行正常'}
            </span>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="customers" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="customers">客户使用明细 ({report.customers.length})</TabsTrigger>
          <TabsTrigger value="sheets">
            图纸识别复盘 ({report.sheetInspections.length})
            {kpis.zeroPointSheets > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                {kpis.zeroPointSheets} 待查
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="ai">
            AI 模型与对话追踪 ({report.recentConversations.length})
          </TabsTrigger>
          <TabsTrigger value="errors">
            异常与排障日志 ({report.errorLogs.length})
            {report.errorLogs.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.2 text-[10px] font-semibold text-destructive">
                {report.errorLogs.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 客户使用明细 */}
        <TabsContent value="customers" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-base">客户全链路使用统计</CardTitle>
                <CardDescription>
                  按最近活跃时间排序，快速定位每位客户在「建项目 → 传图纸 → 落点位 → 出报价 →
                  签合同」各环节的使用深度
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <TextInput
                  label={'搜索客户姓名、邮箱、电话…'}
                  isLabelHidden
                  value={customerQuery}
                  onChange={(v) => setCustomerQuery(v)}
                  placeholder="搜索客户姓名、邮箱、电话…"
                  controlClassName="h-8 pl-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-y bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">客户 / 账号</th>
                      <th className="px-3 py-2.5 text-right font-medium">剩余 / 已用积分</th>
                      <th className="px-3 py-2.5 text-right font-medium">项目数</th>
                      <th className="px-3 py-2.5 text-right font-medium">户型图 / 点位</th>
                      <th className="px-3 py-2.5 text-right font-medium">报价 / 合同</th>
                      <th className="px-3 py-2.5 text-right font-medium">AI 对话 / 消息</th>
                      <th className="px-4 py-2.5 text-right font-medium">最近活跃</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                          没有匹配的客户记录
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((c) => (
                        <tr key={c.userId} className="hover:bg-muted/35">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-foreground">{c.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {c.email}
                              {c.phone ? ` · ${c.phone}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <span
                              className={cn('font-medium', c.aiCredits < 5 && 'text-destructive')}
                            >
                              {c.aiCredits}
                            </span>
                            <span className="text-muted-foreground"> / {c.creditsConsumed}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                            {c.projectCount}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {c.sheetCount} 张{' '}
                            <span className="text-muted-foreground">({c.pointCount} 点)</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {c.quoteCount}{' '}
                            <span className="text-muted-foreground">/ {c.contractCount}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {c.conversationCount}{' '}
                            <span className="text-muted-foreground">({c.messageCount} 条)</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                            {formatDateTime(c.lastActiveAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: 图纸识别复盘 */}
        <TabsContent value="sheets" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-base">客户上传图纸与点位识别诊断</CardTitle>
                <CardDescription>
                  当客户反馈「图纸没识别出来」或「开关数量不对」时，可在此直接点击缩略图查看客户上传的原图，或一键进入该项目点位图协助处理
                </CardDescription>
              </div>
              <Button
                variant={onlyZeroSheet ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setOnlyZeroSheet((v) => !v)}
                className="text-xs"
                icon={<AlertTriangle />}
                label={
                  onlyZeroSheet
                    ? '显示全部图纸'
                    : `只看 0 点位图纸（${report.sheetInspections.filter((x) => x.pointCount === 0).length}）`
                }
              />
            </CardHeader>
            <CardContent>
              {filteredSheets.length === 0 ? (
                <EmptyState compact title="暂无符合条件的图纸记录" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredSheets.map((sh) => {
                    const mBadge = methodLabel(sh.method)
                    return (
                      <div
                        key={sh.id}
                        className="flex flex-col justify-between rounded-[var(--radius-container)] border bg-card p-3 shadow-2xs"
                      >
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImg({
                                url: sh.url,
                                title: `${sh.projectName} · ${sh.sheetName}`,
                              })
                            }
                            className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border bg-muted"
                            title="点击放大查看客户上传的原图"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={sh.url}
                              alt={sh.sheetName}
                              className="size-full object-cover transition-transform group-hover:scale-105"
                            />
                          </button>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate text-xs font-semibold text-foreground">
                                {sh.sheetName}
                              </span>
                              <span
                                className={cn(
                                  'shrink-0 rounded border px-1.5 py-0.2 text-[10px] font-medium',
                                  mBadge.cls,
                                )}
                              >
                                {mBadge.text}
                              </span>
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              项目：{sh.projectName}（{sh.ownerName}）
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs tabular-nums">
                              <span
                                className={cn(
                                  'font-medium',
                                  sh.pointCount === 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-foreground',
                                )}
                              >
                                总点位 {sh.pointCount}
                              </span>
                              <span className="text-muted-foreground">开关 {sh.switchCount}</span>
                              <span className="text-muted-foreground">灯具 {sh.lightCount}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                          <span>{formatDateTime(sh.updatedAt)}</span>
                          <Link
                            href={`/projects/${sh.projectId}/point-map`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            打开点位图排查
                            <ExternalLink className="size-3" />
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {report.uploadLogs.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">最近实时上传识别耗时流水</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-y bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">时间</th>
                        <th className="px-3 py-2 font-medium">上传文件名</th>
                        <th className="px-3 py-2 font-medium">识别通道</th>
                        <th className="px-3 py-2 text-right font-medium">开关 / 灯具 / 区域</th>
                        <th className="px-4 py-2 text-right font-medium">识别耗时</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.uploadLogs.slice(0, 15).map((u) => {
                        const mb = methodLabel(u.method)
                        return (
                          <tr key={u.id}>
                            <td className="px-4 py-2 text-muted-foreground tabular-nums">
                              {formatDateTime(u.createdAt)}
                            </td>
                            <td className="px-3 py-2 font-medium">{u.fileName}</td>
                            <td className="px-3 py-2">
                              <span
                                className={cn('rounded border px-1.5 py-0.2 text-[10px]', mb.cls)}
                              >
                                {mb.text}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              开关 {u.switches} · 灯具 {u.lights} · 区域 {u.areas}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                              {u.durationMs} ms
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Tab 3: AI 模型与对话追踪 */}
        <TabsContent value="ai" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">模型调用与 Auto 路由分布</CardTitle>
                <CardDescription className="text-xs">
                  统计各底层模型的实际调用次数、Auto 自动路由命中次数与消耗积分
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.modelStats.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    暂无模型调用记录
                  </div>
                ) : (
                  report.modelStats.map((m) => (
                    <div
                      key={m.model}
                      className="flex items-center justify-between rounded-lg border bg-muted/25 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-foreground">{m.model}</span>
                        {m.autoRoutedCount > 0 ? (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                            Auto 路由 {m.autoRoutedCount} 次
                          </span>
                        ) : null}
                      </div>
                      <div className="text-right tabular-nums">
                        <span className="font-medium">{m.calls} 次</span>
                        <span className="ml-2 text-muted-foreground">· {m.credits} 积分</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">系统工具调用排行榜</CardTitle>
                <CardDescription className="text-xs">
                  客户在 AI 对话中最常触发的自动化工具
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.toolStats.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    暂无工具调用记录
                  </div>
                ) : (
                  report.toolStats.map((t) => (
                    <div
                      key={t.toolName}
                      className="flex items-center justify-between rounded-lg border bg-muted/25 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-foreground">{t.toolName}</span>
                      <span className="font-medium tabular-nums">{t.calls} 次</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">最近客户 AI 对话会话追踪</CardTitle>
              <CardDescription className="text-xs">
                查看客户最近在用 AI 处理什么项目、调用了几个工具以及最后回复摘要
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-y bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">时间</th>
                      <th className="px-3 py-2.5 font-medium">客户</th>
                      <th className="px-3 py-2.5 font-medium">对话标题 / 关联项目</th>
                      <th className="px-3 py-2.5 font-medium">调度模型</th>
                      <th className="px-3 py-2.5 text-right font-medium">消息 / 工具 / 积分</th>
                      <th className="px-4 py-2.5 font-medium">AI 最后回复摘要</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.recentConversations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          暂无对话记录
                        </td>
                      </tr>
                    ) : (
                      report.recentConversations.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/35">
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                            {formatDateTime(c.updatedAt)}
                          </td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                            {c.userName}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="max-w-48 truncate font-medium">{c.title}</div>
                            {c.projectName ? (
                              <div className="max-w-48 truncate text-[11px] text-muted-foreground">
                                项目：{c.projectName}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              {c.model}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                            {c.messageCount} 条 · {c.toolCount} 工具 · {c.totalCost} 分
                          </td>
                          <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground">
                            {c.lastAssistantPreview || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: 异常与排障日志 */}
        <TabsContent value="errors" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" />
                AI 与接口异常排障中心
              </CardTitle>
              <CardDescription>
                自动捕获 AI
                密钥失效（401）、余额不足（402）、网关拦截（403）、限流（429）或超时等异常。点击右侧复制按钮即可将完整排障上下文复制出来定位问题。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.errorLogs.length === 0 ? (
                <EmptyState
                  compact
                  title="当前系统运行良好"
                  description="没有捕获到 AI 对话或工具异常记录"
                />
              ) : (
                <div className="space-y-2.5">
                  {report.errorLogs.map((err) => (
                    <div
                      key={err.id}
                      className="flex flex-col gap-1.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="error"
                            className="px-1.5 py-0 text-[10px]"
                            label={'异常'}
                          />
                          <span className="font-semibold text-foreground">{err.errorMessage}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>{formatDateTime(err.createdAt)}</span>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => {
                              const text = `[排障日志] 时间: ${err.createdAt}\n客户: ${err.userName} (${err.userId})\n模型: ${err.modelName} (${err.modelId})\n项目ID: ${err.projectId ?? '无'}\n用户指令: ${err.promptPreview}\n报错信息: ${err.errorMessage}`
                              void navigator.clipboard?.writeText(text)
                              toast.success('已复制该条排障上下文')
                            }}
                            icon={<Copy />}
                            label="复制排障信息"
                          />
                        </div>
                      </div>
                      <div className="text-muted-foreground">
                        客户：<strong className="text-foreground">{err.userName}</strong> · 模型：
                        <strong className="text-foreground">{err.modelName}</strong>
                        {err.promptPreview ? ` · 触发指令：「${err.promptPreview}」` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 原图放大预览弹窗 */}
      {previewImg ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl border bg-background shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-4 py-2.5 text-sm font-medium">
              <span>{previewImg.title}</span>
              <Button variant="ghost" size="sm" onClick={() => setPreviewImg(null)} label="关闭" />
            </div>
            <div className="overflow-auto bg-muted/40 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImg.url}
                alt={previewImg.title}
                className="max-h-[78vh] w-auto rounded border bg-white object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
