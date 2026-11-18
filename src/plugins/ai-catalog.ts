import { coreAiSpec } from './ai-copilot/core-ai'
import { aiImportSpec } from './ai-import/ai'
import type { AiSkillSpec, AiToolSpec, PluginAiSpec } from './ai-types'
import { haMcpAiSpec } from './ha-mcp/ai'
import { EXTRA_PLUGIN_AI_SPECS } from './plugin-ai-specs'
import { proposalAiSpec } from './proposal/ai'
import { roomInsightsAiSpec } from './room-insights/ai'
import { smartSelectAiSpec } from './smart-select/ai'
import type { PluginId } from './types'

/**
 * 各插件的 AI 元数据注册表（纯数据，不依赖 Payload 服务端插件实例，客户端、计费模块与知识库导出脚本均可安全导入）。
 */
export const PLUGIN_AI_SPECS: Record<PluginId, PluginAiSpec> = {
  'ai-copilot': coreAiSpec,
  'room-insights': roomInsightsAiSpec,
  'smart-select': smartSelectAiSpec,
  proposal: proposalAiSpec,
  'ai-import': aiImportSpec,
  'doc-styles': EXTRA_PLUGIN_AI_SPECS['doc-styles']!,
  'dwg-import': EXTRA_PLUGIN_AI_SPECS['dwg-import']!,
  'after-sales': EXTRA_PLUGIN_AI_SPECS['after-sales']!,
  'ha-mcp': haMcpAiSpec,
  'business-card': EXTRA_PLUGIN_AI_SPECS['business-card']!,
  'cad-editor': EXTRA_PLUGIN_AI_SPECS['cad-editor']!,
}

export type RegisteredToolSpec = AiToolSpec & {
  /** null 表示核心内置工具（随 ai-copilot 始终启用）；非 null 表示所属插件 ID */
  pluginId: PluginId | null
}

/** 汇总全平台所有已注册的 AI 工具规格（核心工具 + 各插件自注册工具） */
export function allAiToolSpecs(): RegisteredToolSpec[] {
  const out: RegisteredToolSpec[] = []
  for (const [id, spec] of Object.entries(PLUGIN_AI_SPECS) as [PluginId, PluginAiSpec][]) {
    const owner = id === 'ai-copilot' ? null : id
    for (const tool of spec.tools) {
      out.push({ ...tool, pluginId: owner })
    }
  }
  return out
}

/** 汇总全平台所有插件注册的 AI 对话技能模板 */
export function allAiSkillSpecs(): AiSkillSpec[] {
  const out: AiSkillSpec[] = []
  for (const spec of Object.values(PLUGIN_AI_SPECS)) {
    out.push(...spec.skills)
  }
  return out
}

/** 校验每个插件下所有工具声明的权限是否都在该插件自身的 permissions 白名单内 */
export function validatePluginAiPermissions(): { ok: boolean; violations: string[] } {
  const violations: string[] = []
  for (const [pluginId, spec] of Object.entries(PLUGIN_AI_SPECS) as [PluginId, PluginAiSpec][]) {
    const allowed = new Set(spec.permissions)
    for (const tool of spec.tools) {
      for (const perm of tool.permissions) {
        if (!allowed.has(perm)) {
          violations.push(`插件 ${pluginId} 的工具 ${tool.name} 声明了未授权权限 ${perm}`)
        }
      }
    }
  }
  return { ok: violations.length === 0, violations }
}
