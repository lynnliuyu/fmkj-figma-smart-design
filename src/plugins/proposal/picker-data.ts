/**
 * 方案模板选择器、模板库、插件页共用的展示数据（纯数据，服务端组装后传给客户端组件）。
 * 每个模板回答：长什么样（缩略图 / 色板 / 封面版式）、适合谁、什么时候用、有哪些章节。
 */
import { DECK_THEMES, isDeckTheme } from './deck/themes'
import { DECK_SECTIONS, frameworkLabel, type DeckSection, type ProposalFrameworkId, type ProposalKind } from './framework'
import type { ProposalTemplateDef } from './templates'

export type PickerTemplate = {
  value: string
  label: string
  description: string
  kind: ProposalKind
  audience: string
  occasion: string
  highlights: string[]
  framework: ProposalFrameworkId
  frameworkLabel: string
  sections: { value: DeckSection; label: string; pages: string }[]
  /** 页数（按示例项目或当前项目计算）；null = 无法计算 */
  pages: number | null
  priceShown: boolean
  coverStyle: string
  mood: '浅色画面' | '深色画面'
  /** 纸色、主色、强调色、浅色面板 */
  swatches: string[]
}

export const COVER_STYLE_LABEL: Record<string, string> = {
  band: '照片色带封面',
  immersive: '整幅照片封面',
  split: '左文右图封面',
  type: '纯文字大字封面',
}

const HEX = /^#[0-9a-f]{6}$/i

export function toPickerTemplate(t: ProposalTemplateDef, opts: { pages?: number | null } = {}): PickerTemplate {
  const theme = DECK_THEMES[isDeckTheme(t.theme) ? t.theme : 'qixu']
  const construction = t.kind === 'construction'
  const c = theme.style.colors
  const sections = t.sections.map((s) => {
    const spec = DECK_SECTIONS.find((x) => x.value === s)!
    return { value: s, label: spec.label, pages: spec.pages }
  })
  return {
    value: t.value,
    label: t.label,
    description: t.description,
    kind: t.kind,
    audience: t.audience,
    occasion: t.occasion,
    highlights: t.highlights,
    framework: t.framework,
    frameworkLabel: frameworkLabel(t.framework),
    sections,
    pages: opts.pages ?? null,
    priceShown: !construction && t.sections.some((s) => DECK_SECTIONS.find((x) => x.value === s)?.price),
    coverStyle: construction ? '项目信息封面' : (COVER_STYLE_LABEL[theme.cover] ?? '照片封面'),
    mood: !construction && theme.mood === 'dark' ? '深色画面' : '浅色画面',
    swatches: construction ? ['#ffffff', '#171717', '#737373', '#f5f5f5'] : [c.paper, c.ink, t.accent && HEX.test(t.accent) ? t.accent : c.accent, c.soft],
  }
}
