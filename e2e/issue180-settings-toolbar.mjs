import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:3001'
const PID = process.env.DEMO_PROJECT_ID || '431ffb2c-103e-4f06-aef8-a98434eeedf0'
const OUT = process.env.OUT || '.export-artifacts/issue180-batch2/shots'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)))
p.on('console', (m) => {
  if (m.type() === 'error' && !/WebSocket|hmr|DevTools|favicon/i.test(m.text()))
    errs.push(m.text().slice(0, 200))
})
const results = []
const step = async (name, fn) => {
  try {
    const v = await fn()
    results.push({ name, ok: true, detail: v ?? null })
    console.log('✅', name, v ?? '')
  } catch (e) {
    results.push({ name, ok: false, error: e.message.split('\n')[0] })
    console.log('❌', name, e.message.split('\n')[0])
    await p.screenshot({ path: `${OUT}/FAIL-${name}.png` }).catch(() => {})
  }
}

await p.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 30000 })
await sleep(1200)
const tab = p
  .locator('button.astryx-tab')
  .filter({ hasText: /邮箱/ })
  .first()
if (await tab.count()) await tab.click()
await p.waitForSelector('#email', { timeout: 20000 })
await p.fill('#email', 'demo@fmkj.local')
await p.fill('#password', 'demo12345')
await p.click('button[type=submit]')
await sleep(3500)

await step('设置页：Astryx 分区导航', async () => {
  await p.goto(`${BASE}/settings`, { waitUntil: 'load', timeout: 30000 })
  await sleep(2200)
  const nav = p.locator('nav[aria-label="设置分区"]')
  const count = await nav.locator('a.astryx-button, button.astryx-button').count()
  if (count < 3) throw new Error(`导航按钮只有 ${count} 个`)
  await p.screenshot({ path: `${OUT}/settings-light.png` })
  return `${count} 个`
})

await step('设置页：深色 / 窄屏', async () => {
  await p.evaluate(() => {
    document.documentElement.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  })
  await p.reload({ waitUntil: 'load' })
  await sleep(2000)
  await p.screenshot({ path: `${OUT}/settings-dark.png` })
  await p.setViewportSize({ width: 390, height: 844 })
  await p.reload({ waitUntil: 'load' })
  await sleep(1800)
  await p.screenshot({ path: `${OUT}/settings-narrow.png` })
  await p.evaluate(() => {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  })
  await p.setViewportSize({ width: 1440, height: 900 })
})

await step('设置页：锚点吸顶可用 + 键盘焦点', async () => {
  await p.reload({ waitUntil: 'load' })
  await sleep(1600)
  const nav = p.locator('nav[aria-label="设置分区"]')
  await p.evaluate(() => {
    const m = document.querySelector('[role=main]')
    if (m) m.scrollTop = 1500
  })
  await sleep(800)
  const box = await nav.boundingBox()
  const mainBox = await p
    .locator('[role=main]')
    .boundingBox()
    .catch(() => null)
  await p.screenshot({ path: `${OUT}/settings-sticky-scrolled.png` })
  await nav.locator('a.astryx-button, button.astryx-button').nth(2).focus()
  await sleep(250)
  const focus = await p.evaluate(() => ({
    tag: document.activeElement?.tagName,
    text: (document.activeElement?.textContent || '').trim(),
    outline: getComputedStyle(document.activeElement).outlineStyle,
  }))
  await p.screenshot({ path: `${OUT}/settings-focus.png` })
  if (!mainBox) throw new Error('找不到 main')
  if (Math.abs(box.y - mainBox.y) > 4)
    throw new Error(`吸顶位置偏离 main：navY=${Math.round(box.y)} mainY=${Math.round(mainBox.y)}`)
  return `navY=${Math.round(box.y)} mainY=${Math.round(mainBox.y)} focus=${focus.text}/${focus.outline}`
})

await step('设置页：锚点跳转', async () => {
  const nav = p.locator('nav[aria-label="设置分区"]')
  const target = nav
    .locator('a.astryx-button, button.astryx-button')
    .filter({ hasText: '成本与毛利' })
    .first()
  await target.click()
  await sleep(700)
  const hash = await p.evaluate(() => location.hash)
  const y = await p.evaluate(
    () => document.getElementById('settings-cost')?.getBoundingClientRect().top ?? null,
  )
  if (hash !== '#settings-cost') throw new Error(`hash=${hash}`)
  return `hash=${hash} sectionTop=${Math.round(y)}`
})

// ── 点位图工具栏 ───────────────────────────────────────────────
await step('点位图：工具栏渲染', async () => {
  await p.goto(`${BASE}/projects/${PID}/point-map`, { waitUntil: 'load', timeout: 30000 })
  await sleep(4200)
  await p.screenshot({ path: `${OUT}/point-map-light.png` })
  await p.locator('button[aria-label^="显示设置"]').click()
  await sleep(700)
  await p.screenshot({ path: `${OUT}/point-map-popover.png` })
  const sliders = await p.locator('[role=slider]').count()
  const radios = await p.locator('[role=radiogroup] [role=radio]:visible').count()
  const zoom = await p
    .locator('button.astryx-button')
    .filter({ hasText: /^\d+%$/ })
    .count()
  if (!sliders) throw new Error('没有 Astryx Slider')
  if (radios < 4) throw new Error(`显示范围分段只有 ${radios} 项`)
  return `sliders=${sliders} scopeRadios=${radios} zoomBtn=${zoom}`
})

await step('点位图：滑杆 / 分段 / 缩放交互', async () => {
  const slider = p.locator('[role=slider]:visible').first()
  await slider.scrollIntoViewIfNeeded()
  await sleep(300)
  const before = await slider.getAttribute('aria-valuenow')
  const sb = await slider.boundingBox()
  if (!sb) throw new Error('滑杆不可见')
  await p.mouse.click(sb.x + sb.width * 0.3, sb.y + sb.height / 2)
  await sleep(400)
  let after = await slider.getAttribute('aria-valuenow')
  if (before === after) {
    await slider.focus()
    await p.keyboard.press('ArrowLeft')
    await sleep(300)
    after = await slider.getAttribute('aria-valuenow')
  }
  if (before === after) throw new Error(`滑杆值未变化：${before}`)
  const scope = p
    .locator('[role=radiogroup] [role=radio]:visible')
    .filter({ hasText: '仅开关' })
    .first()
  await scope.click()
  await sleep(300)
  const selected = await scope.getAttribute('aria-checked')
  if (selected !== 'true') throw new Error('分段选中态未更新')
  await p.screenshot({ path: `${OUT}/point-map-interacted.png` })
  return `slider ${before}→${after}; scope仅开关=${selected}`
})

await step('点位图：图层开关 + 全部显示', async () => {
  const layer = p.locator('button[role=switch]:visible').filter({ hasText: '设备图标' }).first()
  await layer.click()
  await sleep(500)
  const showAll = p.locator('button.astryx-button:visible').filter({ hasText: '全部显示' }).first()
  const n = await showAll.count()
  if (!n) throw new Error('隐藏图层后没有出现「全部显示」')
  await showAll.click()
  await sleep(500)
  const gone = await p
    .locator('button.astryx-button:visible')
    .filter({ hasText: '全部显示' })
    .count()
  if (gone) throw new Error('点击后「全部显示」未消失')
  return 'showAll 正常'
})

await step('点位图：深色 / 窄屏', async () => {
  await p.evaluate(() => {
    document.documentElement.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  })
  await p.reload({ waitUntil: 'load' })
  await sleep(3000)
  await p.screenshot({ path: `${OUT}/point-map-dark.png` })
  await p.setViewportSize({ width: 390, height: 844 })
  await p.reload({ waitUntil: 'load' })
  await sleep(2600)
  await p.screenshot({ path: `${OUT}/point-map-narrow.png` })
  await p.evaluate(() => {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  })
})

console.log(JSON.stringify({ results, consoleErrors: errs }, null, 2))
await b.close()
process.exit(results.some((r) => !r.ok) || errs.length ? 1 : 0)
