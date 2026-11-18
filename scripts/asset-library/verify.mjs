/**
 * issue #179 素材库验证脚本：起本地静态服务 → 浏览/筛选/搜索/下载 → 校验清单与实际文件。
 *
 * 运行：node scripts/asset-library/verify.mjs
 * 产物：.export-artifacts/asset-library/verify/（截图、下载文件、verification.json）
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, relative } from 'node:path'
import sharp from 'sharp'

const OUT = process.env.ASSET_OUT || join(process.cwd(), '.export-artifacts/asset-library')
const VERIFY = join(OUT, 'verify')
const PORT = 3211
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.md': 'text/markdown; charset=utf-8',
}

function serve() {
  return createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    const rel = url === '/' ? '/index.html' : url
    const path = normalize(join(OUT, rel))
    if (!path.startsWith(OUT) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' })
    res.end(readFileSync(path))
  })
}

function ffprobe(path) {
  try {
    const d = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
        { encoding: 'utf8' },
      ),
    )
    const v = (d.streams || []).find((s) => s.codec_type === 'video') || {}
    return {
      codec: v.codec_name,
      width: v.width,
      height: v.height,
      durationMs: Math.round(Number(d.format?.duration || 0) * 1000),
    }
  } catch {
    return null
  }
}

async function main() {
  mkdirSync(join(VERIFY, 'downloads'), { recursive: true })
  const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'))

  // 1) 清单自检：文件在、尺寸/时长对得上
  const checks = []
  for (const e of manifest.entries) {
    const path = join(OUT, e.file)
    const exists = existsSync(path)
    let ok = exists
    let detail = null
    if (exists && e.format === 'png') {
      const m = await sharp(path).metadata()
      detail = { width: m.width, height: m.height }
      ok = (!e.width || e.width === m.width) && (!e.height || e.height === m.height)
    } else if (exists && e.format === 'mp4') {
      detail = ffprobe(path)
      ok = detail?.codec === 'h264' && (!e.width || e.width === detail.width)
    }
    checks.push({ id: e.id, category: e.category, file: e.file, exists, ok, detail })
  }

  // 2) 静态服务 + 浏览器浏览/筛选/搜索/下载
  const server = serve()
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    acceptDownloads: true,
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text().slice(0, 200))
  })

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' })
  await sleep(1200)
  await page.screenshot({ path: join(VERIFY, 'library-all.png'), fullPage: false })
  const total = await page.locator('.card').count()

  // 筛选：motion
  await page.locator('#cats .chip', { hasText: 'motion' }).click()
  await sleep(500)
  const motionVisible = await page.locator('.card:visible').count()
  await page.screenshot({ path: join(VERIFY, 'filter-motion.png') })

  // 搜索：button（回到全部类别）
  await page.locator('#cats .chip', { hasText: '全部' }).click()
  await page.locator('#q').fill('button')
  await sleep(500)
  const searchVisible = await page.locator('.card:visible').count()
  await page.screenshot({ path: join(VERIFY, 'search-button.png') })

  // 下载：主按钮状态图（多态卡片用第一个 mini 链接）+ 一张产品图
  await page.locator('#q').fill('')
  await page.locator('#cats .chip', { hasText: 'product' }).click()
  await sleep(400)
  const dlLink = page.locator('.card:visible .dl').first()
  const [download] = await Promise.all([page.waitForEvent('download'), dlLink.click()])
  const downloaded = join(VERIFY, 'downloads', download.suggestedFilename())
  await download.saveAs(downloaded)
  await page.screenshot({ path: join(VERIFY, 'download.png') })

  // 下载按钮多态 zip? 直接再取一个 button state
  await page.locator('#cats .chip', { hasText: 'button' }).click()
  await sleep(400)
  const mini = page.locator('.card:visible .mini').first()
  if (await mini.count()) {
    const [d2] = await Promise.all([page.waitForEvent('download'), mini.click()])
    await d2.saveAs(join(VERIFY, 'downloads', d2.suggestedFilename()))
  }

  await browser.close()
  server.close()

  const result = {
    generatedAt: new Date().toISOString(),
    counts: manifest.entries.reduce(
      (acc, e) => ((acc[e.category] = (acc[e.category] || 0) + 1), acc),
      {},
    ),
    cards: total,
    motionVisible,
    searchVisible,
    downloaded: relative(VERIFY, downloaded),
    checks,
    failures: checks.filter((c) => !c.ok),
    consoleErrors: errs,
    motionImport: {
      // Motion 可直接 Import 的格式检查：PNG 位图 + H.264 MP4
      png: checks.filter((c) => c.detail?.width && c.detail?.height).length,
      h264Mp4: checks.filter((c) => c.detail?.codec === 'h264').length,
    },
  }
  writeFileSync(join(VERIFY, 'verification.json'), JSON.stringify(result, null, 2))
  console.log(
    JSON.stringify(
      {
        counts: result.counts,
        cards: total,
        motionVisible,
        searchVisible,
        failures: result.failures.length,
        consoleErrors: errs.length,
      },
      null,
      1,
    ),
  )
  process.exit(result.failures.length || errs.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
