import type { Plugin as PayloadPlugin } from 'payload'

import type { DocStyle } from '@/documents/types'
import type { PluginAiSpec } from './ai-types'

/** 插件服务于项目的哪个阶段（能力中心按阶段筛选，项目里按阶段给出入口） */
export type PluginStage = 'design' | 'quote' | 'build' | 'after' | 'global'

/** 能力中心的三类归属（PROJECT-ARCHITECTURE §4.6.3）：AI 能力 / 模板 / 工具 */
export type PluginCategory = 'ai' | 'template' | 'tool'

/**
 * 插件清单。核心只保留主链路（信息 → 点位 → 报价 → 合同 → 归档），外围功能都以插件实现，
 * 但在界面上统称「能力中心」，用户不安装、不启停，点卡片直接进入对应页面。
 * 清单文件只放数据和服务端配置，不引用界面组件，这样 Payload 配置（含命令行）也能安全加载。
 */
export type AppPlugin = {
  id: PluginId
  name: string
  /** 一句话说明它帮你省掉什么事 */
  tagline: string
  description: string
  /** 接入的项目阶段 */
  stage: PluginStage
  /** 在能力中心里的分类；不分组的插件（如全局助手）可不填 */
  category?: PluginCategory
  /** 在项目里的入口：按钮文字与地址（全局插件可以不填项目） */
  entry?: { label: string; href: (projectId: string) => string }
  /** 插件开发状态：ready 可开关使用；coming-soon 尚未开发，界面显示「待开发」 */
  status: 'ready' | 'coming-soon'
  /** 功能在系统里的入口位置说明 */
  where: string
  /** 在插件页列出的能力点 */
  provides: string[]
  /** Payload 层扩展（集合、接口）。配置在构建时注册；开关只控制页面上的功能入口。 */
  payload?: PayloadPlugin
  /** 提供的文档风格 */
  docStyles?: DocStyle[]
  /** 插件向 AI 助手注册的工具、技能模板、领域知识、调用指导与权限声明 */
  ai?: PluginAiSpec
}

export type PluginId =
  | 'ai-copilot'
  | 'doc-styles'
  | 'proposal'
  | 'room-insights'
  | 'smart-select'
  | 'ai-import'
  | 'dwg-import'
  | 'after-sales'
  | 'ha-mcp'

/** 项目阶段：能力中心按阶段筛选、项目里的插件入口共用 */
export const PLUGIN_STAGES = [
  {
    key: 'design',
    label: '勘测与点位设计',
    core: '信息 · 点位',
    hint: '上传户型图、布置点位、检查配置',
  },
  { key: 'quote', label: '报价与方案', core: '报价', hint: '出报价单、生成给业主看的方案' },
  { key: 'build', label: '签约与施工', core: '合同', hint: '签合同、备货、给施工队交底' },
  { key: 'after', label: '交付与售后', core: '归档', hint: '移交账号与场景、记录维保' },
  { key: 'global', label: '全程助手', core: '全程', hint: '任何阶段都能用' },
] as const satisfies readonly { key: PluginStage; label: string; core: string; hint: string }[]

/** 能力中心的三段分组与排序（页面上按这个顺序渲染标题） */
export const PLUGIN_CATEGORIES = [
  { key: 'ai', label: 'AI 能力', hint: '按 AI 积分计费的智能功能' },
  { key: 'template', label: '模板', hint: '方案、文档的外观与版式' },
  { key: 'tool', label: '工具', hint: '导入、分析与记录类工具' },
] as const satisfies readonly { key: PluginCategory; label: string; hint: string }[]
