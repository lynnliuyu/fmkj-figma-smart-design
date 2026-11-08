import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { loadAndSyncUserCreditTasks } from '@/lib/credit-tasks'
import { getMembershipPolicy } from '@/lib/membership-policy'
import { getPayloadClient } from '@/lib/payload'

import { MembershipClient } from './membership-client'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('会员与积分') }

export default async function MembershipPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()

  const payload = await getPayloadClient()
  // 先同步并自动发放已满足条件的绑定邮箱/微信积分，确保本页余额与流水立即可见
  const { tasks: creditTasks } = await loadAndSyncUserCreditTasks(user)
  const [freshUser, ledgerRes, policy] = await Promise.all([
    payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true }).catch(() => user),
    payload.find({
      collection: 'ai-credit-ledger',
      where: { user: { equals: user.id } },
      sort: '-createdAt',
      limit: 30,
      depth: 0,
      overrideAccess: true,
    }),
    getMembershipPolicy(),
  ])

  const ledger = ledgerRes.docs.map((row) => ({
    id: String(row.id),
    delta: row.delta,
    balanceAfter: row.balanceAfter ?? 0,
    reason: row.reason ?? (row.delta > 0 ? '积分发放' : 'AI 对话扣减'),
    model: row.model ?? null,
    createdAt: row.createdAt,
  }))

  return (
    <MembershipClient
      initial={{
        aiCredits: freshUser.aiCredits ?? 0,
        upgradeHint: policy.upgradeHint,
        ledger,
        creditTasks,
      }}
    />
  )
}
