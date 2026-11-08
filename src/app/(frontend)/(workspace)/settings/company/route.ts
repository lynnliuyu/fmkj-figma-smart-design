import { relId } from '@/lib/access'
import { allStyles, DOC_KIND_LIST, DOC_KINDS } from '@/documents/registry'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { PLUGINS } from '@/plugins'

const MAX_IMAGE = 3 * 1024 * 1024
const TEXT_FIELDS = {
  name: 60,
  slogan: 80,
  phone: 30,
  email: 80,
  address: 200,
  qrCaption: 40,
  quoteNotes: 2000,
  contractTerms: 5000,
} as const
const fail = (status: number, error: string, field?: string) =>
  Response.json({ ok: false, error, field }, { status })

/** 保存当前登录账号自己的抬头、默认内容、文档模板和插件开关（每个账号独立保存，互不覆盖）。 */
export async function POST(request: Request) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, '提交的数据格式无效')
  }

  const data: Record<string, string | null> = {}
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    const value = String(form.get(key) ?? '').trim()
    if (value.length > max) return fail(400, `内容过长（最多 ${max} 字）`, key)
    data[key] = value || null
  }
  if (!data.name) return fail(400, '请填写名称', 'name')

  const payload = await getPayloadClient()
  const images: Record<string, string | null> = {}
  for (const key of ['logo', 'qrCode'] as const) {
    if (form.get(`${key}Remove`) === '1') images[key] = null
    const file = form.get(key)
    if (!(file instanceof File) || file.size === 0) continue
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type))
      return fail(400, '图片仅支持 PNG、JPG、WebP、SVG', key)
    if (file.size > MAX_IMAGE) return fail(400, '图片不能超过 3MB', key)
    try {
      const media = await payload.create({
        collection: 'media',
        data: { alt: `${data.name} ${key === 'logo' ? 'Logo' : '二维码'}` },
        file: {
          data: Buffer.from(await file.arrayBuffer()),
          mimetype: file.type,
          name: file.name,
          size: file.size,
        },
        user,
        // Media 默认只允许 CMS 管理员上传；此处已校验成员登录，且只写入受限类型和大小的图片。
        overrideAccess: true,
      })
      images[key] = String(media.id)
    } catch (error) {
      console.error('[settings] image upload failed', error)
      return fail(500, '图片上传失败，请稍后重试', key)
    }
  }

  // 文档模板默认值：只接受已登记的风格和各文档自己的版式；表单里没有这部分时不改动已保存的值
  const knownStyles = new Set(allStyles().map((s) => s.id))
  const hasDocFields = DOC_KIND_LIST.some(
    (kind) => form.has(`doc-${kind}-style`) || form.has(`doc-${kind}-layout`),
  )
  const documentDefaults = hasDocFields
    ? Object.fromEntries(
        DOC_KIND_LIST.map((kind) => {
          const style = String(form.get(`doc-${kind}-style`) ?? '')
          const layout = String(form.get(`doc-${kind}-layout`) ?? '')
          return [
            kind,
            {
              ...(knownStyles.has(style) ? { style } : {}),
              ...(DOC_KINDS[kind].layouts.some((l) => l.value === layout) ? { layout } : {}),
            },
          ]
        }),
      )
    : undefined
  // 插件开关：没勾选的记为关闭（新安装的插件默认开启）
  const disabledPlugins =
    form.get('plugins-present') === '1'
      ? PLUGINS.filter((p) => form.get(`plugin-${p.id}`) !== 'on').map((p) => p.id)
      : undefined

  try {
    const printProductImages = form.get('printProductImages') === 'on'
    const existingUser = await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 0,
      overrideAccess: true,
      select: { companyProfile: true } as never,
    })
    const prevProfile =
      (existingUser as unknown as { companyProfile?: Record<string, unknown> | null })
        ?.companyProfile ?? {}
    const nextProfile: Record<string, unknown> = {
      ...prevProfile,
      ...data,
      logo: Object.prototype.hasOwnProperty.call(images, 'logo')
        ? images.logo
        : relId(prevProfile.logo) || null,
      qrCode: Object.prototype.hasOwnProperty.call(images, 'qrCode')
        ? images.qrCode
        : relId(prevProfile.qrCode) || null,
      printProductImages,
      ...(documentDefaults ? { documentDefaults } : {}),
      ...(disabledPlugins ? { disabledPlugins } : {}),
    }
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        companyProfile: nextProfile,
      } as never,
      overrideAccess: true,
      depth: 0,
    })
    return Response.json({ ok: true })
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status === 403) return fail(403, '没有权限修改设置')
    console.error('[settings] save failed', error)
    return fail(500, '保存失败，请稍后重试')
  }
}
