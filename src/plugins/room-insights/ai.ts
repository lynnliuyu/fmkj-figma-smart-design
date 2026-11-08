import type { PluginAiSpec } from '@/plugins/ai-types'

export const roomInsightsAiSpec: PluginAiSpec = {
  permissions: ['point-map:read'],
  guidance: [
    '当用户询问某房间的点位是否合理、是否有遗漏、或者需要生成水电施工交底注意事项时，先调用 room_insights 获取每个房间的完整度评分与缺失项，再给出结构化建议。',
  ],
  knowledge: [
    {
      id: 'room-completeness-rules',
      title: '16 类房间点位完整度评估规范',
      summary: '按必备（core）、推荐（recommended）、可选（optional）评估每个房间的点位配置完整度',
      rules: [
        '完整度评分公式：score = 已满足的(必备 + 推荐)项数量 / 总(必备 + 推荐)项数量 × 100（可选不计入分母）。',
        '玄关（entrance）：必备智能门锁、照明；推荐人体传感器、场景面板；可选门铃/摄像头。',
        '客厅（living）：必备照明、智能开关/面板；推荐电动窗帘、中控屏/智能音箱；可选温湿度/空调控制。',
        '厨房（kitchen）：必备照明、开关、烟雾/燃气报警；推荐水浸传感器；可选人体传感器。',
        '卧室（bedroom）：必备照明、双控开关；推荐电动窗帘、人体传感器（起夜）；可选温湿度/空调控制。',
        '卫生间（bathroom）：必备照明、感应或开关控制；推荐水浸传感器。',
        '回路匹配告警：某房间有灯具但没有任何开关/面板/人体传感器时告警「无法单独控制」；灯具 ≥ 10 个但开关键位 < 3 且无中控屏时告警「建议增加键位或改用场景面板分组控制」。',
      ],
    },
  ],
  tools: [
    {
      name: 'room_insights',
      title: '房间智能分析',
      description:
        '读取当前关联项目的房间点位配置：每个房间的设备、配置完整度评分、缺少的必备/推荐设备和推荐联动场景。',
      cost: 0.5,
      permissions: ['point-map:read'],
      scope: 'project',
      mutates: false,
      parameters: { type: 'object', properties: {} },
    },
  ],
  skills: [
    {
      id: 'tpl-room-audit',
      name: '房间点位完整度审查',
      category: '点位审查',
      description: '调用「房间智能分析」插件，按户型逐间检查必配点位、安防传感器与双控遗漏',
      modelHint: 'fast',
      recommendedModelId: 'deepseek-flash',
      requiredPlugins: ['room-insights'],
      variables: [
        {
          key: 'layout',
          label: '户型结构',
          defaultValue: '三室两厅两卫',
          options: ['两室两厅一卫', '三室两厅两卫', '四室两厅三卫', '复式 / 别墅'],
        },
        {
          key: 'focus',
          label: '审查重点',
          defaultValue: '照明回路与安防传感器',
          options: ['照明回路与安防传感器', '全屋无主灯调光', '老人与儿童看护', '精装房后装改造'],
        },
      ],
      promptTemplate:
        '请按【{layout}】户型标准，调用「房间智能分析」插件审查当前项目的点位配置（重点关注：{focus}），列出缺失点位、原因及推荐联动场景。',
    },
    {
      id: 'tpl-wiring-deep',
      name: '水电交底与零火线预留清单',
      category: '点位审查',
      description: '针对现场水电施工交底，按点位汇总零火线、窗帘盒电源、网口与网关位置要求',
      modelHint: 'fast',
      recommendedModelId: 'deepseek-flash',
      requiredPlugins: ['room-insights', 'proposal'],
      variables: [
        {
          key: 'stage',
          label: '施工阶段',
          defaultValue: '水电开槽布管前',
          options: ['水电开槽布管前', '吊顶木工封板前', '油漆完工安装前'],
        },
      ],
      promptTemplate:
        '当前项目处于【{stage}】阶段，请结合项目点位生成一份给水电工与项目经理的强弱电预留交底注意事项（含零火线、底盒深度、窗帘电源与网关网口要求）。',
    },
  ],
}
