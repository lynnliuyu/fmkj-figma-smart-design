import { appAuth } from '@/lib/app-auth'
import { getCompanyInfo } from '@/lib/cached-data'

import { PLUGINS, type PluginId } from '.'

export type PluginFlags = Record<PluginId, boolean>

/**
 * 各插件当前是否启用（服务端读取；设置里关闭的插件为 false，新安装的插件默认开启）。
 * 平台已取消会员分级，插件是否可用只取决于账号自己的开关，不再有等级门槛。
 */
export async function getPluginFlags(userId?: string | number | null): Promise<PluginFlags> {
  let resolvedUserId = userId
  if (resolvedUserId === undefined) {
    const currentUser = await appAuth.getCurrentUser().catch(() => null)
    resolvedUserId = currentUser?.id ?? null
  }
  const { disabledPlugins } = await getCompanyInfo(resolvedUserId)
  const disabled = new Set(disabledPlugins)
  return Object.fromEntries(
    PLUGINS.map((p) => [p.id, p.status === 'ready' && !disabled.has(p.id)]),
  ) as PluginFlags
}
