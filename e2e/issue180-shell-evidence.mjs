/**
 * issue #180 — 工作区外壳改前/改后取证脚本。
 * 登录后对同一状态截图：桌面浅色、桌面深色、窄屏、键盘焦点。
 * 用法: node e2e/issue180-shell-evidence.mjs <before|after>
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:3001'
const TAG = process.argv[2] || 'before'
const OUT = join(process.cwd(), `.export-artifacts/issue180/shots-${TAG}`)
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  await page.waitForSelector('#email', { timeout: 20000 })
  await page.fill('#email', 'demo@fmkj.local')
  await page.fill('#password', 'demo12345')
  await page.click('button[type=submit]')
  await sleep(4500)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message.slice(0, 160)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebSocket|hmr|DevTools|favicon/i.test(m.text()))
      errs.push(m.text().slice(0, 160))
  })

  await login(page)
  await page.goto(`${BASE}/projects`, { waitUntil: 'load', timeout: 30000 })
  await sleep(2500)
  await page.screenshot({ path: join(OUT, 'desktop-light.png') })

  // 深色：next-themes 写 html.classList/dark；用应用外观菜单切
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  })
  await page.reload({ waitUntil: 'load' })
  await sleep(2500)
  await page.screenshot({ path: join(OUT, 'desktop-dark.png') })
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  })

  // 窄屏
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'load' })
  await sleep(2500)
  await page.screenshot({ path: join(OUT, 'narrow-390.png') })

  // 窄屏 + 打开移动导航（若有）
  const navToggle = page
    .locator('button, [role=button]')
    .filter({ hasText: /菜单|导航|menu|打开/i })
    .first()
  if (await navToggle.count()) {
    await navToggle.click({ timeout: 3000 }).catch(() => {})
    await sleep(1200)
    await page.screenshot({ path: join(OUT, 'narrow-nav-open.png') })
    await page.keyboard.press('Escape')
    await sleep(600)
  }

  // 桌面 + 键盘焦点：Tab 三次
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload({ waitUntil: 'load' })
  await sleep(2000)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
  await sleep(400)
  const focus = await page.evaluate(() => {
    const el = document.activeElement
    if (!el) return null
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      label:
        el.getAttribute('aria-label') ||
        (el.textContent || '').trim().slice(0, 30) ||
        el.getAttribute('href'),
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      boxShadow: cs.boxShadow.slice(0, 80),
    }
  })
  await page.screenshot({ path: join(OUT, 'desktop-focus.png') })

  console.log(JSON.stringify({ tag: TAG, focus, consoleErrors: errs }, null, 2))
  await browser.close()
  process.exit(errs.length ? 2 : 0)
}

main().catch((e) => {
  console.error('failed:', e.message.split('\n')[0])
  process.exit(1)
})
