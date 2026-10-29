import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, FilePlus2, MapPinned } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { PROJECT_STAGES, stageIndex, statusLabel } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { quoteStatusLabel, quoteStatusVariant, yuan } from '@/lib/quotes'
import type { Quote, User } from '@/payload-types'

import { createQuoteFromProject } from '../../quotes/actions'

import { canEditProjects, listOwnerOptions } from '../data'
import { ProjectForm } from '../project-form'

export const metadata = { title: '项目详情 · FMKJ 项目管理' }

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await appAuth.getCurrentUser()
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({ collection: 'projects', id, depth: 1, user, overrideAccess: false, select: { pointMap: false }, populate: { users: { name: true } } })
    .catch(() => null)
  if (!project) notFound()

  const [owners, quotes] = await Promise.all([
    listOwnerOptions(),
    payload.find({ collection: 'quotes', where: { project: { equals: project.id } }, depth: 0, limit: 50, sort: '-updatedAt', user, overrideAccess: false, select: { title: true, status: true, total: true, updatedAt: true } }),
  ])
  const owner = typeof project.owner === 'object' ? (project.owner as User | null) : null
  const current = stageIndex(project.stage)
  const editable = canEditProjects(user?.role)

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link href="/projects"><ChevronLeft className="size-4" />项目列表</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.id}/point-map`}><MapPinned className="size-4" />点位图</Link>
        </Button>
      </div>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          {project.status !== 'active' ? <Badge variant="outline">{statusLabel(project.status)}</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {project.customerName}
          {project.community ? ` · ${project.community}` : ''}
          {owner ? ` · 负责人 ${owner.name}` : ''}
        </p>
      </header>

      <ol className="grid grid-cols-7 gap-1" aria-label="项目阶段">
        {PROJECT_STAGES.map((s, i) => (
          <li key={s.value} className="flex flex-col gap-1.5" aria-current={i === current ? 'step' : undefined}>
            <span className={cn('h-1.5 rounded-full', i <= current ? 'bg-primary' : 'bg-muted')} />
            <span className={cn('truncate text-xs', i === current ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.label}</span>
          </li>
        ))}
      </ol>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4">
          <CardTitle className="text-base">报价</CardTitle>
          {editable ? (
            <form action={createQuoteFromProject}>
              <input type="hidden" name="projectId" value={String(project.id)} />
              <Button type="submit" size="sm"><FilePlus2 className="size-4" />从点位图生成报价</Button>
            </form>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {quotes.docs.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">还没有报价。先在点位图里放置设备，再生成报价；没有点位图也可以生成空报价后手动添加产品。</p>
          ) : (
            <ul className="divide-y">
              {(quotes.docs as Quote[]).map((q) => (
                <li key={q.id}>
                  <Link href={`/quotes/${q.id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50">
                    <span className="flex-1 truncate text-sm font-medium">{q.title}</span>
                    <Badge variant={quoteStatusVariant(q.status)}>{quoteStatusLabel(q.status)}</Badge>
                    <span className="w-28 text-right text-sm font-semibold tabular-nums">{yuan(q.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ProjectForm
        owners={owners}
        readOnly={!editable}
        initial={{
          ...project,
          id: String(project.id),
          owner: owner ? String(owner.id) : typeof project.owner === 'string' ? project.owner : null,
        }}
      />
    </section>
  )
}
