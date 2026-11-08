'use server'

import { appAuth } from '@/lib/app-auth'
import { CREDIT_TASKS, grantTaskCreditIfEligible, loadAndSyncUserCreditTasks, type CreditTaskId } from '@/lib/credit-tasks'

/**
 * 领取成长/绑定任务奖励积分（绑定邮箱 +10、绑定微信 +10、关注公众号 +5、完善抬头 +5、首份报价 +5）。
 */
export async function claimTaskCredit(taskId: CreditTaskId): Promise<{ ok: true; credits: number; message: string } | { ok: false; error: string }> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  const spec = CREDIT_TASKS.find((t) => t.id === taskId)
  if (!spec) return { ok: false, error: '未知的积分任务' }

  const { tasks } = await loadAndSyncUserCreditTasks(user)
  const item = tasks.find((t) => t.id === taskId)
  if (!item) return { ok: false, error: '任务状态读取失败' }
  if (item.claimed) return { ok: false, error: '该项任务奖励已领取过' }
  if (!item.eligible) {
    if (taskId === 'bind_email') return { ok: false, error: '请先使用真实邮箱注册或在个人设置中绑定真实邮箱' }
    if (taskId === 'bind_wechat') return { ok: false, error: '请先在微信小程序登录并绑定当前账号' }
    if (taskId === 'complete_company_profile') return { ok: false, error: '请先在「设置」中填写公司抬头名称与联系电话' }
    if (taskId === 'first_quote') return { ok: false, error: '请先在任意项目中生成第一份报价单' }
    return { ok: false, error: '尚未达成该任务条件' }
  }

  const res = await grantTaskCreditIfEligible(String(user.id), taskId)
  if (!res.granted) return { ok: false, error: res.reason }
  return { ok: true, credits: res.credits, message: `已领取「${spec.title}」奖励 +${res.credits} 积分` }
}
