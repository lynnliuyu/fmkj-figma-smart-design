import { previewDemoEnabled } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'

const PREVIEW_DEMO_EMAIL = 'demo@fmkj.dev'

/**
 * 平台运营人员：可以查看全体客户的使用与诊断报告（跨客户数据，普通成员一律不可见）。
 * 满足任一条件即可：
 * - 邮箱在环境变量 PLATFORM_ADMIN_EMAILS（逗号/空格分隔）中；
 * - 邮箱与 Payload 后台（/admin）的 CMS 管理员账号一致；
 * - Figma Make 预览环境中的内置演示管理员账号。
 */
export async function isPlatformOperator(
  user: { email?: string | null } | null | undefined,
): Promise<boolean> {
  const email = user?.email?.trim().toLowerCase()
  if (!email) return false
  const listed = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(/[\s,;，；]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (listed.includes(email)) return true
  if (previewDemoEnabled() && email === PREVIEW_DEMO_EMAIL) return true
  const payload = await getPayloadClient()
  const res = await payload
    .count({ collection: 'admins', where: { email: { equals: email } }, overrideAccess: true })
    .catch(() => null)
  return (res?.totalDocs ?? 0) > 0
}
