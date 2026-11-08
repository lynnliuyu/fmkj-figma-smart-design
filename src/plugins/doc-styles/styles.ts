import type { DocStyle } from '@/documents/types'
import { SANS } from '@/documents/minimal'

const NOTO_FALLBACK = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
const SERIF = "'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace"

/** 栖序雅致：来自 Figma 设计稿——暖白纸色、灰紫强调、细体大编号、深灰表头。 */
export const QIXU_STYLE: DocStyle = {
  id: 'qixu',
  name: '栖序雅致',
  description: '暖白纸色、灰紫强调、细体大编号，适合提案和高端住宅',
  colors: {
    paper: '#f8f7f4',
    ink: '#252523',
    muted: '#6b6b65',
    accent: '#6764a0',
    soft: '#e7dff4',
    softTo: '#d9e7f2',
    rule: '#dad8d1',
    headBg: '#333338',
    headFg: '#ffffff',
    stripe: '#efeee9',
  },
  fonts: {
    display: `'Noto Sans SC:Bold', ${NOTO_FALLBACK}`,
    strong: `'Noto Sans SC:Medium', ${NOTO_FALLBACK}`,
    body: `'Noto Sans SC:Regular', ${NOTO_FALLBACK}`,
    numeral: `'Inter:Light', ${SANS}`,
    latin: `'Inter:Regular', ${SANS}`,
  },
  weights: { display: 700, strong: 500, numeral: 300 },
  header: 'editorial',
  title: 'numbered',
  table: 'dark',
  radius: '0px',
  tagline: 'RESIDENTIAL INTELLIGENCE',
}

/** 商务蓝：深蓝页眉色带、深色表头，正式稳重。 */
export const BUSINESS_STYLE: DocStyle = {
  id: 'business',
  name: '商务蓝',
  description: '深蓝页眉色带、深色表头，正式稳重，适合企业客户',
  colors: {
    paper: '#ffffff',
    ink: '#0f172a',
    muted: '#5b6678',
    accent: '#1e40af',
    soft: '#eef4ff',
    softTo: '#e0ebff',
    rule: '#cfd8e3',
    headBg: '#1e3a8a',
    headFg: '#ffffff',
    stripe: '#f6f8fb',
  },
  fonts: { display: SANS, strong: SANS, body: SANS, numeral: SANS, latin: SANS },
  weights: { display: 700, strong: 600, numeral: 600 },
  header: 'band',
  title: 'underline',
  table: 'dark',
  radius: '4px',
}

/** 东方雅韵：米色纸、朱红点缀、衬线标题。 */
export const ORIENTAL_STYLE: DocStyle = {
  id: 'oriental',
  name: '东方雅韵',
  description: '米色纸、朱红点缀、衬线标题，适合中式和新中式住宅',
  colors: {
    paper: '#fbf8f2',
    ink: '#2a2420',
    muted: '#766b5f',
    accent: '#9b2c2c',
    soft: '#f3e9dc',
    softTo: '#efe2cf',
    rule: '#e2d6c4',
    headBg: '#f1e6d6',
    headFg: '#2a2420',
    stripe: '#f7f1e7',
  },
  fonts: { display: SERIF, strong: SERIF, body: SANS, numeral: SERIF, latin: SERIF },
  weights: { display: 700, strong: 600, numeral: 400 },
  header: 'line',
  title: 'underline',
  table: 'ruled',
  radius: '2px',
}

/** 科技：冷白底、天蓝强调、等宽数字、网格表格。 */
export const TECH_STYLE: DocStyle = {
  id: 'tech',
  name: '科技',
  description: '冷白底、天蓝强调、等宽数字和网格表格，适合年轻客户和极客',
  colors: {
    paper: '#ffffff',
    ink: '#0b1220',
    muted: '#566074',
    accent: '#0369a1',
    soft: '#e6f4fd',
    softTo: '#eafcff',
    rule: '#d6deea',
    headBg: '#e9f1fa',
    headFg: '#0b1220',
    stripe: '#f5f8fc',
  },
  fonts: { display: SANS, strong: SANS, body: SANS, numeral: MONO, latin: MONO },
  weights: { display: 700, strong: 600, numeral: 500 },
  header: 'line',
  title: 'numbered',
  table: 'grid',
  radius: '8px',
}

/** 墨金臻选：象牙白纸、墨黑表头配香槟金、衬线标题（与方案模板「墨金臻选」配套，纸面版适合打印）。 */
export const NOIR_STYLE: DocStyle = {
  id: 'noir',
  name: '墨金臻选',
  description: '象牙白纸、墨黑表头配香槟金、衬线标题，适合别墅大宅与高端客户',
  colors: {
    paper: '#fffdf8',
    ink: '#1c1b19',
    muted: '#736e60',
    accent: '#9c7a3c',
    soft: '#f4ecdc',
    softTo: '#efe4cd',
    rule: '#e3dac8',
    headBg: '#1c1b19',
    headFg: '#e8d5a8',
    stripe: '#faf5ea',
  },
  fonts: {
    display: SERIF,
    strong: `'Noto Sans SC:Medium', ${NOTO_FALLBACK}`,
    body: `'Noto Sans SC:Regular', ${NOTO_FALLBACK}`,
    numeral: SERIF,
    latin: `'Inter:Regular', ${SANS}`,
  },
  weights: { display: 700, strong: 500, numeral: 400 },
  header: 'editorial',
  title: 'underline',
  table: 'dark',
  radius: '0px',
  tagline: 'PRIVATE RESIDENCE',
}

/** 原木自然：燕麦纸色、橄榄绿点缀、衬线标题、圆角卡片（与方案模板「原木自然」配套）。 */
export const GROVE_STYLE: DocStyle = {
  id: 'grove',
  name: '原木自然',
  description: '燕麦纸色、橄榄绿点缀、衬线标题与圆角卡片，适合原木、日式与自然风住宅',
  colors: {
    paper: '#f6f2ea',
    ink: '#2e2b25',
    muted: '#6d675b',
    accent: '#5e6e4f',
    soft: '#e6eadb',
    softTo: '#f0e9da',
    rule: '#ddd4c3',
    headBg: '#e3e8d7',
    headFg: '#3d4a33',
    stripe: '#efe9dd',
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
  title: 'numbered',
  table: 'ruled',
  radius: '10px',
  tagline: 'NATURAL LIVING',
}

export const PLUGIN_DOC_STYLES = [
  QIXU_STYLE,
  NOIR_STYLE,
  GROVE_STYLE,
  BUSINESS_STYLE,
  ORIENTAL_STYLE,
  TECH_STYLE,
]
