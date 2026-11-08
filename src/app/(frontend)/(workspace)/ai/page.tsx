import Link from 'next/link'
import { Bot } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { getCompanyInfo } from '@/lib/cached-data'
import { getPayloadClient } from '@/lib/payload'
import { PLUGINS } from '@/plugins'
import { aiConfigured } from '@/plugins/ai-copilot/server'
import { enabledAiModels } from '@/plugins/ai-copilot/templates'
import { getPluginFlags } from '@/plugins/state'

import { AiSidebarDock } from '@/components/ai/ai-sidebar-dock'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('AI 对话') }

export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{ plugin?: string }>
}) {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()

  const payload = await getPayloadClient()
  const [sp, flags, company, projectsRes] = await Promise.all([
    searchParams,
    getPluginFlags(user.id),
    getCompanyInfo(user.id),
    payload.find({
      collection: 'projects',
      where: { status: { not_equals: 'archived' } },
      sort: '-updatedAt',
      limit: 15,
      depth: 0,
      user,
      overrideAccess: false,
      select: { name: true, customerName: true, platform: true, pointCount: true },
    }),
  ])

  if (!flags['ai-copilot']) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="size-6" />
        </span>
        <div className="space-y-1">
          <h1 className="text-base font-semibold">「AI 对话侧栏（高级）」插件已关闭</h1>
          <p className="text-xs text-muted-foreground">
            该功能面向高级用户提供侧边栏常驻对话、技能模板库、多模型积分计费与跨插件调用。需要使用时可在插件中心开启。
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/plugins/ai-copilot">去插件页开启</Link>
        </Button>
      </section>
    )
  }

  const plugins = PLUGINS.filter((p) => p.id !== 'ai-copilot').map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    enabled: flags[p.id],
    where: p.where,
    provides: p.provides,
  }))

  const projects = projectsRes.docs.map((proj) => ({
    id: String(proj.id),
    name: proj.name,
    customerName: proj.customerName ?? null,
    platform: proj.platform ?? null,
    pointCount: proj.pointCount ?? 0,
  }))

  const activeModels = enabledAiModels(company.aiModels)
  // 从插件详情页「去 AI 对话推演需求」进来时，预先填好关于这个插件的问题
  const fromPlugin = sp.plugin ? PLUGINS.find((p) => p.id === sp.plugin) : undefined
  const initialInput = fromPlugin
    ? `我想用「${fromPlugin.name}」插件：${fromPlugin.description} 结合我手上的项目，它能帮我做什么？应该怎么开始？`
    : undefined

  return (
    // 视口高度减去 48px 顶栏和 main 的上下内边距
    <div className="mx-auto flex h-[calc(100svh-5.5rem)] w-full max-w-3xl flex-col md:h-[calc(100svh-6.5rem)]">
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground">AI 对话</span>
        <Button asChild size="sm" variant="outline">
          <Link href="/ai/image">AI 生图 →</Link>
        </Button>
      </div>
      <AiSidebarDock
        plugins={plugins}
        projects={projects}
        credits={user.aiCredits ?? 0}
        configured={aiConfigured(activeModels)}
        models={activeModels}
        initialInput={initialInput}
      />
    </div>
  )
}
