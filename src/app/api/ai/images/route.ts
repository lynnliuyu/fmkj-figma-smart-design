import { NextResponse } from 'next/server'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getPluginFlags } from '@/plugins/state'

import {
  IMAGE_MODELS,
  generateImage,
  imageGenerationConfigured,
  isImageModelId,
} from '@/plugins/ai-copilot/image-generation'

export const maxDuration = 300

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: imageGenerationConfigured(),
    models: IMAGE_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      sizes: m.sizes,
      cost: m.cost,
    })),
  })
}

export async function POST(request: Request) {
  const user = await appAuth.getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: '请先登录' }, { status: 401 })
  const flags = await getPluginFlags(user.id)
  if (!flags['ai-copilot'])
    return NextResponse.json({ ok: false, error: 'AI 插件已关闭' }, { status: 404 })
  if (!imageGenerationConfigured()) {
    return NextResponse.json(
      { ok: false, error: '服务器尚未配置 AI_BAILIAN_TOKEN_PLAN_KEY' },
      { status: 503 },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown
    model?: unknown
    size?: unknown
  } | null
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) return NextResponse.json({ ok: false, error: '请输入图片描述' }, { status: 400 })
  if (prompt.length > 2000)
    return NextResponse.json({ ok: false, error: '描述最多 2000 字' }, { status: 400 })
  if (!isImageModelId(body?.model))
    return NextResponse.json({ ok: false, error: '不支持的图像模型' }, { status: 400 })

  const model = IMAGE_MODELS.find((m) => m.id === body.model)!
  const size =
    typeof body?.size === 'string' && (model.sizes as readonly string[]).includes(body.size)
      ? body.size
      : model.sizes[0]
  const payload = await getPayloadClient()
  const fresh = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
    select: { aiCredits: true },
  })
  if ((fresh.aiCredits ?? 0) < model.cost) {
    return NextResponse.json(
      { ok: false, error: `积分不足，本模型需要 ${model.cost} 积分` },
      { status: 402 },
    )
  }

  try {
    const image = await generateImage({ prompt, model: model.id as never, size, userId: user.id })
    let balance: number | null = null
    try {
      const entry = await payload.create({
        collection: 'ai-credit-ledger',
        data: {
          user: user.id,
          delta: -model.cost,
          reason: `AI 生图 · ${model.name} · ${prompt.slice(0, 40)}`,
        },
        overrideAccess: true,
        depth: 0,
      })
      balance = entry.balanceAfter ?? null
    } catch (error) {
      console.error('[ai-image] credit deduction failed', error)
    }
    return NextResponse.json({ ok: true, ...image, size, cost: model.cost, balance })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '生图失败' },
      { status: 500 },
    )
  }
}
