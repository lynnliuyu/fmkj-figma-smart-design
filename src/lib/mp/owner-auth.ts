import { getPayloadClient } from '@/lib/payload'
import { findNeedDraft } from '@/lib/services/need-draft'
import type { NeedLead } from '@/payload-types'

/**
 * 业主身份：只认需求单签名令牌，不认员工登录令牌。
 * 业主没有账号，能访问的范围只有自己这份需求单关联的项目。
 */
export async function getOwnerLead(request: Request): Promise<NeedLead | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const payload = await getPayloadClient()
  // 令牌必须是我们签发的，避免拿任意字符串碰撞已存在的记录。
  const { isIssuedNeedToken } = await import('@/lib/services/need-draft')
  if (!isIssuedNeedToken(token, payload.secret)) return null
  return (await findNeedDraft(payload, token)) ?? null
}

/** 业主只能看自己需求单关联的项目；其他项目一律当作不存在。 */
export function ownerProjectId(lead: NeedLead): string | null {
  const project = lead.project
  if (!project) return null
  return typeof project === 'object' ? String(project.id ?? '') || null : String(project)
}
