/**
 * 从当前环境（通常是 Figma Make）导出全部业务数据和图片，供自建服务器导入。
 *
 * 用法（在 Figma Make 的项目里运行）：
 *   pnpm exec payload run --input '{"scriptPath":"scripts/data-export.ts","scriptArgs":["./data-export"]}'
 *
 * 输出目录结构：
 *   data.json        所有集合与公司信息（保留原 ID，关联关系不变）
 *   files/<id>.<ext> 媒体库里的图片原文件
 */
import fs from 'node:fs'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

// 导入顺序即依赖顺序：被引用的集合排在前面。
export const COLLECTIONS = [
  'media',
  'brands',
  'categories',
  'tags',
  'folders',
  // 方案素材库（引用媒体库图片）：漏导会让自建服务器的方案全部退回内置模板、场景章节空白
  'proposal-templates',
  'scenes',
  'users',
  'products',
  'projects',
  'quotes',
  'contracts',
  'ai-conversations',
  'ai-messages',
  'ai-credit-ledger',
  'redemption-codes',
] as const

/** 一并导出的全局设置（AI 模型与渠道只存变量名，不含密钥） */
export const GLOBALS = ['company-settings', 'ai-settings', 'membership-settings'] as const

// Figma 平台附加的字段，自建服务器的表结构里没有，导出时去掉。
const PLATFORM_FIELDS = new Set([
  'createdBy',
  'updatedBy',
  '_h_folders',
  '_h_tags',
  'prefix',
  '_objectKey',
  'original',
  'thumbnailURL',
  'sessions',
  // 密码密文格式与自托管 Payload 不兼容，且属于敏感数据，不导出；上线后用 set-password.ts 重设。
  'hash',
  'salt',
  'loginAttempts',
  'lockUntil',
  'resetPasswordToken',
  'resetPasswordExpiration',
])

const outDir = path.resolve(process.argv[2] || './data-export')

const clean = (doc: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(doc).filter(([k]) => !PLATFORM_FIELDS.has(k)))

const payload = await getPayload({ config })
fs.mkdirSync(path.join(outDir, 'files'), { recursive: true })

const data: Record<string, unknown[]> = {}
for (const slug of COLLECTIONS) {
  if (!payload.collections[slug]) continue
  const docs: Record<string, unknown>[] = []
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: slug,
      depth: 0,
      limit: 200,
      page,
      overrideAccess: true,
      showHiddenFields: true,
    })
    docs.push(...(res.docs as unknown as Record<string, unknown>[]).map(clean))
    if (!res.hasNextPage) break
  }
  data[slug] = docs
  console.log(`${slug}: ${docs.length}`)
}

// 下载图片原文件。url 可能是相对路径（/api/media/file/...），按站点地址补全。
const base =
  process.env.FIGMA_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
let ok = 0
const failed: string[] = []
await Promise.all(
  Array.from({ length: 8 }, async (_, worker) => {
    const media = data.media as { id: string; url?: string; filename?: string }[]
    for (let i = worker; i < media.length; i += 8) {
      const m = media[i]
      const ext = path.extname(m.filename || '') || '.bin'
      const dest = path.join(outDir, 'files', `${m.id}${ext}`)
      // 重复运行时跳过已下载的文件
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        ok++
        continue
      }
      let lastError = ''
      // 存储服务偶尔返回 5xx，最多重试 4 次，间隔递增
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await fetch(new URL(m.url!, base))
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
          ok++
          lastError = ''
          break
        } catch (e) {
          lastError = (e as Error).message
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
      if (lastError) failed.push(`${m.id} ${m.filename}: ${lastError}`)
    }
  }),
)
console.log(`media files: ${ok}/${(data.media as unknown[]).length}`)
if (failed.length) console.log('下载失败：\n' + failed.join('\n'))

const globals: Record<string, Record<string, unknown>> = {}
for (const slug of GLOBALS) {
  const doc = await payload.findGlobal({ slug, depth: 0, overrideAccess: true }).catch(() => null)
  if (doc) globals[slug] = clean(doc as unknown as Record<string, unknown>)
}
fs.writeFileSync(
  path.join(outDir, 'data.json'),
  JSON.stringify({ exportedAt: new Date().toISOString(), collections: data, globals }, null, 2),
)
console.log(`已导出到 ${outDir}`)
process.exit(0)
