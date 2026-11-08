import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import {
  DESKTOP_DOWNLOADS_PATH,
  type DesktopArch,
  type DesktopAsset,
  type DesktopFormat,
  type DesktopPlatformRelease,
  type DesktopReleaseManifest,
} from '@/lib/desktop-release-shared'

/**
 * 桌面客户端安装包（electron-builder 产物）的读取，只在服务端使用。
 * 安装包和 latest.yml / latest-mac.yml 放在 DESKTOP_RELEASES_DIR 目录（Docker 部署挂载为 /data/desktop），
 * 也可以放在对象存储 / CDN，用 DESKTOP_RELEASES_URL 指定公开地址前缀。
 */

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/
const ALLOWED_EXTENSIONS = new Set(['.exe', '.dmg', '.zip', '.blockmap', '.yml'])
const CACHE_MS = 60_000

// 安装包目录是运行时挂载的数据目录：turbopackIgnore 告诉打包器不要追踪它，
// 否则构建时会把整个项目都打进服务端产物。
export function releasesDir() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.DESKTOP_RELEASES_DIR ||
      path.join(/*turbopackIgnore: true*/ process.cwd(), 'desktop-releases'),
  )
}

export function releasesBaseUrl(): string | null {
  const value = process.env.DESKTOP_RELEASES_URL?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.href.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** 只允许目录下的安装包和更新清单（单层文件名，防止路径穿越） */
export function isReleaseFileName(name: string) {
  return (
    FILE_NAME.test(name) &&
    !name.includes('..') &&
    ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())
  )
}

export async function localReleaseFile(name: string) {
  if (!isReleaseFileName(name)) return null
  const filePath = path.join(/*turbopackIgnore: true*/ releasesDir(), name)
  try {
    const info = await stat(/*turbopackIgnore: true*/ filePath)
    return info.isFile() ? { path: filePath, size: info.size, mtime: info.mtime } : null
  } catch {
    return null
  }
}

async function readFeed(name: string): Promise<string | null> {
  const local = await localReleaseFile(name)
  if (local) return readFile(/*turbopackIgnore: true*/ local.path, 'utf8')
  const base = releasesBaseUrl()
  if (!base) return null
  try {
    const response = await fetch(`${base}/${name}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

type Feed = {
  version: string | null
  releaseDate: string | null
  files: { url: string; size: number | null }[]
}

/** 解析 electron-builder 生成的更新清单中需要的字段 */
export function parseFeed(text: string): Feed {
  const field = (name: string) =>
    new RegExp(`^${name}:\\s*['"]?([^'"\\r\\n]+?)['"]?\\s*$`, 'm').exec(text)?.[1] ?? null
  const files: Feed['files'] = []
  for (const line of text.split(/\r?\n/)) {
    const url = /^\s*-\s*url:\s*['"]?([^'"]+?)['"]?\s*$/.exec(line)
    if (url) {
      files.push({ url: url[1], size: null })
      continue
    }
    const size = /^\s+size:\s*(\d+)\s*$/.exec(line)
    if (size && files.length) files[files.length - 1].size = Number(size[1])
  }
  return { version: field('version'), releaseDate: field('releaseDate'), files }
}

function archOf(file: string): DesktopArch {
  if (/arm64/i.test(file)) return 'arm64'
  if (/universal/i.test(file)) return 'universal'
  return 'x64'
}

function toRelease(text: string | null, formats: DesktopFormat[]): DesktopPlatformRelease | null {
  if (!text) return null
  const feed = parseFeed(text)
  if (!feed.version) return null
  const assets: DesktopAsset[] = []
  for (const file of feed.files) {
    const format = path.extname(file.url).slice(1).toLowerCase() as DesktopFormat
    if (!formats.includes(format) || !isReleaseFileName(file.url)) continue
    assets.push({
      file: file.url,
      url: `${DESKTOP_DOWNLOADS_PATH}/${file.url}`,
      size: file.size,
      arch: archOf(file.url),
      format,
    })
  }
  return assets.length ? { version: feed.version, releaseDate: feed.releaseDate, assets } : null
}

let cache: { at: number; value: DesktopReleaseManifest } | null = null

/** 当前发布的桌面客户端（内存缓存 60 秒：上传新版本后最多一分钟生效） */
export async function getDesktopReleases(): Promise<DesktopReleaseManifest> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  const [windows, mac] = await Promise.all([readFeed('latest.yml'), readFeed('latest-mac.yml')])
  const value: DesktopReleaseManifest = {
    app: 'fanmeng-space',
    windows: toRelease(windows, ['exe']),
    mac: toRelease(mac, ['dmg', 'zip']),
  }
  cache = { at: Date.now(), value }
  return value
}
