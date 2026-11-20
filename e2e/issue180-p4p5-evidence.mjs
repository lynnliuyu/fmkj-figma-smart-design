/**
 * issue #180 P4/P5 —— 能力中心 + 公开站外壳控件迁移的改前/改后取证脚本。
 *
 * 同一状态取整页截图（不裁剪单个元素）：桌面浅色 / 桌面深色 / 390 窄屏 × 6 个页面，
 * 并逐项实测交互（能力中心入口卡跳转、详情页返回、阶段筛选、docs 搜索与目录跳转、
 * 上一章下一章、下载页链接、catalog/templates 列表与空态），检查 console 0 错误、
 * 390 无横向溢出。
 *
 * 用法:
 *   BASE=http://127.0.0.1:3184 node e2e/issue180-p4p5-evidence.mjs before
 *   BASE=http://127.0.0.1:3185 node e2e/issue180-p4p5-evidence.mjs after
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:3185'
const TAG = process.argv[2] || 'after'
const OUT = join(process.cwd(), `.export-artifacts/astryx-p4p5/shots-${TAG}`)
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EMAIL = process.env.SMOKE_EMAIL || 'demo@fmkj.local'
const PASS = process.env.SMOKE_PASS || 'demo12345'

/** 结果收集 */
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` —— ${detail}` : ''}`)
}

function attachErrorLogger(page, errs) {
  page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message.slice(0, 200)}`))
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !/WebSocket|hmr|DevTools|favicon|net::ERR|Failed to load resource/i.test(m.text())
    )
      errs.push(m.text().slice(0, 200))
  })
}

/**
 * 整页截图：把视口拉高到内容全高后截整屏（不是元素裁剪）。
 * 工作区页面 AppShell 内部滚动容器不吃 fullPage，公开页 body 滚动 fullPage 可用；
 * 统一用「测量内容高度 → 拉高视口 → 截屏」最稳。
 */
async function fullPageShot(page, path) {
  await sleep(1200)
  const heights = await page.evaluate(() => {
    const de = document.documentElement
    let max = Math.max(de.scrollHeight, document.body.scrollHeight)
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollHeight > el.clientHeight + 8 && el.clientHeight > 200) {
        max = Math.max(max, el.scrollHeight)
      }
    }
    return Math.min(Math.ceil(max), 16000)
  })
  // 先滚到底再回来，触发懒加载图片
  await page.mouse.wheel(0, heights)
  await sleep(500)
  await page.mouse.wheel(0, -heights)
  await sleep(300)
  const vw = page.viewportSize()?.width ?? 1440
  const vh = page.viewportSize()?.height ?? 900
  await page.setViewportSize({ width: vw, height: heights })
  await sleep(400)
  await page.screenshot({ path })
  await page.setViewportSize({ width: vw, height: vh })
  await sleep(200)
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 30000 })
  await sleep(1500)
  const tab = page
    .locator('button.astryx-tab')
    .filter({ hasText: /邮箱/ })
    .first()
  if (await tab.count()) {
    await tab.click()
    await sleep(400)
  }
  await page.waitForSelector('#email', { timeout: 30000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASS)
  await page.click('button[type=submit]')
  await page.waitForURL(/projects|capabilities/, { timeout: 30000 })
  await sleep(1500)
}

/** 名称可点物：迁移前后 role 可能是 link 或 button，按名字找 */
function byName(page, name, exact = false) {
  return page.getByRole('link', { name, exact }).or(page.getByRole('button', { name, exact }))
}

const PAGES = [
  { n: 'capabilities', path: '/capabilities', auth: true },
  { n: 'plugin-detail', path: '/capabilities/ai-copilot', auth: true },
  { n: 'docs', path: '/docs' },
  { n: 'download', path: '/download' },
  { n: 'catalog', path: '/catalog' },
  { n: 'templates', path: '/templates' },
]

async function main() {
  const browser = await chromium.launch({ headless: true })
  const errs = []

  // ════════ 1) 截图：6 页 × 3 模式，全局递增编号 01–18 ════════
  let shotNo = 0
  for (const spec of PAGES) {
    const no = () => String(++shotNo).padStart(2, '0')

    // 桌面浅色
    {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
        colorScheme: 'light',
      })
      const page = await ctx.newPage()
      attachErrorLogger(page, errs)
      if (spec.auth) await login(page)
      await page.goto(`${BASE}${spec.path}`, { waitUntil: 'load', timeout: 30000 })
      await sleep(2000)
      await fullPageShot(page, join(OUT, `${no()}-${spec.n}-light.png`))
      await ctx.close()
    }

    // 桌面深色（同页继续：next-themes 写 html.dark + localStorage）
    {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
        colorScheme: 'dark',
      })
      const page = await ctx.newPage()
      attachErrorLogger(page, errs)
      await page.addInitScript(() => {
        try {
          localStorage.setItem('theme', 'dark')
          document.documentElement?.classList?.add?.('dark')
        } catch {
          /* 首帧 documentElement 未就绪时忽略，next-themes 会自己接管 */
        }
      })
      if (spec.auth) await login(page)
      await page.goto(`${BASE}${spec.path}`, { waitUntil: 'load', timeout: 30000 })
      await sleep(2000)
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
      await fullPageShot(page, join(OUT, `${no()}-${spec.n}-dark.png`))
      check(`${spec.n} 深色模式生效`, isDark)
      await ctx.close()
    }

    // 390 窄屏
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: 'zh-CN',
        colorScheme: 'light',
        isMobile: true,
        hasTouch: true,
      })
      const page = await ctx.newPage()
      attachErrorLogger(page, errs)
      if (spec.auth) await login(page)
      await page.goto(`${BASE}${spec.path}`, { waitUntil: 'load', timeout: 30000 })
      await sleep(2000)
      await fullPageShot(page, join(OUT, `${no()}-${spec.n}-narrow.png`))
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      check(`${spec.n} 390 无横向溢出`, overflow <= 1, `scrollWidth-clientWidth=${overflow}`)
      await ctx.close()
    }
  }

  // ════════ 2) 逐项交互实测（登录态） ════════
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await ctx.newPage()
  attachErrorLogger(page, errs)
  await login(page)

  // —— 能力中心：入口卡点击跳转 ——
  await page.goto(`${BASE}/capabilities`, { waitUntil: 'load' })
  await sleep(1800)
  const firstCardDetail = byName(page, '详情').first()
  const cardVisible = await firstCardDetail.isVisible()
  check('能力中心入口卡「详情」可见', cardVisible)
  if (cardVisible) {
    await firstCardDetail.click()
    await page.waitForURL(/\/capabilities\/[a-z-]+$/, { timeout: 10000 })
    const url1 = new URL(page.url())
    check('入口卡点击跳转详情', /^\/capabilities\/[a-z-]+$/.test(url1.pathname), url1.pathname)
    // —— 详情页返回 ——
    const back = byName(page, '返回能力中心').first()
    await back.click()
    await page.waitForURL(/\/capabilities$/, { timeout: 10000 })
    check('详情页返回能力中心', new URL(page.url()).pathname === '/capabilities')
  }

  // —— 能力中心：阶段筛选 ——
  await page.goto(`${BASE}/capabilities`, { waitUntil: 'load' })
  await sleep(1500)
  // 旧实现是 role=tab 链接条，新实现是官方 TabList；两者都在「阶段」导航里
  const stageNav = page.locator('nav[aria-label="阶段"]').first()
  const quoteTab = stageNav.getByText('报价与方案', { exact: true }).first()
  if (await quoteTab.isVisible()) {
    await quoteTab.click()
    await page.waitForURL(/stage=quote/, { timeout: 10000 })
    const q = new URL(page.url())
    check(
      '阶段筛选：报价与方案',
      q.pathname === '/capabilities' && q.searchParams.get('stage') === 'quote',
      page.url().replace(BASE, ''),
    )
    const h2s = await page.locator('section h2').allTextContents()
    check('筛选结果只剩相关分组', h2s.length >= 1, `分组数=${h2s.length}`)
    const allTab = stageNav.getByText('全部阶段', { exact: true }).first()
    await allTab.click()
    await page.waitForURL((u) => !u.searchParams.get('stage'), { timeout: 10000 })
    const back = new URL(page.url())
    check('阶段筛选：返回全部', !back.searchParams.get('stage'), page.url().replace(BASE, ''))
  } else {
    check('阶段筛选控件可见', false, '未找到「报价与方案」筛选项')
  }

  // —— docs：目录跳转 ——
  await page.goto(`${BASE}/docs`, { waitUntil: 'load' })
  await sleep(2000)
  const tocItem = byName(page, '04. 报价台与双向无缝联动').first()
  check('docs 目录项可见', await tocItem.isVisible())
  await tocItem.click()
  await sleep(900)
  const h1a = await page.locator('main h1').first().textContent()
  check('docs 目录跳转到报价台', /报价台/.test(h1a || ''), `h1=${(h1a || '').slice(0, 30)}`)
  const hash = await page.evaluate(() => window.location.hash)
  check('docs 目录跳转写 URL hash', hash === '#quotes', hash)

  // —— docs：⌘K 搜索 ——
  const trigger = page.getByLabel('搜索文档（⌘K）').first()
  check('docs 搜索触发器可见', await trigger.isVisible())
  // 键盘：聚焦后 Enter 打开（官方 Dialog 是原生 <dialog> 元素）
  await trigger.focus()
  await page.keyboard.press('Enter')
  await sleep(600)
  const dialogOpen = await page.locator('dialog[open]').count()
  check('docs 搜索弹窗打开（Enter）', dialogOpen > 0)
  const input = page.locator('dialog input').first()
  if (await input.count()) {
    await input.fill('快捷键')
    await sleep(500)
    const hasResult = (await page.locator('dialog').textContent())?.includes('点位图画板快捷键速查')
    check('docs 搜索有结果', Boolean(hasResult))
    const quickItem = page
      .locator('dialog')
      .getByRole('button', { name: '点位图画板快捷键速查' })
      .first()
    await quickItem.click()
    await sleep(900)
    const h1b = await page.locator('main h1').first().textContent()
    check('docs 搜索结果跳转', /快捷键速查/.test(h1b || ''), `h1=${(h1b || '').slice(0, 30)}`)
  } else {
    check('docs 搜索输入框存在', false)
  }

  // —— docs：上一章 / 下一章 ——
  await page.goto(`${BASE}/docs`, { waitUntil: 'load' })
  await sleep(1500)
  const nextCard = byName(page, /下一章 · 开始使用 5 分钟快速上手/, false).first()
  check('docs 下一章卡片可见', await nextCard.isVisible())
  // 键盘：聚焦后 Enter 翻章
  await nextCard.focus()
  await page.keyboard.press('Enter')
  await sleep(900)
  const h1c = await page.locator('main h1').first().textContent()
  check(
    'docs 下一章跳转（Enter）',
    /5 分钟快速上手/.test(h1c || ''),
    `h1=${(h1c || '').slice(0, 30)}`,
  )
  const prevCard = byName(page, /上一章 · 开始使用 使用手册总览/, false).first()
  check('docs 上一章卡片可见', await prevCard.isVisible())
  // 官方 ClickableCard 的键盘停靠是卡内隐藏按钮；指针用户点卡片表面
  const prevSurface = prevCard.locator(
    'xpath=ancestor::*[contains(@class,"astryx-clickable-card")][1]',
  )
  const surfaceCount = await prevSurface.count()
  if (surfaceCount > 0) {
    await prevSurface.click()
  } else {
    await prevCard.click()
  }
  await sleep(900)
  const h1d = await page.locator('main h1').first().textContent()
  check('docs 上一章跳转', /使用手册/.test(h1d || ''), `h1=${(h1d || '').slice(0, 30)}`)

  // —— docs 总览五步闭环卡：点卡片表面跳章 ——
  await page.goto(`${BASE}/docs`, { waitUntil: 'load' })
  await sleep(1500)
  const loopCard = page
    .locator('[class*="astryx-clickable-card"]')
    .filter({ hasText: '项目信息与协作' })
    .first()
  if (await loopCard.count()) {
    await loopCard.click()
    await sleep(900)
    const h1e = await page.locator('main h1').first().textContent()
    check('docs 总览闭环卡点击跳转', /项目管理/.test(h1e || ''), `h1=${(h1e || '').slice(0, 30)}`)
  } else {
    // 旧实现是裸 button，直接点
    const loopBtn = page.getByRole('button', { name: /项目信息与协作/ }).first()
    await loopBtn.click()
    await sleep(900)
    const h1e = await page.locator('main h1').first().textContent()
    check('docs 总览闭环卡点击跳转', /项目管理/.test(h1e || ''), `h1=${(h1e || '').slice(0, 30)}`)
  }

  // —— 下载页：安装包直链（拦截 manifest 造一个隔离可测的发布清单） ——
  await page.route('**/downloads/desktop/manifest', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        app: 'fanmeng-space',
        windows: {
          version: '9.9.9',
          releaseDate: null,
          assets: [
            {
              file: 'Fanmeng-Setup-9.9.9.exe',
              url: '/downloads/desktop/Fanmeng-Setup-9.9.9.exe',
              size: 104857600,
              arch: 'x64',
              format: 'exe',
            },
          ],
        },
        mac: {
          version: '9.9.9',
          releaseDate: null,
          assets: [
            {
              file: 'Fanmeng-9.9.9-arm64.dmg',
              url: '/downloads/desktop/Fanmeng-9.9.9-arm64.dmg',
              size: 104857600,
              arch: 'arm64',
              format: 'dmg',
            },
            {
              file: 'Fanmeng-9.9.9-x64.dmg',
              url: '/downloads/desktop/Fanmeng-9.9.9-x64.dmg',
              size: 104857600,
              arch: 'x64',
              format: 'dmg',
            },
          ],
        },
      }),
    }),
  )
  await page.goto(`${BASE}/download`, { waitUntil: 'load' })
  await sleep(2500)
  const downloadLinks = await page.locator('a[href^="/downloads/desktop/"]').count()
  check('下载页有安装包直链', downloadLinks >= 2, `直链数=${downloadLinks}`)
  const heroCta = await page
    .locator('a[href^="/downloads/desktop/"]')
    .filter({ hasText: /下载/ })
    .count()
  check('下载页首屏 CTA 是直链 <a>', heroCta >= 1, `CTA=${heroCta}`)
  await page.unroute('**/downloads/desktop/manifest')
  // 未发布时的空态：回退到「使用网页版」/「即将上线」
  await page.goto(`${BASE}/download`, { waitUntil: 'load' })
  await sleep(2500)
  const emptyPlatform = await page
    .locator('[aria-disabled="true"], button[disabled]')
    .filter({ hasText: '即将上线' })
    .count()
  const webFallback = await byName(page, /使用网页版|查看全部平台/, false).count()
  check(
    '下载页未发布时的回退（空态）',
    emptyPlatform >= 1 && webFallback >= 1,
    `即将上线=${emptyPlatform} 回退=${webFallback}`,
  )

  await ctx.close()

  // —— 公开列表页（未登录态）：catalog / templates 渲染与空态分支 ——
  {
    const pctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    })
    const ppage = await pctx.newPage()
    attachErrorLogger(ppage, errs)
    await ppage.goto(`${BASE}/catalog`, { waitUntil: 'load' })
    await sleep(2000)
    const catalogText = await ppage.locator('main').first().textContent()
    const hasProducts = /各系统主流选型参考/.test(catalogText || '')
    const hasEmpty = /各系统图例与施工规范/.test(catalogText || '')
    check(
      'catalog 列表渲染（在售/图例分支一致）',
      hasProducts || hasEmpty,
      hasProducts ? '在售产品分支' : '图例分支',
    )
    check('catalog 图例区渲染', /标准点位图例与水电施工预留规范/.test(catalogText || ''))

    await ppage.goto(`${BASE}/templates`, { waitUntil: 'load' })
    await sleep(2500)
    const tplText = await ppage.locator('main').first().textContent()
    const ownerCount = (tplText || '').match(/业主方案\s*(\d+)\s*套/)
    check(
      'templates 列表渲染',
      /怎么选/.test(tplText || ''),
      ownerCount ? `业主方案 ${ownerCount[1]} 套` : '',
    )
    const rows = await ppage.locator('table tbody tr').count()
    check('templates 对比表有数据行', rows > 0, `行数=${rows}`)
    await pctx.close()
  }

  // ════════ 3) console 0 错误 ════════
  check('console 0 错误', errs.length === 0, errs.length ? errs.slice(0, 5).join(' | ') : '')

  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n== ${TAG}: ${results.length - failed.length}/${results.length} 通过 ==`)
  if (failed.length) {
    console.log('失败项:')
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
