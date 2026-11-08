import type { PluginCategory, PluginId } from '@/plugins/types'

/** 能力中心里可独立打开的页面；有项目上下文的入口仍从项目内进入。 */
export type PluginTool = {
  id: string
  pluginId: PluginId
  name: string
  description: string
  href: string
  /** 能力中心分类，与 `AppPlugin.category` 同一套口径（PROJECT-ARCHITECTURE §4.6.3） */
  category: PluginCategory
}

export const PLUGIN_TOOLS: PluginTool[] = [
  {
    id: 'ai-chat',
    pluginId: 'ai-copilot',
    category: 'ai',
    name: 'AI 对话',
    description: '用自然语言完成项目、点位、报价、合同和生图任务',
    href: '/ai',
  },
  {
    id: 'ai-image',
    pluginId: 'ai-copilot',
    category: 'ai',
    name: 'AI 生图',
    description: '文字生成智能家居场景图、方案配图和材质意向图',
    href: '/ai/image',
  },
  {
    id: 'floor-plan-style',
    pluginId: 'ai-copilot',
    category: 'ai',
    name: '户型图风格化',
    description: '选风格模板，把户型图重绘成家具彩平图',
    href: '/ai/image/style',
  },
  {
    id: 'proposal-templates',
    pluginId: 'proposal',
    category: 'template',
    name: '方案模板库',
    description: '浏览业主方案与施工交底模板',
    href: '/templates',
  },
  {
    id: 'doc-styles',
    pluginId: 'doc-styles',
    category: 'template',
    name: '打印风格',
    description: '设置报价单、合同的扩展打印风格',
    href: '/settings',
  },
  {
    id: 'usage-reports',
    pluginId: 'room-insights',
    category: 'tool',
    name: '客户使用报告',
    description: '查看客户使用与运维诊断报告',
    href: '/settings/reports',
  },
]
