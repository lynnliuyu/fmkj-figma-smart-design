/**
 * issue #179 素材库验证脚本：起本地静态服务 → 浏览/筛选/搜索/下载 → 校验清单与实际文件。
 *
 * 运行：node scripts/asset-library/verify.mjs
 * 产物：.export-artifacts/asset-library/verify/（截图、下载文件、verification.json）
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
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

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

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

  // ── 单文件隔离验证：只提供 index.html（父目录空，无 assets/）─────────
  const SINGLE = join(VERIFY, 'single')
  rmSync(SINGLE, { recursive: true, force: true })
  mkdirSync(SINGLE, { recursive: true })
  copyFileSync(join(OUT, 'index.html'), join(SINGLE, 'index.html'))
  const singleRequests = []
  const singleServer = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    singleRequests.push(url)
    const rel = url === '/' ? '/index.html' : url
    const path = normalize(join(SINGLE, rel))
    if (rel !== '/index.html' || !path.startsWith(SINGLE) || !existsSync(path)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(readFileSync(path))
  })
  await new Promise((r) => singleServer.listen(3212, '127.0.0.1', r))

  const sctx = await browser.newContext({
    viewport: { width: 1440, height: 3000 },
    locale: 'zh-CN',
    acceptDownloads: true,
  })
  const sp = await sctx.newPage()
  const sErrs = []
  sp.on('pageerror', (e) => sErrs.push(e.message.slice(0, 200)))
  sp.on('console', (m) => {
    if (m.type() === 'error') sErrs.push(m.text().slice(0, 200))
  })
  await sp.goto('http://127.0.0.1:3212/index.html', { waitUntil: 'load' })
  await sleep(1600)
  await sp.screenshot({ path: join(VERIFY, 'single-file.png') })

  const media = await sp.evaluate(() => {
    const imgs = [...document.querySelectorAll('.thumb img')]
    const vids = [...document.querySelectorAll('.thumb video')]
    return {
      cards: document.querySelectorAll('.card').length,
      images: imgs.length,
      imagesOk: imgs.every((i) => i.complete && i.naturalWidth > 0),
      imagesBad: imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.alt),
      videos: vids.length,
      videosOk: vids.every((v) => v.readyState >= 1 && !v.error),
      videosBad: vids
        .filter((v) => v.readyState < 1 || v.error)
        .map((v) => (v.currentSrc || '').slice(0, 48)),
      allInline: [...imgs, ...vids].every((el) =>
        (el.currentSrc || el.src || '').startsWith('data:'),
      ),
    }
  })

  // 筛选/搜索在单文件下仍工作
  await sp.locator('#cats .chip', { hasText: 'motion' }).click()
  await sleep(300)
  const singleMotion = await sp.locator('.card:visible').count()
  await sp.locator('#cats .chip', { hasText: '全部' }).click()
  await sp.locator('#q').fill('button')
  await sleep(300)
  const singleSearch = await sp.locator('.card:visible').count()
  await sp.locator('#q').fill('')

  // 下载字节与原件一致（主下载 + 按钮多态下载）
  const downloadChecks = []
  const pick = async (locator) => {
    const [dl] = await Promise.all([sp.waitForEvent('download'), locator.click()])
    const name = dl.suggestedFilename()
    const saved = join(VERIFY, 'single', `downloaded-${name}`)
    await dl.saveAs(saved)
    const entry = manifest.entries.find(
      (e) =>
        e.file.split('/').pop() === name ||
        (e.states || []).some((st) => st.file.split('/').pop() === name),
    )
    const original = entry
      ? (entry.states || []).find((st) => st.file.split('/').pop() === name)?.file || entry.file
      : null
    const ok = original ? sha256(saved) === sha256(join(OUT, original)) : false
    downloadChecks.push({ name, ok, saved: relative(OUT, saved), original })
  }
  await pick(sp.locator('.card:visible .dl').first())
  await sp.locator('#cats .chip', { hasText: 'button' }).click()
  await sleep(300)
  await pick(sp.locator('.card:visible .mini').first())

  const unexpectedRequests = singleRequests.filter((u) => u !== '/' && u !== '/index.html')
  const singleFile = {
    onlyIndexHtml: existsSync(join(SINGLE, 'index.html')),
    requests: singleRequests,
    unexpectedRequests,
    ...media,
    singleMotion,
    singleSearch,
    downloadChecks,
    consoleErrors: sErrs,
  }
  await sp.close()
  await sctx.close()
  await new Promise((r) => singleServer.close(r))

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
    singleFile,
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
        singleFile: {
          imagesOk: singleFile.imagesOk,
          images: singleFile.images,
          videosOk: singleFile.videosOk,
          videos: singleFile.videos,
          unexpectedRequests: singleFile.unexpectedRequests,
          downloadsOk: singleFile.downloadChecks.every((d) => d.ok),
        },
      },
      null,
      1,
    ),
  )
  const singleFileOk =
    singleFile.imagesOk &&
    singleFile.videosOk &&
    singleFile.allInline &&
    singleFile.unexpectedRequests.length === 0 &&
    singleFile.downloadChecks.every((d) => d.ok) &&
    sErrs.length === 0
  process.exit(result.failures.length || errs.length || !singleFileOk ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
