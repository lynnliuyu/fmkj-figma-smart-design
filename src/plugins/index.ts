import { dwgConverterPlugin } from './dwg-converter'
import { PLUGIN_AI_SPECS } from './ai-catalog'
import { PLUGIN_DOC_STYLES } from './doc-styles/styles'
import type { AppPlugin, PluginId } from './types'

export type { AppPlugin, PluginCategory, PluginId, PluginStage } from './types'
export { PLUGIN_CATEGORIES, PLUGIN_STAGES } from './types'
export {
  PLUGIN_AI_SPECS,
  allAiSkillSpecs,
  allAiToolSpecs,
  validatePluginAiPermissions,
} from './ai-catalog'
export {
  AI_PERMISSIONS,
  type AiKnowledgeEntry,
  type AiPermission,
  type AiSkillSpec,
  type AiToolSpec,
  type PluginAiSpec,
} from './ai-types'

/**
 * 已安装的插件。新增插件：在 src/plugins/<id>/ 写好功能，再在这里登记清单。
 * 主链路（项目信息、点位布置、报价、合同、归档、产品库、设置）不依赖任何插件。
 */
const RAW_PLUGINS: AppPlugin[] = [
  {
    id: 'ai-copilot',
    category: 'ai', // AI 能力：会话里做户型识别、风格化与智能布点
    stage: 'global',
    entry: { label: '打开 AI 对话', href: () => '/ai' },
    tagline: '在任何页面直接问 AI，让它帮你识图、选型、写说明',
    name: 'AI 对话侧栏（高级）',
    description: '侧边栏常驻 AI 助手，支持户型图识别、技能模板与跨插件自动执行。',
    status: 'ready',
    where: '左侧边栏「对话」模式、独立页 /ai',
    provides: ['侧边栏常驻对话', '对话技能模板', '多模型与积分', '跨插件联动'],
  },
  {
    id: 'doc-styles',
    category: 'template', // 模板：打印与文档风格
    stage: 'quote',
    entry: { label: '报价单换风格', href: (id) => `/projects/${id}/quotes` },
    tagline: '报价单、合同换上更多高级排版风格',
    name: '文档风格包',
    description: `为报价单、点位图、合同和交底清单解锁 ${PLUGIN_DOC_STYLES.length} 套扩展视觉风格（与方案模板配套）。`,
    status: 'ready',
    where: '打印页顶部「风格」切换、设置 → 文档模板',
    provides: PLUGIN_DOC_STYLES.map((s) => s.name),
    docStyles: PLUGIN_DOC_STYLES,
  },
  {
    id: 'proposal',
    category: 'template', // 模板：业主方案与施工交底
    stage: 'quote',
    entry: { label: '生成方案', href: (id) => `/print/projects/${id}/proposal` },
    tagline: '点位和预算一键变成给业主看的横版方案',
    name: '方案演示',
    description: '将点位图、房间分析与预算一键生成 A4 横版提案并导出 PDF。',
    status: 'ready',
    where: '项目 → 点位「打印 / 方案」、项目 → 归档',
    provides: ['方案预览', '服务交付页'],
  },
  {
    id: 'room-insights',
    category: 'tool', // 工具：房间配置完整度分析
    stage: 'design',
    entry: { label: '查看房间分析', href: (id) => `/projects/${id}/point-map` },
    tagline: '逐个房间检查漏配，顺手推荐联动场景',
    name: '房间智能分析',
    description: '按房间类型评估点位完整度，提供缺失提醒与联动场景建议。',
    status: 'ready',
    where: '项目 → 点位「区域」面板、方案演示',
    provides: ['配置完整度', '补充建议', '场景推荐'],
  },
  {
    id: 'smart-select',
    category: 'tool', // 工具：按平台与预算档位一键选型
    stage: 'design',
    entry: { label: '一键选型', href: (id) => `/projects/${id}/point-map` },
    tagline: '按平台和预算档位，一键给全屋选好型号',
    name: '智能选型',
    description: '按生态平台与预算档位，一键匹配全屋各设备类型的默认型号。',
    status: 'ready',
    where: '项目 → 点位「统计与默认型号」',
    provides: ['一键选型'],
  },
  {
    id: 'ai-import',
    category: 'ai', // AI 能力：识图生成点位
    stage: 'design',
    entry: { label: 'AI 识别图纸', href: (id) => `/projects/${id}/point-map` },
    tagline: '让 AI 读图纸，自动生成点位',
    name: 'AI 识别导入',
    description: '识别标准图纸中的开关插座与点位符号，支持导入导出点位 JSON。',
    status: 'ready',
    where: '项目 → 点位「AI 识别」标签页',
    provides: ['识别提示词', '导入识别结果', '导出点位 JSON'],
  },
  {
    id: 'dwg-import',
    category: 'tool', // 工具：CAD 图纸转户型底图
    stage: 'design',
    entry: { label: '导入 DWG', href: (id) => `/projects/${id}/point-map` },
    tagline: 'CAD 图纸直接导入成户型底图',
    name: 'DWG 导入',
    description: '上传 CAD DWG 图纸并自动转换为标准户型底图。',
    status: 'ready',
    where: '项目 → 点位「导入 DWG」',
    provides: ['导入 DWG'],
    payload: dwgConverterPlugin({
      endpoint: process.env.DWG_CONVERTER_URL,
      token: process.env.DWG_CONVERTER_TOKEN,
    }),
  },
  {
    id: 'after-sales',
    category: 'tool', // 工具：质保与维保记录
    stage: 'after',
    entry: { label: '售后维保', href: (id) => `/projects/${id}/after-sales` },
    tagline: '质保、检修与配置备份都有记录',
    name: '售后维保记录',
    description:
      '按合同质保期自动倒计时，登记交付验收、巡检、上门检修与设备更换，留存全屋设备台账作为配置备份，并打印售后维保卡。',
    status: 'ready',
    where: '项目 → 归档 →「售后维保」、项目工具箱',
    provides: ['质保倒计时', '维保记录', '配置备份', '售后维保卡'],
  },
  {
    id: 'ha-mcp',
    category: 'ai', // AI 能力：让助手直接读写客户现场的设备
    stage: 'global',
    tagline: '助手直接读取并把控客户现场的真实设备',
    name: '智能家居现场对接（HA-MCP）',
    description:
      '通过 MCP 协议连接客户现场的 Home Assistant：读取真实设备与状态、搜索实体、' +
      '按区域核对点位，也能直接开关设备做现场调试。不中转 HA 的运维能力（改 YAML、装 HACS、备份）。',
    status: 'ready',
    where: 'AI 对话（助手工具）、能力中心 → AI 能力',
    provides: ['设备总览', '实体搜索', '区域核对', '历史排查', '系统健康', '设备控制'],
  },
  {
    id: 'business-card',
    category: 'tool', // 工具：印刷物料，与具体项目无关
    stage: 'global',
    tagline: '改好文字直接导出能送印的名片',
    entry: { label: '打开名片', href: () => '/capabilities/business-card' },
    name: '名片',
    description:
      '四套版式 × 正反面，90×54mm 标准名片；改姓名、头衔、电话、网站后一键导出 300dpi PNG，也能勾选多版打包 ZIP。',
    status: 'ready',
    where: '能力中心 → 全部工具、/capabilities/business-card',
    provides: ['4 套版式', '正反面', '三维预览', '300dpi PNG 导出', '多版 ZIP 打包'],
  },
]

export const PLUGINS: AppPlugin[] = RAW_PLUGINS.map((p) => ({
  ...p,
  ai: PLUGIN_AI_SPECS[p.id],
}))

export const PLUGIN_IDS = PLUGINS.map((p) => p.id)
export const isPluginId = (v: unknown): v is PluginId => PLUGIN_IDS.includes(v as PluginId)
