import Link from 'next/link'
import { AlertTriangle, Eye, PencilLine, Users } from 'lucide-react'

import { BrandLockup } from '@/components/brand/brand-mark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@astryxdesign/core/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { appAuth } from '@/lib/app-auth'
import { APP_NAME, pageTitle } from '@/lib/brand'
import { getPayloadClient } from '@/lib/payload'
import { parseShareConfig } from '@/lib/project-access'
import type { User } from '@/payload-types'

import { JoinCard } from './join-card'

export const metadata = { title: pageTitle('加入项目协作') }

export default async function JoinProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token = '' } = await searchParams
  const payload = await getPayloadClient()
  const [user, project] = await Promise.all([
    appAuth.getCurrentUser(),
    payload
      .findByID({
        collection: 'projects',
        id,
        depth: 1,
        overrideAccess: true,
        populate: { users: { name: true, email: true } },
      })
      .catch(() => null),
  ])

  const rawProj = project as unknown as { shareConfig?: unknown } | null
  const shareConfig = rawProj ? parseShareConfig(rawProj.shareConfig) : null
  const valid = Boolean(
    project && shareConfig && shareConfig.enabled && token && shareConfig.token === token,
  )

  if (!valid || !project || !shareConfig) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-4">
        <Link href="/" aria-label={`${APP_NAME} 首页`}>
          <BrandLockup />
        </Link>
        <Card className="w-full max-w-md text-center">
          <CardHeader className="items-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-warning/15 text-warning">
              <AlertTriangle className="size-5" />
            </div>
            <CardTitle className="mt-2 text-lg">协作链接已失效</CardTitle>
            <CardDescription>
              该项目的协作链接可能已被项目管理员关闭或重置，请联系项目创建者获取最新链接。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="secondary" size="sm" href="/projects" label="返回工作台" />
          </CardContent>
        </Card>
      </main>
    )
  }

  const owner = typeof project.owner === 'object' && project.owner ? (project.owner as User) : null
  const canEdit = shareConfig.role === 'edit'

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <Link href="/" aria-label={`${APP_NAME} 首页`}>
        <BrandLockup />
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="size-4 text-primary" />
              项目协作邀请
            </span>
            <Badge variant={canEdit ? 'default' : 'secondary'} className="gap-1">
              {canEdit ? <PencilLine className="size-3" /> : <Eye className="size-3" />}
              {canEdit ? '可编辑权限' : '仅查看权限'}
            </Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">{project.name}</CardTitle>
            <CardDescription>
              {owner?.name ? `${owner.name} 邀请你加入该项目协作` : '邀请你加入该项目协作'}（
              {canEdit
                ? '可共同编辑点位图、报价单与合同'
                : '只读查看项目点位、报价、合同与导出资料'}
              ）
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <JoinCard
            projectId={String(project.id)}
            token={token}
            role={shareConfig.role}
            currentUser={user ? { name: user.name, email: user.email } : null}
          />
        </CardContent>
      </Card>
    </main>
  )
}
