import { pickDesktopAsset, type DesktopArch } from '@/lib/desktop-release-shared'
import { getDesktopReleases } from '@/lib/desktop-releases'

const TARGETS: Record<string, { platform: 'windows' | 'mac'; arch: DesktopArch }> = {
  windows: { platform: 'windows', arch: 'x64' },
  'mac-arm64': { platform: 'mac', arch: 'arm64' },
  'mac-x64': { platform: 'mac', arch: 'x64' },
}

/**
 * 固定下载地址（可印在宣传物料上）：/downloads/desktop/latest/windows | mac-arm64 | mac-x64
 * 跳转到当前版本的安装包；还没有发布时回到下载页。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  const spec = TARGETS[target]
  if (!spec)
    return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const releases = await getDesktopReleases()
  const asset = pickDesktopAsset(releases[spec.platform], spec.arch, true)
  return new Response(null, {
    status: 302,
    headers: { Location: asset ? asset.url : '/download', 'Cache-Control': 'no-store' },
  })
}
