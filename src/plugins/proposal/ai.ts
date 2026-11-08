import type { PluginAiSpec } from '@/plugins/ai-types'
import { ORCHESTRATION_RULES } from './framework'
import { BUILTIN_PROPOSAL_TEMPLATES } from './templates'

export const proposalAiSpec: PluginAiSpec = {
  permissions: ['templates:read', 'documents:read'],
  guidance: [
    '当用户询问「哪个方案模板适合我的客户」「怎么选提案风格」或需要汇报方案时，调用 recommend_proposal_template 根据客户画像、汇报时机和预算敏感度推荐最匹配的方案模板，并附上预览链接。',
  ],
  knowledge: [
    {
      id: 'proposal-orchestration-spec',
      title: '方案演示模板与章节编排规范',
      summary: '业主方案与施工交底分离，支持完整提案、场景故事、预算速览三种版式框架',
      rules: [
        ...ORCHESTRATION_RULES,
        ...BUILTIN_PROPOSAL_TEMPLATES.map(
          (t) =>
            `${t.label}(${t.value}, ${t.kind === 'owner' ? '业主方案' : '施工交底'})：${t.description}；适合【${t.audience}】，使用时机【${t.occasion}】。`,
        ),
      ],
    },
  ],
  tools: [
    {
      name: 'recommend_proposal_template',
      title: '方案模板智能推荐',
      description:
        '根据业主画像（如别墅高净值、年轻数码家庭、原木风、新中式）、沟通时机（首次沟通、比价阶段、签约汇报）推荐最匹配的方案模板，并返回项目方案预览链接。',
      cost: 0.2,
      permissions: ['templates:read', 'documents:read'],
      scope: 'workspace',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          audience: {
            type: 'string',
            description: '客户画像或装修风格描述（如 别墅业主、原木风、年轻夫妻、新中式）',
          },
          occasion: {
            type: 'string',
            description: '使用时机（如 首次沟通、快速比价、正式签约汇报）',
          },
          budgetSensitive: {
            type: 'boolean',
            description: '客户是否对预算非常敏感、只想先看总价（默认 false）',
          },
        },
      },
    },
  ],
  skills: [
    {
      id: 'tpl-qixu-handover',
      name: '栖序提案与付款验收说明',
      category: '交付话术',
      description:
        '结合「方案演示」与「文档风格包」，生成客户汇报话术、三阶段付款说明与共同验收清单',
      modelHint: 'fast',
      recommendedModelId: 'deepseek-flash',
      requiredPlugins: ['proposal', 'doc-styles'],
      variables: [
        {
          key: 'paymentSplit',
          label: '付款比例',
          defaultValue: '40% / 50% / 10%',
          options: ['40% / 50% / 10%', '30% / 60% / 10%', '50% / 40% / 10%'],
        },
        {
          key: 'warranty',
          label: '质保与维护',
          defaultValue: '设备质保 12 个月，含 1 年上门联调',
          options: ['设备质保 12 个月，含 1 年上门联调', '设备质保 24 个月，含季度巡检'],
        },
      ],
      promptTemplate:
        '请调用「方案演示」与「文档风格包」插件，按栖序提案「08 服务交付 · 付款与确认」结构，采用【{paymentSplit}】付款节点与【{warranty}】条款，生成给客户的方案汇报话术与现场验收确认要点。',
    },
    {
      id: 'tpl-proposal-pick',
      name: '按业主画像推荐提案模板',
      category: '交付话术',
      description:
        '根据业主装修风格与沟通阶段，从方案模板库中挑选最合适的提案模板并生成开场汇报要点',
      modelHint: 'fast',
      recommendedModelId: 'deepseek-flash',
      requiredPlugins: ['proposal'],
      variables: [
        {
          key: 'clientProfile',
          label: '业主与装修风格',
          defaultValue: '改善型三房 · 现代原木风家庭',
          options: [
            '改善型三房 · 现代原木风家庭',
            '别墅大宅 · 高净值业主',
            '年轻科技控 · 极简现代风',
            '新中式大平层 · 三代同堂',
          ],
        },
        {
          key: 'meetingStage',
          label: '汇报时机',
          defaultValue: '首次方案沟通',
          options: ['首次方案沟通', '比价与预算速览', '深化定稿与签约汇报'],
        },
      ],
      promptTemplate:
        '当前客户属于【{clientProfile}】，处于【{meetingStage}】阶段。请调用 recommend_proposal_template 工具推荐最合适的方案模板，并给出 3 条针对该客户的提案讲解建议。',
    },
  ],
}
