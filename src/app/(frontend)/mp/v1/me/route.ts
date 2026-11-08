import { getPayloadClient } from '@/lib/payload'
import { presentMe } from '@/lib/mp/auth'
import { fail, mpRoute, ok, readJson, text } from '@/lib/mp/http'

export const GET = mpRoute(async ({ user }) => ok(await presentMe(user)))

/** 修改自己的姓名和手机号（手机号会作为联系人显示在报价单上）。 */
export const PUT = mpRoute(async ({ request, user }) => {
  const body = await readJson(request)
  const name = text(body.name, 60)
  if (!name) return fail(400, '请填写姓名')
  const payload = await getPayloadClient()
  const updated = await payload.update({
    collection: 'users',
    id: user.id,
    data: { name, phone: text(body.phone, 30) || null },
    user,
    overrideAccess: false,
    depth: 0,
  })
  return ok(await presentMe({ ...user, ...updated, collection: 'users' }))
})
