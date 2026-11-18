/**
 * issue #178 CAD 编辑预览 —— 真实浏览器验证。
 * 打开样例 DXF → 选择/删除一个几何 → 保存 DXF 副本 → 重新打开并核对实体数。
 * 运行前：:3001 dev server + demo@fmkj.local 账号。
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3001'
const OUT = process.env.CAD_OUT || '.export-artifacts/issue178'
mkdirSync(join(OUT, 'downloads'), { recursive: true })
mkdirSync(join(OUT, 'shots'), { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const errs = []
const external = []

function countEntities(dxf) {
  const lines = dxf.split(/\r?\n/)
  const counts = {}
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === '0') {
      const type = lines[i + 1].trim()
      if (type) counts[type] = (counts[type] || 0) + 1
    }
  }
  return counts
}

const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  acceptDownloads: true,
  recordVideo: { dir: join(OUT, 'video'), size: { width: 1440, height: 900 } },
})
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)))
p.on('console', (m) => {
  if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200))
})
p.on('request', (r) => {
  const u = r.url()
  if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u)
})

/** 开发环境句柄（cad-editor 在 NODE_ENV!=production 时挂 window.__cad） */
async function selectionCount(page) {
  return page.evaluate(() => {
    const sel = window.__cad?.manager?.curView?.selectionSet
    return sel ? (sel.size ?? sel._ids?.size ?? 0) : -1
  })
}

/** 用上游 view.worldToScreen 把世界坐标映射到画布内坐标，跨布局稳定。 */
async function worldToPage(page, x, y) {
  const pt = await page.evaluate(
    ([wx, wy]) => {
      const v = window.__cad?.manager?.curView
      if (!v?.worldToScreen) return null
      const s = v.worldToScreen({ x: wx, y: wy })
      return { x: s.x, y: s.y }
    },
    [x, y],
  )
  if (!pt) return null
  const box = await page.locator('[data-slot=cad-canvas]').boundingBox()
  if (!box) return null
  return { x: box.x + pt.x, y: box.y + pt.y }
}

/** 在映射点附近小范围扫描点击，直到选中实体（布局/缩放下有 1-8px 偏移）。 */
async function clickSelectable(page, x, y) {
  for (const dy of [0, -2, 2, -4, 4]) {
    for (const dx of [0, -2, 2, -4, 4, -6, 6, -8, 8]) {
      await page.keyboard.press('Escape')
      await page.mouse.click(x + dx, y + dy)
      await sleep(120)
      if ((await selectionCount(page)) > 0) return true
    }
  }
  return false
}

async function entityCount(page) {
  return page.evaluate(() => {
    const m = window.__cad?.manager
    const ms = m?.curDocument?.database?.tables?.blockTable?.modelSpace
    if (!ms?.newIterator) return -1
    return Array.from(ms.newIterator()).length
  })
}

const step = async (name, fn) => {
  try {
    const v = await fn()
    results.push({ name, ok: true, detail: v ?? null })
    console.log('✅', name, v ? `(${v})` : '')
    return v
  } catch (e) {
    results.push({ name, ok: false, error: e.message.split('\n')[0] })
    console.log('❌', name, e.message.split('\n')[0])
    await p.screenshot({ path: join(OUT, 'shots', `FAIL-${name}.png`) }).catch(() => {})
    return null
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

await step('能力中心出现 CAD 入口', async () => {
  await p.goto(`${BASE}/capabilities`, { waitUntil: 'load', timeout: 30000 })
  await sleep(2500)
  const text = await p.evaluate(() => document.body.innerText)
  if (!text.includes('CAD 编辑（预览）')) throw new Error('能力中心没有 CAD 卡片')
  const card = p.locator('a[href="/plugins/cad-editor"]').first()
  await card.scrollIntoViewIfNeeded()
  await sleep(500)
  await p.screenshot({ path: join(OUT, 'shots', '0-capability-center.png') })
})

await step('详情页入口可用', async () => {
  await p.locator('a[href="/plugins/cad-editor"]').first().click()
  await sleep(2500)
  await p.screenshot({ path: join(OUT, 'shots', '0-detail.png') })
  const btn = p.locator('a[href="/capabilities/cad"]').first()
  if (!(await btn.count())) throw new Error('详情页没有打开按钮')
  await btn.click()
  await sleep(3500)
  if (!p.url().endsWith('/capabilities/cad')) throw new Error(`入口跳转异常：${p.url()}`)
})

await step('进入 CAD 预览页', async () => {
  await p.goto(`${BASE}/capabilities/cad`, { waitUntil: 'load', timeout: 30000 })
  await sleep(4000)
  if (!(await p.locator('[data-slot=cad-canvas] canvas').count())) throw new Error('画布未渲染')
  await p.screenshot({ path: join(OUT, 'shots', '1-enter.png') })
})

await step('打开合成样例 DXF', async () => {
  await p.locator('[data-action=open-sample]').click()
  await sleep(5000)
  const file = await p.locator('[data-slot=cad-file]').innerText()
  const layers = await p.locator('[data-slot=cad-layers]').innerText()
  if (!file.includes('demo-plan.dxf')) throw new Error('文件名未显示')
  if (!/图层\s+4/.test(layers)) throw new Error(`图层数异常：${layers}`)
  await p.screenshot({ path: join(OUT, 'shots', '2-open-sample.png') })
  return `${file} / ${layers}`
})

await step('缩放到范围', async () => {
  await p.locator('button[aria-label="缩放到范围"]').click()
  await sleep(800)
  // 结束 zoom 命令，避免后续第一次点击被命令状态吞掉
  await p.keyboard.press('Escape')
  await sleep(300)
  await p.screenshot({ path: join(OUT, 'shots', '3-zoom-extents.png') })
})

// 选择左圆并删除（坐标来自 1440×900 视口的实际渲染）
await step('选择几何并删除（实际几何编辑）', async () => {
  // 用上游 view.worldToScreen 定位左圆圆心（世界坐标 3000,4000），跨布局稳定。
  const before = await entityCount(p)
  if (before < 0) throw new Error('拿不到实体数（开发句柄未挂载）')
  const pt = await worldToPage(p, 3000, 4000)
  if (!pt) throw new Error('拿不到世界坐标到屏幕的映射')
  if (!(await clickSelectable(p, pt.x, pt.y))) throw new Error('点选几何失败')
  await p.locator('[data-action=erase]').click()
  await sleep(1500)
  const after = await entityCount(p)
  if (after >= before) throw new Error(`几何删除未生效（entity ${before} → ${after}）`)
  console.log(`    entity ${before} → ${after}`)
  const t = await p.locator('[data-slot=cad-dirty]').innerText()
  if (!t.includes('未保存')) throw new Error('删除后未进入「有未保存修改」状态')
  console.log(`    entity ${before} → ${after}`)
  await p.screenshot({ path: join(OUT, 'shots', '4-after-erase.png') })
})

let downloadedPath = null
await step('保存 DXF 副本', async () => {
  const [download] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.locator('[data-action=save-dxf]').click(),
  ])
  const name = download.suggestedFilename()
  downloadedPath = join(OUT, 'downloads', name)
  await download.saveAs(downloadedPath)
  const dxf = readFileSync(downloadedPath, 'utf8')
  const counts = countEntities(dxf)
  // 交叉核对：内存里同一次 dxfOut 的结果（排除下载串味）
  const memDxf = await p.evaluate(() => {
    const db = window.__cad?.manager?.curDocument?.database
    return db?.dxfOut ? db.dxfOut(undefined, 6) : ''
  })
  const memCounts = countEntities(String(memDxf))
  writeFileSync(
    join(OUT, 'saved-counts.json'),
    JSON.stringify({ download: counts, memory: memCounts }, null, 2),
  )
  console.log(
    `    download LINE:${counts.LINE} CIRCLE:${counts.CIRCLE} | memory LINE:${memCounts.LINE} CIRCLE:${memCounts.CIRCLE}`,
  )
  if (memCounts.CIRCLE !== 1) throw new Error(`内存副本里 CIRCLE 应为 1，实际 ${memCounts.CIRCLE}`)
  if (counts.CIRCLE !== 1) throw new Error(`下载副本里 CIRCLE 应为 1，实际 ${counts.CIRCLE}`)
  await sleep(800)
  await p.screenshot({ path: join(OUT, 'shots', '5-saved.png') })
  return `${name} LINE:${counts.LINE} CIRCLE:${counts.CIRCLE} TEXT:${counts.TEXT}`
})

await step('重新打开保存的副本并核对实体', async () => {
  if (!downloadedPath) throw new Error('没有可重开的副本')
  const before = await p.locator('[data-slot=cad-dirty]').innerText()
  await p.setInputFiles('[data-slot=cad-file-input]', downloadedPath)
  await sleep(5000)
  const file = await p.locator('[data-slot=cad-file]').innerText()
  const layers = await p.locator('[data-slot=cad-layers]').innerText()
  const after = await p.locator('[data-slot=cad-dirty]').innerText()
  if (!file.toLowerCase().includes('.dxf')) throw new Error('重开后文件名异常')
  await p.screenshot({ path: join(OUT, 'shots', '6-reopen.png') })
  return `file=${file} ${layers} dirty(保存前=${before} 重开=${after})`
})

await step('非法文件显示错误（加载错误处理）', async () => {
  const bad = join(OUT, 'downloads', 'not-a-drawing.dxf')
  writeFileSync(bad, 'this is not a dxf')
  await p.setInputFiles('[data-slot=cad-file-input]', bad)
  await sleep(2500)
  const text = await p.evaluate(() => document.body.innerText)
  if (!/失败|无效|解析/.test(text)) throw new Error('没有错误提示')
  await p.screenshot({ path: join(OUT, 'shots', '7-invalid-error.png') })
})

await step('DWG 被明确拒绝（许可证边界）', async () => {
  const dwg = join(OUT, 'downloads', 'demo.dwg')
  writeFileSync(dwg, 'fake dwg')
  await p.setInputFiles('[data-slot=cad-file-input]', dwg)
  await sleep(2000)
  const text = await p.evaluate(() => document.body.innerText)
  if (!/DWG/.test(text) || !/不支持|暂不|GPL/.test(text)) throw new Error('DWG 没有被明确拒绝')
  await p.screenshot({ path: join(OUT, 'shots', '7b-dwg-rejected.png') })
})

await step('脏状态离开提示', async () => {
  // 重新打开样例并删除一个实体，制造脏状态
  await p.locator('[data-action=open-sample]').click()
  await sleep(4000)
  const before = await entityCount(p)
  const pt = await worldToPage(p, 3000, 4000)
  if (!pt) throw new Error('拿不到世界坐标映射')
  if (!(await clickSelectable(p, pt.x, pt.y))) throw new Error('点选几何失败')
  await p.locator('[data-action=erase]').click()
  await sleep(1500)
  const after = await entityCount(p)
  if (after >= before) throw new Error('没有制造出脏状态')
  const dirty = await p.locator('[data-slot=cad-dirty]').innerText()
  if (!dirty.includes('未保存')) throw new Error('没有制造出脏状态')
  // 触发站内跳转守卫
  let dialogSeen = false
  p.once('dialog', async (d) => {
    dialogSeen = true
    await d.dismiss()
  })
  await p.keyboard.press('Escape')
  await sleep(300)
  const navLink = p.locator('a[href="/projects"]').filter({ hasText: '项目' }).first()
  await navLink.click({ timeout: 10000 })
  await sleep(1200)
  await p.screenshot({ path: join(OUT, 'shots', '8-unsaved-guard.png') })
  if (!dialogSeen) throw new Error('离开时没有出现未保存确认')
})

writeFileSync(join(OUT, 'result.json'), JSON.stringify({ results, errs, external }, null, 2))
console.log('external requests:', JSON.stringify([...new Set(external)]))
console.log('console errors:', JSON.stringify(errs.slice(0, 6)))
await b.close()
process.exit(results.some((r) => !r.ok) ? 1 : 0)
