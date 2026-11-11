/**
 * HA-MCP 工具执行器。
 *
 * 每个 handler 把助手的函数调用翻译成一次 MCP `tools/call`。
 * 连接地址来自环境变量 `HA_MCP_ENDPOINT`（可选的 `HA_MCP_TOKEN` 放在 Authorization 头）。
 *
 * ⚠️ 设计取向：**没配置就明确说没配置，不静默失败、也不报 500。**
 * 助手会把这个提示原样转述给用户，用户就知道该去设置里填地址了。
 */
import type { AiToolHandler, ToolRunResult } from '@/plugins/ai-copilot/tools/context'

import { callTool, type HaMcpConfig } from './mcp-client'

const NOT_CONFIGURED =
  '还没有连接客户现场的 Home Assistant。请先在环境变量里配置 HA_MCP_ENDPOINT' +
  '（形如 https://<你的 HA 域名>/api/webhook/<webhook-id> 或 http://<ha-ip>:9584/private_xxx），' +
  '必要时再加 HA_MCP_TOKEN。'

function readConfig(): HaMcpConfig | null {
  const endpoint = process.env.HA_MCP_ENDPOINT?.trim()
  if (!endpoint) return null
  const token = process.env.HA_MCP_TOKEN?.trim()
  return {
    endpoint,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    timeoutMs: Number(process.env.HA_MCP_TIMEOUT_MS ?? 20_000),
  }
}

/** 统一包一层：拿配置 → 调工具 → 把文本结果交给模型 */
async function run(
  tool: string,
  args: Record<string, unknown>,
  summary: (text: string) => string,
): Promise<ToolRunResult> {
  const config = readConfig()
  if (!config) return { result: { error: NOT_CONFIGURED }, summary: '未配置 HA 连接' }

  try {
    const out = await callTool(config, tool, args)
    if (out.isError) {
      return { result: { error: out.text }, summary: `${tool} 返回错误` }
    }
    return { result: { text: out.text, data: out.raw }, summary: summary(out.text) }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { result: { error: message }, summary: `调用 ${tool} 失败` }
  }
}

const firstLine = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
    ?.slice(0, 60) ?? '无内容'

export const haMcpHandlers: Record<string, AiToolHandler> = {
  async ha_get_overview(args) {
    return run(
      'ha_get_overview',
      { include_states: args.include_states === true },
      (t) => `已读取现场总览：${firstLine(t)}`,
    )
  },

  async ha_search_entities(args) {
    const query = String(args.query ?? '').trim()
    if (!query) return { result: { error: '请给出搜索关键词' }, summary: '缺少关键词' }
    const payload: Record<string, unknown> = { query }
    if (args.area) payload.area = String(args.area)
    if (args.domain) payload.domain = String(args.domain)
    if (args.limit) payload.limit = Number(args.limit)
    return run('ha_search_entities', payload, (t) => `搜索「${query}」：${firstLine(t)}`)
  },

  async ha_list_areas() {
    return run('ha_list_floors_areas', {}, (t) => `已读取区域：${firstLine(t)}`)
  },

  async ha_get_history(args) {
    const entity = String(args.entity_id ?? '').trim()
    if (!entity) return { result: { error: '请给出实体 ID' }, summary: '缺少实体 ID' }
    return run(
      'ha_get_history',
      { entity_id: entity, hours: Number(args.hours ?? 24) },
      (t) => `${entity} 的历史：${firstLine(t)}`,
    )
  },

  async ha_get_system_health() {
    return run('ha_get_system_health', {}, (t) => `系统健康：${firstLine(t)}`)
  },

  async ha_call_service(args) {
    const domain = String(args.domain ?? '').trim()
    const service = String(args.service ?? '').trim()
    const entity = String(args.entity_id ?? '').trim()
    if (!domain || !service || !entity) {
      return {
        result: { error: '需要 domain / service / entity_id 三个参数' },
        summary: '参数不全',
      }
    }
    const callArgs: Record<string, unknown> = { domain, service, entity_id: entity }
    if (args.data && typeof args.data === 'object') callArgs.data = args.data
    return run(
      'ha_call_service',
      callArgs,
      (t) => `已执行 ${domain}.${service} → ${entity}：${firstLine(t)}`,
    )
  },
}
