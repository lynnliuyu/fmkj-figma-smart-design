/**
 * 插件 AI 元数据规范（纯类型与权限字典，不含任何服务端数据库或运行时依赖）。
 *
 * 每个插件通过 `ai` 字段声明自己向 AI 助手贡献的：
 * - `tools`：工具规格（名称、标题、参数 JSON Schema、积分费用、所需权限、是否修改数据）；
 * - `skills`：可复用的对话技能模板（带变量槽位与推荐模型类型）；
 * - `knowledge`：注入系统提示词与导出到知识库 JSON 的领域规则条目；
 * - `guidance`：指导模型何时、如何调用该插件工具的简短准则；
 * - `permissions`：该插件声明拥有的权限范围（运行时会校验工具权限必须包含在插件声明权限内）。
 */

export const AI_PERMISSIONS = [
  { value: 'projects:read', label: '读取项目列表与详情', mutates: false },
  { value: 'projects:write', label: '创建、修改项目或归档状态', mutates: true },
  { value: 'point-map:read', label: '读取点位图、房间区域与设备统计', mutates: false },
  { value: 'point-map:write', label: '添加户型图、布置房间区域与设备点位', mutates: true },
  { value: 'catalog:read', label: '检索 728 款产品库与品牌价格', mutates: false },
  { value: 'defaults:write', label: '设置项目默认选型型号', mutates: true },
  { value: 'quotes:read', label: '读取项目报价单与金额明细', mutates: false },
  { value: 'quotes:write', label: '生成或修改报价单、优惠与附加费', mutates: true },
  { value: 'contracts:read', label: '读取施工合同与收款计划', mutates: false },
  { value: 'contracts:write', label: '创建或修改施工合同与分期节点', mutates: true },
  { value: 'documents:read', label: '生成打印与导出文档直达链接', mutates: false },
  { value: 'templates:read', label: '读取方案模板、适用客户与推荐匹配', mutates: false },
  { value: 'images:generate', label: '调用 AI 生成图片', mutates: true },
  { value: 'smart-home:read', label: '读取客户现场智能家居设备与状态', mutates: false },
  { value: 'smart-home:write', label: '控制客户现场智能家居设备', mutates: true },
] as const

export type AiPermission = (typeof AI_PERMISSIONS)[number]['value']

export type AiToolSpec = {
  /** 工具函数名（传给大模型的 function.name） */
  name: string
  /** 工具中文名称（展示在聊天气泡与计费明细中） */
  title: string
  /** 工具功能说明（传给大模型的 function.description） */
  description: string
  /** OpenAI function calling 兼容的参数 JSON Schema */
  parameters: Record<string, unknown>
  /** 每次调用附加的积分费用（与 billing.ts 自动同步） */
  cost: number
  /** 调用该工具所需的细粒度权限 */
  permissions: readonly AiPermission[]
  /** 作用域：workspace（全局工作区）或 project（需要关联项目） */
  scope: 'workspace' | 'project'
  /** 是否会修改项目或业务数据（true 时在归档项目或只读协作权限下自动拦截） */
  mutates: boolean
  /** 允许从参数中读取目标项目 ID 的字段名（如 update_project 的 projectId） */
  projectArg?: string
  /** 是否允许在已归档项目上执行（如恢复归档状态） */
  allowArchived?: boolean
}

export type AiSkillVariable = {
  key: string
  label: string
  defaultValue: string
  options?: string[]
}

export type AiSkillSpec = {
  id: string
  name: string
  category: '点位审查' | '选型报价' | '图纸识图' | '交付话术' | '自定义'
  description: string
  /** 推荐的模型能力类型：fast（日常高速）、vision（视觉多模态）、reasoning（深度思考） */
  modelHint?: 'fast' | 'vision' | 'reasoning'
  recommendedModelId: string
  requiredPlugins: string[]
  variables: AiSkillVariable[]
  promptTemplate: string
}

export type AiKnowledgeEntry = {
  id: string
  title: string
  summary: string
  /** 规则正文或结构化要点（导出到知识库 JSON，并在关联该插件时按需注入上下文） */
  rules: readonly string[]
}

export type PluginAiSpec = {
  /** 插件声明的权限边界（其下所有 tools 的 permissions 必须是它的子集） */
  permissions: readonly AiPermission[]
  /** 插件对大模型的调用指导原则（启用并勾选该插件时注入系统提示词） */
  guidance: readonly string[]
  /** 插件提供的领域知识条目 */
  knowledge: readonly AiKnowledgeEntry[]
  /** 插件注册的工具规格列表 */
  tools: readonly AiToolSpec[]
  /** 插件提供的可复用对话技能模板 */
  skills: readonly AiSkillSpec[]
}
