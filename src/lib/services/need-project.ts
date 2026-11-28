import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { relId } from '@/lib/access'
import { lockRow } from '@/lib/pg-row-lock'

import type { NeedLead } from '@/payload-types'

import type { NeedBuildResult } from './need-service'

type Syncable = Pick<NeedLead, 'project' | 'phone'>

const PREFIX = '【来自业主需求单 · 待销售接管】'
/** 摘要结尾标记：有它才能确定性地只替换摘要，不碰销售在后面写的内容。 */
const END = '—— 需求摘要结束 ——'

/**
 * 需求单对应的项目：同一需求单永远只建一次。
 * 备注只替换上一次生成的需求摘要，销售在该项目上补充的文字和已建报价都保留。
 */
export async function syncNeedProject(
  payload: Payload,
  lead: Syncable,
  result: NeedBuildResult,
  summary: string,
  req?: Partial<PayloadRequest>,
  phone?: string | null,
  community?: string,
): Promise<string> {
  const budget = result.pricing.totals.total || null
  const projectId = relId(lead.project)
  if (projectId && req?.transactionID != null) {
    // Payload merges the stored document on update. Read only after a concurrent claim commits.
    await lockRow(
      payload,
      req.transactionID,
      sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`,
    )
  }
  const project = projectId
    ? await payload
        .findByID({
          collection: 'projects',
          id: projectId,
          depth: 0,
          overrideAccess: true,
          req,
          select: { notes: true },
        })
        .catch(() => null)
    : null

  if (!projectId || !project) {
    const created = await payload.create({
      collection: 'projects',
      data: {
        name: `需求单 ${new Date().toISOString().slice(0, 10)} ${result.structured.house.bedrooms}室`,
        status: 'active',
        platform: '米家',
        budget,
        notes: `${summary}\n${END}`,
        customerPhone: phone || lead.phone || null,
        ...(community ? { community } : {}),
      },
      overrideAccess: true,
      depth: 0,
      req,
    })
    return String(created.id)
  }

  const current = project.notes ?? ''
  // 旧版摘要有结尾标记时整段替换，保留销售追加的文字；没有标记时把最新摘要放前面，旧内容留给人工核对。
  const end = current.indexOf(END)
  const tail =
    current.startsWith(PREFIX) && end >= 0 ? current.slice(end + END.length).trim() : current
  const block = `${summary}\n${END}`
  const notes = tail ? `${block}\n\n${tail}` : block

  await payload.update({
    collection: 'projects',
    id: projectId,
    data: { budget, notes, ...(phone ? { customerPhone: phone } : {}) },
    overrideAccess: true,
    depth: 0,
    req,
  })
  return projectId
}
