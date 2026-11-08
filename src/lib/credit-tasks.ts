import { relId } from './access'
import { getPayloadClient } from './payload'
import type { User } from '@/payload-types'

export type CreditTaskId =
  | 'bind_email'
  | 'bind_wechat'
  | 'follow_official_account'
  | 'complete_company_profile'
  | 'first_quote'

export type CreditTaskSpec = {
  id: CreditTaskId
  title: string
  description: string
  credits: number
  ledgerReason: string
  /** auto: 满足条件时系统自动发放或点击即核验发放；claim: 点击关注/完成后领取 */
  mode: 'auto' | 'claim'
}

export const CREDIT_TASKS: CreditTaskSpec[] = [
  {
    id: 'bind_email',
    title: '绑定电子邮箱',
    description: '使用真实邮箱注册或在个人资料中绑定真实邮箱（用于跨端登录与接收通知）',
    credits: 10,
    ledgerReason: '任务奖励 · 绑定电子邮箱',
    mode: 'auto',
  },
  {
    id: 'bind_wechat',
    title: '绑定微信小程序',
    description: '使用微信小程序一键登录或将微信号绑定至当前账号',
    credits: 10,
    ledgerReason: '任务奖励 · 绑定微信小程序',
    mode: 'auto',
  },
  {
    id: 'follow_official_account',
    title: '关注官方公众号',
    description: '关注「繁梦空间」官方服务号，获取产品库更新与行业方案干货',
    credits: 5,
    ledgerReason: '任务奖励 · 关注官方公众号',
    mode: 'claim',
  },
  {
    id: 'complete_company_profile',
    title: '完善专属报价抬头',
    description: '在「设置」中填写你的公司/团队抬头名称与联系电话，生成专属品牌报价单',
    credits: 5,
    ledgerReason: '任务奖励 · 完善专属报价抬头',
    mode: 'auto',
  },
  {
    id: 'first_quote',
    title: '生成首份智能报价单',
    description: '在任意项目中完成点位配置并生成第一份正式报价单',
    credits: 5,
    ledgerReason: '任务奖励 · 生成首份报价单',
    mode: 'auto',
  },
]

/** 判断邮箱是否为真实用户邮箱（排除微信一键注册生成的占位邮箱 @wx.fmkj.local） */
export function isRealUserEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const clean = email.trim().toLowerCase()
  return Boolean(clean) && !clean.endsWith('@wx.fmkj.local') && !clean.endsWith('@example.com')
}

/**
 * 幂等发放单个任务积分：
 * 通过检查 `ai-credit-ledger` 中是否已有相同 user + reason 的记录，确保每个账号每项任务终生最多领取一次。
 * 对于 `bind_wechat`，额外支持传入 `openid` 防止同一个微信号换绑多个账号重复刷积分。
 */
export async function grantTaskCreditIfEligible(
  userId: string,
  taskId: CreditTaskId,
  opts: { openid?: string | null } = {},
): Promise<{ granted: boolean; credits: number; reason: string }> {
  // 同一账号同一任务（微信绑定奖励按微信号）串行核验，避免并发请求在「查重 → 入账」之间重复发放
  const lockKey = taskId === 'bind_wechat' ? 'bind_wechat' : `${taskId}:${userId}`
  return withGrantLock(lockKey, () => grantTaskCreditUnlocked(userId, taskId, opts))
}

const grantLocks = new Map<string, Promise<unknown>>()

async function withGrantLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = grantLocks.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  const tail = run.catch(() => undefined)
  grantLocks.set(key, tail)
  try {
    return await run
  } finally {
    if (grantLocks.get(key) === tail) grantLocks.delete(key)
  }
}

async function grantTaskCreditUnlocked(
  userId: string,
  taskId: CreditTaskId,
  opts: { openid?: string | null },
): Promise<{ granted: boolean; credits: number; reason: string }> {
  const spec = CREDIT_TASKS.find((t) => t.id === taskId)
  if (!spec) return { granted: false, credits: 0, reason: '未知任务' }

  const payload = await getPayloadClient()

  // 1. 检查该用户是否已领取过该任务奖励
  const existingForUser = await payload.count({
    collection: 'ai-credit-ledger',
    where: {
      and: [{ user: { equals: userId } }, { reason: { like: `${spec.ledgerReason}%` } }],
    },
    overrideAccess: true,
  })
  if (existingForUser.totalDocs > 0) {
    return { granted: false, credits: 0, reason: '已领取过该奖励' }
  }

  // 2. 若是微信绑定奖励且带有 openid，检查该微信号是否已在其他有效账号上触发过微信绑定奖励（防止解绑重绑刷分）
  const reasonText =
    taskId === 'bind_wechat' && opts.openid
      ? `${spec.ledgerReason} (${opts.openid.slice(-6)})`
      : spec.ledgerReason

  if (taskId === 'bind_wechat' && opts.openid) {
    const prior = await payload.find({
      collection: 'ai-credit-ledger',
      where: { reason: { equals: reasonText } },
      limit: 20,
      depth: 0,
      overrideAccess: true,
      select: { user: true },
    })
    const otherUserIds = Array.from(
      new Set(
        prior.docs
          .map((d) => relId(d.user))
          .filter((id): id is string => Boolean(id) && id !== userId),
      ),
    )
    if (otherUserIds.length) {
      // 只拦截仍在使用中的账号；换绑时被自动停用的临时微信小号不算，避免真实账号领不到奖励
      const activeOthers = await payload.count({
        collection: 'users',
        where: { and: [{ id: { in: otherUserIds } }, { status: { equals: 'active' } }] },
        overrideAccess: true,
      })
      if (activeOthers.totalDocs > 0) {
        return { granted: false, credits: 0, reason: '该微信号已领取过绑定奖励' }
      }
    }
  }

  await payload.create({
    collection: 'ai-credit-ledger',
    data: {
      user: userId,
      delta: spec.credits,
      reason: reasonText,
    },
    overrideAccess: true,
    depth: 0,
  })

  return { granted: true, credits: spec.credits, reason: spec.ledgerReason }
}

export type UserCreditTaskStatus = CreditTaskSpec & {
  claimed: boolean
  eligible: boolean
}

/**
 * 查询当前用户的全部积分任务状态，并自动为已满足条件但尚未入账的 `auto` 类任务补发积分（如老账号已绑定邮箱/微信）。
 */
export async function loadAndSyncUserCreditTasks(user: User): Promise<{
  tasks: UserCreditTaskStatus[]
  autoGrantedCredits: number
}> {
  const payload = await getPayloadClient()
  const userId = String(user.id)

  const [wechatRes, quoteCount, ledgerRes] = await Promise.all([
    payload.find({
      collection: 'wechat-accounts',
      where: { user: { equals: userId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { openid: true },
    }),
    payload.count({
      collection: 'quotes',
      where: { project: { in: await getUserProjectIds(userId) } },
      overrideAccess: true,
    }),
    payload.find({
      collection: 'ai-credit-ledger',
      where: { user: { equals: userId } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
      select: { reason: true, delta: true },
    }),
  ])

  const hasRealEmail = isRealUserEmail(user.email)
  const hasWechat = wechatRes.docs.length > 0
  const wechatOpenid = (wechatRes.docs[0] as { openid?: string | null } | undefined)?.openid ?? null
  const profile = (
    user as { companyProfile?: { name?: string | null; phone?: string | null } | null }
  ).companyProfile
  const hasProfile = Boolean(profile?.name?.trim() && profile?.phone?.trim())
  const hasQuote = quoteCount.totalDocs > 0

  const claimedReasons = new Set(ledgerRes.docs.map((d) => String(d.reason ?? '')))
  const isClaimed = (spec: CreditTaskSpec) =>
    Array.from(claimedReasons).some(
      (r) => r === spec.ledgerReason || r.startsWith(`${spec.ledgerReason} (`),
    )

  const eligibilityMap: Record<CreditTaskId, boolean> = {
    bind_email: hasRealEmail,
    bind_wechat: hasWechat,
    follow_official_account: true,
    complete_company_profile: hasProfile,
    first_quote: hasQuote,
  }

  let autoGrantedCredits = 0
  // 自动为已达成条件的 bind_email / bind_wechat 触发一次静默核验入账
  for (const autoId of ['bind_email', 'bind_wechat'] as CreditTaskId[]) {
    const spec = CREDIT_TASKS.find((t) => t.id === autoId)!
    if (eligibilityMap[autoId] && !isClaimed(spec)) {
      const res = await grantTaskCreditIfEligible(
        userId,
        autoId,
        autoId === 'bind_wechat' ? { openid: wechatOpenid } : {},
      ).catch(() => ({
        granted: false,
        credits: 0,
      }))
      if (res.granted) {
        autoGrantedCredits += res.credits
        claimedReasons.add(spec.ledgerReason)
      }
    }
  }

  const tasks: UserCreditTaskStatus[] = CREDIT_TASKS.map((spec) => ({
    ...spec,
    claimed: isClaimed(spec),
    eligible: eligibilityMap[spec.id],
  }))

  return { tasks, autoGrantedCredits }
}

async function getUserProjectIds(userId: string): Promise<string[]> {
  const payload = await getPayloadClient()
  const res = await payload
    .find({
      collection: 'projects',
      where: { and: [{ owner: { equals: userId } }, { isDemoTemplate: { not_equals: true } }] },
      limit: 50,
      depth: 0,
      overrideAccess: true,
      select: {},
    })
    .catch(() => ({ docs: [] }))
  return res.docs.map((d) => String(d.id))
}
