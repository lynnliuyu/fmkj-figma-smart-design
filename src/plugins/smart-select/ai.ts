import type { PluginAiSpec } from '@/plugins/ai-types'
import { SELECTION_TIERS } from './auto-select'

export const smartSelectAiSpec: PluginAiSpec = {
  permissions: ['catalog:read', 'defaults:write'],
  guidance: [
    '当用户要求按平台（米家、Aqara、Apple Home、华为、KNX）和预算档次（经济、标准、高端）配单或推荐型号时，调用 smart_select 工具。',
  ],
  knowledge: [
    {
      id: 'smart-select-algorithm',
      title: '智能选型四步匹配规则',
      summary: '候选过滤 → 生态平台逐级放宽 → 档次价格分位（20%/50%/85%）→ 同品类品牌统一',
      rules: [
        '1. 候选池过滤：仅选在售（status=active）且设备类型一致的产品；优先有标价（price>0）和带产品图的产品。',
        '2. 生态平台逐级放宽：米家（米家 → 通用/Matter → 全部）；Aqara Home（Aqara 品牌 → Apple Home/Matter → 通用 → 全部）；Apple Home（Apple Home/Matter → 通用 → 全部）；华为鸿蒙智家（华为 → 通用 → 全部）；KNX（KNX → 通用 → 全部）。',
        '3. 预算档次价格分位：经济档（economy）取 20% 分位价格；标准档（standard）取 50% 中位数价格；高端档（premium）取 85% 分位价格。',
        '4. 同类别品牌统一：同一设备大类内统计出现最多的主品牌，若其他设备类型存在该主品牌产品且价差 ≤ max(30元, 原价×40%)，自动统一为主品牌。',
      ],
    },
  ],
  tools: [
    {
      name: 'smart_select',
      title: '智能选型',
      description:
        '按项目主平台和档次（economy 经济 / standard 标准 / premium 高端），为当前关联项目点位图里用到的设备类型匹配默认型号。当 apply=true 时，会直接把选型结果写入该项目的默认型号。',
      cost: 2,
      permissions: ['catalog:read', 'defaults:write'],
      scope: 'project',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          tier: {
            type: 'string',
            enum: SELECTION_TIERS.map((t) => t.value),
            description: 'economy 经济 / standard 标准 / premium 高端',
          },
          apply: { type: 'boolean', description: '是否直接写入当前项目的默认型号（默认 true）' },
        },
        required: ['tier'],
      },
    },
  ],
  skills: [
    {
      id: 'tpl-smart-select',
      name: '按平台与档次一键配单',
      category: '选型报价',
      description: '调用「智能选型」插件，按指定生态平台和预算档次匹配全屋默认设备型号',
      modelHint: 'fast',
      recommendedModelId: 'deepseek-flash',
      requiredPlugins: ['smart-select', 'room-insights'],
      variables: [
        {
          key: 'platform',
          label: '主平台',
          defaultValue: '米家',
          options: ['米家', 'Aqara Home', 'Apple Home', '华为鸿蒙智家', 'KNX'],
        },
        {
          key: 'tier',
          label: '配置档次',
          defaultValue: '标准档',
          options: ['经济档', '标准档', '高端档'],
        },
      ],
      promptTemplate:
        '请调用「智能选型」插件，以【{platform}】为主平台、按【{tier}】预算标准，为当前项目的开关、窗帘、门锁、传感器与网关推荐默认型号组合，并说明选型理由。',
    },
  ],
}
