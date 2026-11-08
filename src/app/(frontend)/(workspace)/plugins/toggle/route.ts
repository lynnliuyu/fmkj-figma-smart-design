import { revalidatePath } from 'next/cache'

import { appAuth } from '@/lib/app-auth'
import { getCompanyInfo } from '@/lib/cached-data'
import { getPayloadClient } from '@/lib/payload'
import { isPluginId, PLUGINS } from '@/plugins'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/** 切换单个已开发插件的启用状态（待开发插件不可启用）。 */
export async function POST(request: Request) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')

  let body: { id?: unknown; enabled?: unknown }
  try {
    body = (await request.json()) as { id?: unknown; enabled?: unknown }
  } catch {
    return fail(400, '提交的数据格式无效')
  }

  if (!isPluginId(body.id) || typeof body.enabled !== 'boolean') {
    return fail(400, '插件参数无效')
  }

  const plugin = PLUGINS.find((p) => p.id === body.id)
  if (!plugin || plugin.status !== 'ready') {
    return fail(400, '该插件尚在待开发阶段，暂不可开启')
  }

  const company = await getCompanyInfo(user.id)
  const disabled = new Set(company.disabledPlugins.filter((id) => isPluginId(id)))
  if (body.enabled) {
    disabled.delete(plugin.id)
  } else {
    disabled.add(plugin.id)
  }

  try {
    const payload = await getPayloadClient()
    const existingUser = await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 0,
      overrideAccess: true,
      select: { companyProfile: true } as never,
    })
    const prevProfile = ((existingUser as unknown as { companyProfile?: Record<string, unknown> | null })?.companyProfile ?? {})
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        companyProfile: {
          ...prevProfile,
          disabledPlugins: [...disabled],
        },
      } as never,
      overrideAccess: true,
      depth: 0,
    })
    // 插件开关影响整个工作区（侧边栏、归档页文档入口等），统一失效页面缓存
    revalidatePath('/', 'layout')
    return Response.json({ ok: true, enabled: body.enabled })
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status === 403) return fail(403, '没有权限修改插件设置')
    console.error('[plugins] toggle failed', error)
    return fail(500, '保存失败，请稍后重试')
  }
}
