/**
 * 初始化方案素材库：把内置的方案模板与场景写入后台（新部署的自建服务器用；可重复运行）。
 *
 * 用法：
 *   Figma Make：pnpm exec payload run --input '{"scriptPath":"scripts/seed-proposal-library.ts"}'
 *   自建服务器：PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts pnpm exec payload run --input '{"scriptPath":"scripts/seed-proposal-library.ts"}'
 *
 * 规则：按标识（slug）判断，已有的模板和场景不覆盖；已有的内置模板只补空着的「适合客户 / 使用时机 / 外观特点」。
 * 同样的操作也可以在后台「方案模板」「场景库」列表页顶部一键完成。
 */
import path from 'node:path'

import { getPayload } from 'payload'

import {
  proposalLibraryStatus,
  seedBuiltinScenes,
  seedBuiltinTemplates,
} from '@/lib/proposal-library'

const configPath = process.env.PAYLOAD_CONFIG_PATH
  ? path.resolve(process.env.PAYLOAD_CONFIG_PATH)
  : null
const config = configPath
  ? (await import(configPath)).default
  : (await import('@payload-config')).default
const payload = await getPayload({ config })

const before = await proposalLibraryStatus(payload)
console.log(
  `方案模板：后台 ${before.templates.existing} 套，缺少内置 ${before.templates.missing.length} 套`,
)
console.log(
  `场景库：后台 ${before.scenes.existing} 个，缺少内置 ${before.scenes.missing.length} 个`,
)

const templates = await seedBuiltinTemplates(payload, { fill: true })
console.log(
  `方案模板：新增 ${templates.created.length}（${templates.created.join('、') || '无'}），补充说明 ${templates.filled.length}，跳过 ${templates.skipped}`,
)
const scenes = await seedBuiltinScenes(payload, {
  origin: process.env.NEXT_PUBLIC_SITE_URL || process.env.FIGMA_PUBLIC_URL,
})
console.log(
  `场景库：新增 ${scenes.created.length}（${scenes.created.join('、') || '无'}），跳过 ${scenes.skipped}`,
)

const errors = [...templates.errors, ...scenes.errors]
if (errors.length) {
  console.error(`失败 ${errors.length} 条：\n${errors.join('\n')}`)
  process.exit(1)
}
process.exit(0)
