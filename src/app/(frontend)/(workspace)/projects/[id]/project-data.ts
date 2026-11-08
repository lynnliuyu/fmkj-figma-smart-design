import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { countScenePoints } from '@/lib/point-count'
import { getPayloadClient } from '@/lib/payload'
import { getProjectRole, type CollaboratorItem } from '@/lib/project-access'
import { redirectToLogin } from '@/lib/login-redirect'

/**
 * 项目板块共用的数据读取。用 React cache 去重：同一次请求里布局和页面只查一次。
 * 不读取点位图（只有点位页需要），列表和概览用自动统计的点位数。
 */
export const getProject = cache(async (id: string) => {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: {
        name: true,
        customerName: true,
        customerPhone: true,
        community: true,
        address: true,
        platform: true,
        budget: true,
        owner: true,
        collaborators: true,
        notes: true,
        status: true,
        pointCount: true,
        archivedAt: true,
        updatedAt: true,
        finalQuote: true,
        proposalTemplate: true,
        shareConfig: true,
      },
    })
    .catch(() => null)

  const collabs =
    (project as unknown as { collaborators?: CollaboratorItem[] | null })?.collaborators ?? []
  const role = project
    ? getProjectRole({ owner: project.owner, collaborators: collabs }, user.id)
    : null

  // 若地址栏中的项目 ID 已失效或属于其他账号（例如切换了账号后从 ?from= 跳回旧项目地址），自动跳转到当前用户的首个可用项目或项目列表页，避免卡在 404
  if (!project || !role) {
    const ownProjects = await payload
      .find({
        collection: 'projects',
        where: { status: { not_equals: 'archived' } },
        sort: '-updatedAt',
        limit: 1,
        depth: 0,
        user,
        overrideAccess: false,
        select: { name: true },
      })
      .catch(() => null)
    const firstOwnId = ownProjects?.docs?.[0]?.id
    if (firstOwnId && String(firstOwnId) !== String(id)) {
      redirect(`/projects/${firstOwnId}/point-map`)
    }
    redirect('/projects')
  }

  // 早于「点位数」字段保存（或从旧数据导入）的项目还没有统计值：临时从点位图计算，下次保存点位图时写入
  if (project.pointCount == null) {
    const full = await payload
      .findByID({
        collection: 'projects',
        id,
        depth: 0,
        user,
        overrideAccess: false,
        select: { pointMap: true },
      })
      .catch(() => null)
    project.pointCount = countScenePoints(full?.pointMap)
  }
  const archived = project.status === 'archived'
  return {
    user,
    payload,
    project,
    role,
    collaboratorCount: collabs.length,
    archived,
    readOnly: archived || role === 'read',
  }
})

/** 项目的报价（新的在前）和合同。 */
export const getProjectDeals = cache(async (id: string) => {
  const { user, payload, project } = await getProject(id)
  const [quotes, contracts] = await Promise.all([
    payload.find({
      collection: 'quotes',
      where: { project: { equals: project.id } },
      sort: '-updatedAt',
      limit: 100,
      depth: 0,
      user,
      overrideAccess: false,
      select: { title: true, status: true, total: true, updatedAt: true },
    }),
    payload.find({
      collection: 'contracts',
      where: { project: { equals: project.id } },
      limit: 1,
      depth: 0,
      user,
      overrideAccess: false,
    }),
  ])
  return { quotes: quotes.docs, contract: contracts.docs[0] ?? null }
})
