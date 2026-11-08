import type { PluginAiSpec } from './ai-types'
import { PLUGIN_DOC_STYLES } from './doc-styles/styles'
import type { PluginId } from './types'

/** 其余工程与文档插件的 AI 元数据声明（知识、指导与权限） */
export const EXTRA_PLUGIN_AI_SPECS: Partial<Record<PluginId, PluginAiSpec>> = {
  'doc-styles': {
    permissions: ['documents:read'],
    guidance: ['生成打印或导出链接时，可根据客户偏好传入 style 参数切换文档视觉风格。'],
    knowledge: [
      {
        id: 'doc-styles-catalog',
        title: '文档视觉风格包清单',
        summary: `内置极简默认风格 + ${PLUGIN_DOC_STYLES.length} 套扩展视觉风格`,
        rules: PLUGIN_DOC_STYLES.map((s) => `${s.name}(${s.id})：${s.description}`),
      },
    ],
    tools: [],
    skills: [],
  },
  'dwg-import': {
    permissions: ['point-map:write'],
    guidance: [
      '用户询问 CAD .dwg 文件如何导入时，引导其在点位图工作台顶部点击「导入 DWG」自动转换为 3:2 标准户型底图。',
    ],
    knowledge: [
      {
        id: 'dwg-conversion-spec',
        title: 'CAD DWG 自动转换规范',
        summary: '将 .dwg 矢量工程图转换为去图框的 3:2 标准 PNG 底图',
        rules: [
          '支持直接上传 .dwg 文件，服务端转换后进入标准图框裁切器，与手传 PNG 户型图拥有完全一致的标定与布点体验。',
        ],
      },
    ],
    tools: [],
    skills: [],
  },
  'after-sales': {
    permissions: ['projects:read', 'contracts:read'],
    guidance: [
      '解答售后质保问题时：质保起算日优先取项目「交付验收」维保记录的日期，没有时取合同签订日期；质保月数取合同 warrantyMonths（未填写按 12 个月）。',
      '用户需要登记检修、设备更换或留存配置备份时，引导其打开项目的售后维保页（/projects/[id]/after-sales）；交付时可提供售后维保卡打印链接（/print/projects/[id]/after-sales）。',
    ],
    knowledge: [
      {
        id: 'after-sales-policy',
        title: '售后维保与配置备份规范',
        summary: '按合同质保期自动倒计时，记录交付验收、巡检、检修、设备更换、远程调试与配置备份',
        rules: [
          '标准合同默认提供 12 个月设备质保与上门联调服务；登记「交付验收」后质保从验收日起算，否则从合同签订日起算，到期前 30 天提示安排巡检。',
          '维保记录类型：交付验收、定期巡检、上门检修、设备更换、远程调试、配置备份；收费方式分质保内免费、保外收费（记录金额）与赠送服务。',
          '配置备份会把当时的点位图与定稿报价整理成全屋设备台账（代号、位置、设备类型、型号）留存，后续更换设备时以此为基准核对。',
        ],
      },
    ],
    tools: [],
    skills: [],
  },
}
