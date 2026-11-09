import { FilterTabs } from '@/components/filter-tabs'
import { PageHeader } from '@/components/page-header'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import {
  PLUGIN_CATEGORIES,
  PLUGIN_STAGES,
  PLUGINS,
  type PluginCategory,
  type PluginStage,
} from '@/plugins'

import { PluginList, type PluginViewItem, type PluginViewSection } from './plugin-list'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('能力中心') }

const isStage = (v: unknown): v is PluginStage => PLUGIN_STAGES.some((s) => s.key === v)

export default async function PluginsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; plugin?: string }>
}) {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const sp = await searchParams
  const stage = isStage(sp.stage) ? sp.stage : null

  const items: (PluginViewItem & { category: PluginCategory | undefined })[] = PLUGINS.filter(
    (p) => p.status === 'ready',
  ).map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    status: p.status,
    entry: p.entry?.label ?? null,
    provides: p.provides,
    category: p.category,
  }))
  const filtered = items.filter(
    (p) => !stage || PLUGINS.find((x) => x.id === p.id)?.stage === stage,
  )

  // 按能力中心的三类分组：AI 能力 / 模板 / 工具（分类判定见 PROJECT-ARCHITECTURE §4.6.3）
  const sections: PluginViewSection[] = PLUGIN_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    hint: c.hint,
    items: filtered
      .filter((p) => p.category === c.key)
      .map(({ category: _category, ...item }) => item),
  })).filter((s) => s.items.length > 0)

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="能力中心"
        description="点开即用，按 AI 积分计费。"
        actions={
          <FilterTabs
            label="阶段"
            items={[
              { key: 'all', label: '全部阶段', href: '/capabilities', active: !stage },
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
      <PluginList sections={sections} selectedId={sp.plugin ?? null} />
    </section>
  )
}
