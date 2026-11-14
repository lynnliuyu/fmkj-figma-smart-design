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
  { name: '名片', path: '/capabilities/business-card', expect: ['名片', '三维预览'] },
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

  // ── SEO 元信息：OG 图必须是绝对地址，且不能指向本机 ──────────
  // 2026-11-14 生产事故：metadataBase 没读 PUBLIC_URL，退回 http://localhost:3000，
  // 分享到微信/微博的卡片图全部指向本机。页面本身不报错，只能从这里发现。
  // SMOKE_BASE 是本机地址时（CI、SSH 隧道冒烟）这条不适用，跳过。
  if (!only.length || only.some((o) => '首页'.includes(o) || o === '/')) {
    const res = await ctx.request.get(`${BASE}/`, { timeout: 15000 }).catch(() => null)
    const html = res ? await res.text() : ''
    const og = (html.match(/<meta[^>]+property="og:image"[^>]*content="([^"]+)"/i) ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]*property="og:image"/i) ||
      [])[1]
    const baseIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(new URL(BASE).hostname)
    const problems = []
    if (!og) {
      problems.push('首页没有 og:image')
    } else if (!/^https?:\/\//i.test(og)) {
      problems.push(`og:image 不是绝对地址：${og}`)
    } else if (!baseIsLocal && /(^|\/\/)(localhost|127\.0\.0\.1)/i.test(og)) {
      problems.push(`og:image 指向本机（metadataBase 没解析对）：${og}`)
    }
    if (problems.length) {
      console.log(`  ❌ SEO 元信息       ${problems.length} 个问题`)
      for (const p of problems) fail('SEO 元信息', '断言', p)
    } else if (baseIsLocal) {
      console.log(`  ✅ SEO 元信息       本机地址，跳过 OG 断言`)
    } else {
      console.log(`  ✅ SEO 元信息       og:image ${og}`)
    }
    results.push({ name: 'SEO 元信息', path: '/', problems })
  }

  // ── 首页的桌面客户端入口：按钮必须真的指向一个能下的安装包 ──────
  // 2026-11-14 上架首页时发现：客户端 1.1.0 早就打好包，但服务器 desktop-releases
  // 目录是空的，下载页三个平台全显示「即将上线」。页面本身不报错 ——
  // 只有顺着按钮点进去才知道是死链。
  //
  // 两种状态都要判对：有安装包时按钮必须直连安装包；没有安装包时退化成「使用网页版」
  // 也算对（本地开发没有 desktop-releases 目录，永远走这一支），但不能出现死链。
  // 注意 /latest/<target> 在没有包时会 302 回 /download，跟着跳也返回 200 ——
  // 所以只能看它最终落在哪，不能只看状态码。
  if (!only.length || only.some((o) => '首页'.includes(o) || o === '/')) {
    const problems = []
    const manifestRes = await ctx.request
      .get(`${BASE}/downloads/desktop/manifest`, { timeout: 15000 })
      .catch(() => null)
    const manifest = manifestRes?.ok() ? await manifestRes.json().catch(() => null) : null
    const released = Boolean(manifest?.windows || manifest?.mac)

    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 25000 }).catch(() => {})
    await sleep(3000)
    const info = await page
      .evaluate(() => {
        const section = document.querySelector('#desktop')
        if (!section) return { found: false }
        const links = [...section.querySelectorAll('a')].map((a) => ({
          text: (a.textContent || '').trim(),
          href: a.getAttribute('href') || '',
        }))
        return { found: true, text: section.innerText || '', links }
      })
      .catch(() => ({ found: false }))

    if (!info.found) {
      problems.push('首页没有桌面客户端分区（#desktop）')
    } else if (released) {
      const download = info.links.find((l) => l.href.includes('/downloads/desktop/'))
      if (!download) problems.push('已发布安装包，但首页按钮没指向 /downloads/desktop')
      if (/即将上线/.test(info.text)) problems.push('首页客户端分区显示「即将上线」')
    } else {
      // 没发布：不能留死链，得退化成能用的入口
      if (!info.links.some((l) => l.href === '/projects'))
        problems.push('没有安装包时首页也没给出「使用网页版」入口')
      if (info.links.some((l) => l.href.includes('/downloads/desktop/')))
        problems.push('没有安装包却给出了安装包直链')
    }

    if (released) {
      // 有清单还不够：清单里的地址可能指向已删除的文件。逐个跟到底，必须是二进制而不是回跳的 HTML。
      // 必须用 HEAD：GET 会把 120MB 的安装包整个下进内存，生产冒烟直接卡死在这里。
      // HEAD 一样会 302 到安装包，所以「回跳网页」和「文件不存在」都还测得出来。
      for (const target of ['windows', 'mac-arm64', 'mac-x64']) {
        const res = await ctx.request
          .head(`${BASE}/downloads/desktop/latest/${target}`, { timeout: 20000, maxRedirects: 5 })
          .catch(() => null)
        if (!res) {
          problems.push(`/downloads/desktop/latest/${target} 请求失败`)
          continue
        }
        if (res.status() !== 200) {
          problems.push(`/downloads/desktop/latest/${target} 下载不到（${res.status()}）`)
          continue
        }
        const type = res.headers()['content-type'] || ''
        if (type.includes('text/html')) {
          problems.push(`/downloads/desktop/latest/${target} 回跳到了网页，不是安装包`)
        }
        if (!Number(res.headers()['content-length'] || 0)) {
          problems.push(
            `/downloads/desktop/latest/${target} 没有 content-length，安装包可能是空文件`,
          )
        }
      }
    }

    if (problems.length) {
      console.log(`  ❌ 首页客户端入口   ${problems.length} 个问题`)
      for (const p of problems) fail('首页客户端入口', '断言', p)
    } else if (released) {
      console.log('  ✅ 首页客户端入口   三个平台安装包都可下载')
    } else {
      console.log('  ✅ 首页客户端入口   未发布安装包，正确退化为网页版入口')
    }
    results.push({ name: '首页客户端入口', path: '/', problems })
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

  // ── 归档页的交付方案弹窗：几何与本地化 ──────────────────
  // 2026-11-14 用户报「归档页面显示有问题 / 更换方案的弹窗显示有问题」，
  // 三个缺陷都只在**看截图**时才暴露，页面不报错、文字也存在：
  //   1. 弹窗传了 padding={0}，标题被 endContent 的 -8px 补偿顶到弹窗外面；
  //   2. 色板放进了 Button 的 16×16 `icon` 插槽，溢出压住「栖序雅致」；
  //   3. 没套 InternationalizationProvider，日期控件是英文占位符。
  // 前两条靠几何断言，第三条直接读 placeholder。
  if (PID && (!only.length || only.some((o) => '归档弹窗'.includes(o) || 'archive'.includes(o)))) {
    const problems = []
    const dlg = { page: '归档弹窗', name: '归档弹窗', path: `/projects/${PID}/archive`, problems }
    await page
      .goto(`${BASE}/projects/${PID}/archive`, { waitUntil: 'load', timeout: 15000 })
      .catch(() => {})
    await sleep(2500)

    const trigger = page.locator('[aria-label*="交付方案模板"]').first()
    if (!(await trigger.count())) {
      problems.push('找不到「交付方案模板」按钮')
    } else {
      // 触发按钮：文字不能被色板盖住
      const overlap = await trigger.evaluate((el) => {
        const swatch = el.querySelector('.size-3')?.parentElement
        if (!swatch) return null
        // 只认**叶子**文字节点：外层包裹 span 也含中文，拿它会算出假重叠
        const label = [...el.querySelectorAll('span')].find(
          (s) => /[一-龥]/.test(s.textContent || '') && !s.contains(swatch),
        )
        if (!label) return null
        const a = label.getBoundingClientRect()
        const b = swatch.getBoundingClientRect()
        // 正常是色板在左、文字在右，留一个 gap；文字左边跑到色板右边之内就是被压住了
        return Math.round(a.left - b.right)
      })
      if (overlap !== null && overlap < 0) {
        problems.push(`色板盖住了按钮文字（重叠 ${-overlap}px）`)
      }

      await trigger.click()
      await sleep(1500)
      const geo = await page.evaluate(() => {
        const d = document.querySelector('dialog[open]')
        if (!d) return { found: false }
        const r = d.getBoundingClientRect()
        const h2 = d.querySelector('h2')?.getBoundingClientRect()
        return {
          found: true,
          dialog: [r.left, r.top, r.right, r.bottom],
          title: h2 ? [h2.left, h2.top, h2.right, h2.bottom] : null,
          placeholders: [...d.ownerDocument.querySelectorAll('input')]
            .map((i) => i.placeholder)
            .filter(Boolean),
        }
      })
      if (!geo.found) {
        problems.push('弹窗没有打开')
      } else if (!geo.title) {
        problems.push('弹窗缺少标题')
      } else {
        const [dl, dt, dr] = geo.dialog
        const [tl, tt, tr] = geo.title
        if (tt < dt - 0.5 || tl < dl - 0.5 || tr > dr + 0.5) {
          problems.push(
            `标题跑出弹窗（标题 ${tl.toFixed(0)},${tt.toFixed(0)}，弹窗 ${dl.toFixed(0)},${dt.toFixed(0)}）`,
          )
        }
      }
      // 英文占位符只在中文产品里算缺陷
      const english = (geo.placeholders || []).filter((p) => /Select a (date|time)/i.test(p))
      if (english.length) problems.push(`组件文案没有本地化：${english.join('、')}`)
      await page.keyboard.press('Escape').catch(() => {})
      await sleep(400)
    }

    if (problems.length) {
      console.log(`  ❌ 归档弹窗       ${problems.length} 个问题`)
      for (const p of problems) fail('归档弹窗', '断言', p)
    } else {
      console.log(`  ✅ 归档弹窗       标题在框内 · 无重叠 · 文案已中文化`)
    }
    results.push(dlg)
  }

  // ── 点位图侧边栏：设备卡片必须各画各的图标 ────────────────
  // 2026-11-14 用户报「点位图侧边栏的图标去哪啦」：P1 Button 原生化时把
  // 每张卡的图标都写成了 `icon={<PointMarker type={null} />}`，25 张卡全画成
  // 同一个通用「其他」标记。页面不报错、文字也在，只有数图标种类才发现。
  // 断言：卡片数量 ≥ 5 时，图片 src 的**种类**必须与卡片数相当（占位图只有 1 种）。
  if (
    PID &&
    (!only.length || only.some((o) => '点位图图标'.includes(o) || 'point-map'.includes(o)))
  ) {
    const problems = []
    await page
      .goto(`${BASE}/projects/${PID}/point-map`, { waitUntil: 'load', timeout: 20000 })
      .catch(() => {})
    await sleep(5000)
    const info = await page
      .evaluate(() => {
        const aside = document.querySelector('.point-map-aside')
        if (!aside) return { found: false }
        const cards = [...aside.querySelectorAll('button[draggable="true"]')]
        const srcs = cards.map((c) => c.querySelector('img')?.getAttribute('src') ?? null)
        return {
          found: true,
          cards: cards.length,
          missing: srcs.filter((s) => !s).length,
          distinct: new Set(srcs.filter(Boolean)).size,
          overflow: cards.filter((c) => c.scrollWidth > c.clientWidth + 1).length,
        }
      })
      .catch(() => ({ found: false }))
    if (!info.found) {
      problems.push('找不到点位图右侧设备面板')
    } else if (info.cards < 5) {
      problems.push(`设备卡片只有 ${info.cards} 张，可能没渲染`)
    } else {
      if (info.missing) problems.push(`${info.missing} 张卡片没有图标`)
      if (info.distinct < info.cards / 2) {
        problems.push(`图标退化了：${info.cards} 张卡片只有 ${info.distinct} 种图`)
      }
      if (info.overflow) problems.push(`${info.overflow} 张卡片的文字溢出卡片`)
    }
    if (problems.length) {
      console.log(`  ❌ 点位图图标     ${problems.length} 个问题`)
      for (const p of problems) fail('点位图图标', '断言', p)
    } else {
      console.log(`  ✅ 点位图图标     ${info.cards} 张卡片 · ${info.distinct} 种图标 · 无溢出`)
    }
    results.push({ name: '点位图图标', path: `/projects/${PID}/point-map`, problems })
  }

  // ── 名片：素材必须是纯二维码 + 网址必须是正式域名 ──────
  // 2026-11-14 从营销工作台搬过来时踩过两个坑，都是「预览看着像对的、印出来是废的」：
  //   1. 公司资料里的二维码是整张「加我为朋友」名片图（888×1131），塞进 218×218 方框被压扁；
  //   2. 本地 PUBLIC_URL 是 127.0.0.1:13001，直接印到了名片背面。
  // 未登录时页面会被重定向到 /login，离屏画布当然不存在 ——
  // 那是登录态的问题，不是名片的问题，跳过而不是报假失败
  //（生产库没有 demo@fmkj.local，跑生产冒烟时一定会走到这一支）。
  if (
    loggedIn &&
    (!only.length || only.some((o) => '名片'.includes(o) || 'business-card'.includes(o)))
  ) {
    const problems = []
    await page
      .goto(`${BASE}/capabilities/business-card`, { waitUntil: 'load', timeout: 25000 })
      .catch(() => {})
    await sleep(6000)
    const info = await page
      .evaluate(() => {
        // 离屏导出画布是唯一「真正会被打印」的那份，检查它
        const stage = document.querySelector('[aria-hidden].fixed')
        if (!stage) return { found: false }
        const faces = [...stage.children]
        const qrs = [...stage.querySelectorAll('img')].filter((i) => i.alt === '微信二维码')
        const qr = qrs[0]
        const text = stage.innerText || ''
        return {
          found: true,
          faces: faces.length,
          qrs: qrs.length,
          qrRatio: qr && qr.naturalWidth ? qr.naturalWidth / qr.naturalHeight : 0,
          qrNatural: qr ? [qr.naturalWidth, qr.naturalHeight] : null,
          localHost: /(127\.0\.0\.1|localhost|0\.0\.0\.0)/.test(text),
        }
      })
      .catch(() => ({ found: false }))

    if (!info.found) {
      problems.push('找不到名片离屏导出画布')
    } else {
      if (info.faces < 8) problems.push(`导出画布只有 ${info.faces} 张卡面（4 版 × 正反面应为 8）`)
      if (!info.qrs) problems.push('名片上没有微信二维码')
      // 二维码必须接近正方形；整张名片图是 0.79，方框里会被压扁
      if (info.qrs && Math.abs(info.qrRatio - 1) > 0.05) {
        problems.push(
          `二维码不是方的（${info.qrNatural?.join('×')}），印出来会变形 —— 应指向裁好的 /brand/wechat-qr.png`,
        )
      }
      if (info.localHost) problems.push('名片上印着本机地址（127.0.0.1 / localhost）')
    }
    if (problems.length) {
      console.log(`  ❌ 名片           ${problems.length} 个问题`)
      for (const p of problems) fail('名片', '断言', p)
    } else {
      console.log(`  ✅ 名片           ${info.faces} 张卡面 · 二维码方正 · 网址是正式域名`)
    }
    results.push({ name: '名片', path: '/capabilities/business-card', problems })
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
