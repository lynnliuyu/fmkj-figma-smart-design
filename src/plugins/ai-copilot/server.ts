import type { TokenUsage } from './billing'
import type { loadProjectDocs } from '@/lib/project-docs'
import type { PluginFlags } from '@/plugins/state'

import {
  activePluginPromptLines,
  availableTools,
  runTool,
  type ActiveProjectUpdate,
  type AiTool,
  type LlmToolCall,
  type ToolContext,
} from './registry'
import {
  AI_PROVIDER_CHANNELS,
  AUTO_AI_MODEL,
  CUSTOM_KEY_ENV_RE,
  DEFAULT_AI_MODELS,
  enabledAiModels,
  isAiProviderChannelId,
  isVisionCapableModel,
  normalizeCustomBaseUrl,
  type AiModelConfig,
} from './templates'

export {
  availableTools,
  runTool,
  type ActiveProjectUpdate,
  type AiTool,
  type LlmToolCall,
  type ToolContext,
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localhost')
  ) {
    return true
  }
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true
  const m172 = /^172\.(\d+)\./.exec(h)
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true
  return false
}

/**
 * 严格按受信任渠道（channelId）解析 API Key 与请求地址，两个值一对一绑定：
 * - 官方渠道只读对应官方环境变量，且只发往对应官方 HTTPS 域名；
 * - NewAPI 聚合网关只从服务端环境变量 NEWAPI_BASE_URL（需为公网 HTTPS）与 NEWAPI_API_KEY 读取，绝不接受客户端传入的 URL 或环境变量名。
 */
export function resolveModelEndpoint(
  model?:
    | (Pick<AiModelConfig, 'channelId'> & Partial<Pick<AiModelConfig, 'baseUrl' | 'apiKeyEnv'>>)
    | null,
): {
  url: string
  apiKey: string | null
  envKey: string
} {
  // 自定义渠道：地址与变量名已在 parseAiModels 中校验（公网 HTTPS、AI_ 前缀），这里再校验一次
  if (model?.channelId === 'custom') {
    const base = normalizeCustomBaseUrl(model.baseUrl)
    const envKey = model.apiKeyEnv && CUSTOM_KEY_ENV_RE.test(model.apiKeyEnv) ? model.apiKeyEnv : ''
    return {
      url: base ? `${base}/chat/completions` : '',
      apiKey: base && envKey ? process.env[envKey]?.trim() || null : null,
      envKey,
    }
  }
  const channelId = isAiProviderChannelId(model?.channelId) ? model.channelId : 'deepseek'
  const channel = AI_PROVIDER_CHANNELS[channelId]

  if (channelId === 'newapi') {
    const rawBase = (process.env.NEWAPI_BASE_URL || process.env.APP_OPENAI_BASE_URL || '')
      .trim()
      .replace(/\/+$/, '')
    let validUrl = ''
    if (rawBase) {
      try {
        const parsed = new URL(
          rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`,
        )
        if (parsed.protocol === 'https:' && !isPrivateOrLocalHost(parsed.hostname)) {
          validUrl = parsed.toString()
        }
      } catch {
        validUrl = ''
      }
    }
    const apiKey = (process.env.NEWAPI_API_KEY || process.env.ONEAPI_KEY || '').trim() || null
    return {
      url: validUrl,
      apiKey: validUrl ? apiKey : null,
      envKey: 'NEWAPI_BASE_URL + NEWAPI_API_KEY',
    }
  }

  const apiKey = process.env[channel.apiKeyEnv]?.trim() || null
  const base = channel.baseUrl.replace(/\/+$/, '')
  return {
    url: base.endsWith('/chat/completions') ? base : `${base}/chat/completions`,
    apiKey,
    envKey: channel.apiKeyEnv,
  }
}

export function resolveModelApiKey(
  model?: Parameters<typeof resolveModelEndpoint>[0],
): string | null {
  return resolveModelEndpoint(model).apiKey
}

/** 检查受信任渠道列表中哪些已在服务端配置好环境变量（仅返回固定渠道的布尔状态，不探测任意环境变量） */
export function getConfiguredEnvStatus(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const ch of Object.values(AI_PROVIDER_CHANNELS)) {
    out[ch.id] = Boolean(resolveModelEndpoint({ channelId: ch.id }).apiKey)
  }
  return out
}

/** 过滤 DeepSeek 偶发在纯文本模式输出的内部 DSML 协议标签 */
export function stripDsml(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/<[｜|]+DSML[｜|]+[\s\S]*$/g, '')
    .replace(/<\/?[｜|]*DSML[^>]*>/g, '')
    .trim()
}

export const aiConfigured = (models?: AiModelConfig[]) => {
  if (models?.length)
    return models.some((m) => m.enabled && m.id !== 'auto' && Boolean(resolveModelApiKey(m)))
  return Boolean(resolveModelApiKey({ channelId: 'deepseek' }))
}

export const findModel = (
  id: unknown,
  models: AiModelConfig[] = DEFAULT_AI_MODELS,
): AiModelConfig => {
  if (id === 'auto') return AUTO_AI_MODEL
  const list = enabledAiModels(models)
  return list.find((m) => m.id === id) ?? list.find((m) => m.id !== 'auto') ?? DEFAULT_AI_MODELS[0]
}

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | LlmContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

/** 专业重型工具集合：调用这些工具或对这些工具结果做工程分析时，Auto 模式自动升级到 Qwen-3.x / GLM-5.3 等专业强模型 */
export const PRO_EXPERT_TOOLS = new Set([
  'add_floor_sheet',
  'import_points_json',
  'plan_points_with_vision',
  'smart_select',
  'set_project_defaults',
  'room_insights',
  'recommend_proposal_template',
  'create_or_update_quote',
  'create_or_update_contract',
  'create_quote_from_competitor',
])

const EXPERT_INTENT_RE =
  /已上传附件|\[图片\]|点位图|户型图|开关布置|识图|智能选型|一键选型|全屋选型|回路审查|完整度审查|生成报价|报价单|竞品|合同|方案模板|规划|布点|布置/i

export type RouteScene = 'vision' | 'expert' | 'fast'

const routeText = (m: AiModelConfig) => `${m.id} ${m.apiModel} ${m.name}`.toLowerCase()

function sceneScore(m: AiModelConfig, scene: RouteScene): number {
  const s = routeText(m)
  if (scene === 'vision') {
    if (!isVisionCapableModel(s)) return -1
    if (/qwen-?3\.8(?!.*flash)/.test(s)) return 100
    if (/qwen-?3\.8.*flash/.test(s)) return 98
    if (/glm-?5\.3(?!.*flash)/.test(s)) return 96
    if (/qwen-?3\.7/.test(s)) return 94
    if (/qwen-?3\.6/.test(s)) return 92
    if (/qwen-vl-max/.test(s)) return 90
    if (/qvq/.test(s)) return 86
    if (/glm-?5\.3.*flash/.test(s)) return 86
    if (/glm-4v|doubao.*vision|vl|vision/.test(s)) return 80
    return 70
  }
  if (scene === 'expert') {
    if (/qwen-?3\.8(?!.*flash)/.test(s)) return 100
    if (/glm-?5\.3(?!.*flash)/.test(s)) return 96
    if (/qwen-?3\.8.*flash/.test(s)) return 95
    if (/qwen-?3\.7/.test(s)) return 94
    if (/qwen-?3\.6/.test(s)) return 92
    if (/glm-?5\.3.*flash/.test(s)) return 88
    if (/qwen-max|qwq/.test(s)) return 85
    if (/deepseek-reasoner|deepseek-r1|\br1\b/.test(s)) return 82
    if ((m.cost ?? 1) >= 2) return 75
    return 50
  }
  if (/deepseek.*flash|1017/.test(s)) return 100
  if (/deepseek-chat|deepseek-v3/.test(s)) return 95
  if (/qwen-?3\.[5-9].*flash/.test(s)) return 92
  if (/glm-?5\.3.*flash|glm-4-flash/.test(s)) return 90
  if (/qwen-plus|doubao/.test(s)) return 85
  if (!m.reasoning && (m.cost ?? 1) <= 1) return 80
  return 40
}

/** 按场景给可用模型排序（已启用、已配置密钥、会员档位允许），用于 Auto 路由与失败自动切换。 */
export function rankModelsForScene(
  models: AiModelConfig[] = DEFAULT_AI_MODELS,
  scene: RouteScene,
  opts: { canAccessModel?: (m: AiModelConfig) => boolean } = {},
): AiModelConfig[] {
  const pool = enabledAiModels(models, { includeAuto: false }).filter(
    (m) => Boolean(resolveModelApiKey(m)) && (opts.canAccessModel ? opts.canAccessModel(m) : true),
  )
  return [...pool]
    .filter((m) => sceneScore(m, scene) >= 0)
    .sort((a, b) => sceneScore(b, scene) - sceneScore(a, scene))
}

export function inferRouteScene(opts: {
  hasImage?: boolean
  userText?: string
  calledToolNames?: string[]
}): RouteScene {
  if (opts.hasImage) return 'vision'
  if (
    (opts.calledToolNames ?? []).some((n) => PRO_EXPERT_TOOLS.has(n)) ||
    EXPERT_INTENT_RE.test(opts.userText ?? '')
  )
    return 'expert'
  return 'fast'
}

/**
 * Auto 模式智能路由：
 * - scene = 'vision'（含上传户型图/CAD图）：优先选择 qwen-3.8 / 3.7 / 3.6 / glm-5.3 / qwen-vl 等多模态视觉模型
 * - scene = 'expert'（专业重型工具调用或工程方案规划）：优先选择 qwen-3.8 / glm-5.3 / qwen-3.7 / qwen-3.6 / deepseek-r1 等强专业模型
 * - scene = 'fast'（日常对话与轻量项目查询）：优先选择 deepseek-flash (1017) / deepseek-chat / glm-5.3-flash 等高速低耗模型
 */
export function resolveAutoRouteModel(
  models: AiModelConfig[] = DEFAULT_AI_MODELS,
  opts: {
    hasImage?: boolean
    userText?: string
    calledToolNames?: string[]
    canAccessModel?: (m: AiModelConfig) => boolean
  } = {},
): { model: AiModelConfig; reason: 'vision' | 'expert' | 'fast' } {
  const accessOpts = { canAccessModel: opts.canAccessModel }
  const wantsVision = Boolean(opts.hasImage) || /\[图片\]|mediaId:/i.test(opts.userText ?? '')
  const scene = inferRouteScene({
    hasImage: wantsVision,
    userText: opts.userText,
    calledToolNames: opts.calledToolNames,
  })
  if (scene === 'vision') {
    const vision = rankModelsForScene(models, 'vision', accessOpts)[0]
    if (vision) return { model: vision, reason: 'vision' }
  }
  if (scene === 'vision' || scene === 'expert') {
    const expert = rankModelsForScene(models, 'expert', accessOpts)[0]
    if (expert && sceneScore(expert, 'expert') >= 75) return { model: expert, reason: 'expert' }
  }
  const fast = rankModelsForScene(models, 'fast', accessOpts)[0]
  const anyModel = enabledAiModels(models, { includeAuto: false })[0]
  return { model: fast ?? anyModel ?? DEFAULT_AI_MODELS[0], reason: 'fast' }
}

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message)
  }
}

async function postOnce(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new AiError(
      (error as Error)?.name === 'TimeoutError'
        ? 'AI 响应超时，请稍后重试'
        : 'AI 服务暂时无法连接，请稍后重试',
    )
  }
  return res
}

function toModelConfig(modelOrId: AiModelConfig | string): AiModelConfig {
  if (typeof modelOrId === 'string') return findModel(modelOrId)
  return modelOrId
}

async function post(
  modelOrId: AiModelConfig | string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const model = toModelConfig(modelOrId)
  const { url, apiKey, envKey } = resolveModelEndpoint(model)
  if (!url || !apiKey) {
    throw new AiError(
      `模型「${model.name}」尚未配置服务端环境变量（${envKey}），请在环境变量 / Secrets 中添加`,
      503,
    )
  }
  const apiModel = model.apiModel || model.id
  const payloadBody: Record<string, unknown> = { ...body, model: apiModel }
  let res = await postOnce(url, apiKey, payloadBody, timeoutMs)
  // 兼容不同网关对 DeepSeek V4.1-Flash-1017 的模型 ID 命名（官方 /models 返回 deepseek-flash）
  if ((res.status === 400 || res.status === 404) && /deepseek.*flash/i.test(apiModel)) {
    for (const alias of [
      'deepseek-flash-1017',
      'deepseek-v4.1-flash-1017',
      'DeepSeek-V4.1-Flash',
      'deepseek-flash',
      'deepseek-chat',
    ]) {
      if (alias === apiModel) continue
      res = await postOnce(url, apiKey, { ...payloadBody, model: alias }, timeoutMs)
      if (res.ok) return res
    }
  }
  // 如果网关中的该模型不支持多模态 image_url 数组结构而返回 400/422，自动退回纯文本消息重试一次，确保对话绝不中断
  if ((res.status === 400 || res.status === 422) && Array.isArray(payloadBody.messages)) {
    const hasArrayContent = (payloadBody.messages as LlmMessage[]).some((m) =>
      Array.isArray(m.content),
    )
    if (hasArrayContent) {
      const textOnlyMessages = (payloadBody.messages as LlmMessage[]).map((m) => {
        if (!Array.isArray(m.content)) return m
        const joined = m.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('\n')
        return { ...m, content: joined }
      })
      res = await postOnce(url, apiKey, { ...payloadBody, messages: textOnlyMessages }, timeoutMs)
      if (res.ok) return res
    }
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    if (res.status === 401)
      throw new AiError(`模型「${model.name}」密钥无效，请检查环境变量 ${envKey}`, 503)
    if (res.status === 402)
      throw new AiError(`模型「${model.name}」对应账户余额不足，请先在对应平台充值`, 503)
    // 403：密钥没有该模型权限、账户受限，或所在网络被服务商拦截（返回体通常不是 JSON）
    if (res.status === 403) {
      console.error('[ai] provider forbidden', model.id, url, detail?.error?.message)
      throw new AiError(
        `模型「${model.name}」的服务拒绝了请求（403）：请检查 ${envKey} 对应账户的权限与状态；在预览环境中可能被网络限制，发布后在正式站点再试`,
        503,
      )
    }
    if (res.status === 429) throw new AiError('请求太频繁，请稍后再试', 429)
    if (res.status === 520)
      throw new AiError(
        '当前预览环境不允许连接外部 AI 服务。请点击 Publish 发布后，在正式站点或自建服务器使用。',
        503,
      )
    console.error('[ai] provider error', model.id, url, res.status, detail?.error?.message)
    throw new AiError(
      detail?.error?.message
        ? `AI 服务出错：${detail.error.message.slice(0, 120)}`
        : 'AI 服务出错，请稍后重试',
    )
  }
  return res
}

/** 不流式的一次调用（用于判断是否需要调用工具）。 */
export async function complete(
  model: AiModelConfig | string,
  messages: LlmMessage[],
  tools?: unknown[],
) {
  const res = await post(
    model,
    {
      messages,
      ...(tools?.length ? { tools } : {}),
      ...samplingParams(toModelConfig(model)),
      stream: false,
    },
    90_000,
  )
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: LlmToolCall[] } }[]
    usage?: TokenUsage
  }
  const msg: { content?: string | null; tool_calls?: LlmToolCall[]; usage?: TokenUsage } = json
    .choices?.[0]?.message ?? { content: '' }
  if (typeof msg.content === 'string') {
    msg.content = stripDsml(msg.content)
  }
  msg.usage = json.usage
  return msg
}

/** 工具调用场景用较低温度保证稳定；推理模型不支持温度参数时不传。 */
function samplingParams(model: AiModelConfig): Record<string, unknown> {
  const s = routeText(model)
  if (model.reasoning || /reasoner|deepseek-r1|\br1\b|qwq|qvq|thinking/.test(s)) return {}
  return { temperature: 0.5 }
}

/**
 * DeepSeek 偶发在正文里输出内部 DSML 协议标签：流式输出时先扣住可疑片段，确认不是标签再放行，确认是标签则丢弃本轮剩余输出。
 */
function createDsmlFilter(emit: (text: string) => void) {
  let pending = ''
  let blocked = false
  return {
    push(text: string) {
      if (blocked) return
      pending += text
      const idx = pending.search(/<[｜|]/)
      if (idx === -1) {
        emit(pending)
        pending = ''
        return
      }
      if (/<[｜|]+\s*\/?\s*DSML/i.test(pending.slice(idx)) || /DSML/.test(pending.slice(idx))) {
        if (idx > 0) emit(pending.slice(0, idx))
        pending = ''
        blocked = true
        return
      }
      if (pending.length - idx > 16) {
        emit(pending)
        pending = ''
        return
      }
      if (idx > 0) {
        emit(pending.slice(0, idx))
        pending = pending.slice(idx)
      }
    },
    flush() {
      if (!blocked && pending) emit(pending)
      pending = ''
    },
  }
}

export type StreamTurnResult = {
  content: string
  reasoning: string
  tool_calls: LlmToolCall[]
  usage: TokenUsage | null
}

/**
 * 流式调用（支持工具）：正文与思考过程实时回调，同时按 index 拼接流式返回的 tool_calls。
 * 失败抛出 AiError，由调用方决定改用非流式或切换模型。
 */
export async function streamTurn(
  model: AiModelConfig,
  messages: LlmMessage[],
  opts: {
    tools?: unknown[]
    onDelta?: (text: string) => void
    onReasoning?: (text: string) => void
    signal?: AbortSignal
  } = {},
): Promise<StreamTurnResult> {
  const res = await post(
    model,
    {
      messages,
      ...(opts.tools?.length ? { tools: opts.tools } : {}),
      ...samplingParams(model),
      stream: true,
      stream_options: { include_usage: true },
    },
    180_000,
  )
  if (!res.body) throw new AiError('AI 服务没有返回内容，请稍后重试')
  const ctype = res.headers.get('content-type') ?? ''
  if (ctype.includes('application/json')) {
    // 个别网关忽略 stream 参数，直接返回整段 JSON
    const json = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null
          tool_calls?: LlmToolCall[]
          reasoning_content?: string
        }
      }[]
      usage?: TokenUsage
    }
    const msg = json.choices?.[0]?.message
    const content = stripDsml(msg?.content ?? '')
    if (msg?.reasoning_content) opts.onReasoning?.(msg.reasoning_content)
    if (content) opts.onDelta?.(content)
    return {
      content,
      reasoning: msg?.reasoning_content ?? '',
      tool_calls: msg?.tool_calls ?? [],
      usage: json.usage ?? null,
    }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  let usage: TokenUsage | null = null
  const calls: { id: string; name: string; args: string }[] = []
  const filter = createDsmlFilter((t) => {
    content += t
    opts.onDelta?.(t)
  })
  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.replace(/^data:\s*/, '')
    if (!data || data === '[DONE]') return
    try {
      const chunk = JSON.parse(data) as {
        choices?: {
          delta?: {
            content?: string | null
            reasoning_content?: string | null
            tool_calls?: {
              index?: number
              id?: string
              function?: { name?: string; arguments?: string }
            }[]
          }
        }[]
        usage?: TokenUsage | null
      }
      if (chunk.usage) usage = chunk.usage
      const delta = chunk.choices?.[0]?.delta
      if (!delta) return
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content
        opts.onReasoning?.(delta.reasoning_content)
      }
      if (delta.content) filter.push(delta.content)
      for (const tc of delta.tool_calls ?? []) {
        const i = typeof tc.index === 'number' ? tc.index : calls.length
        const slot = calls[i] ?? (calls[i] = { id: '', name: '', args: '' })
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.name += tc.function.name
        if (tc.function?.arguments) slot.args += tc.function.arguments
      }
    } catch {
      // 忽略不完整的行
    }
  }
  try {
    while (true) {
      if (opts.signal?.aborted) {
        await reader.cancel().catch(() => null)
        break
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) handleLine(line)
    }
    // 个别网关最后一个分片（常是 usage）不带换行
    buffer += decoder.decode()
    if (buffer.trim()) handleLine(buffer)
  } catch (error) {
    if (opts.signal?.aborted) return { content, reasoning, tool_calls: [], usage }
    throw new AiError(
      (error as Error)?.name === 'TimeoutError' ? 'AI 响应超时，请稍后重试' : 'AI 输出中断，请重试',
    )
  }
  filter.flush()
  const tool_calls: LlmToolCall[] = calls
    .filter((c) => c && c.name)
    .map((c, i) => ({
      id: c.id || `call_${Date.now().toString(36)}_${i}`,
      type: 'function' as const,
      function: { name: c.name, arguments: c.args || '{}' },
    }))
  return { content: stripDsml(content), reasoning, tool_calls, usage }
}

/** 流式调用：逐段回调正文和思考过程，返回完整正文。 */
export async function stream(
  model: AiModelConfig | string,
  messages: LlmMessage[],
  onDelta: (text: string) => void,
  onReasoning: (text: string) => void,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
) {
  // include_usage：让 OpenAI 兼容接口在最后一个分片返回 tokens 用量，用于按量计费
  const res = await post(
    model,
    { messages, stream: true, stream_options: { include_usage: true } },
    120_000,
  )
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  while (true) {
    if (signal?.aborted) {
      await reader.cancel()
      break
    }
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, '')
      if (!data || data === '[DONE]' || !line.trim().startsWith('data:')) continue
      try {
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string; reasoning_content?: string } }[]
          usage?: TokenUsage | null
        }
        if (chunk.usage) onUsage?.(chunk.usage)
        const delta = chunk.choices?.[0]?.delta
        if (delta?.reasoning_content) onReasoning(delta.reasoning_content)
        if (delta?.content) {
          full += delta.content
          onDelta(delta.content)
        }
      } catch {
        // 忽略不完整的行
      }
    }
  }
  return full
}

export type PromptExtra = {
  userName?: string | null
  membershipLabel?: string | null
  credits?: number | null
  pageLabel?: string | null
  hasImages?: boolean
}

/** 系统提示词：身份、业务背景、看图与输出规范、已激活插件指导原则与当前项目概况。 */
export function systemPrompt(
  project: Awaited<ReturnType<typeof loadProjectDocs>> | null,
  pluginIds: string[] = [],
  flags?: PluginFlags,
  sessionUploads: { name: string; mediaId: string; url: string }[] = [],
  extra: PromptExtra = {},
) {
  const now = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  const lines = [
    '你是「繁梦空间」（FMKJ）全屋智能家居方案设计平台的 AI 助手，服务对象是方案设计师和安装团队。',
    `现在是北京时间 ${now}。${extra.userName ? `当前用户：${extra.userName}${extra.membershipLabel ? `（${extra.membershipLabel}` : ''}${extra.credits != null ? `${extra.membershipLabel ? '，' : '（'}剩余 ${extra.credits} 积分）` : extra.membershipLabel ? '）' : ''}。` : ''}${extra.pageLabel ? `用户当前所在页面：${extra.pageLabel}。` : ''}`,
    '平台主流程：项目信息 → 点位图 → 报价 → 合同 → 归档。',
    '你拥有完整的系统操作工具，可以直接替用户完成：',
    '1. 查询/创建/修改项目与归档状态（list_projects, create_project, update_project）；',
    '2. 将用户拖入上传的户型图添加为项目点位图图纸并写入真实识别到的点位（add_floor_sheet），或将拖入的 fmkj-points JSON 导入点位图（import_points_json）；',
    '【重要规则】：当用户上传了户型图图片时，严禁调用 setup_rooms_and_points 生成网格默认点位！点位图打开时绝不能有未识别的默认点位——只有图像真实识别出点位（通过 add_floor_sheet 的 detectedPoints）或用户提供了点位 JSON（import_points_json）时才生成点位图标；若未识别出点位，保持点位图为空（0 点位），绝不虚构默认点位。',
    '【防失忆规则】：当用户在后续对话中说「重新生成 / 重新识别刚才的图 / 把全部点位导进去 / 只导开关」时，绝不要让用户重新上传图片！直接调用 add_floor_sheet 工具（可直接使用下方「当前项目已有图纸」或「本会话已上传图纸」中的 url 和 mediaId，甚至省略 url 让服务端自动复用当前图纸），并设置 replaceExisting=true（若需重新调用识别器则同时设置 redetect=true）。',
    '【看图规则】凡是带图片的消息，平台已先由视觉大模型看过图：看图结论附在用户消息末尾的「【视觉识图结论】」中，户型图另有「本地几何识别 + 视觉复核」的点位统计。回答必须以这些结论为依据，引用其中的具体房间、数量、文字和型号；看图结论里标注「无法辨认/存疑」的地方要提醒用户核对；不要编造图里没有的信息。非户型图片（实景照片、报价单截图、效果图）不要调用 add_floor_sheet。',
    '【视觉布点】项目已上传户型图后，用户要求规划/补齐/布置 AP、网络面板、窗帘、网关、中控屏、传感器、摄像头、音箱、VRF 等智能设备时，调用 plan_points_with_vision（视觉模型看图按设计规范布点）；不要调用 setup_rooms_and_points。开关、插座、灯具只照图识别，不得凭空规划。',
    '【生图】用户要求生成效果图、场景图、方案配图时调用 generate_image；用户上传了参考图（户型图、实景照片、效果图）并希望据此出图时设置 useAttachedImage=true，平台会先由视觉模型理解参考图再生成，并在生成后做视觉质检。',
    '【竞品报价】用户上传别家报价单截图时，按「【视觉识图结论】」中的逐行转写调用 create_quote_from_competitor；转写里看不清的行要向用户确认，不要猜测型号和单价。',
    '3. 检索 728 款产品库、按平台与档次一键选型或指定某类设备的默认产品（search_products, smart_select, set_project_defaults）；',
    '4. 进行房间点位完整度审查（room_insights）与按业主画像推荐方案模板（recommend_proposal_template）；',
    '5. 从点位图直接生成报价单草稿、修改报价单优惠/附加费/状态（get_project_details, create_or_update_quote）；',
    '6. 生成或修改项目合同、设置付款分期、标记签约与登记收款（create_or_update_contract）；',
    '7. 生成各类打印与导出文档的直达链接（get_document_links）。',
    '当用户提出创建或修改请求时，请主动调用对应工具直接完成操作（可分多步连续调用，例如：新建项目 → 添加户型图 → 智能选型 → 生成报价单），不要只给口头步骤；信息不足且无法合理默认时，只问最关键的一个问题。',
    '回答格式：简体中文 + Markdown（小标题、要点列表、表格），先给结论再给细节，数字与型号要准确；完成工具操作后用 2~4 句话总结结果（做了什么、数量/金额、需要用户核对的地方），再给 1~3 个可直接执行的下一步建议。',
  ]
  const pluginLines = activePluginPromptLines(pluginIds, flags)
  if (pluginLines.length) {
    lines.push('', '已连接插件调用准则：', ...pluginLines)
  }
  if (project) {
    const p = project.project
    const realSheets = project.sheets.filter((s) => s.fileId !== 'blank-sheet' && s.url)
    const sheetSummary = realSheets.length
      ? realSheets
          .map((s) => {
            const mid = s.fileId?.startsWith('sheet-') ? s.fileId.slice(6) : ''
            return `「${s.name}」(url: ${s.url}${mid ? `, mediaId: ${mid}` : ''})`
          })
          .join('；')
      : '暂无已上传图纸（当前为空白示意图）'
    lines.push(
      '',
      `当前关联项目：${p.name}（ID: ${p.id}，客户：${p.customerName || '未填写'}，主平台：${p.platform || '待定'}）`,
      `点位 ${project.points.length} 个，房间 ${project.rooms.length} 个，图纸 ${project.sheets.length} 张，${project.pending} 个点位待选型。`,
      `当前项目已有图纸：${sheetSummary}`,
      `设备构成：${project.categories.map((c) => `${c.name} ${c.count}`).join('、') || '暂无'}`,
      `按当前选型的设备预算：${project.total.toFixed(0)} 元${project.quote ? `；最新报价「${project.quote.title}」合计 ${project.quote.total} 元` : ''}。`,
    )
  } else {
    lines.push(
      '',
      '当前尚未关联具体项目。你可以调用 list_projects 查找已有项目，或调用 create_project 直接新建项目（新建后会自动关联）。',
    )
  }
  if (sessionUploads.length > 0) {
    lines.push(
      '',
      `本会话历史已上传图纸记忆（用户说「重新生成/重新识别」时可直接复用）：${sessionUploads.map((u) => `${u.name} (mediaId: ${u.mediaId}, url: ${u.url})`).join('；')}`,
    )
  }
  return lines.join('\n')
}
