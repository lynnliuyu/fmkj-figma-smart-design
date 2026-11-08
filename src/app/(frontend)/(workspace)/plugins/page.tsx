import { FilterTabs } from '@/components/filter-tabs'
import { PageHeader } from '@/components/page-header'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { PLUGIN_STAGES, PLUGINS, type PluginStage } from '@/plugins'
import { getPluginFlags } from '@/plugins/state'

import { PluginList, type PluginViewItem } from './plugin-list'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('插件市场') }

const isStage = (v: unknown): v is PluginStage => PLUGIN_STAGES.some((s) => s.key === v)

export default async function PluginsPage({ searchParams }: { searchParams: Promise<{ stage?: string; plugin?: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const [sp, flags] = await Promise.all([searchParams, getPluginFlags(user.id)])
  const stage = isStage(sp.stage) ? sp.stage : null

  const items: PluginViewItem[] = PLUGINS.filter((p) => p.status === 'ready').map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    status: p.status,
    stage: p.stage,
    entry: p.entry?.label ?? null,
    provides: p.provides,
    enabled: flags[p.id],
  }))
  const filtered = items.filter((p) => !stage || p.stage === stage)

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="插件市场"
        description="按需开启扩展能力，全部功能均对所有账号开放，使用时按 AI 积分计费。"
        actions={
          <FilterTabs
            label="插件阶段"
            items={[
              { key: 'all', label: '全部阶段', href: '/plugins', active: !stage },
              ...PLUGIN_STAGES.map((s) => ({
                key: s.key,
                label: s.label,
                href: `/plugins?stage=${s.key}`,
                active: stage === s.key,
              })),
            ]}
          />
        }
      />
      <PluginList items={filtered} selectedId={sp.plugin ?? null} />
    </section>
  )
}
