import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { SHEET } from '@/lib/sheet-spec'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * 上传点位图用到的图片，存入媒体库，返回地址：
 * - kind=sheet：浏览器裁切好的标准图纸（3:2）；
 * - kind=asset：画布上直接插入的其他图片。
 * 场景里只保存图片地址，项目数据保持很小。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')

  const { id } = await params
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { name: true },
    })
    .catch(() => null)
  if (!project) return fail(404, '项目不存在或已被删除')

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const kind = form?.get('kind') === 'asset' ? 'asset' : 'sheet'
  const name =
    String(form?.get('name') ?? '')
      .trim()
      .slice(0, 40) || (kind === 'sheet' ? '图纸' : '图片')
  if (!(file instanceof File) || file.size === 0) return fail(400, '请选择图片')
  const ext = TYPES[file.type]
  if (!ext) return fail(400, '只支持 PNG、JPG、WebP 图片')
  if (file.size > SHEET.maxUploadBytes)
    return fail(413, `图片超过 ${Math.round(SHEET.maxUploadBytes / 1024 / 1024)}MB`)
  const data = Buffer.from(await file.arrayBuffer())

  let width: number | null = null
  let height: number | null = null
  try {
    const sharp = (await import('sharp')).default
    const meta = await sharp(data).metadata()
    width = meta.width ?? null
    height = meta.height ?? null
  } catch {
    return fail(400, '图片无法读取，请换一张试试')
  }
  if (
    kind === 'sheet' &&
    width &&
    height &&
    Math.abs(width / height - SHEET.pixelWidth / SHEET.pixelHeight) > 0.02
  ) {
    return fail(400, '图纸需要先裁切成标准尺寸（3:2）')
  }

  try {
    // 权限已在上方校验（可编辑项目的账号），这里由服务端代为写入媒体库。
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${project.name} · ${name}` },
      file: {
        data,
        mimetype: file.type,
        name: `${kind}-${Date.now().toString(36)}.${ext}`,
        size: data.length,
      },
      overrideAccess: true,
      depth: 0,
    })
    if (!media.url) return fail(500, '图片保存失败，请稍后重试')
    return Response.json({ ok: true, mediaId: String(media.id), url: media.url, width, height })
  } catch (error) {
    console.error('[point-map] upload failed', error)
    return fail(500, '图片保存失败，请稍后重试')
  }
}
