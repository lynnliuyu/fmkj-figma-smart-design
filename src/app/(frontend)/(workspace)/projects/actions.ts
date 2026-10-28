'use server'

import { revalidatePath } from 'next/cache'
import { ValidationError } from 'payload'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { PROJECT_PLATFORMS, PROJECT_STAGES, PROJECT_STATUSES } from '@/lib/projects'
import type { Project } from '@/payload-types'

export type ProjectFormState =
  | { ok: true; id: string; savedAt: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | null

const EDIT_ROLES = ['admin', 'manager', 'designer', 'sales']

const values = (list: readonly { value: string }[]) => list.map((i) => i.value)
const str = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? '').trim()
  return v === '__none' ? '' : v
}

/** 只接受白名单字段；负责人以外的关系、审计字段一律不从客户端读取。 */
function parse(form: FormData) {
  const fieldErrors: Record<string, string> = {}
  const pick = (key: string, allowed: string[], fallback: string) => {
    const v = str(form, key) || fallback
    if (!allowed.includes(v)) fieldErrors[key] = '取值无效'
    return v
  }
  const name = str(form, 'name')
  const customerName = str(form, 'customerName')
  if (!name) fieldErrors.name = '请填写项目名称'
  if (!customerName) fieldErrors.customerName = '请填写客户姓名'

  const budgetRaw = str(form, 'budget')
  const budget = budgetRaw ? Number(budgetRaw) : null
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) fieldErrors.budget = '预算需为非负数字'

  const platform = str(form, 'platform')
  if (platform && !(PROJECT_PLATFORMS as readonly string[]).includes(platform)) fieldErrors.platform = '取值无效'

  const data = {
    name,
    customerName,
    customerPhone: str(form, 'customerPhone') || null,
    community: str(form, 'community') || null,
    address: str(form, 'address') || null,
    stage: pick('stage', values(PROJECT_STAGES), 'new') as Project['stage'],
    status: pick('status', values(PROJECT_STATUSES), 'active') as Project['status'],
    platform: (platform || null) as Project['platform'],
    budget,
    owner: str(form, 'owner') || null,
    notes: str(form, 'notes') || null,
  }
  return { data, fieldErrors }
}

function toFailure(error: unknown): ProjectFormState {
  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {}
    for (const e of error.data?.errors ?? []) fieldErrors[e.path] = e.message
    return { ok: false, error: '有字段未通过校验，请检查后重试', fieldErrors }
  }
  const status = (error as { status?: number })?.status
  if (status === 403) return { ok: false, error: '没有权限执行此操作' }
  if (status === 404) return { ok: false, error: '项目不存在或已被删除' }
  console.error('[projects] save failed', error)
  return { ok: false, error: '保存失败，请稍后重试' }
}

export async function saveProject(_prev: ProjectFormState, form: FormData): Promise<ProjectFormState> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  if (!EDIT_ROLES.includes(user.role ?? '')) return { ok: false, error: '只读账号不能修改项目' }

  const id = str(form, 'id')
  const { data, fieldErrors } = parse(form)
  if (Object.keys(fieldErrors).length) return { ok: false, error: '请检查标记的字段', fieldErrors }

  const payload = await getPayloadClient()
  if (data.owner) {
    const owner = await payload.find({
      collection: 'users',
      where: { and: [{ id: { equals: data.owner } }, { status: { equals: 'active' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!owner.docs.length) return { ok: false, error: '请检查标记的字段', fieldErrors: { owner: '负责人不存在或已停用' } }
  }

  try {
    const doc = id
      ? await payload.update({ collection: 'projects', id, data, user, overrideAccess: false, depth: 0 })
      : await payload.create({ collection: 'projects', data: { ...data, owner: data.owner ?? user.id }, user, overrideAccess: false, depth: 0 })
    revalidatePath('/projects')
    revalidatePath(`/projects/${doc.id}`)
    return { ok: true, id: String(doc.id), savedAt: Date.now() }
  } catch (error) {
    return toFailure(error)
  }
}
