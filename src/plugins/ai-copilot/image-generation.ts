/**
 * AI 生图：调用阿里云百炼 Token Plan 的图像生成模型。
 * 与聊天分开：这里只负责 prompt → 图片 → 写入 media，不参与 chat/completions。
 */
import { getPayloadClient } from '@/lib/payload'

const ENDPOINT =
  process.env.AI_IMAGE_ENDPOINT ||
  'https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

export const IMAGE_MODELS = [
  {
    id: 'qwen-image-3.0-pro',
    name: '千问图像 3.0 Pro',
    description: '文生图 / 图生图，支持智能家居场景、方案配图与户型图风格化',
    sizes: ['1024*1024', '1536*1024', '1024*1536'],
    cost: 5,
  },
] as const

export type ImageModel = (typeof IMAGE_MODELS)[number]
export type ImageModelId = ImageModel['id']

export const isImageModelId = (v: unknown): v is ImageModelId =>
  typeof v === 'string' && IMAGE_MODELS.some((m) => m.id === v)

export const imageGenerationConfigured = () =>
  Boolean(process.env.AI_BAILIAN_TOKEN_PLAN_KEY?.trim())

export class ImageGenerationError extends Error {}

export async function generateImage(opts: {
  prompt: string
  model: ImageModelId
  size?: string
  userId: string | number
  /** 参考图（data URL）：支持图生图的模型会参考它的构图与空间；不支持时自动退回纯文生图 */
  referenceImage?: string | null
}): Promise<{
  mediaId: string
  url: string
  width: number
  height: number
  model: ImageModelId
  buffer: Buffer
  usedReference: boolean
}> {
  const key = process.env.AI_BAILIAN_TOKEN_PLAN_KEY?.trim()
  if (!key) throw new ImageGenerationError('服务器尚未配置 AI_BAILIAN_TOKEN_PLAN_KEY')
  const model = IMAGE_MODELS.find((m) => m.id === opts.model)
  if (!model) throw new ImageGenerationError('不支持的图像模型')
  const size =
    opts.size && (model.sizes as readonly string[]).includes(opts.size) ? opts.size : model.sizes[0]

  const request = async (withReference: boolean) => {
    const content: Record<string, string>[] =
      withReference && opts.referenceImage
        ? [{ image: opts.referenceImage }, { text: opts.prompt }]
        : [{ text: opts.prompt }]
    try {
      return await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          input: { messages: [{ role: 'user', content }] },
          parameters: { n: 1, size, watermark: false, prompt_extend: true },
        }),
        signal: AbortSignal.timeout(300_000),
      })
    } catch (error) {
      throw new ImageGenerationError(`生图请求失败：${(error as Error).message || '网络错误'}`)
    }
  }
  let usedReference = Boolean(opts.referenceImage)
  let res = await request(usedReference)
  let raw = await res.text()
  if (!res.ok && usedReference && res.status >= 400 && res.status < 500) {
    // 模型不支持参考图输入：改为纯文生图（提示词已由视觉模型根据参考图写好）
    usedReference = false
    res = await request(false)
    raw = await res.text()
  }
  if (!res.ok) throw new ImageGenerationError(`生图接口返回 ${res.status}：${raw.slice(0, 300)}`)
  let data: {
    output?: { choices?: { message?: { content?: { type?: string; image?: string }[] } }[] }
    usage?: { output_width?: number; output_height?: number }
  }
  try {
    data = JSON.parse(raw)
  } catch {
    throw new ImageGenerationError('生图接口返回无法解析')
  }
  const imageUrl = data.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image
  if (!imageUrl) throw new ImageGenerationError('生图接口没有返回图片 URL')

  let buffer: Buffer
  try {
    const img = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) })
    if (!img.ok) throw new Error(`HTTP ${img.status}`)
    buffer = Buffer.from(await img.arrayBuffer())
  } catch (error) {
    throw new ImageGenerationError(`图片下载失败：${(error as Error).message}`)
  }

  const payload = await getPayloadClient()
  const media = await payload.create({
    collection: 'media',
    data: { alt: `AI 生图 · ${opts.prompt.slice(0, 40)}` },
    file: {
      data: buffer,
      mimetype: 'image/png',
      name: `ai-image-${Date.now().toString(36)}.png`,
      size: buffer.length,
    },
    overrideAccess: true,
    depth: 0,
  })
  return {
    mediaId: String(media.id),
    url: media.url || `/api/media/file/${media.filename}`,
    width: data.usage?.output_width ?? 0,
    height: data.usage?.output_height ?? 0,
    model: opts.model,
    buffer,
    usedReference,
  }
}
