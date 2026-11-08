import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { getPluginFlags } from '@/plugins/state'
import { getPayloadClient } from '@/lib/payload'
import { convertDwg, DwgConvertError, getDwgSettings } from '@/plugins/dwg-converter'

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/** 上传 DWG → 外部服务转换为 PNG → 存入 Media，返回图片地址供点位图作为户型底图。 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.getCurrentUser()
  if (!user) return fail(401, '登录已过期，请重新登录')

  const payload = await getPayloadClient()
  const settings = getDwgSettings(payload.config)
  if (!settings) return fail(503, 'DWG 转换服务未配置')

  const { id } = await params
  const project = await payload
    .findByID({
      collection: 'projects',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { name: true, owner: true },
    })
    .catch(() => null)
  if (!project) return fail(404, '项目不存在或已被删除')
  if (!(await getPluginFlags(relId(project.owner) || user.id))['dwg-import'])
    return fail(404, '「DWG 导入」插件已关闭')

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) return fail(400, '请选择 DWG 文件')
  if (!/\.dwg$/i.test(file.name)) return fail(400, '只支持 .dwg 文件')
  if (file.size > settings.maxBytes)
    return fail(413, `文件超过 ${Math.round(settings.maxBytes / 1024 / 1024)}MB`)

  try {
    const png = await convertDwg(settings, file)
    const name = `${file.name.replace(/\.dwg$/i, '')}.png`
    // 权限已在上方校验（可编辑项目的账号），这里由服务端代为写入 Media。
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${project.name} 户型图` },
      file: { data: png, mimetype: 'image/png', name, size: png.length },
      overrideAccess: true,
      depth: 0,
    })
    if (!media.url) return fail(500, '户型图已转换，但保存失败')
    return Response.json({ ok: true, url: media.url, mediaId: media.id, name })
  } catch (error) {
    if (error instanceof DwgConvertError) return fail(error.status, error.message)
    console.error('[dwg-converter] failed', error)
    return fail(500, '转换失败，请稍后重试')
  }
}
