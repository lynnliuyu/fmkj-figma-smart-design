import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Bot, Clock, ExternalLink, FolderKanban, Settings } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { getCompanyInfo } from '@/lib/cached-data'
import { getPayloadClient } from '@/lib/payload'
import { AI_PERMISSIONS, isPluginId, PLUGINS } from '@/plugins'
import { DEFAULT_AI_TEMPLATES, enabledAiModels } from '@/plugins/ai-copilot/templates'
import { PLUGIN_DOC_STYLES } from '@/plugins/doc-styles/styles'
import { PLUGIN_STAGES } from '@/plugins'
import { buildTemplateGallery, getTemplatePreviewDocs } from '@/plugins/proposal/preview'
import { loadProposalTemplates } from '@/plugins/proposal/registry'
import { TemplateCard } from '@/components/proposal-template-card'
import { projectDisplayName } from '@/lib/project-name'
import { redirectToLogin } from '@/lib/login-redirect'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const plugin = PLUGINS.find((p) => p.id === id)
  return { title: pageTitle(plugin ? `${plugin.name} · 能力中心` : '能力详情') }
}

export default async function PluginDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  if (!isPluginId(id)) notFound()

  const plugin = PLUGINS.find((p) => p.id === id)
  if (!plugin) notFound()

  const payload = await getPayloadClient()
  const [company, templates, projectsRes, previewDocs] = await Promise.all([
    getCompanyInfo(user.id),
    plugin.id === 'proposal' ? loadProposalTemplates(user) : Promise.resolve([]),
    payload.find({
      collection: 'projects',
      where: { status: { not_equals: 'archived' } },
      sort: '-updatedAt',
      limit: 8,
      depth: 0,
      user,
      overrideAccess: false,
      select: { name: true, customerName: true, platform: true, pointCount: true },
    }),
    plugin.id === 'proposal' ? getTemplatePreviewDocs().catch(() => null) : Promise.resolve(null),
  ])

  const pending = plugin.status === 'coming-soon'
  const stage = PLUGIN_STAGES.find((s) => s.key === plugin.stage)!
  const activeAiModels = enabledAiModels(company.aiModels)
  const gallery = plugin.id === 'proposal' ? buildTemplateGallery(templates, previewDocs) : null
  const projects = projectsRes.docs.map((p) => ({
    id: String(p.id),
    name: projectDisplayName(p.name),
    customerName: p.customerName ?? null,
    platform: p.platform ?? null,
    points: p.pointCount ?? 0,
  }))

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/plugins">
            <ArrowLeft className="size-4" />
            返回能力中心
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/ai?plugin=${plugin.id}`}>
            <Bot className="size-4" />
            在 AI 对话中连接
          </Link>
        </Button>
      </div>

      <PageHeader
        title={plugin.name}
        description={plugin.description}
        actions={
          pending ? (
            <Badge variant="outline" className="text-muted-foreground">
              规划中
            </Badge>
          ) : null
        }
      />

      <div className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">项目阶段 · {stage.label}</Badge>
        <span>{plugin.tagline}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>插件能力与接入位置</CardTitle>
          <CardDescription>
            {pending
              ? `规划接入：${stage.label}（${stage.hint}）`
              : `接入阶段：${stage.label}（${stage.hint}）${plugin.entry ? ` · 入口：${plugin.entry.label}` : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {plugin.provides.map((item) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>

          {plugin.id === 'ai-copilot' ? (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    内置对话技能模板（{DEFAULT_AI_TEMPLATES.length} 套）
                  </span>
                  <Button asChild variant="outline" size="xs">
                    <Link href="/ai">
                      <Bot className="size-3.5" />
                      打开 AI 对话工作台
                    </Link>
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DEFAULT_AI_TEMPLATES.map((tpl) => {
                    const m =
                      activeAiModels.find((x) => x.id === tpl.recommendedModelId) ??
                      activeAiModels[0]
                    return (
                      <div key={tpl.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{tpl.name}</span>
                          <Badge variant="outline" className="h-4 px-1.5 text-xs">
                            {tpl.category}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{tpl.description}</p>
                        <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                          推荐：{m?.name} · 连接 {tpl.requiredPlugins.length} 个插件
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="text-xs font-medium text-muted-foreground">可用模型</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {activeAiModels.map((m) => (
                    <div key={m.id} className="rounded-lg border p-2.5 text-xs">
                      <div className="flex items-center justify-between font-medium">
                        <span>{m.name}</span>
                        <span className="text-muted-foreground tabular-nums">×{m.cost}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{m.tag}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {plugin.id === 'doc-styles' ? (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  包含的 {PLUGIN_DOC_STYLES.length} 套扩展打印风格
                </span>
                <Button asChild variant="outline" size="xs">
                  <Link href="/settings">
                    <Settings className="size-3.5" />
                    设置默认模板
                  </Link>
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PLUGIN_DOC_STYLES.map((s) => (
                  <div key={s.id} className="flex items-start gap-2.5 rounded-lg border p-3">
                    <span
                      className="mt-0.5 flex shrink-0 overflow-hidden rounded-sm ring-1 ring-foreground/10"
                      aria-hidden
                    >
                      <span className="size-3.5" style={{ backgroundColor: s.colors.paper }} />
                      <span className="size-3.5" style={{ backgroundColor: s.colors.accent }} />
                      <span className="size-3.5" style={{ backgroundColor: s.colors.headBg }} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.name}</div>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {gallery ? (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  可用的方案模板（业主方案 {gallery.items.filter((t) => t.kind === 'owner').length}{' '}
                  套 · 施工交底 {gallery.items.filter((t) => t.kind === 'construction').length} 套）
                </span>
                <Button asChild variant="outline" size="xs">
                  <Link href="/templates" target="_blank">
                    打开模板库
                    <ExternalLink className="size-3" />
                  </Link>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {gallery.items.map((t) => (
                  <TemplateCard key={t.value} t={t} thumb={gallery.thumbs[t.value]} />
                ))}
              </div>
            </div>
          ) : null}

          {plugin.ai ? (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  插件 AI 元数据（工具 {plugin.ai.tools.length} · 技能 {plugin.ai.skills.length} ·
                  知识条目 {plugin.ai.knowledge.length}）
                </span>
                <div className="flex flex-wrap gap-1">
                  {plugin.ai.permissions.map((perm) => {
                    const meta = AI_PERMISSIONS.find((p) => p.value === perm)
                    return (
                      <Badge
                        key={perm}
                        variant="outline"
                        className="font-mono text-[10px] font-normal"
                        title={meta?.label}
                      >
                        {perm}
                      </Badge>
                    )
                  })}
                </div>
              </div>

              {plugin.ai.tools.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {plugin.ai.tools.map((tool) => (
                    <div key={tool.name} className="rounded-lg border p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{tool.title}</span>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          +{tool.cost} 积分 · {tool.mutates ? '写入' : '只读'}
                        </Badge>
                      </div>
                      <code className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        {tool.name}
                      </code>
                      <p className="mt-1 text-muted-foreground">{tool.description}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {plugin.ai.knowledge.length > 0 ? (
                <div className="space-y-1.5">
                  {plugin.ai.knowledge.map((k) => (
                    <div key={k.id} className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                      <span className="font-medium">{k.title}：</span>
                      <span className="text-muted-foreground">{k.summary}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {pending ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <Clock className="size-6 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">「{plugin.name}」尚在待开发阶段</p>
            <p className="max-w-md text-xs text-muted-foreground">
              规划能力：{plugin.provides.join('、')}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button asChild variant="outline" size="sm">
              <Link href="/plugins">返回能力中心</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/ai?plugin=${plugin.id}`}>去 AI 对话推演需求</Link>
            </Button>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>在项目中使用</CardTitle>
            <CardDescription>
              {`选择下方项目，直接进入该能力在项目里的入口（${plugin.entry?.label ?? stage.hint}）`}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {projects.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                还没有进行中的项目，请先在「项目」中创建。
              </p>
            ) : (
              projects.map((proj) => {
                const targetHref = plugin.entry
                  ? plugin.entry.href(proj.id)
                  : `/projects/${proj.id}`
                const targetLabel =
                  plugin.id === 'proposal'
                    ? '打开方案'
                    : plugin.id === 'doc-styles'
                      ? '预览风格'
                      : plugin.id === 'ai-copilot'
                        ? '打开 AI 对话'
                        : '打开点位图'
                return (
                  <div
                    key={proj.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{proj.name}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {proj.customerName ? `${proj.customerName} · ` : ''}
                        {proj.platform || '平台待定'} · {proj.points} 个点位
                      </p>
                    </div>
                    <Button asChild variant="outline" size="xs">
                      <Link href={targetHref}>
                        {targetLabel}
                        <ExternalLink className="size-3" />
                      </Link>
                    </Button>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
