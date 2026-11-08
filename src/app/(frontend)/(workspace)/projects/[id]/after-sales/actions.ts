'use server'

import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import {
  createConfigBackup,
  deleteServiceRecord,
  saveServiceRecord,
  setServiceRecordStatus,
  type AfterSalesResult,
  type ServiceRecordInput,
} from '@/lib/services/after-sales-service'
import type { User } from '@/payload-types'
import { getPluginFlags } from '@/plugins/state'

/** 售后维保的业务规则在 src/lib/services/after-sales-service.ts；这里只做登录与插件开关（含会员等级）检查。 */
type Gate = { ok: true; user: User } | { ok: false; error: string }

async function gate(projectId: string): Promise<Gate> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id: projectId,
      depth: 0,
      user,
      overrideAccess: false,
      select: { owner: true },
    })
    .catch(() => null)
  if (!project) return { ok: false, error: '项目不存在或无权访问' }
  const flags = await getPluginFlags(relId(project.owner) ?? user.id)
  if (!flags['after-sales'])
    return { ok: false, error: '「售后维保记录」插件未启用或当前会员等级不可用' }
  return { ok: true, user }
}

export async function saveServiceRecordAction(
  projectId: string,
  input: ServiceRecordInput,
  id?: string | null,
): Promise<AfterSalesResult<{ id: string }>> {
  const g = await gate(projectId)
  return g.ok ? saveServiceRecord(g.user, projectId, input, id) : g
}

export async function setServiceRecordStatusAction(
  projectId: string,
  id: string,
  status: string,
): Promise<AfterSalesResult> {
  const g = await gate(projectId)
  return g.ok ? setServiceRecordStatus(g.user, id, status) : g
}

export async function deleteServiceRecordAction(
  projectId: string,
  id: string,
): Promise<AfterSalesResult> {
  const g = await gate(projectId)
  return g.ok ? deleteServiceRecord(g.user, id) : g
}

export async function createConfigBackupAction(
  projectId: string,
): Promise<AfterSalesResult<{ id: string; devices: number }>> {
  const g = await gate(projectId)
  return g.ok ? createConfigBackup(g.user, projectId) : g
}
