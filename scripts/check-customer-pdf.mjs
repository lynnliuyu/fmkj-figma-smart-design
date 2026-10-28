/**
 * Offline acceptance for the production customer PDF templates and shared page budget.
 * Uses fictional data and file:// only: no server, login, customer record or live browser.
 * Run: node scripts/check-customer-pdf.mjs [--prepare-only]
 * CODEX_WORKSPACE_NODE_MODULES / CUSTOMER_PDF_CHROME_PATH can select local runtimes.
 */
import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build, createServer } from "vite"
import sharp from "sharp"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const scratch = path.join(root, ".local/customer-pdf-check")
const output = path.join(root, "output/pdf/customer-pdf-check")
const prepareOnly = process.argv.includes("--prepare-only")
const reportPath = path.join(output, prepareOnly ? "prepare-report.json" : "report.json")
const report = { fixture: "Fictional offline data; never a customer delivery", transport: "file:// only; all network requests blocked", prepared: false, browserExecuted: false, passed: false, scenarios: [] }
let vite, browser

function svgData(svg) { return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` }
function markerColors(count) {
  const colors = []
  for (const red of [40, 100, 160, 220]) for (const green of [40, 100, 160, 220]) for (const blue of [40, 100, 160, 220]) {
    if (Math.max(red, green, blue) - Math.min(red, green, blue) >= 120) colors.push([red, green, blue])
  }
  return colors.slice(0, count)
}

async function prepareFixture() {
  await mkdir(scratch, { recursive: true })
  await mkdir(output, { recursive: true })
  // Preserve Next's real Image component while normalizing its CJS default export
  // for Vite SSR. No substitute document or image markup is used in this check.
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": root } }, ssr: { external: ["react", "react-dom", "react-dom/server"] }, plugins: [{ name: "offline-next-image-interop", enforce: "pre", transform(code) { return code.replace('import Image from "next/image"', 'import ImageModule from "next/image"; const Image = ImageModule.default ?? ImageModule') } }] })
  const { QuotePrintDocument } = await vite.ssrLoadModule("/components/quotes/quote-print-document.tsx")
  const { ProjectPresentationDocument } = await vite.ssrLoadModule("/components/projects/project-presentation-document.tsx")
  const { buildQuotePrintSnapshot } = await vite.ssrLoadModule("/lib/quote-print-snapshot.ts")
  const React = await import("react")
  const { renderToStaticMarkup } = await import("react-dom/server")
  const thumb = svgData('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect x="12" y="12" width="96" height="96" rx="10" fill="#eee" stroke="#555" stroke-width="3"/><path d="M60 25v70" stroke="#888" stroke-width="2"/></svg>')
  const floor = svgData('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1800"><rect width="1400" height="1800" fill="white"/><g stroke="#555" fill="#fafafa" stroke-width="6"><rect x="80" y="150" width="1240" height="1450"/><path d="M80 750h1240M700 150v1450M700 1200h620"/></g><g font-family="sans-serif" font-size="44" fill="#222"><text x="120" y="100">离线测试楼层 · 虚构资料</text><text x="240" y="480">客厅</text><text x="900" y="480">卧室</text><text x="200" y="1100">餐厅</text><text x="850" y="1000">书房</text><text x="850" y="1450">玄关</text><text x="100" y="1710">本图只用于检查分页与清晰度</text></g></svg>')
  const items = Array.from({ length: 26 }, (_, index) => ({
    id: `offline-device-${index + 1}`, lineId: `offline-line-${index + 1}`, name: `离线检查产品 ${String(index + 1).padStart(3, "0")}`,
    category: "离线测试开关", spec: "虚构规格；双键；仅用于检查文字、金额与跨页排版", unit: "个", room: "合成测试房间", image: thumb,
    cost: 0, price: 100 + index + 0.25, discount: 100, quantity: 1,
    finalUnitPrice: 100 + index + 0.25, finalAmount: 100 + index + 0.25,
    productSnapshot: { quotationVerification: { status: "unverified", source: "default", reasons: ["离线合成价格尚未核验", "配套未计入本次报价：测试线材"] } },
  }))
  const brand = { companyName: "离线测试设计室", logoSrc: thumb, contact: "仅供离线排版检查", address: "", qrSrc: "" }
  // Diagnostic color rails are confined to this fixture. A rail must appear on one page
  // only, proving each entire product row survives pagination without being split.
  const colors = markerColors(items.length)
  const markerCss = colors.map((color, index) => `.quote-document tbody tr:nth-child(${index + 1}) td:first-child{background-image:linear-gradient(to right,rgb(${color.join(",")}) 0 6px,transparent 6px)!important}`).join("\n")
  const globalsPath = path.join(root, "app/globals.css")
  // Compile the same imports, Tailwind utilities and print variants used by Next.
  // Raw source CSS is insufficient: hidden + print:block requires the generated rule.
  const globals = (await postcss([tailwindcss({ base: root })]).process(await readFile(globalsPath, "utf8"), { from: globalsPath })).css
  const font = (await readFile(path.join(root, "app/fonts/inter-latin.woff2"))).toString("base64")
  const fontCss = `@font-face{font-family:CustomerPdfInter;src:url(data:font/woff2;base64,${font}) format('woff2');font-style:normal;font-weight:100 900;font-display:swap}:root{--font-sans:CustomerPdfInter}`
  const source = `import { downloadCustomerPdf, prepareCustomerPdfPrint } from ${JSON.stringify(path.join(root, "lib/customer-pdf.ts"))};
const originalPrint = window.print;
const nativeClick = HTMLAnchorElement.prototype.click;
const nativeGetContext = HTMLCanvasElement.prototype.getContext;
const observed = new WeakSet();
window.offlinePdfChecks = { source: null, footers: [], downloads: 0 };
HTMLCanvasElement.prototype.getContext = function (...args) {
  const context = nativeGetContext.apply(this, args);
  if (args[0] === '2d' && context && !observed.has(context)) {
    observed.add(context);
    const nativeFillText = context.fillText;
    context.fillText = function (text, ...args) {
      if (/第\\s*\\d+\\s*\\/\\s*\\d+\\s*页/.test(String(text))) window.offlinePdfChecks.footers.push(String(text));
      return nativeFillText.call(this, text, ...args);
    };
  }
  return context;
};
function sources() {
  return [...document.querySelectorAll('iframe[data-customer-pdf]')].flatMap(frame => {
    const doc = frame.contentDocument;
    return doc ? [{
      text: doc.body.innerText,
      productRows: [...doc.querySelectorAll('.quote-document tbody tr')].map(row => ({ text: row.innerText, height: row.getBoundingClientRect().height })),
      floors: [...doc.querySelectorAll('.quote-document-floor-card img,.presentation-floor img')].map(image => image.alt),
      imagesReady: [...doc.images].every(image => image.complete && image.naturalWidth > 0),
      preparedRoots: [...doc.querySelectorAll('[data-customer-pdf-root]')].map(root => ({
        visibleFloors: [...root.querySelectorAll('.quote-document-floor-card img,.presentation-floor img')].filter(image => {
          const style = doc.defaultView.getComputedStyle(image);
          return image.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        }).length,
      })),
    }] : [];
  });
}
HTMLAnchorElement.prototype.click = function () {
  if (this.download.endsWith('.pdf')) {
    window.offlinePdfChecks.downloads++;
    window.offlinePdfChecks.source = sources();
  }
  return nativeClick.call(this);
};
window.runOfflineCustomerPdf = async (kind) => {
  window.offlinePdfChecks = { source: null, footers: [], downloads: 0 };
  const before = document.querySelectorAll('iframe').length;
  let assertions = 0;
  let layout;
  const quote = document.querySelector('.quote-document');
  const presentation = document.querySelector('.presentation-document');
  await downloadCustomerPdf(kind === 'quote' ? quote : presentation, {
    filename: 'offline-customer-' + kind + '.pdf', title: '离线测试交付',
    companion: kind === 'quote' ? presentation : quote,
    onLayout: value => { layout = value; },
    assertCurrent: () => { assertions++; },
  });
  return { ...window.offlinePdfChecks, layout, printUnchanged: window.print === originalPrint, iframeCountBefore: before, iframeCountAfter: document.querySelectorAll('iframe').length, assertions };
};
window.runOfflinePrintPreflight = async () => {
  const before = document.querySelectorAll('iframe').length;
  const prepared = await prepareCustomerPdfPrint(document.querySelector('.presentation-document'), { companion: document.querySelector('.quote-document') });
  const result = { layout: prepared.layout, printUnchanged: window.print === originalPrint };
  prepared.release();
  return { ...result, iframeCountBefore: before, iframeCountAfter: document.querySelectorAll('iframe').length };
};
window.runOfflineOverBudget = async () => {
  let message = '';
  try { await window.runOfflineCustomerPdf('quote'); }
  catch (error) { message = error instanceof Error ? error.message : String(error); }
  return { message, downloads: window.offlinePdfChecks.downloads, rows: document.querySelectorAll('.quote-document tbody tr').length, iframes: document.querySelectorAll('iframe[data-customer-pdf]').length };
};`
  const entry = path.join(scratch, "entry.js")
  await writeFile(entry, source)
  // Vite 8 uses its bundled compiler; no additional esbuild install is required.
  const result = await build({ root, configFile: false, logLevel: "warn", resolve: { alias: { "@": root } }, build: { write: false, minify: false, lib: { entry, name: "OfflineCustomerPdfCheck", formats: ["iife"] } } })
  const bundle = (Array.isArray(result) ? result.flatMap((item) => item.output) : result.output).find((item) => item.type === "chunk")?.code
  assert(bundle, "The production PDF helper could not be bundled")
  const fixtures = []
  for (const scenario of [{ name: "single-floor", floorCount: 1, itemCount: 26 }, { name: "multi-floor", floorCount: 4, itemCount: 26 }, { name: "over-budget", floorCount: 4, itemCount: 400 }]) {
    const scenarioItems = Array.from({ length: scenario.itemCount }, (_, index) => ({ ...items[index % items.length], id: `offline-device-${index + 1}`, lineId: `offline-line-${index + 1}`, name: `离线检查产品 ${String(index + 1).padStart(3, "0")}` }))
    const subtotal = scenarioItems.reduce((sum, item) => sum + item.finalAmount, 0)
    const total = subtotal + 56.78
    const floors = Array.from({ length: scenario.floorCount }, (_, index) => ({ id: `offline-floor-${index + 1}`, name: `离线合成${index + 1}层`, src: floor }))
    const snapshot = {
      id: "offline-delivery", version: 1, createdAt: "2026-10-27T00:00:00Z", pointMapRevision: 1,
      project: { id: "offline-project", name: "离线合成方案 · 非客户资料", code: "OFFLINE-PROJECT", customer: "虚构测试客户", address: "仅供离线排版检查" },
      plan: { projectId: "offline-project", floorplanName: "虚构楼层", floorplanDataUrl: floor, updatedAt: "2026-10-27T00:00:00Z", floors: floors.map(item => ({ ...item, floorplanName: item.name, floorplanDataUrl: floor, imageWidth: 1400, imageHeight: 1800 })), points: [], scenes: [{ id: "offline-scene", name: "虚构回家场景", trigger: "离线测试触发", description: "仅核对排版，保留真实保存字段。", pointIds: [], status: "proposed" }] },
      quote: { id: "offline-quote", quoteNo: "OFFLINE-QT-ONLY", title: "虚构测试报价", status: "draft", subtotal, discount: 0, installationFee: 56.78, total, rooms: ["合成测试房间"], items: scenarioItems },
      products: [], fingerprint: "offline-only", changes: { comparedToVersion: null, floorIds: [], pointsAdded: 0, pointsRemoved: 0, pointsChanged: 0, productsChanged: [], photosChanged: [], scenesChanged: false, quoteChanged: false, productOverrides: 0, messages: [] },
    }
    const presentation = React.createElement("main", { className: "project-presentation presentation-document" }, React.createElement(ProjectPresentationDocument, { snapshot, floors, brand }))
    const quote = React.createElement(QuotePrintDocument, { ...buildQuotePrintSnapshot({ deliverySnapshot: snapshot, floors, groupMode: "type" }), brand })
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, presentation, quote))
    const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>离线 PDF 检查 · 虚构资料</title><style>${globals}\n${fontCss}\n${markerCss}\nhtml,body{margin:0;padding:0;background:#fff}</style></head><body class="antialiased">${html}<script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>`
    const fixturePath = path.join(scratch, `${scenario.name}.html`)
    await writeFile(fixturePath, fixture)
    fixtures.push({ ...scenario, fixturePath, items: scenarioItems, total, colors })
  }
  await writeFile(path.join(scratch, "fixture.json"), JSON.stringify(fixtures.map(({ name, floorCount, itemCount, total }) => ({ name, floorCount, itemCount, total })), null, 2))
  report.prepared = true
  report.fixturePaths = fixtures.map(fixture => fixture.fixturePath)
  return fixtures
}

function pageJpegs(pdf) {
  const text = pdf.toString("latin1")
  assert(text.startsWith("%PDF-1."), "Missing PDF header")
  assert(!text.includes("Skia/PDF"), "The download still came from Chrome printToPDF")
  const pageCount = [...text.matchAll(/\/Type\s*\/Page\b/g)].length
  const images = []
  for (const match of text.matchAll(/\d+\s+0\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g)) {
    const dictionary = match[1]
    if (!/\/Subtype\s*\/Image\b/.test(dictionary)) continue
    assert(/\/Filter\s*\/DCTDecode\b/.test(dictionary), "Expected a simple JPEG page image")
    const length = Number(dictionary.match(/\/Length\s+(\d+)/)?.[1])
    const width = Number(dictionary.match(/\/Width\s+(\d+)/)?.[1])
    const height = Number(dictionary.match(/\/Height\s+(\d+)/)?.[1])
    assert(length > 0 && width > 0 && height > 0, "Invalid page image dictionary")
    const start = match.index + match[0].length
    images.push({ jpeg: pdf.subarray(start, start + length), width, height })
  }
  assert(pageCount >= 1, "The PDF did not produce a page")
  assert.equal(images.length, pageCount, "Every page must have exactly one flattened image")
  return images
}

async function inspectPdf(filename, colors, imagePrefix) {
  const pdf = await readFile(filename)
  const images = pageJpegs(pdf)
  const colorIndex = new Map(colors.map((color, index) => [color.join(","), index]))
  const markerPages = colors.map(() => [])
  const pages = []
  for (const [index, image] of images.entries()) {
    assert(Math.abs(image.width - 210 / 25.4 * 300) < 2 && Math.abs(image.height - 297 / 25.4 * 300) < 2, "The PDF page image is not A4 at 300 dpi")
    const { data, info } = await sharp(image.jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const counts = colors.map(() => 0)
    let dark = 0, samples = 0
    for (let y = 0; y < info.height; y += 3) for (let x = 0; x < info.width; x += 3) {
      const start = (y * info.width + x) * info.channels
      const rgb = [data[start], data[start + 1], data[start + 2]]
      samples++
      if (Math.min(...rgb) < 200) dark++
      const quantized = rgb.map((value) => Math.max(40, Math.min(220, 40 + 60 * Math.round((value - 40) / 60))))
      if (rgb.some((value, channel) => Math.abs(value - quantized[channel]) > 18)) continue
      const marker = colorIndex.get(quantized.join(","))
      if (marker !== undefined) counts[marker]++
    }
    assert(dark / samples > 0.0005, `Page ${index + 1} is blank`)
    for (const [marker, count] of counts.entries()) if (count > 30) markerPages[marker].push(index + 1)
    await sharp(image.jpeg).png().toFile(path.join(output, `${imagePrefix}-page-${String(index + 1).padStart(2, "0")}.png`))
    pages.push({ page: index + 1, width: image.width, height: image.height, darkFraction: dark / samples })
  }
  for (const [index, pages] of markerPages.entries()) assert.equal(pages.length, 1, `Product ${index + 1} is missing or crosses page boundaries (pages: ${pages.join(", ") || "none"})`)
  assert(pdf.length < images.length * 2_000_000, "The synthetic quote is unexpectedly larger than 2 MB per page")
  return { bytes: pdf.length, pages, markerPages }
}

try {
  const fixtures = await prepareFixture()
  if (prepareOnly) {
    report.note = "Fixture and production helper bundle prepared; browser/PDF checks not run."
    console.log(`Prepared ${fixtures.length} offline delivery fixtures: ${scratch}`)
  } else {
    const runtimeModules = process.env.CODEX_WORKSPACE_NODE_MODULES || "/Users/noonebook/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
    const { chromium } = await import(pathToFileURL(path.join(runtimeModules, "playwright-core/index.mjs")).href)
    report.phase = "browser-launch"
    browser = await chromium.launch({ executablePath: process.env.CUSTOMER_PDF_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true })
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1, serviceWorkers: "block" })
    const forbiddenRequests = []
    await context.route("**/*", (route) => {
      const url = route.request().url()
      if (/^(file:|data:|blob:|about:)/.test(url)) return route.continue()
      forbiddenRequests.push(url)
      return route.abort("blockedbyclient")
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    for (const fixture of fixtures) {
      report.phase = `file-fixture:${fixture.name}`
      await page.goto(pathToFileURL(fixture.fixturePath).href, { waitUntil: "load" })
      await page.emulateMedia({ media: "print" })
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode())) })
      const scenario = { name: fixture.name, floorCount: fixture.floorCount, productRows: fixture.items.length }
      report.scenarios.push(scenario)
      if (fixture.name === "over-budget") {
        const result = await page.evaluate(() => window.runOfflineOverBudget())
        assert(result.message && /10|页数|超/.test(result.message), "The over-budget package was not clearly rejected")
        assert.equal(result.downloads, 0, "An over-budget package was downloaded")
        assert.equal(result.rows, fixture.items.length, "Over-budget handling deleted a quotation row")
        assert.equal(result.iframes, 0, "A rejected package left a temporary iframe")
        scenario.rejection = result
        continue
      }
      await page.screenshot({ path: path.join(output, `${fixture.name}-source-print.png`), fullPage: true })
      const print = await page.evaluate(() => window.runOfflinePrintPreflight())
      assert(print.layout.totalPages <= 10, "The print package exceeded ten pages")
      assert.equal(print.printUnchanged, true, "The print preflight changed window.print")
      assert.equal(print.iframeCountAfter, print.iframeCountBefore, "Print preflight leaked its iframe")
      scenario.print = print
      scenario.documents = []
      for (const kind of ["quote", "presentation"]) {
        const downloadPromise = page.waitForEvent("download", { timeout: 60000 })
        const generation = page.evaluate(kind => window.runOfflineCustomerPdf(kind), kind)
        const [download, result] = await Promise.all([downloadPromise, generation])
        const prefix = `${fixture.name}-${kind}`
        const pdfPath = path.join(output, `${prefix}.pdf`)
        await download.saveAs(pdfPath)
        report.browserExecuted = true
        assert.equal(result.printUnchanged, true, "The PDF downloader changed window.print")
        assert.equal(result.iframeCountAfter, result.iframeCountBefore, "The temporary print iframe was not removed")
        assert(result.assertions > 0, "The saved-source freshness check was never called")
        assert.equal(result.downloads, 1, "A customer action downloaded more than one PDF")
        assert(result.layout && result.layout.totalPages <= 10, "The delivery package exceeded ten pages")
        assert.equal(result.layout.pageCounts.length, 2, "The companion was omitted from the page budget")
        assert.equal(result.layout.totalPages, result.layout.pageCounts.reduce((sum, count) => sum + count, 0), "The package page count is inconsistent")
        const allText = result.source.map(source => source.text).join("\n")
        assert(result.source.every(source => source.imagesReady), "An image was not decoded before download")
        const preparedRoots = result.source.flatMap(source => source.preparedRoots)
        assert.equal(preparedRoots.length, 2, "Both document roots must be prepared")
        for (const prepared of preparedRoots) assert.equal(prepared.visibleFloors, fixture.floorCount, "A document hid one or more floor maps to fit the budget")
        assert.equal(preparedRoots.reduce((sum, prepared) => sum + prepared.visibleFloors, 0), 2 * fixture.floorCount, "The prepared package omitted a visible floor map")
        const quoteSource = result.source.find(source => source.productRows.length)
        // Both production roots are measured; the download source must retain every quote row.
        assert(quoteSource, "The quotation companion was not prepared")
        assert.equal(quoteSource.productRows.length, fixture.items.length, "A product row disappeared from prepared content")
        for (const item of fixture.items) assert(allText.includes(item.name), `Missing product: ${item.name}`)
        assert(allText.includes("未核验") && allText.includes("配套未计入本次报价"), "Verification notes disappeared")
        const expectedAmount = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(fixture.total).replace(/[¥￥\s]/g, "")
        assert(allText.includes(expectedAmount), "The saved total disappeared")
        for (let floor = 1; floor <= fixture.floorCount; floor++) assert(allText.includes(`离线合成${floor}层`), `Floor ${floor} disappeared`)
        report.phase = `pdf-image-inspection:${prefix}`
        const pdf = await inspectPdf(pdfPath, kind === "quote" ? fixture.colors : [], prefix)
        assert.equal(pdf.pages.length, result.layout.pageCounts[0], "The actual PDF count differs from the preflight")
        assert.equal(result.footers.length, pdf.pages.length, "A PDF page has no numbered footer")
        for (let index = 0; index < pdf.pages.length; index++) assert(result.footers[index].includes(`第 ${index + 1} / ${pdf.pages.length} 页`), "The footer page number is incorrect")
        scenario.documents.push({ kind, pdf, browser: result })
      }
      const totalPages = scenario.documents.reduce((sum, document) => sum + document.pdf.pages.length, 0)
      assert(totalPages <= 10, "The two actual downloaded files exceeded ten pages together")
      assert(scenario.documents.every(document => document.browser.layout.totalPages === totalPages), "Two download actions disagreed on the package count")
      scenario.actualTotalPages = totalPages
    }
    assert.deepEqual(forbiddenRequests, [], "The offline fixture tried to access a network resource")
    assert.deepEqual(errors, [], "The browser reported an error")
    report.passed = true
    report.phase = "complete"
    report.visualReview = "Inspect *-page-*.png for Chinese glyphs, table readability, floor images and whitespace. This does not certify customer V1, macOS Preview or WeChat."
    console.log(`Offline customer PDF check passed: single- and multi-floor actual downloads <= 10 pages together; oversize rows retained and download rejected. Review images in ${output}`)
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  console.error(`Offline customer PDF check failed during ${report.phase || "fixture preparation"}: ${report.error.split("\n").slice(0, 2).join(" ")}`)
  process.exitCode = 1
} finally {
  await browser?.close()
  await vite?.close()
  await mkdir(output, { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2))
}
