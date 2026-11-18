/**
 * issue #177 核心用户路径探针（真实浏览器 + 本机 dev server）。
 *
 * 流程：登录 → 新建项目（填写字段）→ 保存 → 重新打开（验证字段保留）
 *     → 从点位图生成报价 → 保存报价 → 重新打开（验证报价保留）。
 * 只读 :3000 上的 dev checkout（主流程代码与 main 一致），不改任何数据
 * 之外的东西；新建的项目会残留（用唯一时间戳命名，便于识别）。
 *
 * 运行：
 *   node e2e/issue177-core-flow.mjs
 * 截图与 trace 输出到 .export-artifacts/issue177/（gitignore 内）。
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const EMAIL = process.env.SMOKE_EMAIL || 'demo@fmkj.local'
const PASS = process.env.SMOKE_PASS || 'demo12345'
const OUT = process.env.ISSUE177_OUT || join(process.cwd(), '.export-artifacts/issue177')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const projectName = `自动化核心流程 ${stamp}`

mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message.slice(0, 160)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebSocket|hmr|DevTools|favicon/i.test(m.text()))
      errs.push(m.text().slice(0, 160))
  })

  const results = []
  const step = async (name, fn) => {
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`  ✅ ${name}`)
    } catch (e) {
      results.push({ name, ok: false, error: e.message.split('\n')[0] })
      console.error(`  ❌ ${name}: ${e.message.split('\n')[0]}`)
      await page.screenshot({ path: join(OUT, `FAIL-${name}.png`) }).catch(() => {})
      throw e
    }
  }

  // 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 20000 })
  await sleep(2000)
  const tab = page
    .locator('button.astryx-tab')
    .filter({ hasText: /邮箱/ })
    .first()
  if (await tab.count()) {
    await tab.click()
    await sleep(600)
  }
  await page.waitForSelector('#email', { timeout: 15000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASS)
  await page.click('button[type=submit]')
  await sleep(4000)
  if (page.url().includes('/login')) throw new Error('登录失败，仍在 /login')
  console.log('  ✅ 登录成功')

  // 新建项目
  let projectId = null
  await step('新建项目页', async () => {
    await page.goto(`${BASE}/projects/new`, { waitUntil: 'load', timeout: 20000 })
    await sleep(1500)
    await page.screenshot({ path: join(OUT, '1-新建项目.png') })
  })

  await step('填写并保存项目', async () => {
    // 关掉「兑换码」引导弹层（新账号可能弹出；找到后点关闭/回车）
    const redeemModal = page.locator('[role=dialog]').filter({ hasText: '兑换' }).first()
    if (await redeemModal.count()) {
      const close = redeemModal
        .locator('button')
        .filter({ hasText: /关闭|跳过|取消/ })
        .first()
      if (await close.count()) await close.click()
      else await page.keyboard.press('Escape')
      await sleep(800)
    }
    // 真实字段：网页表单没有 #name（名称自动生成），填客户/小区/地址
    const community = page.locator('input#community').first()
    if (await community.count()) await community.fill('自动化小区')
    const customer = page.locator('input#customerName').first()
    if (await customer.count()) await customer.fill('自动化客户')
    const address = page.locator('input#address').first()
    if (await address.count()) await address.fill('3-1201')
    // 保存按钮：项目表单的提交按钮（在含 #customerName 的 form 内）
    const projectForm = page
      .locator('form')
      .filter({ has: page.locator('input#customerName') })
      .first()
    const saveBtn = projectForm.locator('button[type=submit]').first()
    if (!(await saveBtn.count())) throw new Error('找不到项目保存按钮')
    await saveBtn.scrollIntoViewIfNeeded()
    await saveBtn.click()
    // 保存成功后跳到 /projects/<uuid>（详情页）。注意不能匹配 /projects/new ——
    // 表单页本身就满足 /projects/[^/?]+，用 UUID 形式排除引导页。
    await page.waitForFunction(
      () => {
        const p = location.pathname
        return /\/projects\/[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(p)
      },
      { timeout: 20000 },
    )
    projectId = page.url().split('/').pop()
    await sleep(1200)
    // 保存后详情页应有刚保存的字段
    const savedText = await page.evaluate(() => document.body.innerText || '')
    if (!savedText.includes('自动化客户')) throw new Error('保存后详情页没显示新字段')
    await page.screenshot({ path: join(OUT, '2-保存后跳转.png') })
  })

  await step('重新打开项目（字段保留）', async () => {
    // 用全新 context 重新打开（模拟「保存后关掉再重开」），确保全新加载
    const ctx2 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    })
    const page2 = await ctx2.newPage()
    // 重开是登录态之外的会话：重新登录一次
    await page2.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 20000 })
    const t2 = page2
      .locator('button.astryx-tab')
      .filter({ hasText: /邮箱/ })
      .first()
    if (await t2.count()) await t2.click()
    await page2.waitForSelector('#email', { timeout: 15000 })
    await page2.fill('#email', EMAIL)
    await page2.fill('#password', PASS)
    await page2.click('button[type=submit]')
    await page2.waitForTimeout(3500)
    // 登录后可能落在 /projects/new 引导页：先回项目列表再进详情（代表正常重开路径）
    await page2.goto(`${BASE}/projects`, { waitUntil: 'load', timeout: 20000 })
    await page2.waitForTimeout(1200)
    await page2.goto(`${BASE}/projects/${projectId}`, { waitUntil: 'load', timeout: 20000 })
    await page2.waitForTimeout(2500)
    const diag = await page2.evaluate(() => ({
      url: location.pathname,
      body: (document.body.innerText || '').slice(0, 300),
      full: document.body.innerText || '',
    }))
    console.log(`    [诊断] 重开 url=${diag.url} body=${JSON.stringify(diag.body.slice(0, 150))}`)
    if (!diag.url.startsWith('/projects/')) throw new Error(`重开未到详情页，落在 ${diag.url}`)
    for (const want of ['自动化客户', '自动化小区', '3-1201', '客户与房屋']) {
      if (!diag.full.includes(want)) throw new Error(`重开后找不回字段「${want}」`)
    }
    await page2.screenshot({ path: join(OUT, '3-重新打开.png') })
    await ctx2.close()
  })

  // 从项目点位图生成报价：找「新建报价 / 生成报价」入口
  let quoteId = null
  await step('从项目生成报价', async () => {
    await page.goto(`${BASE}/projects/${projectId}/quotes`, { waitUntil: 'load', timeout: 20000 })
    await sleep(2000)
    const text = await page.evaluate(() => document.body.innerText || '')
    // 找生成报价按钮：没点位时是「新建空白报价」，有点位时是「从点位图生成报价」
    const genBtn = page
      .locator('button, a')
      .filter({ hasText: /生成报价|新建空白报价|新建报价|从点位图/ })
      .first()
    if (await genBtn.count()) {
      await genBtn.click()
      await sleep(3000)
      // 可能跳到一个报价单页
      if (/\/quotes\/[^/]+$/.test(page.url())) {
        quoteId = page.url().split('/').pop()
        await page.screenshot({ path: join(OUT, '4-生成报价.png') })
        return
      }
    }
    // 没有按钮时先看页面有没有报价列表（旧项目可能已有报价）
    console.log(`    报价页文字: ${text.slice(0, 120)}`)
    throw new Error('找不到生成报价入口')
  })

  if (quoteId) {
    await step('编辑并保存报价', async () => {
      await page.goto(`${BASE}/projects/${projectId}/quotes/${quoteId}`, {
        waitUntil: 'load',
        timeout: 20000,
      })
      await sleep(2000)
      await page.screenshot({ path: join(OUT, '5-报价单.png') })
      const saveBtn = page
        .locator('button')
        .filter({ hasText: /保存报价/ })
        .first()
      if (!(await saveBtn.count())) throw new Error('找不到「保存报价」按钮')
      await saveBtn.scrollIntoViewIfNeeded()
      await saveBtn.click()
      await sleep(1800)
      // 保存成功应出现提示（toast），或页面无报错
      const errFree = await page.evaluate(
        () => !(document.body.innerText || '').includes('保存失败'),
      )
      if (!errFree) throw new Error('报价保存失败提示出现')
    })

    await step('重新打开报价（字段保留）', async () => {
      await page.goto(`${BASE}/projects/${projectId}/quotes/${quoteId}`, {
        waitUntil: 'load',
        timeout: 20000,
      })
      await sleep(1500)
      const text = await page.evaluate(() => document.body.innerText || '')
      if (text.trim().length < 30) throw new Error('报价单重开后内容过少')
      await page.screenshot({ path: join(OUT, '6-报价重开.png') })
    })
  }

  // 汇总
  const consoleErrors = errs.length ? errs : []
  console.log(`\n项目ID: ${projectId}  报价ID: ${quoteId || '(未生成)'}`)
  console.log(`控制台错误: ${consoleErrors.length ? consoleErrors.join(' | ') : '无'}`)
  writeFileSync(
    join(OUT, 'results.json'),
    JSON.stringify(
      { projectName, projectId, quoteId, stamp, steps: results, consoleErrors },
      null,
      2,
    ),
  )
  await browser.close()
  process.exit(consoleErrors.length ? 2 : 0)
}

main().catch((e) => {
  console.error('探针失败:', e.message.split('\n')[0])
  process.exit(1)
})
