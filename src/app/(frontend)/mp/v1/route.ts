import { wechatConfigured } from '@/lib/mp/auth'
import { ok } from '@/lib/mp/http'
import { aiConfigured } from '@/plugins/ai-copilot/server'

export const dynamic = 'force-dynamic'

/** 健康检查：小程序启动时确认服务器地址可用，以及是否开放微信登录。 */
export async function GET() {
  return ok({
    name: 'FMKJ 小程序接口',
    version: 1,
    wechatLogin: wechatConfigured(),
    ai: aiConfigured(),
  })
}
