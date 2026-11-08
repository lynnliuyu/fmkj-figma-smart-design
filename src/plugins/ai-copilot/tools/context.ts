import { loadProjectDocs } from '@/lib/project-docs'
import type { User } from '@/payload-types'
import type { RegisteredToolSpec } from '@/plugins/ai-catalog'
import type { PluginFlags } from '@/plugins/state'

import type { TokenUsage } from '../billing'
import type { AiModelConfig } from '../templates'

export type ActiveProjectUpdate = {
  id: string
  name: string
  customerName: string | null
  platform: string | null
  pointCount: number
}

/** 本轮对话里用户附带的图片（已压成视觉模型可用的 data URL） */
export type ToolImage = {
  dataUrl: string
  mediaId?: string | null
  url?: string | null
  kind?: string | null
  name?: string
}

export type ToolContext = {
  user: User
  projectId: string | null
  project: Awaited<ReturnType<typeof loadProjectDocs>> | null
  onProjectChange?: (proj: ActiveProjectUpdate) => void
  mutated?: boolean
  /** 本轮对话可用的图片（生图参考、看图规划使用） */
  images?: ToolImage[]
  /** 视觉模型看图结论（已注入对话上下文） */
  visionBrief?: string
  /** 可用的视觉模型（按能力排序），工具内部看图时使用 */
  visionModels?: AiModelConfig[]
  /** 工具内部调用模型产生的 tokens 计入本次对话费用 */
  recordUsage?: (
    model: AiModelConfig,
    usage: TokenUsage | null,
    fallback?: { input: string; output: string },
  ) => void
  /** 长耗时工具向前端推送进度提示 */
  notify?: (status: string) => void
}

export type ToolRunResult = {
  result: unknown
  summary: string
  href?: string
  hrefLabel?: string
  /** AI 生图返回的媒体 URL，聊天里直接展示 */
  imageUrl?: string
}

export type AiToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolRunResult>

export type AiTool = {
  /** null 表示核心内置工具（始终可用）；非 null 表示需开启并勾选对应插件 */
  pluginId: keyof PluginFlags | null
  pluginName: string
  spec: RegisteredToolSpec
  definition: Record<string, unknown>
  run: AiToolHandler
}

export async function refreshContextProject(ctx: ToolContext, targetProjectId: string) {
  ctx.projectId = targetProjectId
  ctx.project = await loadProjectDocs(targetProjectId, ctx.user).catch(() => null)
  if (ctx.project) {
    ctx.onProjectChange?.({
      id: String(ctx.project.project.id),
      name: ctx.project.project.name,
      customerName: ctx.project.project.customerName ?? null,
      platform: ctx.project.project.platform ?? null,
      pointCount: ctx.project.points.length,
    })
  }
}
