import Link from 'next/link'
import { AlertTriangle, CalendarClock, Clock, FolderKanban, Plus, Search } from 'lucide-react'
import type { Where } from 'payload'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import {
  PROJECT_STAGES,
  WORKBENCH_GROUPS,
  groupWorkbench,
  riskLabel,
  stageLabel,
  waitingLabel,
  type WorkbenchGroupKey,
} from '@/lib/projects'
import { cn } from '@/lib/utils'
import type { Project, User } from '@/payload-types'

import { canEditProjects } from './data'

export const metadata = { title: '项目工作台 · FMKJ 项目管理' }

const GROUP_ICONS: Record<WorkbenchGroupKey, typeof AlertTriangle> = {
  risk: AlertTriangle,
  upcoming: CalendarClock,
  waiting: Clock,
  active: FolderKanban,
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }) : '—'

function dueTone(iso?: string | null) {
  if (!iso) return 'text-muted-foreground'
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000
  if (days < -1) return 'text-destructive-strong font-medium'
  if (days < 3) return 'text-warning font-medium'
  return 'text-muted-foreground'
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; mine?: string }> }) {
  const user = await appAuth.getCurrentUser()
  const { q = '', mine = '' } = await searchParams
  const payload = await getPayloadClient()

  const where: Where = { and: [{ status: { not_in: ['archived', 'canceled'] } }] }
  const keyword = q.trim()
  if (keyword) {
    where.and!.push({
      or: [{ name: { like: keyword } }, { customerName: { like: keyword } }, { community: { like: keyword } }, { customerPhone: { like: keyword } }],
    })
  }
  if (mine && user) where.and!.push({ owner: { equals: user.id } })

  const result = await payload.find({ collection: 'projects', where, depth: 1, limit: 500, sort: '-updatedAt', user, overrideAccess: false })
  const projects = result.docs as Project[]
  const groups = groupWorkbench(projects)
  const stageCounts = PROJECT_STAGES.map((s) => ({ ...s, count: projects.filter((p) => p.stage === s.value).length }))

  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, mine, ...patch })
    for (const [k, v] of [...params]) if (!v) params.delete(k)
    const s = params.toString()
    return s ? `/projects?${s}` : '/projects'
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">项目工作台</h1>
          <p className="text-sm text-muted-foreground">
            共 <span className="font-medium text-foreground tabular-nums">{projects.length}</span> 个进行中的项目，按需要处理的优先级分组
          </p>
        </div>
        {canEditProjects(user?.role) ? (
          <Button asChild>
            <Link href="/projects/new"><Plus className="size-4" />新建项目</Link>
          </Button>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stageCounts.map((s) => (
          <div key={s.value} className="rounded-xl bg-muted/60 px-3 py-2.5">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-xl font-semibold tabular-nums">{s.count}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action="/projects" className="flex flex-wrap items-center gap-2">
          {mine ? <input type="hidden" name="mine" value={mine} /> : null}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="搜索项目、客户、小区或电话" aria-label="搜索项目" className="pl-9" />
          </div>
          <Button type="submit" variant="outline">搜索</Button>
        </form>
        <div className="flex gap-1.5">
          <Button asChild size="sm" variant={!mine ? 'default' : 'outline'}><Link href={href({ mine: '' })}>全部项目</Link></Button>
          <Button asChild size="sm" variant={mine ? 'default' : 'outline'}><Link href={href({ mine: '1' })}>我负责的</Link></Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <FolderKanban className="size-8 text-muted-foreground" />
          <p className="font-medium">{keyword || mine ? '没有找到符合条件的项目' : '还没有项目'}</p>
          <p className="text-sm text-muted-foreground">{keyword || mine ? '换个关键词或切换到全部项目试试。' : '新建第一个项目开始跟进。'}</p>
        </div>
      ) : (
        WORKBENCH_GROUPS.map((group) => {
          const rows = groups[group.key]
          if (!rows.length) return null
          const Icon = GROUP_ICONS[group.key]
          return (
            <Card key={group.key} className="gap-0 py-0">
              <CardHeader className="flex flex-row items-center gap-3 border-b py-4">
                <Icon className={cn('size-4', group.key === 'risk' ? 'text-destructive-strong' : 'text-muted-foreground')} />
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {group.label}
                    <Badge variant="secondary" className="tabular-nums">{rows.length}</Badge>
                  </CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">项目</TableHead>
                      <TableHead>阶段</TableHead>
                      <TableHead className="hidden md:table-cell">负责人</TableHead>
                      <TableHead>下一步</TableHead>
                      <TableHead className="pr-6 text-right">截止</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => {
                      const owner = typeof p.owner === 'object' ? (p.owner as User | null) : null
                      return (
                        <TableRow key={p.id} className="relative">
                          <TableCell className="pl-6">
                            <Link href={`/projects/${p.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                              {p.name}
                            </Link>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {p.customerName}
                              {p.community ? ` · ${p.community}` : ''}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">{stageLabel(p.stage)}</Badge>
                              {p.riskLevel !== 'normal' ? (
                                <Badge variant={p.riskLevel === 'blocked' ? 'destructive' : 'secondary'}>{riskLabel(p.riskLevel)}</Badge>
                              ) : null}
                              {p.waitingOn !== 'none' ? <Badge variant="secondary">{waitingLabel(p.waitingOn)}</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-sm md:table-cell">{owner?.name ?? <span className="text-muted-foreground">未分配</span>}</TableCell>
                          <TableCell className="max-w-64 text-sm">
                            <span className="line-clamp-1">{p.nextAction || (p.riskNote ?? <span className="text-muted-foreground">—</span>)}</span>
                          </TableCell>
                          <TableCell className={cn('pr-6 text-right text-sm tabular-nums', dueTone(p.nextActionDueAt))}>{fmtDate(p.nextActionDueAt)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )
        })
      )}
    </section>
  )
}
