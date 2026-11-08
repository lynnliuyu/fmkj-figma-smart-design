import {
  CREDIT_TASKS,
  grantTaskCreditIfEligible,
  loadAndSyncUserCreditTasks,
  type CreditTaskId,
} from '@/lib/credit-tasks'
import { fail, mpRoute, ok, readJson, text } from '@/lib/mp/http'
import { redeemCodeForUser } from '@/lib/services/membership-service'

/** 小程序端核销兑换码（充值 AI 积分或激活会员等级），或领取积分任务奖励（传入 taskId）。 */
export const POST = mpRoute(async ({ request, user }) => {
  const body = await readJson(request)
  const rawTaskId = text(body.taskId, 40) as CreditTaskId
  if (rawTaskId) {
    const spec = CREDIT_TASKS.find((t) => t.id === rawTaskId)
    if (!spec) return fail(400, '未知的积分任务')
    const { tasks } = await loadAndSyncUserCreditTasks(user)
    const item = tasks.find((t) => t.id === rawTaskId)
    if (!item) return fail(400, '读取任务状态失败')
    if (item.claimed) return fail(400, '该项任务奖励已领取过')
    if (!item.eligible) return fail(400, '尚未达成该任务条件')
    const granted = await grantTaskCreditIfEligible(String(user.id), rawTaskId)
    if (!granted.granted) return fail(400, granted.reason)
    return ok({
      ok: true,
      message: `已领取「${spec.title}」奖励 +${granted.credits} 积分`,
      creditsAdded: granted.credits,
    })
  }
  const result = await redeemCodeForUser(user, text(body.code, 40))
  if (!result.ok) return fail(400, result.error)
  return ok(result)
})
