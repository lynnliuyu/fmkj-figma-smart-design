import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, MapPinned } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { PROJECT_STAGES, stageIndex, statusLabel } from '@/lib/projects'
import { cn } from '@/lib/utils'
import type { User } from '@/payload-types'

import { canEditProjects, listOwnerOptions } from '../data'
import { ProjectForm } from '../project-form'

export const metadata = { title: '项目详情 · FMKJ 项目管理' }

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await appAuth.getCurrentUser()
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({ collection: 'projects', id, depth: 1, user, overrideAccess: false })
    .catch(() => null)
  if (!project) notFound()

  const owners = await listOwnerOptions()
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
