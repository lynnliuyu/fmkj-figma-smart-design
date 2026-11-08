import Link from 'next/link'
import {
  ArrowLeft,
  ArrowUpRight,
  Blocks,
  Image as ImageIcon,
  Palette,
  Sparkles,
} from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { PLUGIN_TOOLS } from '@/lib/plugin-tools'
import { getPluginFlags } from '@/plugins/state'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('工具') }

const ICONS = {
  'ai-chat': Sparkles,
  'ai-image': ImageIcon,
  'floor-plan-style': Palette,
  'proposal-templates': Blocks,
  'doc-styles': Blocks,
  'usage-reports': Blocks,
} as const

export default async function PluginToolsPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const flags = await getPluginFlags(user.id)
  const tools = PLUGIN_TOOLS.filter((tool) => flags[tool.pluginId])
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href="/plugins">
          <ArrowLeft className="size-4" />
          返回能力中心
        </Link>
      </Button>
      <PageHeader
        title="工具"
        description="可以独立打开的功能页面，点开即用、按 AI 积分计费；需要项目上下文的入口仍从项目内进入。"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const Icon = ICONS[tool.id as keyof typeof ICONS] ?? Blocks
          return (
            <Link
              key={tool.id}
              href={tool.href}
              className="group rounded-2xl border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:bg-muted/20"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
              </div>
              <div className="mt-3 text-sm font-medium">{tool.name}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {tool.description}
              </p>
            </Link>
          )
        })}
      </div>
      {tools.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          还没有可用的工具，稍后会自动出现在这里。
        </p>
      ) : null}
    </section>
  )
}
