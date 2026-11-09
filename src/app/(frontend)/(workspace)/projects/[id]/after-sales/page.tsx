import Link from 'next/link'
import { Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { relId } from '@/lib/access'
import { loadAfterSales } from '@/lib/services/after-sales-service'
import { PLUGINS } from '@/plugins'
import { getPluginFlags } from '@/plugins/state'

import { getProject } from '../project-data'
import { AfterSalesBoard } from './after-sales-board'

/** 售后维保（插件）：质保倒计时、维保记录与配置备份。项目归档后仍可登记，仅查看的协作者只能浏览。 */
export default async function ProjectAfterSalesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user, project, role, archived } = await getProject(id)
  const ownerId = relId(project.owner) || user.id
  const plugin = PLUGINS.find((p) => p.id === 'after-sales')
  const flags = await getPluginFlags(ownerId)

  if (!flags['after-sales'] || !plugin) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Wrench className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">售后维保记录</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            这项能力目前不可用。可用时可以按合同质保期追踪检修、设备更换与配置备份。
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/capabilities/after-sales">去能力中心查看</Link>
        </Button>
      </section>
    )
  }

  const full = await loadAfterSales(user, String(project.id))
  // 配置备份可能有上百台设备：页面只需要数量和最近一次备份的前几台，完整台账在打印页查看
  const data = {
    ...full,
    records: full.records.map((r) =>
      r.snapshot ? { ...r, snapshot: { ...r.snapshot, devices: [] } } : r,
    ),
    latestBackup: full.latestBackup?.snapshot
      ? {
          ...full.latestBackup,
          snapshot: {
            ...full.latestBackup.snapshot,
            devices: full.latestBackup.snapshot.devices.slice(0, 5),
          },
        }
      : full.latestBackup,
  }
  return (
    <AfterSalesBoard
      projectId={String(project.id)}
      data={data}
      canEdit={role !== 'read'}
      archived={archived}
    />
  )
}
