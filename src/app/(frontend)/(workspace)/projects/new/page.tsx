import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { appAuth } from '@/lib/app-auth'

import { canEditProjects, listOwnerOptions } from '../data'
import { ProjectForm } from '../project-form'

export const metadata = { title: '新建项目 · FMKJ 项目管理' }

export default async function NewProjectPage() {
  const user = await appAuth.getCurrentUser()
  if (!canEditProjects(user?.role)) redirect('/projects')
  const owners = await listOwnerOptions()

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href="/projects"><ChevronLeft className="size-4" />项目列表</Link>
      </Button>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">新建项目</h1>
        <p className="text-sm text-muted-foreground">负责人不选时默认为你自己</p>
      </header>
      <ProjectForm owners={owners} initial={{ owner: user ? String(user.id) : null }} />
    </section>
  )
}
