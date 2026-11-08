/**
 * 方案视觉主题（模板框架的「外观」部分；内容结构由 ../framework.ts 的章节组合决定）。
 * 每个主题 = 颜色字体（DocStyle，驱动 bg-doc-* / doc-display 等工具类）
 * + 方案专用变量（--deck-*：说明卡、平面卡、编号圆点、照片标注、圆角）
 * + 版式变体（封面、章节标题、表格）+ 少量外观开关（深浅、数字字体、品牌标记、圆角）。
 *
 * - qixu 栖序雅致：Figma 设计稿原样（暖白纸、灰紫、Inter 细体大编号、深灰表头、照片色带封面）；
 * - noir 墨金臻选：深色画面、香槟金、衬线标题、整幅照片封面、金线表头，适合屏幕演示；
 * - grove 原木自然：燕麦纸、橄榄绿、衬线标题、左右分栏封面、圆角照片与卡片；
 * - azure 晨岚现代（「智域科技」模板使用）：冷白纸面、深海蓝强调、细线卡片、照片色带封面；
 * - terra 赤陶中古：羊皮纸色、赤陶棕、画廊式横幅照片与衬线标题；
 * - mono 素白极简：纯白纸面、墨黑文字、纯文字封面，不用照片也有质感；
 * - dawn 晨曦暖调：奶油纸色、陶土橙、圆角卡片与竖幅照片，温暖亲和；
 * - jade 东方雅韵：宣纸色、青瓷绿、衬线标题与茶室照片，适合新中式与东方风住宅；
 * - linen 海盐柔雅：海盐蓝灰、拱窗照片、柔和衬线与居家留白；
 * - slate 岩灰建筑：冷灰纸色、直角线框、左图右文的建筑目录封面。
 * 封面照片来自 public/proposal/photos；主题同时改变纸面、字体与构图，缩略图由真实封面渲染。
 */
import type { CSSProperties } from 'react'

import type { DocStyle } from '@/documents/types'
import { GROVE_STYLE, QIXU_STYLE } from '@/plugins/doc-styles/styles'

const NOTO_FALLBACK = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
const SERIF = "'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif"

const SANS = "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif"

const AZURE_STYLE: DocStyle = {
  id: 'azure',
  name: '晨岚现代',
  description: '冷白纸色、深海蓝强调',
  colors: {
    paper: '#f8fafc',
    ink: '#1b2230',
    muted: '#64708a',
    accent: '#24508f',
    soft: '#e6edf6',
    softTo: '#f1f5fa',
    rule: '#dbe3ee',
    headBg: '#1d2b44',
    headFg: '#ffffff',
    stripe: '#f1f5fa',
  },
  fonts: {
    display: `'Noto Sans SC:Medium', ${NOTO_FALLBACK}`,
    strong: `'Noto Sans SC:Medium', ${NOTO_FALLBACK}`,
    body: `'Noto Sans SC:Regular', ${NOTO_FALLBACK}`,
    numeral: `'Inter:Regular', ${SANS}`,
    latin: `'Inter:Regular', ${SANS}`,
  },
  weights: { display: 500, strong: 500, numeral: 300 },
  header: 'line',
  title: 'numbered',
  table: 'dark',
  radius: '6px',
  tagline: 'MODERN LIVING',
}

const TERRA_STYLE: DocStyle = {
  id: 'terra',
  name: '赤陶中古',
  description: '羊皮纸色、赤陶棕与温厚衬线',
  colors: {
    paper: '#f5eee4',
    ink: '#3e2d25',
    muted: '#766257',
    accent: '#994b32',
    soft: '#ead9c9',
    softTo: '#f3e8dc',
    rule: '#d6c3b2',
    headBg: '#583d30',
    headFg: '#fff7eb',
    stripe: '#eee3d5',
  },
  fonts: {
    display: SERIF,
    strong: `'Noto Sans SC:Medium', ${NOTO_FALLBACK}`,
    body: `'Noto Sans SC:Regular', ${NOTO_FALLBACK}`,
    numeral: SERIF,
    latin: `'Inter:Regular', ${SANS}`,
  },
  weights: { display: 600, strong: 500, numeral: 400 },
  header: 'line',
  title: 'underline',
  table: 'ruled',
  radius: '0px',
  tagline: 'TIMELESS LIVING',
}

const LINEN_STYLE: DocStyle = {
  ...TERRA_STYLE,
  id: 'linen',
  name: '海盐柔雅',
  description: '海盐蓝灰、柔和衬线与浅色留白',
  colors: {
    paper: '#f3f7f6',
    ink: '#293f45',
    muted: '#5c747a',
    accent: '#526f78',
    soft: '#e0e9e8',
    softTo: '#edf2ef',
    rule: '#cbd8d7',
    headBg: '#dfe9e9',
    headFg: '#29464f',
    stripe: '#eaf0ee',
  },
  radius: '16px',
  tagline: 'QUIET EVERYDAY',
}

const SLATE_STYLE: DocStyle = {
  ...AZURE_STYLE,
  id: 'slate',
  name: '岩灰建筑',
  description: '冷灰纸色、石墨文字与建筑线框',
  colors: {
    paper: '#eff0ed',
    ink: '#252c30',
    muted: '#626e73',
    accent: '#46545b',
    soft: '#dde2df',
    softTo: '#e8ebe7',
    rule: '#bec7c4',
    headBg: '#303b40',
    headFg: '#f4f5ef',
    stripe: '#e5e9e5',
  },
  fonts: { ...AZURE_STYLE.fonts, numeral: `'Inter:Bold', ${SANS}` },
  weights: { display: 500, strong: 500, numeral: 700 },
  radius: '0px',
  tagline: 'SPACES IN ORDER',
}

/** 新主题的卡片、图纸和标签沿用同一纸面色系，保留设备本身的类别色。 */
function paperVars(style: DocStyle): Record<string, string> {
  const c = style.colors
  return {
    '--deck-panel': c.soft,
    '--deck-panel-border': c.rule,
    '--deck-card': c.paper,
    '--deck-card-border': c.rule,
    '--deck-diagram': c.paper,
    '--deck-muted-panel': c.stripe,
    '--deck-box': c.stripe,
    '--deck-marker': c.accent,
    '--deck-marker-ring': c.paper,
    '--deck-marker-fg': '#ffffff',
    '--deck-plan-code': c.accent,
    '--deck-chip': c.paper,
    '--deck-chip-fg': c.accent,
    '--deck-chip-ink': c.ink,
    '--deck-badge': c.soft,
    '--deck-service-row': c.soft,
    '--deck-radius': style.radius,
    '--deck-radius-sm': style.radius === '0px' ? '0px' : '10px',
  }
}

const MONO_STYLE: DocStyle = {
  id: 'mono',
  name: '素白极简',
  description: '纯白画面、黑色粗体',
  colors: {
    paper: '#ffffff',
    ink: '#111111',
    muted: '#6b6b6b',
    accent: '#111111',
    soft: '#f2f2f2',
    softTo: '#fafafa',
    rule: '#e3e3e3',
    headBg: '#111111',
    headFg: '#ffffff',
    stripe: '#f7f7f7',
  },
  fonts: {
    display: `'Noto Sans SC:Bold', ${NOTO_FALLBACK}`,
    strong: `'Noto Sans SC:Medium', ${NOTO_FALLBACK}`,
    body: `'Noto Sans SC:Regular', ${NOTO_FALLBACK}`,
    numeral: `'Inter:Bold', ${SANS}`,
    latin: `'Inter:Regular', ${SANS}`,
  },
  weights: { display: 700, strong: 500, numeral: 700 },
  header: 'line',
  title: 'numbered',
  table: 'dark',
  radius: '0px',
  tagline: 'ESSENTIAL',
}

/** 墨金臻选的深色画面（方案专用；报价单、合同用的是纸面版 NOIR_STYLE） */
const NOIR_DECK_STYLE: DocStyle = {
  id: 'noir-deck',
  name: '墨金臻选',
  description: '深色画面、香槟金、衬线标题',
  colors: {
    paper: '#141416',
    ink: '#f1ebdf',
    muted: '#9b9588',
    accent: '#c9a86a',
    soft: '#2a2621',
    softTo: '#1c1b19',
    rule: '#34322d',
    headBg: '#1c1b19',
    headFg: '#c9a86a',
    stripe: '#18181a',
  },
  fonts: {
    display: SERIF,
    strong: `'Noto Sans SC:Medium', ${NOTO_FALLBACK}`,
    body: `'Noto Sans SC:Regular', ${NOTO_FALLBACK}`,
    numeral: SERIF,
    latin: `'Inter:Regular', ${NOTO_FALLBACK}`,
  },
  weights: { display: 700, strong: 500, numeral: 400 },
  header: 'editorial',
  title: 'underline',
  table: 'dark',
  radius: '0px',
  tagline: 'PRIVATE RESIDENCE',
}

/** 方案视觉主题；后台「方案模板」可进一步换强调色、封面图和标语。 */
export type DeckThemeId =
  | 'qixu'
  | 'noir'
  | 'grove'
  | 'azure'
  | 'terra'
  | 'mono'
  | 'dawn'
  | 'jade'
  | 'linen'
  | 'slate'

export type DeckTheme = {
  id: DeckThemeId
  /** 框架名称与说明（模板选择器里显示） */
  label: string
  description: string
  style: DocStyle
  /** 方案专用颜色与圆角 */
  vars: Record<string, string>
  /** 封面：照片色带 / 整幅照片 / 左文右图 / 纯文字 / 画廊 / 拱窗 / 建筑目录 */
  cover: 'band' | 'immersive' | 'split' | 'type' | 'gallery' | 'arch' | 'architectural'
  chapter: 'numeral' | 'eyebrow' | 'badge'
  table: 'dark' | 'gold' | 'soft'
  /** 深色画面（底图和点位标注需要调亮） */
  mood: 'light' | 'dark'
  /** 金额数字字体：latin = Inter，numeral = 风格的数字字体（多为衬线） */
  amount: 'latin' | 'numeral'
  /** 金额是否用强调色 */
  accentAmount: boolean
  /** 没有 Logo 时的品牌标记：渐变方块 / 描边方块 */
  brandMark: 'gradient' | 'outline'
  /** 圆角风格（圆点、圆角色块） */
  rounded: boolean
  /** 页眉英文副标是否加字距 */
  trackedTagline: boolean
  headline: string
  /** 页眉右侧英文（品牌英文名之后） */
  tagline: string
  coverTagline: string
  coverPhoto: string
  /** 照片上的说明标签 */
  photoNote: string
}

export const DECK_THEMES: Record<DeckThemeId, DeckTheme> = {
  qixu: {
    id: 'qixu',
    label: '栖序雅致',
    description: '暖白纸色、灰紫强调、细体大编号',
    style: QIXU_STYLE,
    vars: {
      '--deck-panel': '#ecebf6',
      '--deck-panel-border': 'transparent',
      '--deck-card': '#ffffff',
      '--deck-card-border': 'transparent',
      '--deck-diagram': '#ffffff',
      '--deck-muted-panel': '#efeee9',
      '--deck-box': '#efeee9',
      '--deck-marker': '#7773b8',
      '--deck-marker-ring': '#ffffff',
      '--deck-marker-fg': '#ffffff',
      '--deck-plan-code': '#6c68b0',
      '--deck-chip': '#ffffff',
      '--deck-chip-fg': '#6764a0',
      '--deck-chip-ink': '#252523',
      '--deck-badge': '#ecebf6',
      '--deck-service-row': '#ecebf6',
      '--deck-radius': '0px',
      '--deck-radius-sm': '0px',
    },
    cover: 'band',
    chapter: 'numeral',
    table: 'dark',
    mood: 'light',
    amount: 'latin',
    accentAmount: false,
    brandMark: 'gradient',
    rounded: false,
    trackedTagline: false,
    headline: '让家，懂你的生活。',
    tagline: 'RESIDENTIAL INTELLIGENCE',
    coverTagline: 'A HOME THAT UNDERSTANDS YOU',
    coverPhoto: '/proposal/photos/cover-qixu.jpg',
    photoNote: '氛围意向图 · 生活场景示意，非项目实景',
  },
  noir: {
    id: 'noir',
    label: '墨金臻选',
    description: '深色画面、香槟金与衬线标题',
    style: NOIR_DECK_STYLE,
    vars: {
      '--deck-panel': '#1c1b19',
      '--deck-panel-border': 'rgba(201, 168, 106, 0.45)',
      '--deck-card': '#f3efe6',
      '--deck-card-border': 'transparent',
      '--deck-diagram': '#19191b',
      '--deck-muted-panel': '#1c1b19',
      '--deck-box': '#232220',
      '--deck-marker': '#c9a86a',
      '--deck-marker-ring': '#141416',
      '--deck-marker-fg': '#141416',
      '--deck-plan-code': '#7a5c22',
      '--deck-chip': '#141416',
      '--deck-chip-fg': '#c9a86a',
      '--deck-chip-ink': '#f1ebdf',
      '--deck-badge': '#262420',
      '--deck-service-row': '#1f1d1a',
      '--deck-radius': '0px',
      '--deck-radius-sm': '0px',
    },
    cover: 'immersive',
    chapter: 'eyebrow',
    table: 'gold',
    mood: 'dark',
    amount: 'numeral',
    accentAmount: true,
    brandMark: 'outline',
    rounded: false,
    trackedTagline: true,
    headline: '静享不凡，智在无声。',
    tagline: 'PRIVATE RESIDENCE',
    coverTagline: 'PRIVATE RESIDENCE · SMART LIVING',
    coverPhoto: '/proposal/photos/cover-noir.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  grove: {
    id: 'grove',
    label: '原木自然',
    description: '燕麦纸色、橄榄绿、圆角照片',
    style: GROVE_STYLE,
    vars: {
      '--deck-panel': '#e6eadb',
      '--deck-panel-border': 'transparent',
      '--deck-card': '#fffdf8',
      '--deck-card-border': '#ddd4c3',
      '--deck-diagram': '#fffdf8',
      '--deck-muted-panel': '#ece6d9',
      '--deck-box': '#f3eee4',
      '--deck-marker': '#5e6e4f',
      '--deck-marker-ring': '#ffffff',
      '--deck-marker-fg': '#ffffff',
      '--deck-plan-code': '#4b5a3e',
      '--deck-chip': '#fffdf8',
      '--deck-chip-fg': '#5e6e4f',
      '--deck-chip-ink': '#2e2b25',
      '--deck-badge': '#e6eadb',
      '--deck-service-row': '#eef1e6',
      '--deck-radius': '18px',
      '--deck-radius-sm': '12px',
    },
    cover: 'split',
    chapter: 'badge',
    table: 'soft',
    mood: 'light',
    amount: 'numeral',
    accentAmount: false,
    brandMark: 'gradient',
    rounded: true,
    trackedTagline: true,
    headline: '让家，回到自然的节奏。',
    tagline: 'NATURAL LIVING',
    coverTagline: 'LIVING WITH NATURE',
    coverPhoto: '/proposal/photos/cover-grove.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  azure: {
    id: 'azure',
    label: '晨岚现代',
    description: '冷白纸色、深海蓝强调、细线卡片，适合现代简约住宅',
    style: AZURE_STYLE,
    vars: {
      '--deck-panel': '#e6edf6',
      '--deck-panel-border': 'transparent',
      '--deck-card': '#ffffff',
      '--deck-card-border': '#dbe3ee',
      '--deck-diagram': '#ffffff',
      '--deck-muted-panel': '#eef2f7',
      '--deck-box': '#eef2f7',
      '--deck-marker': '#24508f',
      '--deck-marker-ring': '#ffffff',
      '--deck-marker-fg': '#ffffff',
      '--deck-plan-code': '#1d4072',
      '--deck-chip': '#ffffff',
      '--deck-chip-fg': '#24508f',
      '--deck-chip-ink': '#1b2230',
      '--deck-badge': '#e6edf6',
      '--deck-service-row': '#e9eff7',
      '--deck-radius': '6px',
      '--deck-radius-sm': '4px',
    },
    cover: 'band',
    chapter: 'eyebrow',
    table: 'dark',
    mood: 'light',
    amount: 'latin',
    accentAmount: false,
    brandMark: 'gradient',
    rounded: false,
    trackedTagline: true,
    headline: '清爽有序，一切刚刚好。',
    tagline: 'MODERN LIVING',
    coverTagline: 'CLEAR · CALM · CONNECTED',
    coverPhoto: '/proposal/photos/cover-azure.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  terra: {
    id: 'terra',
    label: '赤陶中古',
    description: '羊皮纸色、赤陶棕、画廊式横幅照片，适合中古与复古住宅',
    style: TERRA_STYLE,
    vars: paperVars(TERRA_STYLE),
    cover: 'gallery',
    chapter: 'eyebrow',
    table: 'soft',
    mood: 'light',
    amount: 'numeral',
    accentAmount: true,
    brandMark: 'outline',
    rounded: false,
    trackedTagline: true,
    headline: '把时光的温度，留在家里。',
    tagline: 'TIMELESS LIVING',
    coverTagline: 'A HOME WITH CHARACTER',
    coverPhoto: '/proposal/photos/dining.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  mono: {
    id: 'mono',
    label: '素白极简',
    description: '纯白画面、黑色粗体编号与细线，信息清晰克制，适合商务汇报',
    style: MONO_STYLE,
    vars: {
      '--deck-panel': '#f2f2f2',
      '--deck-panel-border': 'transparent',
      '--deck-card': '#ffffff',
      '--deck-card-border': '#e3e3e3',
      '--deck-diagram': '#ffffff',
      '--deck-muted-panel': '#f4f4f4',
      '--deck-box': '#f4f4f4',
      '--deck-marker': '#111111',
      '--deck-marker-ring': '#ffffff',
      '--deck-marker-fg': '#ffffff',
      '--deck-plan-code': '#111111',
      '--deck-chip': '#111111',
      '--deck-chip-fg': '#ffffff',
      '--deck-chip-ink': '#ffffff',
      '--deck-badge': '#f2f2f2',
      '--deck-service-row': '#f5f5f5',
      '--deck-radius': '0px',
      '--deck-radius-sm': '0px',
    },
    cover: 'type',
    chapter: 'badge',
    table: 'dark',
    mood: 'light',
    amount: 'latin',
    accentAmount: false,
    brandMark: 'outline',
    rounded: false,
    trackedTagline: true,
    headline: '少即是多，智能本应安静。',
    tagline: 'ESSENTIAL',
    coverTagline: 'LESS BUT BETTER',
    coverPhoto: '/proposal/photos/study.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  dawn: {
    id: 'dawn',
    label: '晨曦暖调',
    description: '奶油纸色与陶土橙、竖幅照片，以场景故事打动家庭用户',
    style: { ...TERRA_STYLE, id: 'dawn', name: '晨曦暖调' },
    vars: {
      '--deck-panel': '#f4e3d7',
      '--deck-panel-border': 'transparent',
      '--deck-card': '#fffaf5',
      '--deck-card-border': '#ead8c8',
      '--deck-diagram': '#fffaf5',
      '--deck-muted-panel': '#f1e6db',
      '--deck-box': '#f6ece2',
      '--deck-marker': '#b5603a',
      '--deck-marker-ring': '#ffffff',
      '--deck-marker-fg': '#ffffff',
      '--deck-plan-code': '#8f4a2b',
      '--deck-chip': '#fffaf5',
      '--deck-chip-fg': '#b5603a',
      '--deck-chip-ink': '#3a2a22',
      '--deck-badge': '#f4e3d7',
      '--deck-service-row': '#f7eae0',
      '--deck-radius': '14px',
      '--deck-radius-sm': '10px',
    },
    cover: 'split',
    chapter: 'numeral',
    table: 'soft',
    mood: 'light',
    amount: 'numeral',
    accentAmount: true,
    brandMark: 'gradient',
    rounded: true,
    trackedTagline: true,
    headline: '每一个清晨，都被温柔唤醒。',
    tagline: 'WARM HOME',
    coverTagline: 'GOOD MORNING, HOME',
    coverPhoto: '/proposal/photos/cover-dawn.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  jade: {
    id: 'jade',
    label: '东方雅韵',
    description: '宣纸色与青瓷绿、衬线标题，适合新中式与东方风住宅',
    style: {
      ...GROVE_STYLE,
      id: 'jade',
      name: '东方雅韵',
      colors: {
        ...GROVE_STYLE.colors,
        paper: '#f7f4ec',
        accent: '#3f7f78',
        soft: '#dfece9',
        headBg: '#dde9e6',
        headFg: '#2c5a55',
      },
    },
    vars: {
      '--deck-panel': '#dfece9',
      '--deck-panel-border': 'transparent',
      '--deck-card': '#fffdf8',
      '--deck-card-border': '#ddd4c3',
      '--deck-diagram': '#fffdf8',
      '--deck-muted-panel': '#ece6d9',
      '--deck-box': '#f3eee4',
      '--deck-marker': '#3f7f78',
      '--deck-marker-ring': '#ffffff',
      '--deck-marker-fg': '#ffffff',
      '--deck-plan-code': '#2f625d',
      '--deck-chip': '#fffdf8',
      '--deck-chip-fg': '#3f7f78',
      '--deck-chip-ink': '#2e2b25',
      '--deck-badge': '#dfece9',
      '--deck-service-row': '#e8f1ef',
      '--deck-radius': '18px',
      '--deck-radius-sm': '12px',
    },
    cover: 'split',
    chapter: 'badge',
    table: 'soft',
    mood: 'light',
    amount: 'numeral',
    accentAmount: false,
    brandMark: 'gradient',
    rounded: true,
    trackedTagline: true,
    headline: '雅致如瓷，静享东方。',
    tagline: 'ORIENTAL LIVING',
    coverTagline: 'ORIENTAL SERENITY',
    coverPhoto: '/proposal/photos/cover-jade.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  linen: {
    id: 'linen',
    label: '海盐柔雅',
    description: '海盐蓝灰、拱窗照片与柔和衬线，适合法式与浅色住宅',
    style: LINEN_STYLE,
    vars: paperVars(LINEN_STYLE),
    cover: 'arch',
    chapter: 'badge',
    table: 'soft',
    mood: 'light',
    amount: 'numeral',
    accentAmount: false,
    brandMark: 'outline',
    rounded: true,
    trackedTagline: true,
    headline: '让日常，轻柔而从容。',
    tagline: 'QUIET EVERYDAY',
    coverTagline: 'LIGHT, SPACE AND EVERYDAY LIFE',
    coverPhoto: '/proposal/photos/cover-qixu.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
  slate: {
    id: 'slate',
    label: '岩灰建筑',
    description: '冷灰纸色、直角线框与建筑目录封面，适合现代建筑住宅',
    style: SLATE_STYLE,
    vars: paperVars(SLATE_STYLE),
    cover: 'architectural',
    chapter: 'eyebrow',
    table: 'dark',
    mood: 'light',
    amount: 'latin',
    accentAmount: false,
    brandMark: 'outline',
    rounded: false,
    trackedTagline: false,
    headline: '空间有序，生活自如。',
    tagline: 'SPACES IN ORDER',
    coverTagline: 'RESIDENTIAL DESIGN STUDY',
    coverPhoto: '/proposal/photos/study.jpg',
    photoNote: '氛围意向图 · 非项目实景',
  },
}

export const isDeckTheme = (v: unknown): v is DeckThemeId =>
  typeof v === 'string' && Object.hasOwn(DECK_THEMES, v)
export const DECK_THEME_LIST = Object.values(DECK_THEMES)

const HEX = /^#[0-9a-f]{6}$/i
const mixHex = (a: string, b: string, t: number) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        parseInt(a.slice(i, i + 2), 16) +
          (parseInt(b.slice(i, i + 2), 16) - parseInt(a.slice(i, i + 2), 16)) * t,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

/** 后台方案模板对框架的覆盖项 */
export type DeckOverrides = {
  accent?: string | null
  coverPhoto?: string | null
  headline?: string | null
  coverTagline?: string | null
}

/** 在框架之上应用模板覆盖：强调色同步到编号圆点、标签、浅色面板 */
export function customizeTheme(theme: DeckTheme, o: DeckOverrides): DeckTheme {
  const accent = o.accent && HEX.test(o.accent) ? o.accent : null
  const dark = theme.mood === 'dark'
  return {
    ...theme,
    style: accent
      ? {
          ...theme.style,
          colors: { ...theme.style.colors, accent, ...(dark ? { headFg: accent } : {}) },
        }
      : theme.style,
    vars: accent
      ? {
          ...theme.vars,
          '--deck-marker': accent,
          '--deck-plan-code': mixHex(accent, '#000000', 0.2),
          '--deck-chip-fg': accent,
          ...(dark
            ? {}
            : {
                '--deck-panel': mixHex(accent, '#ffffff', 0.85),
                '--deck-badge': mixHex(accent, '#ffffff', 0.85),
                '--deck-service-row': mixHex(accent, '#ffffff', 0.88),
              }),
        }
      : theme.vars,
    headline: o.headline?.trim() || theme.headline,
    coverTagline: o.coverTagline?.trim() || theme.coverTagline,
    coverPhoto: o.coverPhoto || theme.coverPhoto,
  }
}

export const deckVars = (theme: DeckTheme) => theme.vars as CSSProperties
