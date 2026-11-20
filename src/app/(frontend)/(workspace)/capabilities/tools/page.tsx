import Image from 'next/image'
import { ArrowLeft, ArrowUpRight, Blocks } from 'lucide-react'

import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HoverPrefetchLink } from '@/components/hover-prefetch-link'
import { PageHeader } from '@/components/page-header'
import { Button } from '@astryxdesign/core/Button'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { PLUGIN_TOOLS } from '@/lib/plugin-tools'
import { getPluginFlags } from '@/plugins/state'
import { redirectToLogin } from '@/lib/login-redirect'
import { filterFeaturedTools, TOOL_CARD_META } from './page-data'

export const metadata = { title: pageTitle('工具') }

export default async function PluginToolsPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const flags = await getPluginFlags(user.id)
  const available = PLUGIN_TOOLS.filter((tool) => flags[tool.pluginId])
  const tools = filterFeaturedTools(available)

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground"
        href="/capabilities"
        icon={<ArrowLeft />}
        label="返回能力中心"
      />
      <PageHeader title="工具" description="点开即用的工具，无需项目上下文，直接打开就能用。" />
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => {
          const meta = TOOL_CARD_META[tool.id as keyof typeof TOOL_CARD_META]
          return (
            <HoverPrefetchLink
              key={tool.id}
              href={tool.href}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs transition duration-200 hover:border-border hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
            >
              <div className="relative aspect-[16/10] overflow-hidden border-b bg-muted/40">
                <Image
                  src={meta.cover}
                  alt={meta.coverAlt}
                  fill
                  sizes="(min-width: 1024px) 480px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
                />
                <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-xs backdrop-blur-sm">
                  {meta.chip}
                </span>
                {/* 封面与内容区之间只留一层很轻的渐隐，避免图片边界抢戏 */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background/60 to-transparent"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight">{tool.name}</h2>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5"
                  />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
                <div className="mt-auto pt-2">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {meta.footer}
                  </span>
                </div>
              </div>
            </HoverPrefetchLink>
          )
        })}
      </div>
      {tools.length === 0 ? (
        <EmptyState
          className="min-h-42.5 rounded-2xl border border-dashed border-workspace-outline bg-workspace-paper dark:border-workspace-outline-dark dark:bg-workspace-panel-dark"
          icon={
            <Center className="size-10 rounded-full bg-workspace-icon-surface dark:bg-workspace-icon-surface-dark">
              <Blocks className="size-5" />
            </Center>
          }
          title="还没有可用的工具"
          description="启用能力中心的插件后，工具会自动出现在这里。"
        />
      ) : null}
    </section>
  )
}
