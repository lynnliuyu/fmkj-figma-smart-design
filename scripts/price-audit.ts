/**
 * 产品价格补齐与校准工具（issue #195）。
 *
 * 两条命令，都只写 `marketPrice / priceSource / priceCheckedAt`，
 * **绝不写 `price`（对外售价）**：
 *
 *   # 1) 出清单：缺价产品 + 有价但与参考价偏差大的抽样
 *   pnpm exec payload run --input '{"scriptPath":"scripts/price-audit.ts","scriptArgs":["--list","--out","/tmp/price-audit"]}'
 *
 *   # 2) 按人工确认过的 CSV 写参考价（默认 dry-run，加 --apply 才落库）
 *   pnpm exec payload run --input '{"scriptPath":"scripts/price-audit.ts","scriptArgs":["--apply","/tmp/price-audit/confirmed.csv"]}'
 *
 * 硬约束（与工单一致）：
 * - 只写参考价字段；price 一律不动（脚本里没有写 price 的路径）。
 * - 逐条写入，遇错立即停止（失败即停），不循环重试。
 * - CSV 里 marketPrice 为空 / 非法 / 非正数 → 跳过并记入 skipped，不代填。
 * - 不抓取需要登录的页面；抓取（电商到手价）在工具之外完成，本脚本只做
 *   「清单 → 人工确认 → 入库」，避免把反爬/合规风险带进服务器。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Args = {
  list: boolean
  apply: string | null
  out: string
  /** 每批写多少条（默认 50）；写完一批落一次进度，可断点续跑 */
  batchSize: number
  /** 从 progress.json 记到的位置继续 */
  resume: boolean
  /** 只处理前 N 条（样本阶段用，例如 --limit 15） */
  limit: number | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    list: false,
    apply: null,
    out: process.cwd(),
    batchSize: 50,
    resume: false,
    limit: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--list') args.list = true
    else if (a === '--apply') args.apply = argv[++i] ?? null
    else if (a === '--out') args.out = argv[++i] ?? args.out
    else if (a === '--batch-size') args.batchSize = Math.max(1, Number(argv[++i]) || 50)
    else if (a === '--resume') args.resume = true
    else if (a === '--limit') args.limit = Math.max(1, Number(argv[++i]) || 1)
  }
  return args
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (rows: Record<string, unknown>[], columns: string[]) =>
  [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') +
  '\n'

/** 极简 CSV 解析（够用：无嵌套引号换行的简单表）。 */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) return []
  const split = (line: string) => {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') quoted = false
        else cur += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const header = split(lines[0]!).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = split(line)
    const row: Record<string, string> = {}
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()))
    return row
  })
}

/** 电商搜索链接（人工核对用；不自动抓取）。 */
const searchLinks = (sku: string, name: string) => {
  const q = encodeURIComponent(`${sku} ${name}`.trim())
  return {
    jd: `https://search.jd.com/Search?keyword=${q}&enc=utf-8`,
    tmall: `https://list.tmall.com/search_product.htm?q=${q}`,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.selfhost.config')

  const payload = await getPayload({ config })

  if (args.list) {
    const res = await payload.find({
      collection: 'products',
      limit: 5000,
      depth: 0,
      overrideAccess: true,
      select: {
        sku: true,
        name: true,
        deviceType: true,
        price: true,
        marketPrice: true,
        priceCheckedAt: true,
        brand: true,
        status: true,
      } as never,
    })
    const docs = res.docs as unknown as Record<string, unknown>[]

    // depth:0 时 brand 只是 ID 字符串，按对象取名会得到空品牌（验收观察 #1）。
    // 单独查一次品牌表建 id→name 映射，避免逐条 depth:1 放大响应。
    const brandNames = new Map<string, string>()
    try {
      const brands = await payload.find({
        collection: 'brands',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
        select: { name: true },
      })
      for (const b of brands.docs as unknown as Record<string, unknown>[])
        brandNames.set(String(b.id), String(b.name ?? ''))
    } catch {
      // 品牌表读不到时退化为 ID，不阻断清单生成
    }
    const brandOf = (p: Record<string, unknown>) => {
      const raw = p.brand
      if (raw && typeof raw === 'object') return String((raw as { name?: unknown }).name ?? '')
      return raw ? (brandNames.get(String(raw)) ?? '') : ''
    }
    const missing = docs.filter((p) => {
      const mp = typeof p.marketPrice === 'number' ? p.marketPrice : 0
      return !(mp > 0)
    })

    mkdirSync(args.out, { recursive: true })

    // 待补清单（人工核对用）：带品牌与搜索链接
    const rows = missing.map((p) => {
      const brand = brandOf(p)
      const links = searchLinks(String(p.sku ?? ''), String(p.name ?? ''))
      return {
        sku: p.sku,
        name: p.name,
        deviceType: p.deviceType,
        brand,
        当前售价: p.price,
        参考价: '',
        来源链接: '',
        jd搜索: links.jd,
        tmall搜索: links.tmall,
      }
    })
    const columns = [
      'sku',
      'name',
      'deviceType',
      'brand',
      '当前售价',
      '参考价',
      '来源链接',
      'jd搜索',
      'tmall搜索',
    ]
    writeFileSync(join(args.out, 'missing-price.csv'), toCsv(rows, columns))
    writeFileSync(
      join(args.out, 'missing-price.json'),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), total: docs.length, missing: rows },
        null,
        2,
      ),
    )

    // 偏差抽样（已有参考价的产品，与售价偏差 > 20%）
    const deviation = docs
      .filter((p) => typeof p.marketPrice === 'number' && (p.marketPrice as number) > 0)
      .map((p) => {
        const mp = p.marketPrice as number
        const price = typeof p.price === 'number' ? p.price : 0
        const diff = price > 0 ? (mp - price) / price : null
        return {
          sku: p.sku,
          name: p.name,
          price,
          marketPrice: mp,
          偏差百分比: diff === null ? '' : Math.round(diff * 1000) / 10,
        }
      })
      .filter((r) => typeof r.偏差百分比 === 'number' && Math.abs(r.偏差百分比) > 20)
      .sort((a, b) => Math.abs(Number(b.偏差百分比)) - Math.abs(Number(a.偏差百分比)))
    writeFileSync(
      join(args.out, 'deviation-top.csv'),
      toCsv(deviation, ['sku', 'name', 'price', 'marketPrice', '偏差百分比']),
    )

    const withRef = docs.filter(
      (p) => typeof p.marketPrice === 'number' && (p.marketPrice as number) > 0,
    ).length
    const coverage = {
      generatedAt: new Date().toISOString(),
      total: docs.length,
      withMarketPrice: withRef,
      missingMarketPrice: rows.length,
      coveragePct: docs.length ? Math.round((withRef / docs.length) * 1000) / 10 : 0,
      deviationOver20pct: deviation.length,
      missingByDeviceType: rows.reduce<Record<string, number>>((acc, r) => {
        const k = String(r.deviceType ?? 'unknown')
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      }, {}),
      missingByBrand: rows.reduce<Record<string, number>>((acc, r) => {
        const k = String(r.brand || 'unknown')
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      }, {}),
    }
    writeFileSync(join(args.out, 'coverage.json'), JSON.stringify(coverage, null, 2))
    console.log(
      `清单已生成 → ${args.out}\n  产品总数 ${docs.length}，缺参考价 ${rows.length}，覆盖率 ${coverage.coveragePct}%\n  偏差>20% ${deviation.length}（deviation-top.csv）`,
    )
    return
  }

  if (args.apply) {
    if (!existsSync(args.apply)) {
      throw new Error(`找不到确认文件：${args.apply}`)
    }
    const progressFile = args.apply.replace(/\.csv$/, '') + '.progress.json'
    const resultFile = args.apply.replace(/\.csv$/, '') + '.result.json'

    const allRows = parseCsv(readFileSync(args.apply, 'utf8'))
    const rows = args.limit ? allRows.slice(0, args.limit) : allRows

    // 断点续跑：progress.json 记录已完成的行键与累计统计
    type Progress = {
      doneSkus: string[]
      updated: number
      skipped: string[]
      batches: { index: number; from: number; to: number; updated: number; at: string }[]
    }
    let progress: Progress = { doneSkus: [], updated: 0, skipped: [], batches: [] }
    if (args.resume && existsSync(progressFile)) {
      progress = JSON.parse(readFileSync(progressFile, 'utf8')) as Progress
      console.log(`续跑：已完成 ${progress.doneSkus.length} 条`)
    }
    const done = new Set(progress.doneSkus)

    let batchUpdated = 0
    let batchStartRow = 1
    let processed = 0
    const total = rows.length
    for (const [index, row] of rows.entries()) {
      const sku = (row.sku ?? '').trim()
      if (sku && done.has(sku)) continue

      const raw = (row['参考价'] ?? row.marketPrice ?? '').trim()
      const source = (row['来源链接'] ?? row.priceSource ?? '').trim()
      const price = Number(raw)
      if (!sku || !(Number.isFinite(price) && price > 0)) {
        // 抓不到就留空等人工：不猜、不代填（resume 时同一条不重复记，验收观察 #3）
        const note = `${sku || '(无 sku)'}: 参考价为空或非法（${raw || '空'}）`
        if (!progress.skipped.includes(note)) progress.skipped.push(note)
        continue
      }
      const found = await payload.find({
        collection: 'products',
        where: { sku: { equals: sku } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const doc = found.docs[0]
      if (!doc) {
        const note = `${sku}: 库里没有这个 SKU`
        if (!progress.skipped.includes(note)) progress.skipped.push(note)
        continue
      }
      try {
        // ⚠️ 只写参考价三件套；**没有任何写 price 的分支**。
        await payload.update({
          collection: 'products',
          id: doc.id,
          data: {
            marketPrice: price,
            priceSource: source || null,
            priceCheckedAt: new Date().toISOString(),
          },
          overrideAccess: true,
        })
      } catch (e) {
        // 失败即停（不硬刷）：把当前进度落盘后退出
        writeFileSync(progressFile, JSON.stringify(progress, null, 2))
        throw new Error(
          `第 ${index + 1} 条（${sku}）写入失败，已停止并保存进度：${e instanceof Error ? e.message : e}`,
        )
      }
      if (batchUpdated === 0) batchStartRow = index + 1
      progress.updated++
      progress.doneSkus.push(sku)
      done.add(sku)
      batchUpdated++
      processed++

      // 限速：每写一条停 120ms
      await new Promise((r) => setTimeout(r, 120))

      // 每批落一次进度（断点续跑的锚点）
      if (batchUpdated >= args.batchSize) {
        progress.batches.push({
          index: progress.batches.length + 1,
          // 本批覆盖的 CSV 行号区间（1-based，仅统计实际写入的行）
          from: batchStartRow,
          to: index + 1,
          updated: batchUpdated,
          at: new Date().toISOString(),
        })
        writeFileSync(progressFile, JSON.stringify(progress, null, 2))
        console.log(
          `  批次 ${progress.batches.length} 完成：+${batchUpdated}，累计 ${progress.updated}/${total}`,
        )
        batchUpdated = 0
      }
    }

    // 收尾：落盘进度与结果（含跳过明细，便于人工补）
    if (batchUpdated > 0) {
      progress.batches.push({
        index: progress.batches.length + 1,
        from: batchStartRow,
        to: rows.length,
        updated: batchUpdated,
        at: new Date().toISOString(),
      })
    }
    writeFileSync(progressFile, JSON.stringify(progress, null, 2))
    writeFileSync(
      resultFile,
      JSON.stringify(
        {
          updated: progress.updated,
          skipped: progress.skipped,
          batches: progress.batches,
          processedThisRun: processed,
          total,
          at: new Date().toISOString(),
          note: '只写 marketPrice/priceSource/priceCheckedAt；price 未被修改。',
        },
        null,
        2,
      ),
    )
    console.log(
      `已写入参考价 ${progress.updated} 条（本次 +${processed}）；跳过 ${progress.skipped.length} 条\n  进度：${progressFile}\n  结果：${resultFile}`,
    )
    if (progress.skipped.length) console.log(progress.skipped.slice(0, 20).join('\n'))
    return
  }

  console.log('用法：--list [--out 目录] | --apply <missing-price.csv（填好参考价）>')
}

// ⚠️ 必须顶层 await：`payload run` 在脚本模块返回后即结束进程，
// 用 `main().then()` 的写法异步工作会被直接截断（实测无输出、无产出文件）。
try {
  await main()
} catch (e) {
  console.error('失败：', e instanceof Error ? e.message : e)
  process.exitCode = 1
}
