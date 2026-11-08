import { getPayloadClient } from '@/lib/payload'
import { bearerToken, hashToken } from '@/lib/mp/auth'
import { mpRoute, ok } from '@/lib/mp/http'

/** 解除自己账号上的全部微信绑定；当前设备保持登录，其他微信登录的设备下线。 */
export const DELETE = mpRoute(async ({ request, user }) => {
  const payload = await getPayloadClient()
  await payload.delete({
    collection: 'wechat-accounts',
    where: { user: { equals: user.id } },
    overrideAccess: true,
    depth: 0,
  })
  const current = bearerToken(request)
  await payload.delete({
    collection: 'mp-sessions',
    where: {
      and: [
        { user: { equals: user.id } },
        { client: { equals: 'wechat' } },
        ...(current ? [{ tokenHash: { not_equals: hashToken(current) } }] : []),
      ],
    },
    overrideAccess: true,
    depth: 0,
  })
  return ok({ wechatBound: false })
})
