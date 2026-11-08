import { allAiToolSpecs } from '@/plugins/ai-catalog'

/**
 * AI 对话按用量计费：
 *
 *   积分 = ceil(倍率 × 本次人民币成本 / 0.1 元 + Σ 工具费用)
 *
 * 人民币成本 = 输入未命中缓存 tokens × 输入价
 *            + 输入命中缓存 tokens × 缓存命中价
 *            + 输出 tokens × 输出价
 * 价格单位：元 / 百万 tokens；1 AI 积分 = 0.1 元；最少 1 积分；失败不扣费。
 *
 * 模型没有配置价格时，兼容旧公式（避免历史模型直接变成免费）：
 *   积分 = ceil(倍率 ×（输入 tokens/1000 × 0.1 + 输出 tokens/1000 × 0.5）+ 工具费用）
 */

/** 1 AI 积分 = 0.1 元 */
export const CREDIT_VALUE_CNY = 0.1

/** 旧公式兼容费率（模型未配置价格时使用） */
export const INPUT_PER_1K = 0.1
export const OUTPUT_PER_1K = 0.5

export type PricePerMillion = {
  /** 输入未命中缓存，元/百万 tokens */
  input: number
  /** 输出，元/百万 tokens */
  output: number
  /** 输入命中缓存，元/百万 tokens */
  cachedInput: number
}

export type ModelPricing = {
  peak: PricePerMillion
  offPeak: PricePerMillion
}

/** 工具调用费用：直接从各插件注册的 AiToolSpec.cost 自动汇总，未列出的按 DEFAULT_TOOL_COST。 */
export const TOOL_COSTS: Record<string, number> = Object.fromEntries(
  allAiToolSpecs().map((t) => [t.name, t.cost]),
)
export const DEFAULT_TOOL_COST = 0.5

export type TokenUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  /** OpenAI / 部分网关：缓存命中的输入 tokens */
  prompt_tokens_details?: { cached_tokens?: number } | null
  /** DeepSeek 原生字段：缓存命中的输入 tokens */
  prompt_cache_hit_tokens?: number
}

/** 北京时间的 DeepSeek / TokenHub 高峰时段：工作日 9:00–12:00、14:00–18:00。法定节假日暂按工作日处理。 */
export function isPeakTime(at: Date = new Date()): boolean {
  const bj = new Date(at.getTime() + 8 * 60 * 60 * 1000)
  const day = bj.getUTCDay()
  const hour = bj.getUTCHours()
  if (day < 1 || day > 5) return false
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

export type PricedModel = {
  cost?: number | null
  pricing?: ModelPricing | null
}

/** 在一次对话中累计 tokens 与工具调用。 */
export class UsageMeter {
  inputTokens = 0
  outputTokens = 0
  /** 输入中命中缓存的部分，已包含在 inputTokens 内 */
  cachedInputTokens = 0
  tools: string[] = []
  /** 接口没有返回 usage 的轮次数（此时按字符估算） */
  estimated = 0

  add(usage: TokenUsage | null | undefined, fallback?: { input: string; output: string }) {
    if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
      const prompt = Math.max(0, Math.trunc(usage.prompt_tokens ?? 0))
      const cached = Math.max(
        0,
        Math.trunc(
          usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0,
        ),
      )
      this.inputTokens += prompt
      this.cachedInputTokens += Math.min(cached, prompt)
      this.outputTokens += Math.max(0, Math.trunc(usage.completion_tokens ?? 0))
    } else if (fallback) {
      this.estimated++
      this.inputTokens += estimateTokens(fallback.input)
      this.outputTokens += estimateTokens(fallback.output)
    }
  }

  tool(name: string) {
    this.tools.push(name)
  }

  toolCost() {
    return this.tools.reduce((s, n) => s + (TOOL_COSTS[n] ?? DEFAULT_TOOL_COST), 0)
  }

  /** 本次应扣积分（整数，最少 1）。传入模型价格时按真实成本计费，也兼容直接传倍率数字。 */
  credits(modelOrMultiplier: PricedModel | number, at: Date = new Date()): number {
    return Math.max(1, Math.ceil(this.tokenCredits(modelOrMultiplier, at) + this.toolCost() - 1e-9))
  }

  /** 仅 tokens 部分折算的积分（未取整、不含工具费），多模型合计时使用。 */
  tokenCredits(modelOrMultiplier: PricedModel | number, at: Date = new Date()): number {
    const model: PricedModel =
      typeof modelOrMultiplier === 'number' ? { cost: modelOrMultiplier } : modelOrMultiplier
    const multiplier =
      Number.isFinite(model?.cost) && Number(model.cost) > 0 ? Number(model.cost) : 1
    const pricing = model?.pricing
    const hasPricing = Boolean(pricing && (pricing.peak.input > 0 || pricing.peak.output > 0))
    if (hasPricing && pricing) {
      const price = isPeakTime(at) ? pricing.peak : pricing.offPeak
      const missInput = Math.max(0, this.inputTokens - this.cachedInputTokens)
      const costCny =
        (missInput / 1_000_000) * Math.max(0, price.input) +
        (this.cachedInputTokens / 1_000_000) * Math.max(0, price.cachedInput) +
        (this.outputTokens / 1_000_000) * Math.max(0, price.output)
      return multiplier * (costCny / CREDIT_VALUE_CNY)
    }
    // 旧公式：模型未配置价格时的兼容路径
    return (
      multiplier *
      ((this.inputTokens / 1000) * INPUT_PER_1K + (this.outputTokens / 1000) * OUTPUT_PER_1K)
    )
  }

  summary() {
    const t = this.tools.length ? ` · 工具 ${this.tools.length} 次` : ''
    const c = this.cachedInputTokens
      ? `（缓存命中 ${this.cachedInputTokens.toLocaleString('en-US')}）`
      : ''
    return `输入 ${this.inputTokens.toLocaleString('en-US')}${c} / 输出 ${this.outputTokens.toLocaleString('en-US')} tokens${t}${this.estimated ? '（部分估算）' : ''}`
  }
}

/** 接口未返回 usage 时的粗略估算：中文约 1 字 ≈ 0.7 token，其他约 4 字符 ≈ 1 token。 */
export function estimateTokens(text: string) {
  if (!text) return 0
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length
  return Math.ceil(cjk * 0.7 + (text.length - cjk) / 4)
}

type LedgerModel = PricedModel & { id: string; name?: string }

/**
 * 一次对话里可能先后用到多个模型（Auto 路由、视觉看图、失败自动切换），按每个模型各自的真实价格分别计费后合计。
 */
export class UsageLedger {
  private meters = new Map<string, { model: LedgerModel; meter: UsageMeter }>()
  readonly tools: string[] = []

  add(
    model: LedgerModel,
    usage: TokenUsage | null | undefined,
    fallback?: { input: string; output: string },
  ) {
    let entry = this.meters.get(model.id)
    if (!entry) {
      entry = { model, meter: new UsageMeter() }
      this.meters.set(model.id, entry)
    }
    entry.meter.add(usage, fallback)
  }

  tool(name: string) {
    this.tools.push(name)
  }

  get inputTokens() {
    return [...this.meters.values()].reduce((s, e) => s + e.meter.inputTokens, 0)
  }

  get outputTokens() {
    return [...this.meters.values()].reduce((s, e) => s + e.meter.outputTokens, 0)
  }

  get estimated() {
    return [...this.meters.values()].reduce((s, e) => s + e.meter.estimated, 0)
  }

  credits(at: Date = new Date()): number {
    let tokens = 0
    for (const { model, meter } of this.meters.values()) tokens += meter.tokenCredits(model, at)
    const toolCost = this.tools.reduce((s, n) => s + (TOOL_COSTS[n] ?? DEFAULT_TOOL_COST), 0)
    return Math.max(1, Math.ceil(tokens + toolCost - 1e-9))
  }

  summary() {
    const models = [...this.meters.values()].map((e) => e.model.name ?? e.model.id)
    const t = this.tools.length ? ` · 工具 ${this.tools.length} 次` : ''
    const m = models.length > 1 ? ` · ${models.length} 个模型协作` : ''
    return `输入 ${this.inputTokens.toLocaleString('en-US')} / 输出 ${this.outputTokens.toLocaleString('en-US')} tokens${t}${m}${this.estimated ? '（部分估算）' : ''}`
  }
}
