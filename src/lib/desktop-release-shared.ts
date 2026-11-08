/** 桌面客户端发布信息：服务端与下载页（客户端组件）共用的类型和纯函数。 */

export type DesktopArch = 'x64' | 'arm64' | 'universal'
export type DesktopFormat = 'exe' | 'dmg' | 'zip'

export type DesktopAsset = {
  file: string
  url: string
  size: number | null
  arch: DesktopArch
  format: DesktopFormat
}

export type DesktopPlatformRelease = {
  version: string
  releaseDate: string | null
  assets: DesktopAsset[]
}

export type DesktopReleaseManifest = {
  app: 'fanmeng-space'
  windows: DesktopPlatformRelease | null
  mac: DesktopPlatformRelease | null
}

/** 安装包与自动更新清单的公开路径（桌面客户端的更新地址也指向这里） */
export const DESKTOP_DOWNLOADS_PATH = '/downloads/desktop'

export const DESKTOP_FORMAT_LABELS: Record<DesktopFormat, string> = {
  exe: '安装程序 .exe',
  dmg: '磁盘映像 .dmg',
  zip: '压缩包 .zip',
}

/**
 * 选出某平台、某芯片架构推荐下载的文件：架构完全匹配优先，其次通用包；
 * 安装程序 / DMG 优先于 ZIP。strict 为 true 时不回退到其它架构。
 */
export function pickDesktopAsset(
  release: DesktopPlatformRelease | null | undefined,
  arch: DesktopArch,
  strict = false,
): DesktopAsset | null {
  if (!release) return null
  const score = (asset: DesktopAsset) => {
    const archScore = asset.arch === arch ? 0 : asset.arch === 'universal' ? 1 : strict ? null : 2
    return archScore === null ? null : archScore * 10 + (asset.format === 'zip' ? 1 : 0)
  }
  let best: DesktopAsset | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const asset of release.assets) {
    const value = score(asset)
    if (value !== null && value < bestScore) {
      best = asset
      bestScore = value
    }
  }
  return best
}

export function formatBytes(size: number | null) {
  if (!size) return '—'
  const mb = size / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}
