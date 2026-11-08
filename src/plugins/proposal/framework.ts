/**
 * 方案模板框架：一份方案 = 若干「章节」按顺序组合。章节是固定的页面组件（deck/pages），
 * 「结构」是一组推荐的章节顺序；模板（templates.ts / 后台「方案模板」）在结构的基础上选主题、调章节、换文案。
 *
 * 编排规范（ORCHESTRATION_RULES，normalizeSections 负责执行，后台模板与内置模板都经过它）：
 * 1. 封面固定在第一页；模板没选封面时自动补上。
 * 2. 每个章节最多出现一次。
 * 3. 投资明细在服务交付之前，服务交付固定在最后一章。
 * 4. 需要点位的章节（平面、系统、空间、场景、其余空间）在项目没有点位时自动跳过。
 * 5. 生活场景按场景库匹配；场景库为空时使用内置场景，保证章节不会空白。
 * 6. 施工交底是独立版式（不含价格），不和业主方案混排、不参与章节编排。
 */

export const DECK_SECTIONS = [
  {
    value: 'cover',
    label: '封面',
    description: '品牌、标题、项目与预算',
    pages: '1 页',
    needsPoints: false,
    price: false,
  },
  {
    value: 'plans',
    label: '住宅平面',
    description: '每张图纸一页，点位编号与索引',
    pages: '每张图纸 1 页',
    needsPoints: true,
    price: false,
  },
  {
    value: 'system',
    label: '系统与设备',
    description: '网络拓扑、设备类别与配置原则',
    pages: '1 页',
    needsPoints: true,
    price: false,
  },
  {
    value: 'zones',
    label: '空间章节',
    description: '进门、休息、看护、专注四个空间章节',
    pages: '每个有设备的空间 1 页（最多 4 页）',
    needsPoints: true,
    price: true,
  },
  {
    value: 'scenes',
    label: '生活场景',
    description: '场景库匹配到的场景：图片、联动步骤与实际产品',
    pages: '每 2 个场景 1 页',
    needsPoints: true,
    price: false,
  },
  {
    value: 'rooms',
    label: '其余空间',
    description: '没有展开的房间：设备与小计',
    pages: '按房间数分页',
    needsPoints: true,
    price: true,
  },
  {
    value: 'investment',
    label: '投资明细',
    description: '设备清单、费用与合计',
    pages: '每 12 行 1 页',
    needsPoints: false,
    price: true,
  },
  {
    value: 'service',
    label: '服务交付',
    description: '服务流程、付款节点与签字确认',
    pages: '1 页',
    needsPoints: false,
    price: false,
  },
] as const
export type DeckSection = (typeof DECK_SECTIONS)[number]['value']
export const isDeckSection = (v: unknown): v is DeckSection =>
  DECK_SECTIONS.some((s) => s.value === v)
export const deckSectionLabel = (v: DeckSection) =>
  DECK_SECTIONS.find((s) => s.value === v)?.label ?? v

/** 方案的两种用途：业主方案（给客户看，含预算）与施工交底（给安装团队，不含价格），选择器里分开展示 */
export const PROPOSAL_KINDS = [
  { value: 'owner', label: '业主方案', description: '给业主看的横版提案：场景、平面、系统与预算' },
  {
    value: 'construction',
    label: '施工交底',
    description: '给安装团队：点位代号、安装位置与清单，不含任何价格',
  },
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]['value']

export const PROPOSAL_FRAMEWORKS = [
  {
    value: 'full',
    label: '完整提案',
    description: '8 章完整提案：平面 → 系统 → 空间 → 场景 → 投资 → 交付，适合正式汇报',
    audience: '已经确认需求、准备签约的业主',
    occasion: '方案深化后的正式汇报、签约前定稿',
    sections: ['cover', 'plans', 'system', 'zones', 'scenes', 'rooms', 'investment', 'service'],
  },
  {
    value: 'story',
    label: '场景故事',
    description: '先讲生活场景，再落到空间、平面与预算，适合首次沟通打动业主',
    audience: '还在了解全屋智能、需要被打动的业主',
    occasion: '首次方案沟通、家庭成员一起看方案',
    sections: ['cover', 'scenes', 'zones', 'plans', 'system', 'investment', 'service'],
  },
  {
    value: 'budget',
    label: '预算速览',
    description: '封面 + 系统 + 投资 + 交付，几页讲清预算，适合快速报价',
    audience: '预算敏感、正在比价的业主',
    occasion: '首次咨询后的快速报价、比价阶段',
    sections: ['cover', 'system', 'investment', 'service'],
  },
  {
    value: 'construction',
    label: '施工交底',
    description: '点位代号与清单，不含价格，给安装团队',
    audience: '安装团队、水电工与项目经理',
    occasion: '进场施工前交底、现场安装与验收核对',
    sections: [],
  },
] as const satisfies readonly {
  value: string
  label: string
  description: string
  audience: string
  occasion: string
  sections: readonly DeckSection[]
}[]
export type ProposalFrameworkId = (typeof PROPOSAL_FRAMEWORKS)[number]['value']
export const isProposalFramework = (v: unknown): v is ProposalFrameworkId =>
  PROPOSAL_FRAMEWORKS.some((f) => f.value === v)
export const frameworkSections = (id: ProposalFrameworkId): DeckSection[] => [
  ...(PROPOSAL_FRAMEWORKS.find((f) => f.value === id)?.sections ?? []),
]
export const frameworkLabel = (id: ProposalFrameworkId) =>
  PROPOSAL_FRAMEWORKS.find((f) => f.value === id)?.label ?? id
export const frameworkOf = (id: ProposalFrameworkId) =>
  PROPOSAL_FRAMEWORKS.find((f) => f.value === id) ?? PROPOSAL_FRAMEWORKS[0]
export const kindOfFramework = (id: ProposalFrameworkId): ProposalKind =>
  id === 'construction' ? 'construction' : 'owner'

/** 编排规范（导出到知识库，也显示在后台「方案模板」说明里） */
export const ORCHESTRATION_RULES = [
  '封面固定在第一页；模板没选封面时自动补上',
  '每个章节最多出现一次，重复的章节只保留第一次',
  '投资明细排在服务交付之前，服务交付固定在最后一章',
  '需要点位的章节（住宅平面、系统与设备、空间章节、生活场景、其余空间）在项目没有点位时自动跳过',
  '生活场景按场景库匹配项目真实的房间与设备；场景库为空时使用内置场景，章节不会空白',
  '施工交底是独立版式（不含价格），不和业主方案混排，也不参与章节编排',
] as const

/**
 * 按编排规范整理章节顺序：去重 → 封面置顶 → 投资明细与服务交付置底（投资在前）。
 * 施工交底没有章节，原样返回空数组；空列表回退到版式框架的推荐章节。
 */
export function normalizeSections(
  sections: readonly unknown[],
  framework: ProposalFrameworkId = 'full',
): DeckSection[] {
  if (framework === 'construction') return []
  const seen = new Set<DeckSection>()
  const list: DeckSection[] = []
  for (const s of sections) {
    if (!isDeckSection(s) || seen.has(s)) continue
    seen.add(s)
    list.push(s)
  }
  if (!list.length) return frameworkSections(framework)
  const middle = list.filter((s) => s !== 'cover' && s !== 'investment' && s !== 'service')
  return [
    'cover' as const,
    ...middle,
    ...(seen.has('investment') ? (['investment'] as const) : []),
    ...(seen.has('service') ? (['service'] as const) : []),
  ]
}
