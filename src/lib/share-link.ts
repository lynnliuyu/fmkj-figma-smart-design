import { getPayloadClient } from '@/lib/payload'
import { shareLinkMatches } from '@/lib/project-access'

/**
 * 按业主分享链接的凭证找到项目 ID（服务端使用）。
 * 只读取 id 与 shareConfig，避免扫描项目表时把点位图大 JSON 读进内存；凭证必须完全一致且链接未关闭。
 */
export async function findProjectIdByShareToken(token: string): Promise<string | null> {
  const trimmed = typeof token === 'string' ? token.trim() : ''
  if (trimmed.length < 12 || trimmed.length > 80) return null
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'projects',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    select: { shareConfig: true } as never,
  })
  const docs = res.docs as unknown as { id: string | number; shareConfig?: unknown }[]
  const match = docs.find((p) => shareLinkMatches(p.shareConfig, trimmed))
  return match ? String(match.id) : null
}
