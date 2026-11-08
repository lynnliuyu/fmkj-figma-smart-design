import type { AiModelOption } from '@/components/ai/ai-elements'
import { allAiSkillSpecs } from '@/plugins/ai-catalog'
import type { PluginId } from '@/plugins/types'
import type { ModelPricing } from './billing'

/**
 * 受信任的 AI 渠道白名单：
 * 每个渠道的请求域名（baseUrl）与密钥环境变量名（apiKeyEnv）在服务端严格一对一绑定，
 * 严禁客户端自定义任意 URL 或读取任意环境变量，从根源杜绝 SSRF 与密钥外带。
 */
export const AI_PROVIDER_CHANNELS = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  newapi: {
    id: 'newapi',
    label: 'NewAPI / OneAPI 聚合网关',
    // 聚合网关地址仅从服务端环境变量 NEWAPI_BASE_URL / APP_OPENAI_BASE_URL 读取
    baseUrl: 'env:NEWAPI_BASE_URL',
    apiKeyEnv: 'NEWAPI_API_KEY',
  },
  siliconflow: {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
  },
  dashscope: {
    id: 'dashscope',
    label: '阿里百炼（通义千问）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
  },
  ark: {
    id: 'ark',
    label: '火山方舟（豆包）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKeyEnv: 'ARK_API_KEY',
  },
  moonshot: {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
  },
  zhipu: {
    id: 'zhipu',
    label: '智谱清言 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnv: 'ZHIPU_API_KEY',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  },
} as const

export type AiProviderChannelId = keyof typeof AI_PROVIDER_CHANNELS
export const AI_PROVIDER_CHANNEL_LIST = Object.values(AI_PROVIDER_CHANNELS)

export function isAiProviderChannelId(v: unknown): v is AiProviderChannelId {
  return typeof v === 'string' && v in AI_PROVIDER_CHANNELS
}

/** 后台自定义渠道（OpenAI 兼容接口，如腾讯云 CloudBase、自建网关）；密钥仍只放在环境变量里 */
export type AiCustomChannel = { key: string; label: string; baseUrl: string; apiKeyEnv: string }

/** 自定义渠道的密钥变量名必须以 AI_ 开头，避免借此读取平台或其它业务的密钥 */
export const CUSTOM_KEY_ENV_RE = /^AI_[A-Z0-9_]{2,60}$/

const PRIVATE_HOST_RE =
  /^(localhost|0\.0\.0\.0|\[::1\]|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)|\.(local|internal|localhost)$/i

/** 规范化自定义渠道的接口根地址：必须是公网 HTTPS；去掉结尾的 /chat/completions 与斜杠 */
export function normalizeCustomBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const base = raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
  try {
    const u = new URL(base)
    if (u.protocol !== 'https:' || PRIVATE_HOST_RE.test(u.hostname)) return null
    return base
  } catch {
    return null
  }
}

export function parseCustomChannels(value: unknown): AiCustomChannel[] {
  if (!Array.isArray(value)) return []
  const out: AiCustomChannel[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const key = cleanStr(r.key, 40).replace(/[^a-zA-Z0-9_-]/g, '')
    const baseUrl = normalizeCustomBaseUrl(r.baseUrl)
    const apiKeyEnv = cleanStr(r.apiKeyEnv, 64)
    if (!key || !baseUrl || !CUSTOM_KEY_ENV_RE.test(apiKeyEnv) || out.some((c) => c.key === key))
      continue
    out.push({ key, label: cleanStr(r.label, 60, key), baseUrl, apiKeyEnv })
  }
  return out
}

export type AiModelConfig = AiModelOption & {
  /** 绑定的渠道：内置受信任渠道 ID，或 custom（配合 customChannel 指向后台自定义渠道） */
  channelId: AiProviderChannelId | 'custom'
  /** channelId 为 custom 时对应的自定义渠道标识 */
  customChannel?: string
  /** 实际传给接口的 model 参数名（如 deepseek-chat、qwen-vl-max、deepseek-reasoner） */
  apiModel: string
  /** 只读展示：由 channelId 决定的接口地址说明 */
  baseUrl: string
  /** 只读展示：由 channelId 决定的环境变量名 */
  apiKeyEnv: string
  /** 是否启用（开启后出现在网页与小程序的模型选择列表中） */
  enabled: boolean
  /** 是否为默认选中模型 */
  isDefault?: boolean
  /** 模型真实价格（元/百万 tokens）；未配置时走旧倍率公式 */
  pricing?: ModelPricing | null
}

export function inferModelTier(
  apiModel: string,
  reasoning?: boolean,
  cost?: number,
): { minTier: 'free' | 'pro' | 'team'; tierBadge: 'Go' | 'Plus' | 'Pro' } {
  const m = apiModel.toLowerCase()
  if (
    reasoning ||
    /reasoner|deepseek-r1|\br1\b|qwq|qvq|thinking|glm-zero|qwen-?3\.8(?!.*flash)|glm-?5\.3(?!.*flash)/i.test(
      m,
    ) ||
    (cost ?? 1) >= 3
  ) {
    return { minTier: 'team', tierBadge: 'Pro' }
  }
  if (
    /vl|vision|qwen-max|qwen-?3\.[5678]|glm-4v|glm-4-plus|glm-?5\.3.*flash|kimi|moonshot-v1-128k|doubao-1-5-vision/i.test(
      m,
    ) ||
    (cost ?? 1) === 2
  ) {
    return { minTier: 'pro', tierBadge: 'Plus' }
  }
  return { minTier: 'free', tierBadge: 'Go' }
}

/**
 * 判断模型代号是否支持多模态视觉识图（image_url）：
 * 涵盖千问 Qwen-3.6/3.7/3.8、智谱 GLM-5.3 / GLM-5.3-Flash，以及 Qwen-VL / QVQ / GLM-4V / 豆包 Vision 等。
 */
export const VISION_MODEL_RE =
  /vl|vision|glm-4v|qvq|omni|doubao.*vision|qwen-?3\.[5-9]|glm-?5\.[0-9]|gpt-4o|claude-3|gemini/i

export function isVisionCapableModel(apiModelOrId: string | undefined | null): boolean {
  if (!apiModelOrId) return false
  return VISION_MODEL_RE.test(apiModelOrId)
}

/**
 * Auto 智能路由虚拟模型：
 * 平常对话走 DeepSeek Flash 等极速模型；遇到图纸识图或复杂专业工具调用时自动切换到 Qwen-3.x / GLM-5.3 等高阶专业模型。
 */
export const AUTO_AI_MODEL: AiModelConfig = {
  id: 'auto',
  name: 'Auto（智能路由）',
  provider: '智能多模型调度',
  channelId: 'deepseek',
  tag: '日常 DeepSeek · 识图与重工具自动切 Qwen/GLM',
  cost: 1,
  description:
    '日常对话使用 DeepSeek Flash 高速响应；上传图纸或调用智能选型/审查/报价等专业工具时自动切换 Qwen-3.x / GLM-5.3 等强模型',
  apiModel: 'auto',
  baseUrl: AI_PROVIDER_CHANNELS.deepseek.baseUrl,
  apiKeyEnv: AI_PROVIDER_CHANNELS.deepseek.apiKeyEnv,
  minTier: 'free',
  tierBadge: 'Go',
  enabled: true,
  isDefault: true,
}

export function resolveExplicitOrInferredTier(
  explicitMinTier: unknown,
  apiModel: string,
  reasoning?: boolean,
  cost?: number,
): { minTier: 'free' | 'pro' | 'team'; tierBadge: 'Go' | 'Plus' | 'Pro' } {
  if (explicitMinTier === 'free') return { minTier: 'free', tierBadge: 'Go' }
  if (explicitMinTier === 'pro') return { minTier: 'pro', tierBadge: 'Plus' }
  if (explicitMinTier === 'team') return { minTier: 'team', tierBadge: 'Pro' }
  return inferModelTier(apiModel, reasoning, cost)
}

/**
 * 系统内置默认模型（未在后台自定义时使用）。
 */
export const DEFAULT_AI_MODELS: AiModelConfig[] = [
  {
    id: 'deepseek-flash',
    name: 'DeepSeek V3（高速标准）',
    provider: AI_PROVIDER_CHANNELS.deepseek.label,
    channelId: 'deepseek',
    tag: 'Go 基础 · 高速工具调用',
    cost: 1,
    description: '高速长上下文模型（1M 上下文），支持多步调用系统工具与已启用插件',
    apiModel: 'deepseek-flash',
    baseUrl: AI_PROVIDER_CHANNELS.deepseek.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.deepseek.apiKeyEnv,
    minTier: 'free',
    tierBadge: 'Go',
    enabled: true,
    isDefault: true,
    pricing: {
      peak: { input: 2, output: 8, cachedInput: 0.04 },
      offPeak: { input: 1, output: 4, cachedInput: 0.02 },
    },
  },
  {
    id: 'qwen-vl-plus',
    name: '通义千问 Qwen-VL-Max（高阶视觉多模态）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Plus 专属 · 视觉识图与高定方案',
    cost: 2,
    description: 'Plus 会员高阶视觉与多模态模型，支持复杂 CAD/户型图点位识别与高定方案润色',
    apiModel: 'qwen-vl-max',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    enabled: true,
    isDefault: false,
    pricing: {
      peak: { input: 3, output: 9, cachedInput: 1.2 },
      offPeak: { input: 3, output: 9, cachedInput: 1.2 },
    },
  },
  {
    id: 'deepseek-r1-pro',
    name: 'DeepSeek-R1（满血深度推理）',
    provider: AI_PROVIDER_CHANNELS.deepseek.label,
    channelId: 'deepseek',
    tag: 'Pro 旗舰 · 别墅全案深度审查',
    cost: 3,
    reasoning: true,
    description: 'Pro 旗舰深度推理大模型，适合多层别墅回路审查、跨平台协议规划与整案预算优化',
    apiModel: 'deepseek-reasoner',
    baseUrl: AI_PROVIDER_CHANNELS.deepseek.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.deepseek.apiKeyEnv,
    minTier: 'team',
    tierBadge: 'Pro',
    enabled: true,
    isDefault: false,
    pricing: {
      peak: { input: 4, output: 16, cachedInput: 1 },
      offPeak: { input: 1, output: 4, cachedInput: 0.25 },
    },
  },
]

export const AI_MODELS: AiModelOption[] = DEFAULT_AI_MODELS

/** 后台「设置 → AI 模型与接口」里可一键添加的常用官方 API 与 NewAPI 聚合网关预设 */
export const AI_PROVIDER_PRESETS: Omit<AiModelConfig, 'id' | 'enabled' | 'isDefault'>[] = [
  {
    name: 'DeepSeek Flash 1017（日常极速对话）',
    provider: AI_PROVIDER_CHANNELS.deepseek.label,
    channelId: 'deepseek',
    tag: 'Go 基础 · Auto 日常对话默认',
    cost: 1,
    description: 'DeepSeek V4.1-Flash-1017 极速对话模型，Auto 模式下日常问答与轻量查询的默认引擎',
    apiModel: 'deepseek-flash',
    baseUrl: AI_PROVIDER_CHANNELS.deepseek.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.deepseek.apiKeyEnv,
    minTier: 'free',
    tierBadge: 'Go',
    reasoning: false,
  },
  {
    name: '通义千问 Qwen-3.6（高阶多模态与工具）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Plus 专属 · 多模态识图与配单',
    cost: 2,
    description: '千问 3.6 多模态与工具调用主力模型，支持户型图纸识别与方案选型',
    apiModel: 'qwen-3.6',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '通义千问 Qwen-3.7（专业工程与多模态）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Plus 专属 · 复杂图纸与选型',
    cost: 2,
    description: '千问 3.7 增强版多模态模型，适合非标黑白 CAD 开关图识别与多步工程工具编排',
    apiModel: 'qwen-3.7',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '通义千问 Qwen-3.8-Flash（高速视觉与多模态）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Plus 专属 · 极速图纸视觉识别',
    cost: 2,
    description: '千问 3.8 Flash 高速多模态模型，首包快、吞吐高，适合户型图点位识别与日常看图问答',
    apiModel: 'qwen3.8-flash',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '通义千问 Qwen-3.8（旗舰视觉与工程大脑）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Pro 旗舰 · Auto 识图与重工具首选',
    cost: 3,
    description:
      '千问 3.8 旗舰多模态与深度工程模型，Auto 模式下遇到复杂 CAD 识图与全屋选型/审查时自动优先调度',
    apiModel: 'qwen-3.8',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'team',
    tierBadge: 'Pro',
    reasoning: true,
  },
  {
    name: '智谱清言 GLM-5.3-Flash（高速多模态）',
    provider: AI_PROVIDER_CHANNELS.zhipu.label,
    channelId: 'zhipu',
    tag: 'Plus 专属 · 高速视觉与工具',
    cost: 2,
    description: '智谱 GLM-5.3 Flash 高速多模态模型，兼顾图纸视觉识别与快速工具执行',
    apiModel: 'glm-5.3-flash',
    baseUrl: AI_PROVIDER_CHANNELS.zhipu.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.zhipu.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '智谱清言 GLM-5.3（旗舰多模态与工程推演）',
    provider: AI_PROVIDER_CHANNELS.zhipu.label,
    channelId: 'zhipu',
    tag: 'Pro 旗舰 · 复杂图纸与全案精算',
    cost: 3,
    description: '智谱 GLM-5.3 旗舰多模态大模型，擅长复杂电气图纸理解、竞品报价拆解与合同审查',
    apiModel: 'glm-5.3',
    baseUrl: AI_PROVIDER_CHANNELS.zhipu.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.zhipu.apiKeyEnv,
    minTier: 'team',
    tierBadge: 'Pro',
    reasoning: true,
  },
  {
    name: 'DeepSeek-V3（高速标准）',
    provider: AI_PROVIDER_CHANNELS.deepseek.label,
    channelId: 'deepseek',
    tag: 'Go 基础 · 高速工具调用',
    cost: 1,
    description: 'DeepSeek 官方主力高速对话模型，擅长全屋智能点位规划、选型与报价工具调用',
    apiModel: 'deepseek-chat',
    baseUrl: AI_PROVIDER_CHANNELS.deepseek.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.deepseek.apiKeyEnv,
    minTier: 'free',
    tierBadge: 'Go',
    reasoning: false,
  },
  {
    name: '通义千问 Qwen-Plus（日常主力）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Go 基础 · 稳定均衡',
    cost: 1,
    description: '阿里云百炼均衡主力模型，响应稳定，适合常规报价生成与产品库检索',
    apiModel: 'qwen-plus',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'free',
    tierBadge: 'Go',
    reasoning: false,
  },
  {
    name: '豆包 Doubao-1.5-Pro（高速响应）',
    provider: AI_PROVIDER_CHANNELS.ark.label,
    channelId: 'ark',
    tag: 'Go 基础 · 火山方舟',
    cost: 1,
    description: '字节跳动火山方舟高速对话模型，适合高频日常问答与基础配置生成',
    apiModel: 'doubao-1-5-pro-32k-250115',
    baseUrl: AI_PROVIDER_CHANNELS.ark.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.ark.apiKeyEnv,
    minTier: 'free',
    tierBadge: 'Go',
    reasoning: false,
  },
  {
    name: '智谱清言 GLM-4-Flash（轻量极速）',
    provider: AI_PROVIDER_CHANNELS.zhipu.label,
    channelId: 'zhipu',
    tag: 'Go 基础 · 极速响应',
    cost: 1,
    description: '智谱开放平台高性价比极速模型，适合快速检索与简单指令执行',
    apiModel: 'glm-4-flash',
    baseUrl: AI_PROVIDER_CHANNELS.zhipu.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.zhipu.apiKeyEnv,
    minTier: 'free',
    tierBadge: 'Go',
    reasoning: false,
  },
  {
    name: '通义千问 Qwen-VL-Max（高阶视觉多模态）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Plus 专属 · 户型图视觉识别',
    cost: 2,
    description: '阿里视觉多模态旗舰，支持上传 CAD/户型图识别开关、灯具点位与空间结构',
    apiModel: 'qwen-vl-max',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '豆包 Doubao-1.5-Vision-Pro（视觉多模态）',
    provider: AI_PROVIDER_CHANNELS.ark.label,
    channelId: 'ark',
    tag: 'Plus 专属 · 图纸视觉理解',
    cost: 2,
    description: '火山方舟高阶视觉理解大模型，支持建筑平面图区域划分与图例识别',
    apiModel: 'doubao-1-5-vision-pro-32k-250115',
    baseUrl: AI_PROVIDER_CHANNELS.ark.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.ark.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '智谱清言 GLM-4V-Plus（高清图纸视觉）',
    provider: AI_PROVIDER_CHANNELS.zhipu.label,
    channelId: 'zhipu',
    tag: 'Plus 专属 · 多模态识图',
    cost: 2,
    description: '智谱高阶多模态视觉模型，擅长高分辨率户型图与电气图例识别',
    apiModel: 'glm-4v-plus',
    baseUrl: AI_PROVIDER_CHANNELS.zhipu.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.zhipu.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '通义千问 Qwen-Max（高定文本旗舰）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Plus 专属 · 复杂工具编排',
    cost: 2,
    description: '通义千问文本旗舰模型，适合复杂多步工具连续调用与高定提案话术润色',
    apiModel: 'qwen-max',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: '月之暗面 Kimi K2（超长清单与合同）',
    provider: AI_PROVIDER_CHANNELS.moonshot.label,
    channelId: 'moonshot',
    tag: 'Plus 专属 · 超长上下文',
    cost: 2,
    description: 'Moonshot 旗舰长文本模型，适合超长工程采购清单核对、合同条款审查与方案润色',
    apiModel: 'kimi-k2-0711-preview',
    baseUrl: AI_PROVIDER_CHANNELS.moonshot.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.moonshot.apiKeyEnv,
    minTier: 'pro',
    tierBadge: 'Plus',
    reasoning: false,
  },
  {
    name: 'DeepSeek-R1（满血深度推理）',
    provider: AI_PROVIDER_CHANNELS.deepseek.label,
    channelId: 'deepseek',
    tag: 'Pro 旗舰 · 别墅全案深度审查',
    cost: 3,
    description: 'DeepSeek 满血深度推理模型，适合多层别墅回路审查、跨平台协议规划与整案预算精算',
    apiModel: 'deepseek-reasoner',
    baseUrl: AI_PROVIDER_CHANNELS.deepseek.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.deepseek.apiKeyEnv,
    minTier: 'team',
    tierBadge: 'Pro',
    reasoning: true,
  },
  {
    name: '通义千问 QwQ-Plus（复杂工程逻辑推理）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Pro 旗舰 · 深度逻辑思考',
    cost: 3,
    description: '阿里深度思考推理模型，擅长水电交底严密核验、多回路配电计算与预算优化推演',
    apiModel: 'qwq-plus',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'team',
    tierBadge: 'Pro',
    reasoning: true,
  },
  {
    name: '通义千问 QVQ-Max（视觉深度思考推理）',
    provider: AI_PROVIDER_CHANNELS.dashscope.label,
    channelId: 'dashscope',
    tag: 'Pro 旗舰 · 视觉思维链推理',
    cost: 3,
    description: '阿里视觉深度推理旗舰，支持边看复杂别墅户型图边做深度工程点位推演',
    apiModel: 'qvq-max',
    baseUrl: AI_PROVIDER_CHANNELS.dashscope.baseUrl,
    apiKeyEnv: AI_PROVIDER_CHANNELS.dashscope.apiKeyEnv,
    minTier: 'team',
    tierBadge: 'Pro',
    reasoning: true,
  },
]

const cleanStr = (v: unknown, max: number, fallback = '') =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback

/** 解析并校验后台保存的 AI 模型列表；为空时回退到默认模型。 */
export function parseAiModels(
  value: unknown,
  customChannels: AiCustomChannel[] = [],
): AiModelConfig[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_AI_MODELS.map((m) => ({ ...m }))
  const out: AiModelConfig[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = cleanStr(r.name, 80)
    const apiModel = cleanStr(r.apiModel, 120)
    const rawId = cleanStr(r.id, 60) || apiModel
    const id = rawId.replace(/[^a-zA-Z0-9._:-]/g, '-')
    const custom =
      r.channelId === 'custom' ? customChannels.find((c) => c.key === r.customChannel) : undefined
    // 指向不存在（或校验未通过）的自定义渠道时跳过该模型
    if (r.channelId === 'custom' && !custom) continue
    const channelId: AiProviderChannelId | 'custom' = custom
      ? 'custom'
      : isAiProviderChannelId(r.channelId)
        ? r.channelId
        : 'deepseek'
    const channel = custom
      ? { label: custom.label, baseUrl: custom.baseUrl, apiKeyEnv: custom.apiKeyEnv }
      : AI_PROVIDER_CHANNELS[channelId as AiProviderChannelId]
    if (!id || !name || !apiModel || seen.has(id)) continue
    seen.add(id)
    const costNum = Number(r.cost)
    const validCost = Number.isInteger(costNum) && costNum >= 0 && costNum <= 100 ? costNum : 1
    const isReasoning = Boolean(r.reasoning)
    const tierInfo = resolveExplicitOrInferredTier(r.minTier, apiModel, isReasoning, validCost)
    const num = (v: unknown) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : 0
    }
    const peak = {
      input: num(r.peakInputPrice),
      output: num(r.peakOutputPrice),
      cachedInput: num(r.peakCachedInputPrice),
    }
    const offPeakRaw = {
      input: num(r.offPeakInputPrice),
      output: num(r.offPeakOutputPrice),
      cachedInput: num(r.offPeakCachedInputPrice),
    }
    const offPeak =
      offPeakRaw.input || offPeakRaw.output || offPeakRaw.cachedInput ? offPeakRaw : peak
    const pricing = peak.input || peak.output || peak.cachedInput ? { peak, offPeak } : null
    out.push({
      id,
      name,
      provider: channel.label,
      channelId,
      ...(custom ? { customChannel: custom.key } : {}),
      tag: cleanStr(r.tag, 40, '工具调用'),
      cost: validCost,
      description: cleanStr(r.description, 200, `${name}（${apiModel}）`),
      reasoning: isReasoning,
      apiModel,
      // 内置渠道用固定 baseUrl 与 apiKeyEnv；自定义渠道用后台已校验的地址与 AI_ 前缀变量名
      baseUrl: channel.baseUrl,
      apiKeyEnv: channel.apiKeyEnv,
      minTier: tierInfo.minTier,
      tierBadge: tierInfo.tierBadge,
      enabled: r.enabled !== false,
      isDefault: Boolean(r.isDefault),
      pricing,
    })
  }
  if (out.length === 0) return DEFAULT_AI_MODELS.map((m) => ({ ...m }))
  if (!out.some((m) => m.enabled)) out[0].enabled = true
  if (!out.some((m) => m.enabled && m.isDefault)) {
    const firstEnabled = out.find((m) => m.enabled) ?? out[0]
    firstEnabled.isDefault = true
  }
  return out
}

/** 获取当前已启用且排好序的模型（默认模型排第一）。 */
export function enabledAiModels(
  models: AiModelConfig[],
  options?: { includeAuto?: boolean },
): AiModelConfig[] {
  const active = models.filter((m) => m.enabled && m.id !== 'auto')
  const list = active.length ? active : [models[0] ?? DEFAULT_AI_MODELS[0]]
  const sorted = [...list].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
  if (options?.includeAuto === false) return sorted
  return [AUTO_AI_MODEL, ...sorted]
}

export type AiTemplateVariable = {
  key: string
  label: string
  defaultValue: string
  options?: string[]
}

/**
 * 面向高级用户的可复用 AI 对话技能模板：
 * 每个模板绑定推荐模型、自动挂载的插件、结构化变量槽位与提示词正文。
 */
export type AiPromptTemplate = {
  id: string
  name: string
  category: '点位审查' | '选型报价' | '图纸识图' | '交付话术' | '自定义'
  description: string
  recommendedModelId: string
  requiredPlugins: PluginId[]
  variables: AiTemplateVariable[]
  promptTemplate: string
}

/** 从各插件自注册的 skills 元数据自动汇总生成全局对话技能模板 */
export const DEFAULT_AI_TEMPLATES: AiPromptTemplate[] = allAiSkillSpecs().map((s) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  description: s.description,
  recommendedModelId: s.recommendedModelId,
  requiredPlugins: s.requiredPlugins as PluginId[],
  variables: s.variables,
  promptTemplate: s.promptTemplate,
}))

export function fillPromptTemplate(tpl: AiPromptTemplate, values: Record<string, string>): string {
  let out = tpl.promptTemplate
  for (const v of tpl.variables) {
    const val = values[v.key] ?? v.defaultValue
    out = out.replaceAll(`{${v.key}}`, val)
  }
  return out
}
