import { getPayloadClient } from '@/lib/payload'

/**
 * 负责人下拉选项：员工只能读自己的账号，这里在服务端只取启用员工的 id 和姓名。
 */
export async function listOwnerOptions() {
  const payload = await getPayloadClient()
  const users = await payload.find({
    collection: 'users',
    where: { status: { equals: 'active' } },
    select: { name: true },
    sort: 'name',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  return users.docs.map((u) => ({ value: String(u.id), label: u.name }))
}

export const canEditProjects = (role?: string | null) => ['admin', 'manager', 'designer', 'sales'].includes(role ?? '')
