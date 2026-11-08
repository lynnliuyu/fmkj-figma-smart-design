import fs from 'node:fs/promises'
import path from 'node:path'

import type { Payload } from 'payload'

import { BUILTIN_SCENES } from '@/lib/builtin-scenes'
import { BUILTIN_PROPOSAL_TEMPLATES } from '@/plugins/proposal/templates'

/**
 * 方案素材库（方案模板 + 场景库）的初始化：把代码里的内置模板与内置场景写入后台，变成可编辑的数据。
 * - 后台「方案模板」「场景库」列表页的「补齐内置…」按钮与 scripts/seed-proposal-library.ts 共用；
 * - 按标识（slug）判断，已存在的记录不会被覆盖；fill = true 时只补「适合客户 / 使用时机 / 外观特点」这类空字段；
 * - 场景图片从 public/proposal/photos/scenes/<slug>.jpg 上传到媒体库（读不到文件时用 origin 下载，再不行就不带图片，方案改用章节默认照片）。
 */

export type LibraryStatus = {
  templates: { builtin: number; existing: number; missing: string[] }
  scenes: { builtin: number; existing: number; missing: string[] }
}

let autoSeedPromise: Promise<void> | null = null

/**
 * 确保后台「方案模板」与「场景库」至少已初始化内置记录（新部署的自建服务器首次访问时自动幂等补齐，无需人工进后台点击）。
 */
export async function ensureBuiltinLibrarySeeded(payload: Payload): Promise<void> {
  if (autoSeedPromise) return autoSeedPromise
  autoSeedPromise = (async () => {
    try {
      const [tpl, scn] = await Promise.all([
        payload.find({
          collection: 'proposal-templates',
          limit: 200,
          depth: 0,
          overrideAccess: true,
          select: { slug: true },
        }),
        payload.find({
          collection: 'scenes',
          limit: 200,
          depth: 0,
          overrideAccess: true,
          select: { slug: true },
        }),
      ])
      const tplSlugs = new Set(tpl.docs.map((d) => d.slug))
      const scnSlugs = new Set(scn.docs.map((d) => d.slug))
      const missingTpl = BUILTIN_PROPOSAL_TEMPLATES.some((t) => !tplSlugs.has(t.value))
      const missingScn = BUILTIN_SCENES.some((s) => !scnSlugs.has(s.slug))
      if (tpl.totalDocs === 0 || missingTpl) {
        await seedBuiltinTemplates(payload, { fill: true })
      }
      if (scn.totalDocs === 0 || missingScn) {
        await seedBuiltinScenes(payload, {
          origin:
            process.env.NEXT_PUBLIC_SITE_URL ||
            process.env.PUBLIC_URL ||
            process.env.FIGMA_PUBLIC_URL,
        })
      }
    } catch {
      // 忽略并发或只读构建阶段异常，下次请求可重试
      autoSeedPromise = null
    }
  })()
  return autoSeedPromise
}

export async function proposalLibraryStatus(payload: Payload): Promise<LibraryStatus> {
  await ensureBuiltinLibrarySeeded(payload)
  const [tpl, scn] = await Promise.all([
    payload.find({
      collection: 'proposal-templates',
      limit: 500,
      depth: 0,
      overrideAccess: true,
      select: { slug: true },
    }),
    payload.find({
      collection: 'scenes',
      limit: 500,
      depth: 0,
      overrideAccess: true,
      select: { slug: true },
    }),
  ])
  const tplSlugs = new Set(tpl.docs.map((d) => d.slug))
  const scnSlugs = new Set(scn.docs.map((d) => d.slug))
  return {
    templates: {
      builtin: BUILTIN_PROPOSAL_TEMPLATES.length,
      existing: tpl.totalDocs,
      missing: BUILTIN_PROPOSAL_TEMPLATES.filter((t) => !tplSlugs.has(t.value)).map((t) => t.label),
    },
    scenes: {
      builtin: BUILTIN_SCENES.length,
      existing: scn.totalDocs,
      missing: BUILTIN_SCENES.filter((s) => !scnSlugs.has(s.slug)).map((s) => s.name),
    },
  }
}

type SeedResult = { created: string[]; filled: string[]; skipped: number; errors: string[] }

/** 补齐内置方案模板（按标识跳过已有的；fill 时给已有记录补空着的适合客户 / 使用时机 / 外观特点） */
export async function seedBuiltinTemplates(
  payload: Payload,
  opts: { fill?: boolean } = {},
): Promise<SeedResult> {
  const out: SeedResult = { created: [], filled: [], skipped: 0, errors: [] }
  const existing = await payload.find({
    collection: 'proposal-templates',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const bySlug = new Map(
    existing.docs.map((d) => [
      d.slug,
      d as typeof d & {
        audience?: string | null
        occasion?: string | null
        highlights?: string[] | null
      },
    ]),
  )
  for (const [i, t] of BUILTIN_PROPOSAL_TEMPLATES.entries()) {
    const doc = bySlug.get(t.value)
    try {
      if (!doc) {
        await payload.create({
          collection: 'proposal-templates',
          data: {
            name: t.label,
            slug: t.value,
            description: t.description,
            audience: t.audience,
            occasion: t.occasion,
            highlights: t.highlights,
            framework: t.framework,
            theme: t.theme,
            sections: t.sections,
            markers: 'symbol',
            enabled: true,
            sortOrder: (i + 1) * 10,
          } as never,
          overrideAccess: true,
          depth: 0,
        })
        out.created.push(t.label)
        continue
      }
      const patch: Record<string, unknown> = {}
      if (opts.fill) {
        if (!doc.audience?.trim()) patch.audience = t.audience
        if (!doc.occasion?.trim()) patch.occasion = t.occasion
        if (!doc.highlights?.length) patch.highlights = t.highlights
      }
      if (Object.keys(patch).length) {
        await payload.update({
          collection: 'proposal-templates',
          id: doc.id,
          data: patch as never,
          overrideAccess: true,
          depth: 0,
        })
        out.filled.push(t.label)
      } else out.skipped++
    } catch (e) {
      out.errors.push(`${t.label}：${(e as Error).message}`)
    }
  }
  return out
}

async function sceneImage(
  payload: Payload,
  slug: string,
  alt: string,
  origin?: string,
  builtinUrl?: string,
): Promise<string | null> {
  const rel = builtinUrl?.startsWith('/proposal/')
    ? builtinUrl.slice(1)
    : `proposal/photos/scenes/${slug}.jpg`
  const png = rel.endsWith('.png')
  let data: Buffer | null = await fs
    .readFile(path.join(process.cwd(), 'public', rel))
    .catch(() => null)
  if (!data && origin) {
    const res = await fetch(`${origin.replace(/\/+$/, '')}/${rel}`).catch(() => null)
    if (res?.ok) data = Buffer.from(await res.arrayBuffer())
  }
  if (!data) return null
  const media = await payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data,
      mimetype: png ? 'image/png' : 'image/jpeg',
      name: `scene-${slug}.${png ? 'png' : 'jpg'}`,
      size: data.length,
    },
    overrideAccess: true,
    depth: 0,
  })
  return String(media.id)
}

/** 补齐内置场景（按标识跳过已有的；图片一并上传到媒体库） */
export async function seedBuiltinScenes(
  payload: Payload,
  opts: { origin?: string } = {},
): Promise<SeedResult> {
  const out: SeedResult = { created: [], filled: [], skipped: 0, errors: [] }
  const existing = await payload.find({
    collection: 'scenes',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { slug: true },
  })
  const slugs = new Set(existing.docs.map((d) => d.slug))
  for (const s of BUILTIN_SCENES) {
    if (slugs.has(s.slug)) {
      out.skipped++
      continue
    }
    try {
      const image = await sceneImage(
        payload,
        s.slug,
        `${s.image?.alt ?? s.name}（${s.credit}）`,
        opts.origin,
        s.image?.url,
      ).catch(() => null)
      await payload.create({
        collection: 'scenes',
        data: {
          name: s.name,
          slug: s.slug,
          enabled: true,
          sortOrder: s.sortOrder,
          summary: s.summary,
          headline: s.headline,
          subtitle: s.subtitle,
          tagline: s.tagline,
          steps: s.steps.map((text) => ({ text })),
          ...(image ? { image } : {}),
          scope: s.scope,
          chapter: s.chapter,
          roomTypes: s.roomTypes,
          requiredDevices: s.requiredDevices,
          anyDevices: s.anyDevices,
        } as never,
        overrideAccess: true,
        depth: 0,
      })
      out.created.push(s.name)
    } catch (e) {
      out.errors.push(`${s.name}：${(e as Error).message}`)
    }
  }
  return out
}
