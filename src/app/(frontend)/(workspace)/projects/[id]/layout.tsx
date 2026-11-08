import type { Metadata } from 'next'

import { pageTitle } from '@/lib/brand'
import { isDemoProjectName, projectDisplayName } from '@/lib/project-name'

import { getProject } from './project-data'
import { ProjectHeader } from './project-header'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { project } = await getProject(id)
  return { title: pageTitle(projectDisplayName(project.name)) }
}

/** 项目详情外框：顶栏显示项目名称和五个板块，各板块页面在下方渲染。 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { project, archived, role, collaboratorCount } = await getProject(id)
  const subtitle = [project.customerName, project.community].filter(Boolean).join(' · ')

  return (
    <>
      <ProjectHeader
        projectId={String(project.id)}
        name={projectDisplayName(project.name)}
        demo={isDemoProjectName(project.name)}
        subtitle={subtitle}
        archived={archived}
        role={role}
        collaboratorCount={collaboratorCount}
      />
      {children}
    </>
  )
}
