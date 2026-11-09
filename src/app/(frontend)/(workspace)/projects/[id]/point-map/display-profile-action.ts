'use server'

import { APIError } from 'payload'

import { appAuth } from '@/lib/app-auth'
import { isDisplayProfileId } from '@/lib/display-profile'
import { getPayloadClient } from '@/lib/payload'

/**
 * 保存项目的点位图显示方案。
 *
 * 权限：走 `overrideAccess: false` + 传 user，由 Projects 集合自身的
 * access 规则判断（owner / edit 可写，read 不可）。不在这里重复写权限逻辑。
 */
export async function setDisplayProfile(
  projectId: string,
  profileId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDisplayProfileId(profileId)) return { ok: false, error: '未知的显示方案' }

  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }

  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'projects',
      id: projectId,
      data: { displayProfile: profileId },
      user,
      overrideAccess: false,
      depth: 0,
      select: { displayProfile: true } as never,
    })
    return { ok: true }
  } catch (error) {
    if (error instanceof APIError && error.status < 500) return { ok: false, error: error.message }
    console.error('[point-map] save display profile failed', error)
    return { ok: false, error: '保存失败，请稍后重试' }
  }
}
