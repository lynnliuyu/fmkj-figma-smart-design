/**
 * 把 data-export.ts 导出的数据导入自建服务器的数据库（保留原 ID）。
 *
 * 只会写入自建服务器的 PostgreSQL；如果连到的不是 PostgreSQL 会直接中止。
 *
 * 用法（在服务器上，数据库已执行过 `payload migrate`）：
 *   pnpm exec payload run --input '{"scriptPath":"scripts/data-import.ts","scriptArgs":["./data-export"]}'
 *
 * 可重复运行：已存在的记录（按 ID）会跳过，不会重复导入。
 * 员工密码无法迁移（加密格式不兼容），导入后需用 scripts/set-password.ts 逐个重设。
 */
import fs from 'node:fs'
import path from 'node:path'

import { getPayload } from 'payload'

const ORDER = [
  'media',
  'brands',
  'categories',
  'tags',
  'folders',
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
// 上传相关字段由文件本身生成，导入时不带。
const UPLOAD_FIELDS = new Set([
  'url',
  'filename',
  'mimeType',
  'filesize',
  'width',
  'height',
  'sizes',
  'focalX',
  'focalY',
])
// 登录相关字段一律不迁移：Figma 的密码密文格式与自托管 Payload 不兼容，员工需用 set-password.ts 重设密码。
const AUTH_FIELDS = new Set([
  'hash',
  'salt',
  'loginAttempts',
  'lockUntil',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'resetPasswordRequestedAt',
  'password',
])

type Doc = Record<string, unknown> & { id: string }

const inDir = path.resolve(process.argv[2] || './data-export')
const dump = JSON.parse(fs.readFileSync(path.join(inDir, 'data.json'), 'utf8')) as {
  collections: Record<string, Doc[]>
  globals: Record<string, Record<string, unknown>>
}
const files = new Map(
  fs
    .readdirSync(path.join(inDir, 'files'))
    .map((f) => [path.parse(f).name, path.join(inDir, 'files', f)]),
)

// 明确加载自建服务器版配置，避免误用 Figma 托管版配置把数据写回 Figma。
const configPath = path.resolve(process.env.PAYLOAD_CONFIG_PATH || 'src/payload.selfhost.config.ts')
const config = (await import(configPath)).default
const payload = await getPayload({ config })
if (payload.db.name !== 'postgres') {
  console.error(
    `已中止：当前数据库是 ${payload.db.name}，导入只能在自建服务器的 PostgreSQL 上运行。`,
  )
  process.exit(1)
}
const summary: string[] = []

for (const slug of ORDER) {
  const docs = dump.collections[slug] ?? []
  if (!payload.collections[slug] || docs.length === 0) continue
  let created = 0
  let skipped = 0
  const errors: string[] = []
  for (const doc of docs) {
    const exists = await payload.find({
      collection: slug,
      where: { id: { equals: doc.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    })
    if (exists.docs.length) {
      skipped++
      continue
    }
    const data = Object.fromEntries(
      Object.entries(doc).filter(
        ([k]) =>
          k !== 'createdAt' &&
          k !== 'updatedAt' &&
          !(slug === 'media' && UPLOAD_FIELDS.has(k)) &&
          !AUTH_FIELDS.has(k),
      ),
    )
    // Figma 数据库不校验引用，报价里可能还指向已删除的产品；明细自带名称/型号/价格快照，清空失效链接即可。
    if (slug === 'quotes' && Array.isArray(data.items)) {
      const productIds = new Set((dump.collections.products ?? []).map((p: { id: string }) => p.id))
      data.items = data.items.map((it: Record<string, unknown>) =>
        it.product && !productIds.has(it.product as string) ? { ...it, product: null } : it,
      )
    }
    try {
      if (slug === 'media') {
        const filePath = files.get(doc.id)
        if (!filePath) throw new Error('缺少图片文件')
        await payload.create({
          collection: 'media',
          data: data as never,
          filePath,
          overrideAccess: true,
          context: { importing: true },
        })
      } else if (slug === 'users') {
        // 随机密码占位，没人知道它；上线后用 set-password.ts 给每位员工设置新密码。
        await payload.create({
          collection: 'users',
          data: { ...data, password: crypto.randomUUID() } as never,
          overrideAccess: true,
          context: { importing: true },
        })
      } else {
        await payload.create({
          collection: slug,
          data: data as never,
          overrideAccess: true,
          context: { importing: true },
        })
      }
      created++
    } catch (e) {
      errors.push(`${doc.id}: ${(e as Error).message}`)
    }
  }
  const line = `${slug}: 新增 ${created}，已存在跳过 ${skipped}，失败 ${errors.length}`
  summary.push(line)
  console.log(line)
  if (errors.length) console.log(errors.slice(0, 20).join('\n'))
}

for (const [slug, data] of Object.entries(dump.globals)) {
  const { id: _id, createdAt: _c, updatedAt: _u, globalType: _g, ...rest } = data
  if (!payload.globals.config.some((g) => g.slug === slug)) continue
  await payload.updateGlobal({
    slug: slug as 'company-settings',
    data: rest as never,
    overrideAccess: true,
  })
  console.log(`${slug}: 已更新`)
}

console.log(
  '\n提示：旧版导出文件不含方案模板与场景库时，可运行 scripts/seed-proposal-library.ts 补齐内置内容。',
)

console.log('\n导入完成：\n' + summary.join('\n'))
process.exit(0)
