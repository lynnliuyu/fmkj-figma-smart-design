import type { DocStyle } from './types'

export const SANS =
  "var(--font-sans), 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"

/** 核心自带的风格：白底细线、黑白为主。其他风格由「文档风格包」插件提供。 */
export const MINIMAL_STYLE: DocStyle = {
  id: 'minimal',
  name: '简约',
  description: '白底细线，黑白为主，适合大多数场景',
  colors: {
    paper: '#ffffff',
    ink: '#171717',
    muted: '#6b6b6b',
    accent: '#171717',
    soft: '#f4f4f4',
    softTo: '#f4f4f4',
    rule: '#e2e2e2',
    headBg: '#f7f7f7',
    headFg: '#171717',
    stripe: '#fafafa',
  },
  fonts: { display: SANS, strong: SANS, body: SANS, numeral: SANS, latin: SANS },
  weights: { display: 600, strong: 500, numeral: 300 },
  header: 'line',
  title: 'plain',
  table: 'ruled',
  radius: '6px',
}
