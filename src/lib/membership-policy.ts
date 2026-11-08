import { cache } from 'react'

import { getPayloadClient } from '@/lib/payload'

export type MembershipPolicy = { upgradeHint: string }

const DEFAULT_HINT = '联系服务顾问获取兑换码，在「积分与账单」页输入兑换码即可充值 AI 积分。'

/**
 * 后台「会员设置」里的引导文案（同一次请求只读一次）。
 * 平台已取消会员分级，这里只剩「怎么获得积分」的说明，不再有权益限制规则。
 */
export const getMembershipPolicy = cache(async (): Promise<MembershipPolicy> => {
  const payload = await getPayloadClient()
  const doc = await payload
    .findGlobal({ slug: 'membership-settings', depth: 0, overrideAccess: true })
    .catch(() => null)
  return { upgradeHint: doc?.upgradeHint?.trim() || DEFAULT_HINT }
})
