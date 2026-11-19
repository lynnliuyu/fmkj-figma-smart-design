import { AiPageFallback } from '@/components/ai/ai-panel'
import { appAuth } from '@/lib/app-auth'
import { getCompanyInfo } from '@/lib/cached-data'
import { getPayloadClient } from '@/lib/payload'
import { PLUGINS } from '@/plugins'
import { aiConfigured } from '@/plugins/ai-copilot/server'
import { enabledAiModels } from '@/plugins/ai-copilot/templates'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: 'AI 对话' }

/**
 * AI 会话整页（#190 回退入口）：
 * 视口窄到放不下右栏（< AI_PANEL_COMPACT_WIDTH）时，AiPanel 隐藏，
 * 顶栏开关跳到这里接续同一个会话——同一个 AiSidebarDock 实例模型，
 * 同一份 localStorage 草稿（按 userId+会话隔离），消息与上下文不重复渲染。
 * 宽屏不经过此页（右栏常驻）。
 */
export default async function AiPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const payload = await getPayloadClient()
  const [company, projectsRes] = await Promise.all([
    getCompanyInfo(user.id),
    payload
      .find({
        collection: 'projects',
        where: { status: { not_equals: 'archived' } },
        sort: '-updatedAt',
        limit: 12,
        depth: 0,
        user,
        overrideAccess: false,
        select: { name: true, customerName: true, platform: true, pointCount: true },
      })
      .catch(() => ({ docs: [] })),
  ])

  const plugins = PLUGINS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    enabled: p.status === 'ready',
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
  const activeAiModels = enabledAiModels(company.aiModels)

  return (
    <AiPageFallback
      plugins={plugins}
      projects={projects}
      credits={user.aiCredits ?? 0}
      configured={aiConfigured(activeAiModels)}
      models={activeAiModels}
      userId={user.id}
    />
  )
}
