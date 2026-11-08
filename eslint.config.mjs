import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * ESLint 配置：只开「能抓到真 bug」的规则，不做风格检查。
 *
 * 风格交给 oxfmt（格式化），语义 bug 交给 ESLint，两者不重叠。
 * 刻意保持规则集精简——规则一多就会产生大量噪音，最后没人看。
 *
 * 当前只启用 React Hooks 相关规则：全仓 67 个 useEffect，
 * 依赖数组写错会导致闭包捕获旧值、无限渲染，这类 bug 靠人眼很难发现。
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'build/**',
      'miniprogram/**', // 小程序独立运行时，不在 CI 覆盖范围
      'desktop/**', // Electron 独立运行时，同上
      'src/app/(payload)/**', // Payload 生成文件，不要改
      'src/payload-types.ts', // Payload 生成
      'src/themes/**', // Astryx theme build 产物
      'scripts/**', // 一次性脚本，不进产品代码质量门禁
      '**/*.test.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // 只留这两条：它们能抓到真 bug（hooks 顺序错、依赖数组漏项导致闭包捕获旧值）
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // 其余规则在真实业务代码里噪音大于收益，全部关掉。
      // 实测：全开时 128 个问题里真 bug 只有 1 个（还是有意的 design choice）。
      // 规则一多就会产生大量噪音，最后没人看，等于没有。
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-irregular-whitespace': 'off',
      'no-useless-assignment': 'off',
      'no-constant-binary-expression': 'off',
      'no-self-assign': 'off',
      'no-sparse-arrays': 'off',
      'no-fallthrough': 'off',
      'no-unused-private-class-members': 'off',
      'prefer-const': 'off',
      'no-undef': 'off', // TS 已负责；避免 Node/浏览器全局误报
    },
  },
  {
    // 代码里现有 25 处 `// eslint-disable-next-line @next/next/no-img-element` 注释，
    // 说明历史上就配过这个插件；装上它这些注释才有意义，也真能查出 <img> 的用法问题。
    files: ['**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      // 只开这一条：其余 Next 规则（如 no-html-link-for-pages）在本仓噪音过大
      '@next/next/no-img-element': 'warn',
    },
  },
)
