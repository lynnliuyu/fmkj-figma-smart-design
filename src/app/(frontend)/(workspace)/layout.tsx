import { AiPanel, AiPanelProvider } from '@/components/ai/ai-panel'
import { WorkspaceShell } from '@/components/workspace-shell'
import { appAuth } from '@/lib/app-auth'
import { getCompanyInfo } from '@/lib/cached-data'
import { getPayloadClient } from '@/lib/payload'
import { isPlatformOperator } from '@/lib/platform-operator'
import { PLUGINS } from '@/plugins'
import { aiConfigured } from '@/plugins/ai-copilot/server'
import { enabledAiModels } from '@/plugins/ai-copilot/templates'
import { redirectToLogin } from '@/lib/login-redirect'

/** 需要成员登录的系统页面。 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const payload = await getPayloadClient()
  const [company, projectsRes, operator] = await Promise.all([
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
    isPlatformOperator(user),
  ])

  const disabled = new Set(company.disabledPlugins)
  const plugins = PLUGINS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    enabled: p.status === 'ready' && !disabled.has(p.id),
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

  const aiCopilotEnabled = plugins.some(
    (p) => p.id === 'ai-copilot' && p.status === 'ready' && p.enabled,
  )

  return (
    /* AI 对话右栏：宽屏常驻一列，窄屏收成抽屉（断点理由见 lib/ai-panel.ts） */
    <AiPanelProvider enabled={aiCopilotEnabled}>
      <WorkspaceShell
        user={{ name: user.name, email: user.email }}
        brand={{ name: company.name, logo: company.logo?.url ?? null }}
        plugins={plugins}
        ai={{ credits: user.aiCredits ?? 0 }}
        showOperatorReports={operator}
        rightPanel={
          <AiPanel
            plugins={plugins}
            projects={projects}
            credits={user.aiCredits ?? 0}
            configured={aiConfigured(activeAiModels)}
            models={activeAiModels}
            userId={user.id}
          />
        }
      >
        {children}
      </WorkspaceShell>
    </AiPanelProvider>
  )
}
