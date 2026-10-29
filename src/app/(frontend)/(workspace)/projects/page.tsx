import Form from 'next/form'
import Link from 'next/link'
import { FolderKanban, Plus, Search } from 'lucide-react'
import type { Where } from 'payload'

import { Badge } from '@/components/ui/badge'
import { FilterTabs } from '@/components/filter-tabs'
import { SearchSubmit } from '@/components/search-submit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { PROJECT_STAGES, stageIndex, stageLabel, statusLabel } from '@/lib/projects'
import type { Project, User } from '@/payload-types'

import { canEditProjects } from './data'

export const metadata = { title: '项目 · FMKJ 项目管理' }

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const user = await appAuth.getCurrentUser()
  const { q = '', stage = '' } = await searchParams
  const payload = await getPayloadClient()

  const where: Where = { and: [{ status: { not_equals: 'archived' } }] }
  const keyword = q.trim()
  if (keyword) {
    where.and!.push({
      or: [{ name: { like: keyword } }, { customerName: { like: keyword } }, { community: { like: keyword } }, { customerPhone: { like: keyword } }],
    })
  }
  if (stage) where.and!.push({ stage: { equals: stage } })

  const result = await payload.find({
    collection: 'projects',
    where,
    depth: 1,
    limit: 500,
    sort: '-updatedAt',
    user,
    overrideAccess: false,
    // 列表不需要点位图等大字段，只取显示用的列。
    select: { name: true, customerName: true, community: true, stage: true, status: true, owner: true, updatedAt: true },
    populate: { users: { name: true } },
  })
  const projects = result.docs as Project[]

  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, stage, ...patch })
    for (const [k, v] of [...params]) if (!v) params.delete(k)
    const s = params.toString()
    return s ? `/projects?${s}` : '/projects'
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">项目</h1>
          <p className="text-sm text-muted-foreground">
            共 <span className="font-medium text-foreground tabular-nums">{projects.length}</span> 个项目
          </p>
        </div>
        {canEditProjects(user?.role) ? (
          <Button asChild>
            <Link href="/projects/new"><Plus className="size-4" />新建项目</Link>
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3">
        <Form action="/projects" className="flex flex-wrap items-center gap-2">
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="搜索项目、客户、小区或电话" aria-label="搜索项目" className="pl-9" />
          </div>
          <SearchSubmit />
        </Form>
        <FilterTabs
          label="按阶段筛选"
          items={[{ value: '', label: '全部' }, ...PROJECT_STAGES].map((s) => ({ key: s.value || 'all', label: s.label, href: href({ stage: s.value }), active: stage === s.value }))}
        />
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <FolderKanban className="size-8 text-muted-foreground" />
          <p className="font-medium">{keyword || stage ? '没有找到符合条件的项目' : '还没有项目'}</p>
          <p className="text-sm text-muted-foreground">{keyword || stage ? '换个关键词或阶段试试。' : '新建第一个项目开始跟进。'}</p>
        </div>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-6">项目</TableHead>
                <TableHead>阶段</TableHead>
                <TableHead className="hidden md:table-cell">负责人</TableHead>
                <TableHead className="hidden pr-6 text-right sm:table-cell">更新时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => {
                const owner = typeof p.owner === 'object' ? (p.owner as User | null) : null
                return (
                  <TableRow key={p.id} className="relative">
                    <TableCell className="pl-4 sm:pl-6">
                      <Link href={`/projects/${p.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                        {p.name}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.customerName}
                        {p.community ? ` · ${p.community}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 text-sm">
                          {stageLabel(p.stage)}
                          {p.status !== 'active' ? <Badge variant="secondary">{statusLabel(p.status)}</Badge> : null}
                        </div>
                        {/* 7 个阶段的迷你进度：一眼看出项目推进到哪一步 */}
                        <div className="flex w-28 gap-0.5" aria-hidden="true">
                          {PROJECT_STAGES.map((st, i) => (
                            <span key={st.value} className={i <= stageIndex(p.stage) ? 'h-1 flex-1 rounded-full bg-foreground/70' : 'h-1 flex-1 rounded-full bg-muted'} />
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{owner?.name ?? <span className="text-muted-foreground">未分配</span>}</TableCell>
                    <TableCell className="hidden pr-6 text-right text-sm text-muted-foreground tabular-nums sm:table-cell">{fmtDate(p.updatedAt)}</TableCell>
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
