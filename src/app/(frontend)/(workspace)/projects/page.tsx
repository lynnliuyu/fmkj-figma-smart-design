import { StatTile } from '@/components/stat-tile'
import Form from 'next/form'
import Link from 'next/link'
import { FolderKanban, Plus, Search, Sparkles } from 'lucide-react'
import type { Where } from 'payload'

import { EmptyState } from '@/components/empty-state'
import { FilterTabs } from '@/components/filter-tabs'
import { PageHeader } from '@/components/page-header'
import { SearchSubmit } from '@/components/search-submit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { getPayloadClient } from '@/lib/payload'
import { countScenePoints } from '@/lib/point-count'
import { fmtDate } from '@/lib/projects'
import { yuan } from '@/lib/quotes'
import { isDemoProjectName, projectDisplayName } from '@/lib/project-name'

import { claimDemoProject } from './actions'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('项目') }

type Amount = { value: number; caption: string }

/** 系统为新成员发放的示例项目，名称带「【示例】」前缀 */
const isDemo = isDemoProjectName

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>
}) {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const { q = '', view = '' } = await searchParams
  const archived = view === 'archived'
  const keyword = q.trim()
  const payload = await getPayloadClient()

  const statusWhere: Where = archived
    ? { status: { equals: 'archived' } }
    : { status: { not_equals: 'archived' } }
  const where: Where = keyword
    ? {
        and: [
          statusWhere,
          {
            or: [
              { name: { like: keyword } },
              { customerName: { like: keyword } },
              { community: { like: keyword } },
              { address: { like: keyword } },
              { customerPhone: { like: keyword } },
            ],
          },
        ],
      }
    : statusWhere

  const [result, activeCount, archivedCount] = await Promise.all([
    payload.find({
      collection: 'projects',
      where,
      depth: 0,
      limit: 500,
      sort: '-updatedAt',
      user,
      overrideAccess: false,
      // 列表只取显示用的字段，不读取点位图
      select: {
        name: true,
        customerName: true,
        community: true,
        platform: true,
        status: true,
        pointCount: true,
        updatedAt: true,
      },
    }),
    payload.count({
      collection: 'projects',
      where: { status: { not_equals: 'archived' } },
      user,
      overrideAccess: false,
    }),
    payload.count({
      collection: 'projects',
      where: { status: { equals: 'archived' } },
      user,
      overrideAccess: false,
    }),
  ])
  const projects = result.docs
  const ids = projects.map((p) => p.id)

  // 还没有点位数统计的旧项目：一次查询补算（下次保存点位图时会写入）
  const legacy = projects.filter((p) => p.pointCount == null).map((p) => p.id)
  if (legacy.length) {
    const maps = await payload.find({
      collection: 'projects',
      where: { id: { in: legacy } },
      depth: 0,
      limit: legacy.length,
      user,
      overrideAccess: false,
      select: { pointMap: true },
    })
    const counts = new Map(maps.docs.map((d) => [d.id, countScenePoints(d.pointMap)]))
    for (const p of projects) if (p.pointCount == null) p.pointCount = counts.get(p.id) ?? 0
  }

  // 每个项目的报价数量、要展示的金额和合同状态：两次批量查询，不按项目逐个查
  const [quotes, contracts] = ids.length
    ? await Promise.all([
        payload.find({
          collection: 'quotes',
          where: { project: { in: ids } },
          depth: 0,
          limit: 2000,
          sort: '-updatedAt',
          user,
          overrideAccess: false,
          select: { project: true, total: true, status: true },
        }),
        payload.find({
          collection: 'contracts',
          where: { project: { in: ids } },
          depth: 0,
          limit: 500,
          user,
          overrideAccess: false,
          select: { project: true, status: true, amount: true },
        }),
      ])
    : [{ docs: [] }, { docs: [] }]

  const quoteStats = new Map<string, { count: number; latest: number; accepted: number | null }>()
  for (const quote of quotes.docs) {
    const pid = relId(quote.project)
    if (!pid) continue
    const stat = quoteStats.get(pid) ?? { count: 0, latest: quote.total ?? 0, accepted: null }
    stat.count++
    if (quote.status === 'accepted' && stat.accepted === null) stat.accepted = quote.total ?? 0
    quoteStats.set(pid, stat)
  }
  const contractOf = new Map(contracts.docs.map((c) => [relId(c.project), c]))

  const amountOf = (pid: string): Amount | null => {
    const contract = contractOf.get(pid)
    if (contract) return { value: contract.amount ?? 0, caption: '合同金额' }
    const stat = quoteStats.get(pid)
    if (!stat) return null
    return stat.accepted !== null
      ? { value: stat.accepted, caption: '已确认报价' }
      : { value: stat.latest, caption: '最新报价' }
  }

  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, view, ...patch })
    for (const [k, v] of [...params]) if (!v) params.delete(k)
    const s = params.toString()
    return s ? `/projects?${s}` : '/projects'
  }

  // 账号名下（含已归档）没有示例项目时，提供「领取示例项目」
  const demoCount = await payload.count({
    collection: 'projects',
    where: { and: [{ owner: { equals: user.id } }, { name: { like: '【示例】' } }] },
    overrideAccess: false,
    user,
  })
  const canClaimDemo = demoCount.totalDocs === 0
  const totalPoints = projects.reduce((sum, p) => sum + (p.pointCount ?? 0), 0)
  const totalQuoteAmount = projects.reduce((sum, p) => {
    const a = amountOf(String(p.id))
    return sum + (a?.value ?? 0)
  }, 0)
  const signedContractsCount = contracts.docs.filter((c) => c.status === 'signed').length
  const claimButton = canClaimDemo ? (
    <form action={claimDemoProject}>
      <Button type="submit" variant="secondary" icon={<Sparkles />} label="领取示例项目" />
    </form>
  ) : null

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        title="项目工作台"
        description={
          keyword ? (
            <>
              匹配「{keyword}」共{' '}
              <span className="font-medium text-foreground tabular-nums">{projects.length}</span> 个
            </>
          ) : (
            '管理全屋智能设计项目、户型彩平点位图、多版本报价与交付归档'
          )
        }
        actions={
          <div className="flex items-center gap-2">
            {claimButton}
            <Button href="/projects/new" icon={<Plus />} label="新建项目" />
          </div>
        }
      />

      {/*
        指标条：一条带发丝分隔线的横条，而不是四张浮起的等权卡片。
        四张卡片会让首屏视觉中心停在数字上、把真正要操作的「项目列表」压下去，
        也带来最重的「通用后台」观感（视觉评审指出的首要问题）。
      */}
      {projects.length > 0 ? (
        <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-[var(--radius-container)] border bg-card sm:grid-cols-4 sm:divide-y-0">
          <StatTile
            size="inline"
            label={archived ? '已归档项目' : '进行中项目'}
            value={projects.length}
            unit="个项目"
          />
          <StatTile
            size="inline"
            label="累计设计点位"
            value={totalPoints.toLocaleString('zh-CN')}
            unit="个点位"
          />
          <StatTile size="inline" label="方案报价总额" value={yuan(totalQuoteAmount)} />
          <StatTile
            size="inline"
            label="报价 / 签约"
            value={quotes.docs.length}
            unit={`份 · 已签 ${signedContractsCount}`}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          label="项目状态"
          items={[
            {
              key: 'active',
              label: '进行中',
              count: activeCount.totalDocs,
              href: href({ view: '' }),
              active: !archived,
            },
            {
              key: 'archived',
              label: '已归档',
              count: archivedCount.totalDocs,
              href: href({ view: 'archived' }),
              active: archived,
            },
          ]}
        />
        <Form action="/projects" className="flex w-full items-center gap-2 sm:w-auto">
          {archived ? <input type="hidden" name="view" value="archived" /> : null}
          <div className="relative flex-1 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="搜索项目、客户、小区或电话"
              aria-label="搜索项目"
              className="h-9 border-border bg-background pl-9 text-xs shadow-2xs"
            />
          </div>
          <SearchSubmit />
        </Form>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-5" />}
          title={
            keyword
              ? '没有找到符合条件的项目'
              : archived
                ? '还没有归档的项目'
                : '还没有进行中的项目'
          }
          description={
            keyword
              ? '请尝试其他关键词'
              : archived
                ? '交付完成的项目可在「归档」页移入此处'
                : '创建项目后即可上传户型图并布置点位'
          }
          action={
            !keyword && !archived ? (
              <>
                <Button size="sm" href="/projects/new" icon={<Plus />} label="新建项目" />
                {claimButton}
              </>
            ) : null
          }
        />
      ) : (
        <Card className="overflow-hidden border-border py-0 shadow-2xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-6">项目名称与客户</TableHead>
                <TableHead className="hidden w-32 md:table-cell">生态平台</TableHead>
                <TableHead className="w-24 text-right">点位</TableHead>
                <TableHead className="hidden text-right sm:table-cell">方案报价 / 合同</TableHead>
                <TableHead className="hidden pr-6 text-right md:table-cell">最近更新</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => {
                const pid = String(p.id)
                const amount = amountOf(pid)
                const display = projectDisplayName(p.name)
                return (
                  <TableRow
                    key={pid}
                    className="group relative transition-colors hover:bg-subtle/80"
                  >
                    <TableCell className="max-w-0 py-3 pl-4 sm:pl-6">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          href={`/projects/${pid}`}
                          className="truncate text-sm font-semibold text-foreground after:absolute after:inset-0"
                        >
                          {display}
                        </Link>
                        {isDemo(p.name) ? (
                          <Badge variant="brand" className="h-4.5 shrink-0 px-1.5 text-[11px]">
                            示例
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[p.customerName, p.community].filter(Boolean).join(' · ') ||
                          '未填写客户与楼盘'}
                      </div>
                    </TableCell>
                    <TableCell className="hidden w-32 md:table-cell">
                      {p.platform ? (
                        <Badge variant="outline" className="rounded-md">
                          {p.platform}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="w-28 text-right tabular-nums">
                      {p.pointCount ? (
                        <span className="text-sm font-medium text-foreground tabular-nums">
                          {p.pointCount}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">未布点</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden w-40 text-right sm:table-cell">
                      {amount ? (
                        <div>
                          <div className="text-sm font-semibold text-foreground tabular-nums">
                            {yuan(amount.value)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{amount.caption}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden w-28 pr-6 text-right text-xs text-muted-foreground tabular-nums md:table-cell">
                      {fmtDate(p.updatedAt)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}
