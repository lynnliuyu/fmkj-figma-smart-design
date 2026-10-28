import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'

const MAX_IMAGE = 3 * 1024 * 1024
const TEXT_FIELDS = { name: 60, slogan: 80, phone: 30, email: 80, address: 200, qrCaption: 40, quoteNotes: 2000 } as const
const fail = (status: number, error: string, field?: string) => Response.json({ ok: false, error, field }, { status })

/** 保存公司信息（仅员工管理员）。图片上传到 Media，再关联到全局设置。 */
export async function POST(request: Request) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')
  if (user.role !== 'admin') return fail(403, '只有管理员可以修改公司信息')

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
  if (!data.name) return fail(400, '请填写公司名称', 'name')

  const payload = await getPayloadClient()
  const images: Record<string, string | null> = {}
  for (const key of ['logo', 'qrCode'] as const) {
    if (form.get(`${key}Remove`) === '1') images[key] = null
    const file = form.get(key)
    if (!(file instanceof File) || file.size === 0) continue
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return fail(400, '图片仅支持 PNG、JPG、WebP、SVG', key)
    if (file.size > MAX_IMAGE) return fail(400, '图片不能超过 3MB', key)
    try {
      const media = await payload.create({
        collection: 'media',
        data: { alt: `${data.name} ${key === 'logo' ? 'Logo' : '二维码'}` },
        file: { data: Buffer.from(await file.arrayBuffer()), mimetype: file.type, name: file.name, size: file.size },
        user,
        // Media 默认只允许 CMS 管理员上传；此处已在上方校验员工管理员身份，且只写入受限类型和大小的图片。
        overrideAccess: true,
      })
      images[key] = String(media.id)
    } catch (error) {
      console.error('[settings] image upload failed', error)
      return fail(500, '图片上传失败，请稍后重试', key)
    }
  }

  try {
    const printProductImages = form.get('printProductImages') === 'on'
    await payload.updateGlobal({ slug: 'company-settings', data: { ...data, ...images, printProductImages } as never, user, overrideAccess: false })
    return Response.json({ ok: true })
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status === 403) return fail(403, '没有权限修改公司信息')
    console.error('[settings] save failed', error)
    return fail(500, '保存失败，请稍后重试')
  }
}
