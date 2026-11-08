/**
 * 方案模板：同一份点位与报价数据，完整、故事与预算框架的横版提案（前三套来自 Figma 设计稿 FGGahF8jZGnRLwcgZfJloK），
 * 外加不含价格、给安装团队的施工交底版。后台「方案模板」有数据时以后台为准（版式框架 × 视觉风格），这里是兜底的内置模板。
 *
 * 每个模板都要回答三个问题（选择器、模板库、知识库导出都会展示）：
 * - audience：适合什么客户；occasion：什么时候用；highlights：一眼能看出的 2–3 个外观特点。
 */
import type { DeckThemeId } from './deck/themes'
import { frameworkSections, kindOfFramework, type DeckSection, type ProposalFrameworkId, type ProposalKind } from './framework'

/** 方案点位的显示方式：number = 设计稿的编号圆点；symbol / product = 设备图标 / 产品图 */
export type ProposalMarkers = 'number' | 'symbol' | 'product'
export const isProposalMarkers = (v: unknown): v is ProposalMarkers => v === 'number' || v === 'symbol' || v === 'product'

export type ProposalTemplateDef = {
  /** 模板标识（网址参数、项目里保存的模板） */
  value: string
  label: string
  description: string
  /** 业主方案 / 施工交底（由版式框架决定） */
  kind: ProposalKind
  /** 适合什么客户 */
  audience: string
  /** 什么时候用 */
  occasion: string
  /** 外观特点（2–3 个短标签） */
  highlights: string[]
  framework: ProposalFrameworkId
  theme: DeckThemeId
  /** 实际使用的章节（按顺序） */
  sections: DeckSection[]
  markers: 'number' | 'symbol'
  headline?: string | null
  tagline?: string | null
  coverPhoto?: string | null
  /** 强调色（#RRGGBB），留空沿用主题 */
  accent?: string | null
}

type BuiltinCopy = { description: string; audience: string; occasion: string; highlights: string[] }

function builtin(value: string, label: string, framework: ProposalFrameworkId, theme: DeckThemeId, copy: BuiltinCopy): ProposalTemplateDef {
  return { value, label, ...copy, kind: kindOfFramework(framework), framework, theme, sections: frameworkSections(framework), markers: 'symbol' }
}

export const BUILTIN_PROPOSAL_TEMPLATES: ProposalTemplateDef[] = [
  builtin('qixu', '栖序雅致', 'full', 'qixu', {
    description: '暖白纸色、灰紫强调、细体大编号，忠于设计稿的 8 章完整提案',
    audience: '大多数改善型住宅业主（三房到大平层）',
    occasion: '方案深化后的正式汇报、签约前定稿',
    highlights: ['暖白纸面', '照片色带封面', '8 章完整'],
  }),
  builtin('noir', '墨金臻选', 'full', 'noir', {
    description: '深色画面、香槟金与衬线标题，屏幕演示质感最强',
    audience: '别墅、大平层等高净值业主',
    occasion: '大屏投影或平板现场演示、高端项目提案',
    highlights: ['深色画面', '整幅照片封面', '金线表头'],
  }),
  builtin('grove', '原木自然', 'full', 'grove', {
    description: '燕麦纸色、橄榄绿、左文右图封面与圆角卡片',
    audience: '原木、日式、侘寂等自然风格的家庭',
    occasion: '与室内设计师联合提案、软装偏自然的项目',
    highlights: ['燕麦纸面', '分栏封面', '圆角卡片'],
  }),
  builtin('quick', '预算速览', 'budget', 'qixu', {
    description: '封面、系统、投资与交付 4 章，几页讲清预算',
    audience: '预算敏感、第一次咨询的业主',
    occasion: '首次沟通后当天出报价、比价阶段',
    highlights: ['4 章精简', '先讲预算', '约 5 页'],
  }),
  builtin('azure', '智域科技', 'story', 'azure', {
    description: '冷白纸面、深海蓝强调与细线卡片，先讲生活场景再落到预算',
    audience: '年轻业主、数码爱好者与偏好科技感的家庭',
    occasion: '首次方案沟通，用场景打动业主',
    highlights: ['场景先行', '深海蓝细线', '现代简约'],
  }),
  builtin('mono', '素白极简', 'full', 'mono', {
    description: '纯白纸面与黑色粗体，纯文字大字封面，克制高级',
    audience: '设计师工作室、极简风业主与商务客户',
    occasion: '与设计公司合作提案、需要打印装订的正式文本',
    highlights: ['纯文字封面', '黑白克制', '打印友好'],
  }),
  builtin('dawn', '晨曦暖调', 'story', 'dawn', {
    description: '奶油纸色与陶土橙、竖幅照片，以场景故事打动家庭用户',
    audience: '有老人和孩子的家庭、偏爱温馨风格的业主',
    occasion: '首次方案沟通、全家一起看方案',
    highlights: ['场景先行', '陶土暖色', '竖幅照片'],
  }),
  builtin('jade', '东方雅韵', 'full', 'jade', {
    description: '宣纸色与青瓷绿、衬线标题，适合新中式与东方风住宅',
    audience: '新中式、东方风别墅与高端住宅业主',
    occasion: '顶奢项目正式提案、需要文化调性的汇报',
    highlights: ['宣纸青瓷', '衬线标题', '东方意境'],
  }),
  builtin('terra', '赤陶中古', 'full', 'terra', {
    description: '羊皮纸底、赤陶棕与衬线标题，画廊式横幅照片呈现中古住宅的温厚质感',
    audience: '中古、复古与胡桃木风格住宅的业主',
    occasion: '设计深化汇报、软装与全屋智能联合提案',
    highlights: ['画廊式封面', '羊皮纸赤陶棕', '8 章完整'],
  }),
  builtin('linen', '海盐柔雅', 'full', 'linen', {
    description: '海盐蓝灰纸面、拱窗照片与柔和衬线，适合明亮从容的法式居家提案',
    audience: '法式、轻复古与浅色自然风住宅的家庭',
    occasion: '家庭方案沟通、与室内设计师联合汇报',
    highlights: ['拱窗照片封面', '海盐蓝灰', '8 章完整'],
  }),
  builtin('slate', '岩灰建筑', 'full', 'slate', {
    description: '冷灰纸面、石墨文字与直角线框，左图右文的建筑目录式封面',
    audience: '现代建筑、清水混凝土与工业风住宅的业主',
    occasion: '建筑师联合提案、需要清楚核对点位与预算的正式汇报',
    highlights: ['建筑目录封面', '石墨直角线框', '8 章完整'],
  }),
  builtin('construction', '施工交底', 'construction', 'qixu', {
    description: '点位代号、安装位置、房间配置与逐点核对表，不含任何价格',
    audience: '安装团队、水电工与项目经理',
    occasion: '进场施工前交底、现场安装与验收核对',
    highlights: ['不含价格', '点位代号', '逐点核对'],
  }),
]

/** 兼容旧代码与落地页：内置模板的名称清单 */
export const PROPOSAL_TEMPLATES = BUILTIN_PROPOSAL_TEMPLATES
export const DEFAULT_PROPOSAL_TEMPLATE = 'qixu'
export const CONSTRUCTION_TEMPLATE = 'construction'

/** 旧版模板编号兼容：旧链接和已保存的默认值继续可用 */
const LEGACY_PROPOSAL_TEMPLATES: Record<string, string> = { modern: 'qixu', premium: 'noir' }

/** 在模板清单里找模板（支持旧编号），找不到返回 null */
export function resolveProposalTemplate(v: unknown, list: ProposalTemplateDef[] = BUILTIN_PROPOSAL_TEMPLATES): ProposalTemplateDef | null {
  if (typeof v !== 'string' || !v) return null
  const key = LEGACY_PROPOSAL_TEMPLATES[v] ?? v
  return list.find((t) => t.value === key) ?? null
}

/** 业主方案在前、施工交底在后（选择器、模板库、知识库都按这个顺序） */
export const ownerTemplates = (list: ProposalTemplateDef[]) => list.filter((t) => t.kind === 'owner')
export const constructionTemplates = (list: ProposalTemplateDef[]) => list.filter((t) => t.kind === 'construction')

export type TemplateQuery = { audience?: string | null; occasion?: string | null; style?: string | null; budgetSensitive?: boolean | null }

/** 几乎每个模板都会出现的词，不参与打分 */
const STOP_WORDS = new Set(['业主', '客户', '方案', '适合', '项目', '家庭', '住宅', '模板', '一起', '需要'])

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[\s,，、/·;；。()（）]+/)
    .flatMap((w) => (w.length > 2 && /[\u4e00-\u9fff]/.test(w) ? Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2)) : [w]))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))

/**
 * 按客户画像推荐业主方案模板（AI 工具、模板库搜索共用）：
 * 把描述拆成词，与模板的适合客户、使用时机、外观特点和说明做匹配；预算敏感优先预算速览。
 */
export function recommendTemplates(list: ProposalTemplateDef[], q: TemplateQuery, limit = 3) {
  const owner = ownerTemplates(list)
  const queryWords = [...new Set(tokens([q.audience, q.occasion, q.style].filter(Boolean).join(' ')))]
  const scored = owner.map((t, index) => {
    const fields = [
      { text: t.audience, weight: 3, reason: `适合：${t.audience}` },
      { text: t.occasion, weight: 2, reason: `时机：${t.occasion}` },
      { text: t.highlights.join(' '), weight: 2, reason: `特点：${t.highlights.join('、')}` },
      { text: `${t.label} ${t.description}`, weight: 1, reason: t.description },
    ]
    let score = 0
    const reasons = new Set<string>()
    for (const w of queryWords) {
      for (const f of fields) {
        if (f.text.toLowerCase().includes(w)) {
          score += f.weight
          reasons.add(f.reason)
        }
      }
    }
    if (q.budgetSensitive && t.framework === 'budget') {
      score += 6
      reasons.add('预算敏感：先讲预算的精简版式')
    }
    return { template: t, score, reasons: [...reasons].slice(0, 3), index }
  })
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit)
}
