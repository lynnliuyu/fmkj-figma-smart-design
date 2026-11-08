import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import { isReleaseFileName, localReleaseFile, releasesBaseUrl } from '@/lib/desktop-releases'

/**
 * 桌面客户端安装包与自动更新清单：/downloads/desktop/<文件名>
 * 支持 HEAD、ETag、单段 Range（断点续传）；本地没有文件且配置了 DESKTOP_RELEASES_URL 时跳转到 CDN。
 */

const CONTENT_TYPES: Record<string, string> = {
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.dmg': 'application/x-apple-diskimage',
  '.zip': 'application/zip',
  '.blockmap': 'application/octet-stream',
  '.yml': 'text/yaml; charset=utf-8',
}

type Context = { params: Promise<{ file: string }> }

export function GET(request: Request, context: Context) {
  return serve(request, context, false)
}

export function HEAD(request: Request, context: Context) {
  return serve(request, context, true)
}

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/** 解析单段 Range；多段请求返回 null（按完整文件响应，electron-updater 会自动改为整包下载） */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, startText, endText] = match
  let start: number
  let end: number
  if (startText === '') {
    const suffix = Number(endText)
    if (!suffix) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1)
  }
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}

async function serve(request: Request, context: Context, headOnly: boolean) {
  const { file } = await context.params
  if (!isReleaseFileName(file)) return notFound()

  const local = await localReleaseFile(file)
  if (!local) {
    const base = releasesBaseUrl()
    return base ? Response.redirect(`${base}/${file}`, 302) : notFound()
  }

  const extension = path.extname(file).toLowerCase()
  const isFeed = extension === '.yml'
  const etag = `"${local.size.toString(16)}-${local.mtime.getTime().toString(16)}"`
  const headers = new Headers({
    'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Last-Modified': local.mtime.toUTCString(),
    ETag: etag,
    // 更新清单每次都要重新校验；安装包文件名带版本号，可以缓存
    'Cache-Control': isFeed ? 'no-cache' : 'public, max-age=604800',
  })
  if (!isFeed) headers.set('Content-Disposition', `attachment; filename="${file}"`)
  if (request.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers })

  const range = parseRange(request.headers.get('range'), local.size)
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${local.size}`)
    return new Response(null, { status: 416, headers })
  }
  const start = range ? range.start : 0
  const end = range ? range.end : local.size - 1
  headers.set('Content-Length', String(Math.max(0, end - start + 1)))
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${local.size}`)
  const status = range ? 206 : 200
  if (headOnly || local.size === 0) return new Response(null, { status, headers })

  const body = Readable.toWeb(
    createReadStream(/*turbopackIgnore: true*/ local.path, { start, end }),
  ) as unknown as ReadableStream<Uint8Array>
  return new Response(body, { status, headers })
}
