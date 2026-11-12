/**
 * 页面冒烟测试 —— CI 里的最后一道门禁。
 *
 * 为什么需要它：六道门禁（oxfmt / eslint / tsc / knowledge:check / vitest / build）
 * 全都只看**代码**，看不到页面。2026-11-08 那批 bug 就是活例子：
 * 类型过了、84 个单测过了、生产构建过了 —— 但页面照样把内部枚举名
 * `智能switch-2设备` 印到客户合同上，侧边栏也看不出当前在哪一页。
 *
 * 这个脚本起真实浏览器，登录、逐个打开关键页面，断言**用户能感知的东西**：
 *   1. 没有 console 错误 / 页面异常
 *   2. 没有卡在骨架屏
 *   3. 页面真的渲染出了内容（不是空白）
 *   4. 没有横向滚动条（窄屏溢出）
 *   5. 没有加载失败的图片
 *   6. 业务红线：客户可见处不出现内部枚举名
 *
 * 用法：
 *   node e2e/smoke.mjs                    # 全部
 *   node e2e/smoke.mjs 项目 模板           # 只跑名字匹配的
 *   SMOKE_BASE=http://localhost:3000      # 换地址
 *   SMOKE_KEEP=1                           # 失败时保留截图目录
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const EMAIL = process.env.SMOKE_EMAIL || 'demo@fmkj.local'
const PASS = process.env.SMOKE_PASS || 'demo12345'
const PID = process.env.SMOKE_PROJECT_ID || ''
const OUT = process.env.SMOKE_OUT || '/tmp/fmkj-smoke'

// 需要登录才能看的页面；未登录时应被重定向到 /login
const GATED = [
  { name: '项目列表', path: '/projects', expect: ['项目工作台'] },
  { name: '项目详情', path: PID ? `/projects/${PID}` : null },
  { name: '点位图', path: PID ? `/projects/${PID}/point-map` : null },
  { name: '报价单', path: PID ? `/projects/${PID}/quotes` : null },
  { name: '合同', path: PID ? `/projects/${PID}/contract` : null },
  { name: '归档分享', path: PID ? `/projects/${PID}/archive` : null },
  { name: '售后', path: PID ? `/projects/${PID}/after-sales` : null },
  { name: '能力中心', path: '/capabilities', expect: ['能力中心'] },
  { name: '模板中心', path: '/capabilities/templates', expect: ['模板中心', '文档风格'] },
  { name: '全部工具', path: '/capabilities/tools' },
  { name: 'AI 能力', path: '/ai' },
  { name: 'AI 生图', path: '/ai/image' },
  { name: '设置', path: '/settings', expect: ['设置'] },
  { name: '产品库', path: '/products' },
  { name: '报价中心', path: '/quotes' },
]

// 公开页，不必登录
const PUBLIC = [
  { name: '首页', path: '/', expect: ['繁梦空间'] },
  { name: '模板介绍', path: '/templates' },
  { name: '产品目录', path: '/catalog' },
  { name: '文档中心', path: '/docs' },
  { name: '下载页', path: '/download' },
]

/** 客户可见处不该出现的内部标识（2026-11-08 的真实事故） */
const LEAK_PATTERNS = [
  { re: /智能[a-z][a-z0-9-]*设备/i, why: '内部设备枚举名被拼进产品名' },
  { re: /DEMO-[A-Z]/, why: '内部演示型号泄漏到客户可见处' },
  { re: /\bswitch-\d\b/, why: '内部点位类型泄漏' },
  { re: /\bdownlight\b|\bmotion-sensor\b|\btouch-panel\b/, why: '内部点位类型泄漏' },
]

const only = process.argv.slice(2)
const picked = (list) =>
  only.length
    ? list.filter((p) => only.some((o) => p.name.includes(o) || (p.path || '').includes(o)))
    : list

const failures = []
const results = []
const fail = (page, kind, detail) => {
  failures.push({ page, kind, detail })
  console.error(`      ✗ [${kind}] ${detail}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await ctx.newPage()

  // 收集每个页面生命周期内的错误（用对象包一层，便于在 check() 里重置）
  const errs = { list: [] }
  page.on('pageerror', (e) => errs.list.push(`PAGEERROR ${e.message.slice(0, 160)}`))
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() !== 'error') return
    // dev 模式的 HMR WebSocket / React DevTools 提示不算缺陷
    if (/WebSocket|hmr|DevTools|Failed to load resource.*favicon/i.test(t)) return
    errs.list.push(t.slice(0, 160))
  })
  page.on('response', (r) => {
    if (r.status() >= 500)
      errs.list.push(`HTTP ${r.status()} ${r.url().replace(BASE, '').slice(0, 80)}`)
  })

  // ── 登录 ──────────────────────────────────────────────
  console.log(`\n▶ 冒烟测试  ${BASE}\n`)
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 15000 })
  await sleep(2500)
  // ⚠️ 官方 Astryx `Tab` 渲染成 `button.astryx-tab`，**没有 `role="tab"`**
  // （2026-11-12 实测：getByRole('tab') 得 0 个元素 → 登录页冒烟失败）。
  // 选中态只有 `data-selected="selected"`。
  const tab = page
    .locator('button.astryx-tab')
    .filter({ hasText: /邮箱/ })
    .first()
  if (await tab.count()) {
    await tab.click()
    await sleep(800)
  }
  // 登录要容错：登录页本身可能因为路由层出错而渲染不出来（2026-11-08 那次
  // 「页面卡骨架屏」的坑就是如此）。登录失败应该**明确报错并退出**，
  // 而不是抛一个 locator 超时异常糊过去——那样 CI 日志里看不出真实原因。
  let loggedIn = false
  try {
    await page.waitForSelector('#email', { timeout: 15000 })
    await page.fill('#email', EMAIL)
    await page.fill('#password', PASS)
    await page.click('button[type=submit]')
    await sleep(5000)
    loggedIn = !page.url().includes('/login')
  } catch {
    const diag = await page
      .evaluate(() => ({
        url: location.pathname,
        skel: document.querySelectorAll('[data-slot=skeleton]').length,
        textLen: (document.body.innerText || '').trim().length,
      }))
      .catch(() => ({ url: '(取不到)', skel: -1, textLen: -1 }))
    console.error(`  ❌ 登录页无法完成登录：停在 ${diag.url}`)
    console.error(`     骨架块 ${diag.skel} 个 · 页面文字 ${diag.textLen} 字`)
    if (diag.skel > 0) console.error('     → 疑似页面卡在骨架屏（Suspense 未 resolve）')
    await page.screenshot({ path: join(OUT, '登录失败.png'), fullPage: false }).catch(() => {})
    await browser.close()
    process.exit(1)
  }
  if (loggedIn) console.log('  ✅ 登录成功')
  else console.log('  ⚠️  登录未成功（受保护页面会按「未登录」预期处理）')

  // ── 登录页：必须用**未登录**的干净上下文测 ──────────────
  // 登录态下访问 /login 会被重定向走，断言不到登录表单。
  if (!only.length || only.some((o) => '登录页'.includes(o) || '/login'.includes(o))) {
    // 必须新建**独立 context**：同一个 context 里的 page 共享 cookie，
    // 用它开的新页仍是登录态，测不出「未登录访问 /login」的行为。
    const anonCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    })
    const anon = await anonCtx.newPage()
    const anonErrs = []
    anon.on('pageerror', (e) => anonErrs.push(`PAGEERROR ${e.message.slice(0, 160)}`))
    await anon.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 15000 }).catch(() => {})
    await sleep(2500)
    const m = await anon.evaluate(() => ({
      url: location.pathname,
      textLen: (document.body.innerText || '').trim().length,
      inner: document.body.innerText || '',
      skel: document.querySelectorAll('[data-slot=skeleton]').length,
    }))
    const problems = []
    if (anonErrs.length) problems.push(...anonErrs.slice(0, 3))
    if (m.skel > 0) problems.push(`有 ${m.skel} 个骨架块未消失`)
    if (m.textLen < 110) problems.push(`页面文字只有 ${m.textLen} 字`)
    // 必须**停留在** /login
    if (!m.url.startsWith('/login')) problems.push(`未登录访问 /login 却被跳到 ${m.url}`)
    // ⚠️ 「微信扫码登录 / 邮箱密码登录」这对 tab 只在**服务端配置了微信小程序**时渲染
    //    （qrLoginAvailable()）。CI 与本地开发环境都没有微信配置，只有邮箱表单 ——
    //    这是正确行为，不能当缺陷。有 tabs 时才断言两者都在。
    const hasTabSwitcher = m.inner.includes('邮箱密码登录')
    if (hasTabSwitcher) {
      for (const e of ['微信扫码登录', '邮箱密码登录']) {
        if (!m.inner.includes(e)) problems.push(`有登录方式切换但缺少「${e}」`)
      }
    } else if (!m.inner.includes('邮箱') || !m.inner.includes('密码')) {
      problems.push('既没有扫码登录 tab，也没有邮箱密码表单')
    }
    results.push({ name: '登录页', path: '/login', url: m.url, problems })
    if (problems.length) {
      console.log(`  ❌ 登录页          ${problems.length} 个问题`)
      for (const p of problems) fail('登录页', '断言', p)
    } else {
      console.log(`  ✅ 登录页          文字 ${String(m.textLen).padStart(5)}（未登录上下文）`)
    }
    await anon.close()
    await anonCtx.close()
  }

  // ── 旧 URL 兼容（2026-11-09 /plugins → /capabilities）────────
  // 这条单独查：书签、客户群里的历史分享、搜索引擎收录都靠它不 404。
  if (!only.length || only.some((o) => '旧URL'.includes(o) || 'plugins'.includes(o))) {
    const legacy = [
      ['/plugins', '/capabilities'],
      ['/plugins/templates', '/capabilities/templates'],
      ['/plugins/tools', '/capabilities/tools'],
    ]
    const problems = []
    for (const [from, to] of legacy) {
      const res = await ctx.request.get(`${BASE}${from}`, { maxRedirects: 0 }).catch(() => null)
      const status = res ? res.status() : 0
      const loc = res ? res.headers()['location'] || '' : ''
      const okStatus = status === 301 || status === 308
      const okTarget = loc.includes(to)
      if (!okStatus || !okTarget) {
        problems.push(`${from} → 期望 301 到 ${to}，实际 ${status} ${loc || '(无 Location)'}`)
      }
    }
    if (problems.length) {
      console.log(`  ❌ 旧URL兼容       ${problems.length} 个问题`)
      for (const p of problems) fail('旧URL兼容', '断言', p)
    } else {
      console.log(`  ✅ 旧URL兼容       /plugins* → /capabilities* 全部 301`)
    }
    results.push({ name: '旧URL兼容', path: '/plugins', problems })
  }

  // ── 公开页 ────────────────────────────────────────────
  for (const p of picked(PUBLIC)) {
    await check(page, p, { gated: false, errs })
  }
  // ── 需登录页 ──────────────────────────────────────────
  for (const p of picked(GATED)) {
    if (!p.path) continue
    await check(page, p, { gated: true, loggedIn, errs })
  }

  await browser.close()

  const bad = results.filter((r) => r.problems.length)
  console.log(`\n${'─'.repeat(60)}`)
  console.log(
    `共 ${results.length} 页 · 通过 ${results.length - bad.length} · 有问题 ${bad.length}`,
  )
  if (failures.length) {
    console.log(`\n失败明细：`)
    for (const f of failures) console.log(`  ${f.page} → [${f.kind}] ${f.detail}`)
    writeFileSync(join(OUT, 'failures.json'), JSON.stringify({ failures, results }, null, 2))
    console.log(`\n截图与明细：${OUT}`)
    process.exit(1)
  }
  console.log('全部通过 ✅\n')
}

async function check(page, spec, { gated, loggedIn, errs }) {
  const { name, path, expect: expects = [] } = spec
  errs.list = []
  const problems = []

  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 15000 }).catch(() => {})
  await sleep(2200)
  // 整页滚一遍触发 lazy-load（图片密集页面的内容否则拿不到）
  await page
    .evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8)
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 90))
      }
      window.scrollTo(0, 0)
    })
    .catch(() => {})
  await sleep(1200)

  const m = await page.evaluate(() => {
    const visibleImgs = [...document.images].filter((i) => {
      const cs = getComputedStyle(i)
      return cs.display !== 'none' && cs.visibility !== 'hidden'
    })
    return {
      url: location.pathname,
      title: document.title,
      skel: document.querySelectorAll('[data-slot=skeleton]').length,
      textLen: (document.body.innerText || '').trim().length,
      innerText: document.body.innerText || '',
      hScroll: document.documentElement.scrollWidth > window.innerWidth + 4,
      brokenImgs: visibleImgs
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => i.src.split('/').pop()),
    }
  })

  const shot = join(OUT, `${name.replace(/[/\\]/g, '_')}.png`)
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {})

  // 未登录时被重定向到 /login 是**正确行为**，不算失败
  if (gated && !loggedIn && m.url.startsWith('/login')) {
    results.push({ name, path, url: m.url, problems: [], note: '未登录，按预期重定向' })
    console.log(`  ✅ ${name.padEnd(12)} （未登录 → 重定向到 /login，符合预期）`)
    return
  }

  // 1. 错误
  if (errs.list.length) problems.push(...errs.list.slice(0, 3))
  // 2. 骨架屏卡住
  if (m.skel > 0) problems.push(`有 ${m.skel} 个骨架块未消失`)
  // 3. 内容为空
  if (m.textLen < 150) problems.push(`页面文字只有 ${m.textLen} 字，可能没渲染`)
  // 4. 横向溢出
  if (m.hScroll) problems.push('出现横向滚动条')
  // 5. 坏图
  if (m.brokenImgs.length) problems.push(`图片加载失败：${m.brokenImgs.slice(0, 3).join(', ')}`)
  // 6. 关键文案
  for (const e of expects) {
    if (!m.innerText.includes(e)) problems.push(`缺少预期内容「${e}」`)
  }
  // 7. 内部标识泄漏（客户可见处）
  for (const { re, why } of LEAK_PATTERNS) {
    const hit = re.exec(m.innerText)
    if (hit) problems.push(`内部标识泄漏：${why}（命中「${hit[0]}」）`)
  }

  results.push({ name, path, url: m.url, problems })
  if (problems.length) {
    console.log(`  ❌ ${name.padEnd(12)} ${problems.length} 个问题`)
    for (const p of problems) fail(name, '断言', p)
  } else {
    console.log(`  ✅ ${name.padEnd(12)} 文字 ${String(m.textLen).padStart(5)} · 骨架 0 · 无错误`)
  }
}

main().catch((e) => {
  console.error('冒烟测试自身异常：', e)
  process.exit(1)
})
