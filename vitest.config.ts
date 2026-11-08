import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 单元测试只覆盖 src/lib 下的纯函数（无 DB / Payload 副作用），
 * 需要 Payload 运行时的回归由 `pnpm run knowledge:check` 与构建门禁负责。
 */
export default defineConfig({
  resolve: {
    alias: {
      // 与 tsconfig.json 的 paths 保持一致
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 说明文件：这些用例是源码行为的回归网，不是覆盖率门槛
    reporters: ['default'],
  },
})
