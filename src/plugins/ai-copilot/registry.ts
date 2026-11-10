import { getPayloadClient } from '@/lib/payload'
import { canEditProject } from '@/lib/project-access'
import { ARCHIVED_MESSAGE, READONLY_COLLAB_MESSAGE } from '@/lib/project-guards'
import { allAiToolSpecs, PLUGIN_AI_SPECS, validatePluginAiPermissions } from '@/plugins/ai-catalog'
import { haMcpHandlers } from '@/plugins/ha-mcp/ai-handlers'
import { proposalHandlers } from '@/plugins/proposal/ai-handlers'
import { roomInsightsHandlers } from '@/plugins/room-insights/ai-handlers'
import { smartSelectHandlers } from '@/plugins/smart-select/ai-handlers'
import type { PluginFlags } from '@/plugins/state'
import type { PluginId } from '@/plugins/types'

import { coreToolHandlers } from './tools/core-handlers'
import { competitorQuoteHandlers } from './tools/competitor-quote'
import type { AiTool, AiToolHandler, ToolContext } from './tools/context'

export type {
  ActiveProjectUpdate,
  AiTool,
  AiToolHandler,
  ToolContext,
  ToolRunResult,
} from './tools/context'
export { refreshContextProject } from './tools/context'

export type LlmToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** 汇总各插件自己注册的工具执行函数（去中心化维护，按工具名映射） */
const HANDLER_MAP: Record<string, AiToolHandler> = {
  ...coreToolHandlers,
  ...competitorQuoteHandlers,
  ...roomInsightsHandlers,
  ...smartSelectHandlers,
  ...proposalHandlers,
}

/** 根据各插件声明的 AiToolSpec 自动构建完整工具列表 */
export const REGISTERED_AI_TOOLS: AiTool[] = allAiToolSpecs()
  .filter((spec) => Boolean(HANDLER_MAP[spec.name]))
  .map((spec) => ({
    pluginId: spec.pluginId,
    pluginName: spec.title,
    spec,
    definition: {
      type: 'function',
      function: {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
      },
    },
    run: HANDLER_MAP[spec.name]!,
  }))

/** 本次对话可用的工具：核心工具始终可用，插件工具需对应插件已开启且已勾选 */
export function availableTools(
  _modelId: string,
  pluginIds: string[],
  flags: PluginFlags,
): AiTool[] {
  return REGISTERED_AI_TOOLS.filter(
    (t) => t.pluginId === null || (flags[t.pluginId] && pluginIds.includes(t.pluginId)),
  )
}

/** 获取当前对话已激活插件的 AI 指导原则与知识条目（用于动态拼装系统提示词） */
export function activePluginPromptLines(pluginIds: string[], flags?: PluginFlags): string[] {
  const lines: string[] = []
  const activeIds = new Set<PluginId>(['ai-copilot'])
  for (const id of pluginIds) {
    if (id in PLUGIN_AI_SPECS && (!flags || flags[id as PluginId])) {
      activeIds.add(id as PluginId)
    }
  }
  for (const id of activeIds) {
    const spec = PLUGIN_AI_SPECS[id]
    if (!spec) continue
    for (const g of spec.guidance) {
      lines.push(`- [${id}] ${g}`)
    }
  }
  return lines
}

/**
 * 执行工具调用，并在执行前统一实施插件权限、项目关联与归档/协作只读守卫：
 * 1. 校验工具所需的 permissions 均在所属插件声明的 permissions 白名单内；
 * 2. 若 scope === 'project'，确保存在目标项目；
 * 3. 若 mutates === true 且针对具体项目，校验当前用户具有编辑权限且项目未归档（allowArchived 除外）。
 */
export async function runTool(tools: AiTool[], call: LlmToolCall, ctx: ToolContext) {
  const tool = tools.find((t) => t.spec.name === call.function.name)
  if (!tool) return { tool: null, output: { error: '未知工具或对应插件未启用' } }

  const ownerId: PluginId = tool.pluginId ?? 'ai-copilot'
  const declaredPerms = new Set(PLUGIN_AI_SPECS[ownerId]?.permissions ?? [])
  for (const perm of tool.spec.permissions) {
    if (!declaredPerms.has(perm)) {
      return {
        tool,
        output: { error: `工具「${tool.pluginName}」缺少插件权限声明：${perm}` },
        summary: '权限校验未通过',
      }
    }
  }

  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
  } catch {
    // 参数解析失败按空参数处理
  }

  const argProjectId =
    tool.spec.projectArg &&
    typeof args[tool.spec.projectArg] === 'string' &&
    String(args[tool.spec.projectArg]).trim()
      ? String(args[tool.spec.projectArg]).trim()
      : null
  const targetProjectId = argProjectId ?? ctx.projectId

  if (tool.spec.scope === 'project' && !targetProjectId) {
    return {
      tool,
      output: {
        error: '当前尚未关联项目，请先调用 list_projects 选择项目或调用 create_project 新建项目',
      },
      summary: '未关联项目',
    }
  }

  if (tool.spec.mutates && targetProjectId) {
    const payload = await getPayloadClient()
    const proj = await payload
      .findByID({
        collection: 'projects',
        id: targetProjectId,
        depth: 0,
        overrideAccess: true,
        select: { status: true, owner: true, collaborators: true },
      })
      .catch(() => null)
    if (!proj) {
      return { tool, output: { error: '目标项目不存在或已被删除' }, summary: '项目不存在' }
    }
    if (!canEditProject(proj as never, ctx.user.id)) {
      return { tool, output: { error: READONLY_COLLAB_MESSAGE }, summary: '仅查看权限，无法修改' }
    }
    if (proj.status === 'archived' && !tool.spec.allowArchived) {
      return { tool, output: { error: ARCHIVED_MESSAGE }, summary: '项目已归档' }
    }
  }

  try {
    const { result, summary, href, hrefLabel, imageUrl } = await tool.run(args, ctx)
    return { tool, output: result, summary, href, hrefLabel, imageUrl }
  } catch (error) {
    console.error('[ai] tool failed', call.function.name, error)
    return { tool, output: { error: `工具执行失败：${(error as Error)?.message ?? '未知错误'}` } }
  }
}

export { validatePluginAiPermissions }
