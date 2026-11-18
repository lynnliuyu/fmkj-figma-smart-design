/**
 * issue #179 素材库构建脚本（本地、可复跑、独立产物）。
 *
 * 产物：.export-artifacts/asset-library/（已被 .gitignore 忽略，不会进公开站）
 *   assets/{product,optimized,button,motion}/*  + manifest.json + index.html + README.md
 *
 * 数据：本机 dev server（默认 :3001）+ 演示账号 + 内置示例项目/报价，全部合成数据。
 * 外部素材：无（只收项目自有 + 自产截图/录屏）。
 *
 * 运行：
 *   node scripts/asset-library/build.mjs
 * 环境：
 *   BASE=http://127.0.0.1:3001  SHOWCASE_BASE=http://127.0.0.1:3000
 *   DEMO_EMAIL=demo@fmkj.local  DEMO_PASS=demo12345
 *   DEMO_PROJECT_ID=431ffb2c-...  DEMO_QUOTE_ID=21f7b7e5-...
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import sharp from 'sharp'

const BASE = process.env.BASE || 'http://127.0.0.1:3001'
const SHOWCASE_BASE = process.env.SHOWCASE_BASE || 'http://127.0.0.1:3000'
const EMAIL = process.env.DEMO_EMAIL || 'demo@fmkj.local'
const PASS = process.env.DEMO_PASS || 'demo12345'
const PROJECT_ID = process.env.DEMO_PROJECT_ID || '431ffb2c-103e-4f06-aef8-a98434eeedf0'
const QUOTE_ID = process.env.DEMO_QUOTE_ID || '21f7b7e5-f4f4-4b76-a678-6988d64ebebd'
const OUT = process.env.ASSET_OUT || join(process.cwd(), '.export-artifacts/asset-library')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const entries = []
const log = (...a) => console.log('·', ...a)

function fileMeta(path, extra = {}) {
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16)
  return { bytes: readFileSync(path).length, sha256_16: hash, ...extra }
}

function addEntry(entry) {
  entries.push(entry)
  return entry
}

/** 用 sharp 读图片尺寸，写进 manifest，避免手工填错。 */
async function pngMeta(path) {
  const m = await sharp(path).metadata()
  return { width: m.width, height: m.height }
}

function ffprobe(path) {
  try {
    const raw = execFileSync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
      { encoding: 'utf8' },
    )
    const d = JSON.parse(raw)
    const v = (d.streams || []).find((s) => s.codec_type === 'video') || {}
    return {
      width: v.width,
      height: v.height,
      codec: v.codec_name,
      durationMs: Math.round(Number(d.format?.duration || 0) * 1000),
    }
  } catch {
    return null
  }
}

function transcode(src, dest, { width, height }) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-sseof',
      '-3.5',
      '-i',
      src,
      '-an',
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x0b0b0c`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      dest,
    ],
    { stdio: 'ignore' },
  )
}

async function login(page, base) {
  await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 30000 })
  await sleep(1200)
  const tab = page
    .locator('button.astryx-tab')
    .filter({ hasText: /邮箱/ })
    .first()
  if (await tab.count()) await tab.click()
  await page.waitForSelector('#email', { timeout: 20000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASS)
  await page.click('button[type=submit]')
  await sleep(3500)
}

async function shot(page, url, path, { width = 1920, height = 1080, wait = 2600 } = {}) {
  await page.setViewportSize({ width, height })
  await page.goto(`${BASE}${url}`, { waitUntil: 'load', timeout: 30000 })
  await sleep(wait)
  await page.screenshot({ path, animations: 'disabled' })
  return path
}

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  for (const d of ['assets/product', 'assets/optimized', 'assets/button', 'assets/motion']) {
    mkdirSync(join(OUT, d), { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  await login(page, BASE)

  // ── 1. 产品演示图（真实页面 + 演示数据）──────────────────────────────
  const shots = [
    ['home-16x9', '/', '产品首页（16:9）', ['landing', 'hero']],
    ['projects-16x9', '/projects', '项目工作台（16:9）', ['projects']],
    ['point-map-16x9', `/projects/${PROJECT_ID}/point-map`, '点位图编辑（16:9）', ['point-map']],
    ['quote-16x9', `/projects/${PROJECT_ID}/quotes/${QUOTE_ID}`, '报价单编辑（16:9）', ['quote']],
    ['capabilities-16x9', '/capabilities', '能力中心（16:9）', ['capabilities']],
    ['settings-16x9', '/settings', '设置（16:9）', ['settings']],
  ]
  for (const [id, url, title, tags] of shots) {
    const path = join(OUT, 'assets/product', `${id}.png`)
    await shot(page, url, path, { wait: id === 'point-map-16x9' ? 5200 : 2800 })
    const m = await pngMeta(path)
    addEntry({
      id,
      title,
      category: 'product',
      orientation: '16:9',
      format: 'png',
      file: relative(OUT, path),
      ...m,
      source: { type: 'self', ref: '本地演示数据截图' },
      license: '内部宣传使用（繁梦空间自有素材）',
      attribution: '繁梦空间',
      tags,
      notes: '演示账号 + 内置示例项目，无客户真实数据。',
      ...fileMeta(path),
    })
    log('product', id)
  }

  // 竖版：首页 / 项目工作台
  for (const [id, url, title, tags] of [
    ['home-9x16', '/', '产品首页（9:16）', ['landing', 'hero']],
    ['projects-9x16', '/projects', '项目工作台（9:16）', ['projects']],
  ]) {
    const path = join(OUT, 'assets/product', `${id}.png`)
    await shot(page, url, path, { width: 1080, height: 1920, wait: 2600 })
    const m = await pngMeta(path)
    addEntry({
      id,
      title,
      category: 'product',
      orientation: '9:16',
      format: 'png',
      file: relative(OUT, path),
      ...m,
      source: { type: 'self', ref: '本地演示数据截图' },
      license: '内部宣传使用（繁梦空间自有素材）',
      attribution: '繁梦空间',
      tags,
      notes: '竖屏版；页面按 1080×1920 视口渲染。',
      ...fileMeta(path),
    })
    log('product', id)
  }

  // ── 2. 优化版：/showcase（PR #176 验证过的固定版式）+ #173 展示版点位图 ──
  {
    const path = join(OUT, 'assets/optimized/showcase-1920x1080.png')
    let source = 'PR #176 /showcase（1920×1080 固定版式页）'
    try {
      const ctx2 = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: 'zh-CN',
        deviceScaleFactor: 1,
      })
      const p2 = await ctx2.newPage()
      await p2.goto(`${SHOWCASE_BASE}/showcase`, { waitUntil: 'load', timeout: 30000 })
      await sleep(2500)
      await p2.screenshot({ path, animations: 'disabled' })
      await ctx2.close()
    } catch (e) {
      // :3000 没开 /showcase 时，回退到 PR #176 的验证截图（resize 到 1920×1080）
      const fallback = join(
        process.cwd(),
        '.export-artifacts/pr176-showcase/showcase-1920x1080-retina2x.png',
      )
      if (!existsSync(fallback)) throw e
      await sharp(fallback).resize(1920, 1080, { fit: 'cover' }).png().toFile(path)
      source = 'PR #176 验证截图（回退）'
      console.warn('showcase: 使用 PR #176 验证截图回退', e.message.split('\n')[0])
    }
    const m = await pngMeta(path)
    addEntry({
      id: 'showcase-1920x1080',
      title: '方案展示页（1920×1080 固定版式）',
      category: 'optimized',
      orientation: '16:9',
      format: 'png',
      file: relative(OUT, path),
      ...m,
      source: { type: 'project', ref: source },
      license: '内部宣传使用（繁梦空间自有素材）',
      attribution: '繁梦空间',
      tags: ['showcase', 'hero'],
      notes: '直接可作为 Motion 的 16:9 背景/底图；内容来自内置示例母版项目。',
      ...fileMeta(path),
    })
    log('optimized showcase')
  }

  // #173：展示版点位图（去引线/型号文字），2400×1600（3:2）
  for (const [i, floor] of [
    [1, '一层'],
    [2, '二层'],
    [3, '三层'],
  ]) {
    const src = join(process.cwd(), `public/demo-plans/gy-${i}f-showcase.png`)
    if (!existsSync(src)) continue
    const path = join(OUT, 'assets/optimized', `plan-${i}f-showcase.png`)
    copyFileSync(src, path)
    const m = await pngMeta(path)
    addEntry({
      id: `plan-${i}f-showcase`,
      title: `展示版点位图 · ${floor}`,
      category: 'optimized',
      orientation: '3:2',
      format: 'png',
      file: relative(OUT, path),
      ...m,
      source: { type: 'project', ref: 'public/demo-plans/gy-*f-showcase.png（#173）' },
      license: '内部宣传使用（繁梦空间自有素材）',
      attribution: '繁梦空间',
      tags: ['point-map', 'plan', 'showcase'],
      notes: '只保留房间轮廓、点位圆点与房间名；适合缩到 960px 使用。',
      ...fileMeta(path),
    })
    log('optimized plan', i)
  }

  // 品牌素材（矢量 + 1024 图标）
  for (const [srcRel, id, title, fmt] of [
    ['public/brand/fmkj-logo-full.svg', 'brand-logo-vector', '品牌横版 Logo（矢量）', 'svg'],
    ['public/brand/fmkj-logo-full@2x.png', 'brand-logo-2x', '品牌横版 Logo（2x）', 'png'],
    ['public/brand/fmkj-app-icon-1024.png', 'brand-app-icon-1024', 'App 图标（1024）', 'png'],
  ]) {
    const src = join(process.cwd(), srcRel)
    if (!existsSync(src)) continue
    const ext = srcRel.split('.').pop()
    const path = join(OUT, 'assets/optimized', `${id}.${ext}`)
    copyFileSync(src, path)
    const m = ext === 'png' ? await pngMeta(path) : { width: null, height: null }
    addEntry({
      id,
      title,
      category: 'optimized',
      orientation: ext === 'png' ? '1:1' : 'vector',
      format: fmt,
      file: relative(OUT, path),
      ...m,
      source: { type: 'project', ref: srcRel },
      license: '内部宣传使用（繁梦空间自有素材）',
      attribution: '繁梦空间',
      tags: ['brand', 'logo'],
      notes: ext === 'svg' ? '矢量，Motion 可经 Illustrator/Figma 转 PNG 后导入。' : '',
      ...fileMeta(path),
    })
    log('optimized brand', id)
  }

  // #173：单色设备图标（白/金，16 类必需）—— 拷贝 SVG + 生成 8×2 总览图
  try {
    const monoIndex = JSON.parse(
      readFileSync(join(process.cwd(), 'public/board/symbols/mono/index.json'), 'utf8'),
    )
    const devices = Object.entries(monoIndex.devices || {}).filter(([, d]) => d.required)
    for (const color of ['white', 'gold']) {
      const dir = join(OUT, 'assets/optimized/mono-icons', color)
      mkdirSync(dir, { recursive: true })
      const items = []
      for (const [key, d] of devices) {
        const rel = d[color]
        if (!rel) continue
        const src = join(process.cwd(), 'public/board/symbols/mono', rel)
        if (!existsSync(src)) continue
        const dest = join(dir, `${key}.svg`)
        copyFileSync(src, dest)
        items.push({ key, label: d.label || key, file: relative(OUT, dest) })
      }
      // 8×2 总览图（深色底，方便白/金图标直接看）
      const cell = 112
      const cols = 8
      const rows = Math.ceil(items.length / cols)
      const composites = []
      for (const [i, item] of items.entries()) {
        const x = (i % cols) * cell + (cell - 64) / 2
        const y = Math.floor(i / cols) * cell + (cell - 64) / 2
        const svg = readFileSync(join(OUT, item.file))
        const icon = await sharp(svg, { density: 384 }).resize(64, 64).png().toBuffer()
        composites.push({ input: icon, left: x, top: y })
      }
      const sheetPath = join(OUT, 'assets/optimized', `mono-icons-${color}-sheet.png`)
      await sharp({
        create: {
          width: cols * cell,
          height: rows * cell,
          channels: 4,
          background: { r: 17, g: 17, b: 19, alpha: 1 },
        },
      })
        .composite(composites)
        .png()
        .toFile(sheetPath)
      const sm = await pngMeta(sheetPath)
      addEntry({
        id: `mono-icons-${color}-sheet`,
        title: `单色设备图标总览（${color === 'white' ? '白' : '金'}，${items.length} 个）`,
        category: 'optimized',
        orientation: 'sheet',
        format: 'png',
        file: relative(OUT, sheetPath),
        ...sm,
        source: { type: 'project', ref: 'public/board/symbols/mono（#173）' },
        license: '内部宣传使用（繁梦空间自有素材）',
        attribution: '繁梦空间',
        tags: ['icons', 'mono', 'sheet'],
        notes: '总览图用于快速挑选；单个 SVG 在同目录 mono-icons/<color>/ 下，透明底、可任意缩放。',
        ...fileMeta(sheetPath),
      })
      addEntry({
        id: `mono-icons-${color}-svg`,
        title: `单色设备图标 SVG 集（${color === 'white' ? '白' : '金'}）`,
        category: 'optimized',
        orientation: 'icon',
        format: 'svg',
        file: relative(OUT, dir),
        source: { type: 'project', ref: 'public/board/symbols/mono（#173）' },
        license: '内部宣传使用（繁梦空间自有素材）',
        attribution: '繁梦空间',
        tags: ['icons', 'mono'],
        notes: `${items.length} 个透明底 SVG；Motion 建议先转 256/512 PNG。`,
        items,
      })
      log('optimized mono', color, items.length)
    }
  } catch (e) {
    console.warn('mono icons skipped:', e.message)
  }

  // ── 3. 按钮/控件状态（真实 UI，元素级 2x 截图）────────────────────
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`${BASE}/projects`, { waitUntil: 'load', timeout: 30000 })
  await sleep(2800)

  const stateShots = []
  const primary = page.locator('a:visible').filter({ hasText: '新建项目' }).first()
  if (await primary.count()) stateShots.push(['primary', primary, '主按钮'])
  const iconBtn = page.locator('button:visible[aria-label*="外观"]').first()
  if (await iconBtn.count()) stateShots.push(['icon', iconBtn, '图标按钮（外观）'])
  const tab = page.locator('a:visible').filter({ hasText: '进行中' }).first()
  if (await tab.count()) stateShots.push(['tab', tab, '筛选标签'])
  const search = page.locator('input:visible[placeholder*="搜索项目"]').first()
  if (await search.count()) stateShots.push(['search', search, '搜索输入框'])

  for (const [key, loc, label] of stateShots) {
    try {
      const isInput = key === 'search'
      const states = []
      const save = async (state) => {
        const path = join(OUT, 'assets/button', `${key}-${state}.png`)
        await loc.screenshot({ path, animations: 'disabled' })
        const m = await pngMeta(path)
        states.push({ state, file: relative(OUT, path), ...m, ...fileMeta(path) })
      }
      await loc.scrollIntoViewIfNeeded()
      await save('default')
      if (!isInput) {
        await loc.hover()
        await sleep(350)
        await save('hover')
      }
      await loc.focus().catch(() => {})
      await sleep(250)
      await save('focus')
      const box = await loc.boundingBox()
      if (box && !isInput) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await sleep(250)
        await save('pressed')
        await page.mouse.up()
      }
      addEntry({
        id: `button-${key}`,
        title: `按钮状态 · ${label}`,
        category: 'button',
        orientation: 'element',
        format: 'png',
        file: states[0].file,
        width: states[0].width,
        height: states[0].height,
        source: { type: 'self', ref: '本地演示页面元素截图（2x）' },
        license: '内部宣传使用（繁梦空间自有素材）',
        attribution: '繁梦空间',
        tags: ['button', 'ui-state', key],
        notes: `default / hover / focus / pressed 四态；背景为页面画布色，2x 像素。`,
        states,
      })
      log('button', key, states.length)
      // pressed 的 mouse.up 会触发 click（链接会跳转、图标按钮会开菜单）：复位页面
      await page.keyboard.press('Escape').catch(() => {})
      await page.goto(`${BASE}/projects`, { waitUntil: 'load', timeout: 30000 })
      await sleep(1800)
    } catch (e) {
      console.warn('button state skipped:', key, e.message.split('\n')[0])
    }
  }

  // ── 4. 动效片段（MP4 / H.264，Motion 可导入）────────────────────────
  const clips = []
  const record = async (id, title, { width = 1920, height = 1080 }, actions) => {
    const vctx = await browser.newContext({
      viewport: { width, height },
      locale: 'zh-CN',
      recordVideo: { dir: join(OUT, '_raw'), size: { width, height } },
    })
    const vp = await vctx.newPage()
    await login(vp, BASE)
    try {
      await actions(vp)
    } catch (e) {
      console.warn('clip action failed', id, e.message.split('\n')[0])
    }
    const video = vp.video()
    await vctx.close()
    if (!video) return
    const raw = await video.path()
    const mp4 = join(OUT, 'assets/motion', `${id}.mp4`)
    transcode(raw, mp4, { width, height })
    const meta = ffprobe(mp4) || {}
    addEntry({
      id,
      title,
      category: 'motion',
      orientation: '16:9',
      format: 'mp4',
      file: relative(OUT, mp4),
      width: meta.width ?? width,
      height: meta.height ?? height,
      durationMs: meta.durationMs ?? null,
      codec: meta.codec,
      source: { type: 'self', ref: '本地真实交互录屏 → H.264 MP4' },
      license: '内部宣传使用（繁梦空间自有素材）',
      attribution: '繁梦空间',
      tags: ['motion', 'ui', id],
      notes: 'Motion：直接 Import 到项目；透明叠加需自行抠底（录屏带页面背景）。',
      ...fileMeta(mp4),
    })
    clips.push(id)
    log('motion', id, meta.codec, meta.durationMs)
  }

  await record('account-menu', '账户菜单开合', {}, async (vp) => {
    await vp.goto(`${BASE}/projects`, { waitUntil: 'load', timeout: 30000 })
    await sleep(2500)
    await vp.locator('button[aria-label^="账户"]').click()
    await sleep(1000)
    await vp.keyboard.press('Escape')
    await sleep(600)
  })
  await record('theme-switch', '深浅色切换', {}, async (vp) => {
    await vp.goto(`${BASE}/projects`, { waitUntil: 'load', timeout: 30000 })
    await sleep(2500)
    await vp.locator('button[aria-label*="外观"]').click()
    await sleep(600)
    await vp.getByText('深色', { exact: true }).first().click()
    await sleep(1200)
    await vp.locator('button[aria-label*="外观"]').click()
    await sleep(500)
    await vp.getByText('浅色', { exact: true }).first().click()
    await sleep(800)
  })
  await record('ai-drawer', 'AI 侧栏抽屉', { width: 1280, height: 720 }, async (vp) => {
    await vp.goto(`${BASE}/projects`, { waitUntil: 'load', timeout: 30000 })
    await sleep(2500)
    const toggle = vp.locator('[aria-label="AI 对话"]').first()
    if (await toggle.count()) {
      await toggle.click()
      await sleep(1200)
      const close = vp.locator('[aria-label="关闭 AI 对话"]').first()
      if (await close.count()) await close.click()
      await sleep(600)
    }
  })

  await browser.close()

  // ── 5. manifest + 静态浏览页 + README ───────────────────────────────
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/asset-library/build.mjs',
    sourceBase: BASE,
    privacy: '内部宣传素材；产物在 .export-artifacts/（gitignore），不进入公开站。',
    licenses: {
      self: '繁梦空间自产（演示数据），仅限内部宣传使用。',
      project: '繁梦空间项目自有素材，仅限内部宣传使用。',
      external: '本批次未收录任何外部素材；后续收录必须有明确的宣传与再分发授权。',
    },
    categories: {
      product: '真实产品页面截图（演示数据）',
      optimized: '宣传用优化版（展示页、点位图、图标、品牌）',
      button: '可复用按钮/控件状态',
      motion: '可预览动效片段（MP4/H.264，Motion 可导入）',
    },
    entries,
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

  // 清理录屏中间产物
  rmSync(join(OUT, '_raw'), { recursive: true, force: true })

  writeFileSync(join(OUT, 'index.html'), renderHtml(manifest))
  writeFileSync(join(OUT, 'README.md'), renderReadme(manifest))

  console.log(`\n✓ ${entries.length} entries → ${relative(process.cwd(), OUT)}`)
  const count = (c) => entries.filter((e) => e.category === c).length
  console.log(
    `  product ${count('product')} · optimized ${count('optimized')} · button ${count('button')} · motion ${count('motion')}`,
  )
}

function renderHtml(manifest) {
  const data = JSON.stringify(manifest).replace(/</g, '\\u003c')
  const cards = manifest.entries
    .map((e) => {
      const meta = [
        e.orientation,
        e.width && e.height ? `${e.width}×${e.height}` : null,
        e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : null,
        e.format.toUpperCase(),
      ]
        .filter(Boolean)
        .join(' · ')
      const preview = e.items
        ? `<div class="fileicon">SVG × ${e.items.length}</div>`
        : e.format === 'mp4'
          ? `<video src="${e.file}" muted loop playsinline preload="metadata"></video>`
          : e.format === 'png' || e.format === 'svg'
            ? `<img src="${e.states ? e.states[0].file : e.file}" alt="${e.title}" loading="lazy" />`
            : `<div class="fileicon">${e.format.toUpperCase()}</div>`
      const downloads = e.states
        ? e.states
            .map(
              (s) => `<a class="mini" href="${s.file}" download title="${s.state}">${s.state}</a>`,
            )
            .join('')
        : e.items
          ? `<span class="mini muted">${e.items.length} 个 SVG</span>`
          : `<a class="dl" href="${e.file}" download>下载</a>`
      return `<article class="card" data-cat="${e.category}" data-orient="${e.orientation}" data-tags="${(e.tags || []).join(' ')}" data-text="${(e.title + ' ' + (e.tags || []).join(' ')).toLowerCase()}">
  <div class="thumb">${preview}</div>
  <div class="body">
    <div class="row"><span class="badge c-${e.category}">${e.category}</span><span class="meta">${meta}</span></div>
    <h3>${e.title}</h3>
    <p class="src">${e.source.ref} · ${e.license}</p>
    <div class="actions">${downloads}<button class="copy" data-file="${e.file}">复制路径</button></div>
  </div>
</article>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>繁梦空间 · 内部素材库</title>
<link rel="icon" href="data:," />
<style>
:root{--bg:#0b0b0c;--panel:#161618;--border:#2a2a2e;--fg:#f4f4f5;--muted:#9b9ba3;--accent:#9d8cff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"PingFang SC","Segoe UI",sans-serif}
header{padding:28px 32px 12px;display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between}
h1{font-size:20px;margin:0}h1 span{color:var(--muted);font-size:13px;font-weight:400;margin-left:10px}
.banner{margin:0 32px;padding:10px 14px;border:1px solid #3a3344;background:#1c1726;color:#c9c2e8;border-radius:10px;font-size:12px}
.controls{display:flex;flex-wrap:wrap;gap:10px;padding:16px 32px;align-items:center}
input[type=search]{background:var(--panel);border:1px solid var(--border);color:var(--fg);border-radius:10px;padding:9px 12px;min-width:260px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:var(--panel);border:1px solid var(--border);color:var(--muted);border-radius:999px;padding:7px 13px;cursor:pointer;font-size:12px}
.chip.active{border-color:var(--accent);color:var(--fg);background:#241f3a}
.count{color:var(--muted);font-size:12px;margin-left:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;padding:8px 32px 48px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.thumb{height:170px;background:#08080a;display:flex;align-items:center;justify-content:center;overflow:hidden}
.thumb img,.thumb video{max-width:100%;max-height:100%;object-fit:contain}
.fileicon{color:var(--muted);font-weight:600;letter-spacing:.1em}
.body{padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);color:var(--fg);text-transform:uppercase;letter-spacing:.04em}
.c-product{background:#12222b;border-color:#1d3a47}.c-optimized{background:#1b2417;border-color:#2c3a23}
.c-button{background:#241f3a;border-color:#3a3360}.c-motion{background:#2b1a1a;border-color:#4a2a2a}
.meta{color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
h3{font-size:14px;margin:0}
.src{color:var(--muted);font-size:11px;margin:0;line-height:1.45}
.actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:2px}
.dl,.mini{font-size:12px;color:#0b0b0c;background:var(--accent);border-radius:8px;padding:6px 12px;text-decoration:none;font-weight:600}
.mini{background:#2a2a30;color:var(--fg);font-weight:400;padding:4px 9px;text-transform:capitalize}
.mini.muted{color:var(--muted)}
.copy{background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;margin-left:auto}
.copy:hover{color:var(--fg);border-color:var(--accent)}
.empty{padding:48px 32px;color:var(--muted)}
footer{padding:0 32px 40px;color:var(--muted);font-size:11px}
code{background:#1f1f24;padding:1px 6px;border-radius:5px}
</style></head>
<body>
<header>
  <h1>繁梦空间 · 内部素材库 <span>${manifest.entries.length} 项 · 仅内部宣传使用</span></h1>
  <span class="meta">生成于 ${manifest.generatedAt}</span>
</header>
<div class="banner">独立产物：位于 <code>.export-artifacts/asset-library/</code>，不进公开站。截图使用演示数据；外部素材本批为 0。</div>
<div class="controls">
  <input id="q" type="search" placeholder="搜索标题 / 标签（如 hero、motion、button）" />
  <div class="chips" id="cats"></div>
  <div class="chips" id="orients"></div>
  <span class="count" id="count"></span>
</div>
<main class="grid" id="grid">${cards}</main>
<footer>
  Motion：图片/视频直接 Import；按钮/图标是 PNG/SVG（透明元素按需抠底）。<br/>
  许可：${manifest.licenses.self} ${manifest.licenses.project} ${manifest.licenses.external}<br/>
  复跑：<code>node scripts/asset-library/build.mjs</code> · 清单：<code>manifest.json</code>
</footer>
<script>
const DATA = ${data};
const grid = document.getElementById('grid');
const q = document.getElementById('q');
const countEl = document.getElementById('count');
let cat = 'all', orient = 'all';
const cats = ['all', ...Object.keys(DATA.categories)];
const orients = ['all', ...new Set(DATA.entries.map(e => e.orientation))];
function renderChips(el, list, current, onPick) {
  el.innerHTML = list.map(v => \`<button class="chip \${v===current?'active':''}" data-v="\${v}">\${v==='all'?'全部':v}</button>\`).join('');
  el.querySelectorAll('.chip').forEach(b => b.onclick = () => onPick(b.dataset.v));
}
function apply() {
  const text = q.value.trim().toLowerCase();
  let n = 0;
  grid.querySelectorAll('.card').forEach(card => {
    const okCat = cat === 'all' || card.dataset.cat === cat;
    const okOri = orient === 'all' || card.dataset.orient === orient;
    const okText = !text || card.dataset.text.includes(text);
    const show = okCat && okOri && okText;
    card.style.display = show ? '' : 'none';
    if (show) n++;
  });
  countEl.textContent = n + ' / ' + DATA.entries.length + ' 项';
}
function bind() {
  renderChips(document.getElementById('cats'), cats, cat, v => { cat = v; bind(); apply(); });
  renderChips(document.getElementById('orients'), orients, orient, v => { orient = v; bind(); apply(); });
  document.querySelectorAll('.copy').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.file); b.textContent = '已复制'; setTimeout(()=>b.textContent='复制路径',1200); } catch {}
  });
  apply();
}
q.addEventListener('input', apply);
bind();
// 视频悬停预览
document.querySelectorAll('.thumb video').forEach(v => {
  v.addEventListener('mouseenter', () => v.play().catch(()=>{}));
  v.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
});
</script>
</body></html>`
}

function renderReadme(manifest) {
  const rows = manifest.entries
    .map(
      (e) =>
        `| ${e.id} | ${e.category} | ${e.orientation} | ${e.width ?? '-'}×${e.height ?? '-'} | ${e.durationMs ? (e.durationMs / 1000).toFixed(1) + 's' : '-'} | ${e.file} | ${e.source.ref} |`,
    )
    .join('\n')
  return `# 繁梦空间 · 内部素材库（issue #179）

独立产物，**不在公开站**：目录 \`.export-artifacts/asset-library/\`（gitignore）。
浏览：直接打开 \`index.html\`（manifest 已内联，file:// 也能用；视频预览建议起一个本地静态服务）。

## 用途与边界
- 供团队制作宣传视频（含 Apple Motion 工程直接 Import）。
- 截图/录屏全部来自本机演示环境与**演示数据**（内置示例项目，无客户真实信息）。
- 外部素材：**0**。后续收录必须同时具备「宣传使用」与「再分发」授权，并在 manifest 写清署名。
- 本产物不进入公开站；不要把它复制到 public/。

## 分类
- \`product\`：真实产品页面截图（16:9 / 9:16）
- \`optimized\`：展示页 1920×1080、展示版点位图、单色图标、品牌矢量
- \`button\`：真实按钮/控件 default/hover/focus/pressed 四态（2x）
- \`motion\`：交互录屏转 H.264 MP4（Motion 可导入）

## Motion 导入
1. File → Import，选 PNG/MP4；视频按素材尺寸自动建层。
2. 按钮/控件 PNG 带页面背景（非透明）；图标 SVG 透明底，建议先转 256/512 PNG。
3. 时长与尺寸见 manifest 的 \`durationMs\` / \`width\` / \`height\`。

## 复跑
\`\`\`bash
# 本机 dev（演示库）+ PR #176 的 /showcase dev（如可用）
PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts DATABASE_URI=postgres://fmkj@127.0.0.1:55432/fmkj \\
PAYLOAD_SECRET=dev-local-secret-key-please-change PORT=3001 pnpm exec next dev --port 3001
node scripts/asset-library/build.mjs
node scripts/asset-library/verify.mjs
\`\`\`

## 清单
| id | category | orientation | 尺寸 | 时长 | 文件 | 来源 |
| --- | --- | --- | --- | --- | --- | --- |
${rows}
`
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
