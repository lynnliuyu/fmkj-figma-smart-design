import type { OxfmtConfig } from 'oxfmt'

export default {
  // miniprogram（小程序，独立运行时）与 desktop（Electron）不在 CI 覆盖范围内，
  // 本地也无法验证，故不纳入格式化，避免对未验证代码做大规模改动。
  // 生成文件不纳入格式化：
  //   payload-types.ts                     — Payload 生成
  //   src/app/(payload)/**                 — Payload 生成（AGENTS.md 明确不要改）
  //   miniprogram/**                       — 小程序，独立运行时、不在 CI 覆盖
  //   desktop/**                           — Electron，同上
  ignorePatterns: [
    '**/payload-types.ts',
    // 上游自托管资源（CAD worker / 字体清单 / 样例模板）：按上游原样提交，不改写
    'public/workers/**',
    'public/cad-data/**',
    'tsconfig.json',
    'src/app/(payload)/**',
    'miniprogram/**',
    'desktop/**',
  ],
  printWidth: 100,
  semi: false,
  singleQuote: true,
  sortPackageJson: false,
  trailingComma: 'all',
} satisfies OxfmtConfig
