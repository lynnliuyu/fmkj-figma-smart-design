/**
 * 营销工作台素材快照导出（只读，不改库）。
 *
 * 把主站的项目、点位图、报价与配图导出成一份可整体搬走的本地快照，供
 * `DreamStars/marketing/` 这个独立工作台读取（它不连生产库，只读这里的文件）。
 * 数据契约见 `DreamStars/marketing/PLAN.md` §2，隐私红线见 §3。
 *
 * 用法（在 fmkj-latest 里跑）：
 *   corepack pnpm@10.34.3 exec tsx scripts/export-marketing-snapshot.ts [--limit N] [--project <id>] [--no-redact]
 *
 * 输出（默认 ../marketing/data/）：
 *   index.json               项目清单（标题走 socialCaseTitle，不含客户身份）
 *   projects/<id>.json       单个项目快照：{ id, exportedAt, redacted, poster, raw, company }
 *   media/{sheets,scenes,brand}/  配图，json 里全部用 ./media/... 相对路径引用
 *
 * 默认脱敏：去掉客户姓名、电话与详细门牌，项目标题一律走主站的 socialCaseTitle()。
 * 快照会被推到公网云主机，脱敏不可省；只有显式传 --no-redact 才导出全量。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import config from '@payload-config'
import { getPayload } from 'payload'

import { categoryOfType, deviceTypeOf } from '@/lib/device-types'
import { miniAppCodeForCompany } from '@/lib/mini-app-code'
import { planAreaOf } from '@/lib/point-scene'
import { loadSystemProjectDocs } from '@/lib/project-docs'
import { nightScenePhotoForScene } from '@/lib/scene-night-photos'
import {
  socialCaseTitle,
  socialSheetTitle,
  type SocialPosterData,
} from '@/lib/social-poster'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const opt = (name: string): string | null => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null
}

const limitArg = opt('--limit')
const limit = limitArg ? Math.max(0, Number.parseInt(limitArg, 10) || 0) : 0
const onlyProject = opt('--project')
/** 默认脱敏；只有显式 --no-redact 才导出全量（含客户姓名、电话与门牌）。 */
const redacted = !flag('--no-redact')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.resolve(repoRoot, '..', 'marketing', 'data')
/** 自托管配置把媒体库原文件存在这里（payload.selfhost.config.ts 的 staticDir）。 */
const mediaDir = path.resolve(repoRoot, process.env.MEDIA_DIR || 'media')
const publicDir = path.resolve(repoRoot, 'public')

const exportedAt = new Date().toISOString()

/* ---------------- 脱敏 ---------------- */

/** 去掉电话、客户姓名这类个人值；真的删掉了东西才收拾残留的分隔符。 */
const scrubText = (text: string, privateValues: string[]) => {
  let out = text
  let removed = false
  for (const value of privateValues) {
    if (value && out.includes(value)) {
      out = out.split(value).join('')
      removed = true
    }
  }
  const digits = /1[3-9]\d{9}/g
  if (digits.test(out)) {
    out = out.replace(digits, '')
    removed = true
  }
  return removed ? out.replace(/[·,，\-—\s]+$/, '').trim() : out
}

/** 客户身份字段：脱敏模式下整键去掉，而不是留空串。 */
const PRIVATE_KEYS = new Set(['customerName', 'customerPhone', 'address'])

/** 递归去掉客户身份字段并清洗字符串（只在脱敏模式使用）。 */
function scrub<T>(value: T, privateValues: string[]): T {
  if (typeof value === 'string') return scrubText(value, privateValues) as unknown as T
  if (Array.isArray(value)) return value.map((v) => scrub(v, privateValues)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PRIVATE_KEYS.has(k)) continue
      out[k] = scrub(v, privateValues)
    }
    return out as unknown as T
  }
  return value
}

/* ---------------- 配图 ---------------- */

const urlPathname = (url: string) =>
  url.startsWith('http') ? new URL(url).pathname : new URL(url, 'http://localhost').pathname

/**
 * 复制一张配图到 <outDir>/media/<kind>/，返回 json 里要写的相对路径。
 * 找不到源文件时返回 null（调用方退回原 url，并在结尾汇总警告）。
 */
function copyAsset(url: string | null, kind: 'sheets' | 'scenes' | 'brand'): string | null {
  if (!url) return null
  const dir = path.join(outDir, 'media', kind)
  fs.mkdirSync(dir, { recursive: true })

  let filename: string
  let source: string | null = null
  let inline: Buffer | null = null

  if (url.startsWith('data:')) {
    const m = /^data:([^;,]*)?(;base64)?,([\s\S]*)$/.exec(url)
    if (!m) return null
    const subtype = (m[1] ?? '').split('/')[1]?.replace('+xml', '') || 'bin'
    inline = Buffer.from(m[3], m[2] ? 'base64' : 'utf8')
    filename = `inline-${inline.toString('base64url').slice(0, 24)}.${subtype}`
  } else {
    const pathname = urlPathname(url)
    filename = path.basename(decodeURIComponent(pathname)) || 'asset.bin'
    // 媒体库原文件在 media/ 里（url 是 /api/media/file/<filename>），其余静态图在 public/ 下
    const candidates = pathname.startsWith('/api/media/file/')
      ? [path.join(mediaDir, filename)]
      : [path.join(publicDir, decodeURIComponent(pathname)), path.join(mediaDir, filename)]
    source = candidates.find((p) => fs.existsSync(p)) ?? null
    if (!source) return null
  }

  const dest = path.join(dir, filename)
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
    if (inline) fs.writeFileSync(dest, inline)
    else fs.copyFileSync(source!, dest)
  }
  return `./media/${kind}/${filename}`
}

/* ---------------- 主流程 ---------------- */

const payload = await getPayload({ config })

const ids = onlyProject
  ? [onlyProject]
  : (
      await payload.find({
        collection: 'projects',
        depth: 0,
        limit,
        sort: '-updatedAt',
        overrideAccess: true,
        select: { pointCount: true } as never,
      })
    ).docs.map((p) => String(p.id))

fs.mkdirSync(path.join(outDir, 'projects'), { recursive: true })
console.log(`导出 ${ids.length} 个项目 → ${outDir}（${redacted ? '脱敏' : '全量'}）`)

const missingAssets: string[] = []
const indexProjects: Record<string, unknown>[] = []

for (const id of ids) {
  const docs = await loadSystemProjectDocs(id).catch(() => null)
  if (!docs) {
    console.warn(`  跳过 ${id}：读取失败或项目不存在`)
    continue
  }
  const project = docs.project
  const privateValues = [project.customerName, project.customerPhone].filter(
    (v): v is string => !!v,
  )
  // 项目标题一律走主站现成的 socialCaseTitle()（本来就去个人身份与门牌）
  const title = socialCaseTitle(project.community, privateValues)

  // 点位数据：照抄归档页 archive/page.tsx 里 posterData 的组装方式
  const allSheets = docs.sheets.filter((s) => s.url)
  const allAreas = docs.areas
  const allPoints = docs.points
  const typeCounter = new Map<string, number>()
  for (const pt of allPoints) {
    typeCounter.set(pt.deviceType, (typeCounter.get(pt.deviceType) ?? 0) + 1)
  }
  const topTypes = [...typeCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, name: deviceTypeOf(type)?.name ?? '设备', count }))
  const hasLighting = allPoints.some((p) => categoryOfType(p.deviceType)?.slug === 'lighting')
  const sceneIdeas = [
    ...(hasLighting
      ? [
          {
            name: '观影模式',
            title: '灯光退场，电影开场。',
            description: '观影场景 · 从客厅灯光开始讨论',
          },
        ]
      : []),
    ...(allPoints.some((p) => p.deviceType === 'curtain-track')
      ? [
          {
            name: '睡眠模式',
            title: '把一天，留在灯光之外。',
            description: '睡眠场景 · 窗帘与休息习惯一起确认',
          },
        ]
      : []),
    ...(hasLighting && allPoints.some((p) => p.deviceType === 'motion-sensor')
      ? [
          {
            name: '起夜模式',
            title: '夜里起身，脚下有光。',
            description: '夜间引导 · 感应与低亮度照明意向',
          },
        ]
      : []),
  ]

  // 配图落盘：poster 与 raw 里的 url 都换成 ./media/... 相对路径，整目录可搬走
  const mediaSrc = (url: string | null, kind: 'sheets' | 'scenes' | 'brand', label: string) => {
    const rel = copyAsset(url, kind)
    if (url && !rel) missingAssets.push(`${id} ${label}: ${url}`)
    return rel ?? url
  }

  const sheets = allSheets.map((sheet, i) => ({
    name: socialSheetTitle(sheet.name, i),
    url: mediaSrc(sheet.url, 'sheets', `sheet ${sheet.name}`)!,
    points: allPoints
      .filter((p) => p.sheetId === sheet.id && p.rx !== null && p.ry !== null)
      .map((p) => ({
        id: p.id,
        deviceType: p.deviceType,
        code: p.code,
        rx: p.rx,
        ry: p.ry,
        angle: p.angle,
      })),
    areas: allAreas
      .filter((a) => a.sheetId === sheet.id)
      .map((a) =>
        planAreaOf(a, sheet as { x: number; y: number; width: number; height: number }),
      ),
  }))
  const scenePhotos = sceneIdeas.flatMap((idea) => {
    const photo = nightScenePhotoForScene(idea.name)
    if (!photo) return []
    return [
      {
        key: photo.key,
        title: idea.title,
        description: idea.description,
        url: mediaSrc(photo.url, 'scenes', `scene ${photo.key}`)!,
        alt: photo.alt,
      },
    ]
  })
  const qrCodeUrl = mediaSrc(
    docs.company.qrCode?.url ?? '/brand/wechat-contact-qr.jpg',
    'brand',
    'qrCode',
  )
  const miniAppCodeUrl = mediaSrc(
    miniAppCodeForCompany(docs.company.name),
    'brand',
    'miniAppCode',
  )

  // 定稿报价与归档页同一套规则（合同依据 → 手动定稿 → 已接受 → 最新）
  const finalQuote = docs.quote
  const poster: SocialPosterData = {
    title,
    platform: project.platform || '全屋智能',
    pointCount: allPoints.length || project.pointCount || 0,
    roomCount: new Set(allPoints.map((p) => p.areaId).filter(Boolean)).size || allAreas.length,
    floorCount: allSheets.length,
    totalAmount: finalQuote?.total ?? project.budget ?? null,
    budgetLabel: finalQuote ? '本次方案报价参考' : '项目预算参考',
    companyName: docs.company.name,
    qrCodeUrl,
    miniAppCodeUrl,
    sheets,
    topTypes,
    scenePhotos,
  }

  // raw 是出图与分镜要用的原始数据，结构与 PLAN.md §2 一致
  const raw = {
    sheets: allSheets.map((s, i) => ({
      id: s.id,
      name: sheets[i].name,
      url: sheets[i].url,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
    })),
    areas: allAreas,
    points: allPoints,
    quote: finalQuote
      ? {
          id: String(finalQuote.id),
          title: finalQuote.title,
          total: finalQuote.total ?? 0,
          status: finalQuote.status ?? 'draft',
        }
      : null,
  }

  const company = { name: docs.company.name, qrCodeUrl }

  const snapshot = {
    id,
    exportedAt,
    redacted,
    poster,
    raw: redacted ? scrub(raw, privateValues) : raw,
    company: redacted ? scrub(company, privateValues) : company,
  }
  fs.writeFileSync(
    path.join(outDir, 'projects', `${id}.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  )

  indexProjects.push({
    id,
    title,
    community: redacted ? socialCaseTitle(project.community, privateValues) : project.community,
    platform: project.platform || '全屋智能',
    pointCount: poster.pointCount,
    roomCount: poster.roomCount,
    floorCount: poster.floorCount,
    sheetCount: sheets.length,
    hasQuote: Boolean(finalQuote),
    updatedAt: project.updatedAt,
  })
  console.log(
    `  ${id} ${title} · ${poster.pointCount} 点位 · ${sheets.length} 图 · 报价${finalQuote ? '有' : '无'}`,
  )
}

fs.writeFileSync(
  path.join(outDir, 'index.json'),
  `${JSON.stringify(
    { exportedAt, source: 'fmkj-latest@local', redacted, projects: indexProjects },
    null,
    2,
  )}\n`,
)
console.log(`已写出 index.json（${indexProjects.length} 个项目）`)
if (missingAssets.length) console.log('以下配图没找到源文件：\n' + missingAssets.join('\n'))
process.exit(0)
