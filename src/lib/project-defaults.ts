import { getCatalog } from '@/lib/cached-data'
import { isDeviceType } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import { parseDefaults, type ProjectDefaults } from '@/lib/point-map-items'
import type { User } from '@/payload-types'

export type SetDefaultResult = { ok: true; defaults: ProjectDefaults } | { ok: false; error: string; status: number }

/**
 * 设置 / 清除项目某个设备类型的默认型号。
 * 服务端校验：设备类型在字典内、产品存在且在售、产品设备类型与之一致；项目按用户权限读写。
 */
export async function setProjectDefault(user: User, projectId: string, deviceType: unknown, productId: unknown): Promise<SetDefaultResult> {
  if (!isDeviceType(deviceType)) return { ok: false, error: '设备类型无效', status: 400 }
  if (productId !== null && (typeof productId !== 'string' || !productId)) return { ok: false, error: '产品无效', status: 400 }
  if (typeof productId === 'string') {
    const product = (await getCatalog()).find((p) => p.id === productId)
    if (!product || product.status !== 'active') return { ok: false, error: '该产品不存在或已下架', status: 400 }
    if (product.deviceType !== deviceType) return { ok: false, error: '产品的设备类型与所选类型不一致', status: 400 }
  }
  const payload = await getPayloadClient()
  const project = await payload
    .findByID({ collection: 'projects', id: projectId, depth: 0, user, overrideAccess: false, select: { defaultProducts: true } })
    .catch(() => null)
  if (!project) return { ok: false, error: '项目不存在或已被删除', status: 404 }
  const defaults = parseDefaults(project.defaultProducts)
  if (productId) defaults[deviceType] = productId as string
  else delete defaults[deviceType]
  try {
    await payload.update({ collection: 'projects', id: projectId, data: { defaultProducts: defaults }, user, overrideAccess: false, depth: 0, select: { updatedAt: true } })
    return { ok: true, defaults }
  } catch (error) {
    if ((error as { status?: number })?.status === 403) return { ok: false, error: '没有权限修改该项目', status: 403 }
    console.error('[project-defaults] save failed', error)
    return { ok: false, error: '保存失败，请稍后重试', status: 500 }
  }
}
