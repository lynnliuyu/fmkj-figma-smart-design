import type { OxfmtConfig } from 'oxfmt'

export default {
  // miniprogram（小程序，独立运行时）与 desktop（Electron）不在 CI 覆盖范围内，
  // 本地也无法验证，故不纳入格式化，避免对未验证代码做大规模改动。
  ignorePatterns: ['**/payload-types.ts', 'tsconfig.json', 'miniprogram/**', 'desktop/**'],
  printWidth: 100,
  semi: false,
  singleQuote: true,
  sortPackageJson: false,
  trailingComma: 'all',
} satisfies OxfmtConfig
