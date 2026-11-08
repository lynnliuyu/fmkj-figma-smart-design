import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { migrations } from './migrations'
import { sharedConfig } from './payload.shared'

/**
 * 自建服务器版配置：PostgreSQL；图片存本地目录，或可选的 S3 兼容对象存储（阿里云 OSS、腾讯云 COS 等）。
 * Docker 构建时会把 `@payload-config` 指向这个文件；Figma Make 里仍使用 payload.config.ts。
 * 所需环境变量见 .env.selfhost.example 和 DEPLOY.md。
 */
const dirname = path.dirname(fileURLToPath(import.meta.url))

const useS3 = Boolean(process.env.S3_BUCKET)

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`缺少环境变量 ${name}，请参考 .env.selfhost.example`)
  return value
}

// 没有配置 S3 时，图片存在服务器本地目录（Docker 里挂载为数据卷）。
const mediaDir = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR || 'media')
const thumbCacheDir = '/tmp/fmkj-selfhost-thumbs'

const collections = useS3
  ? sharedConfig.collections
  : sharedConfig.collections.map((c) =>
      c.slug === 'media'
        ? {
            ...c,
            upload: { staticDir: mediaDir },
            endpoints: [
              ...(Array.isArray(c.endpoints) ? c.endpoints : []),
              {
                path: '/file/:filename',
                method: 'get' as const,
                handler: async (req: {
                  routeParams?: Record<string, unknown>
                  url?: string
                  headers: Headers
                }) => {
                  const rawName =
                    typeof req.routeParams?.filename === 'string' ? req.routeParams.filename : ''
                  const filename = path.basename(decodeURIComponent(rawName))
                  if (!filename) return new Response('Not Found', { status: 404 })

                  const filePath = path.join(/*turbopackIgnore: true*/ mediaDir, filename)
                  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
                    return new Response('Not Found', { status: 404 })
                  }

                  const stat = fs.statSync(/*turbopackIgnore: true*/ filePath)
                  const reqUrl = new URL(req.url || 'http://localhost', 'http://localhost')
                  const widthParam = Number(
                    reqUrl.searchParams.get('width') || reqUrl.searchParams.get('w') || 0,
                  )
                  const qualityParam = Math.min(
                    92,
                    Math.max(
                      50,
                      Number(
                        reqUrl.searchParams.get('quality') || reqUrl.searchParams.get('q') || 78,
                      ),
                    ),
                  )
                  const ext = path.extname(filename).toLowerCase()
                  const isRaster =
                    ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp'

                  // 当带有 ?width= 缩略图参数，或原图超过 350KB（例如 9MB 的 XLSX-CLEAN-0338-original.png）时，自动用 sharp 转为轻量 WebP 并缓存
                  const targetWidth =
                    widthParam > 0
                      ? Math.min(2400, Math.max(48, widthParam))
                      : stat.size > 350 * 1024
                        ? 1280
                        : 0

                  const etag = `"${createHash('sha1').update(`${filename}:${stat.mtimeMs}:${targetWidth}:${qualityParam}`).digest('hex').slice(0, 20)}"`
                  if (req.headers.get('if-none-match') === etag) {
                    return new Response(null, {
                      status: 304,
                      headers: {
                        ETag: etag,
                        'Cache-Control': 'public, max-age=31536000, immutable',
                      },
                    })
                  }

                  if (isRaster && targetWidth > 0) {
                    try {
                      fs.mkdirSync(thumbCacheDir, { recursive: true })
                      const cacheKey = `${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}_w${targetWidth}_q${qualityParam}.webp`
                      const cachePath = path.join(/*turbopackIgnore: true*/ thumbCacheDir, cacheKey)
                      let outBuf: Buffer
                      if (fs.existsSync(/*turbopackIgnore: true*/ cachePath)) {
                        outBuf = fs.readFileSync(/*turbopackIgnore: true*/ cachePath)
                      } else {
                        outBuf = await sharp(/*turbopackIgnore: true*/ filePath)
                          .resize({ width: targetWidth, withoutEnlargement: true })
                          .webp({ quality: qualityParam })
                          .toBuffer()
                        fs.writeFileSync(/*turbopackIgnore: true*/ cachePath, outBuf)
                      }
                      return new Response(new Uint8Array(outBuf), {
                        status: 200,
                        headers: {
                          'Content-Type': 'image/webp',
                          'Content-Length': String(outBuf.length),
                          ETag: etag,
                          'Cache-Control': 'public, max-age=31536000, immutable',
                        },
                      })
                    } catch {
                      // sharp 转换异常时回退直接返回原文件并附带强缓存头
                    }
                  }

                  const mimeMap: Record<string, string> = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.webp': 'image/webp',
                    '.svg': 'image/svg+xml',
                    '.gif': 'image/gif',
                    '.avif': 'image/avif',
                  }
                  const rawBuf = fs.readFileSync(/*turbopackIgnore: true*/ filePath)
                  return new Response(new Uint8Array(rawBuf), {
                    status: 200,
                    headers: {
                      'Content-Type': mimeMap[ext] || 'application/octet-stream',
                      'Content-Length': String(rawBuf.length),
                      ETag: etag,
                      'Cache-Control': 'public, max-age=31536000, immutable',
                    },
                  })
                },
              },
            ],
          }
        : c,
    )

export default buildConfig({
  ...sharedConfig,
  collections,
  secret: required('PAYLOAD_SECRET'),
  serverURL: process.env.PUBLIC_URL || undefined,
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString: required('DATABASE_URI'),
      max: process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : undefined,
    },
    // 沿用 Figma 数据库里的 UUID 主键，迁移数据时关联关系保持不变。
    idType: 'uuid',
    // 允许导入脚本写入原 ID（data-import.ts 依赖这一项）。
    allowIDOnCreate: true,
    migrationDir: path.resolve(dirname, 'migrations'),
    // 生产容器启动时自动执行尚未运行的迁移（standalone 镜像里没有 payload CLI）。
    // 注意：Payload 的 push 只在 NODE_ENV !== 'production' 时生效，Docker runner 固定为 production，
    // 所以线上必须走迁移文件；push 只给本地 pnpm dev 用。
    prodMigrations: migrations,
    push: process.env.NODE_ENV !== 'production' && process.env.PAYLOAD_DB_PUSH !== 'false',
  }),
  storage: useS3
    ? [
        s3Storage({
          collections: { media: true },
          bucket: required('S3_BUCKET'),
          config: {
            region: process.env.S3_REGION || 'auto',
            endpoint: process.env.S3_ENDPOINT || undefined,
            // MinIO 等自建存储需要路径风格；阿里云 OSS / 腾讯云 COS 用默认的虚拟主机风格。
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
            credentials: {
              accessKeyId: required('S3_ACCESS_KEY_ID'),
              secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
            },
          },
        }),
      ]
    : [],
})
