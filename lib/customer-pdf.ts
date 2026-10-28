import { createCustomerJpegPdf, customerPdfPageFooter, paginateCustomerPdf, selectCustomerPdfLayout, type CustomerPdfBlock, type CustomerPdfJpegPage, type CustomerPdfLayout } from "./customer-pdf-pages"

const CSS_PER_MM = 96 / 25.4
const CONTENT_WIDTH = 190 * CSS_PER_MM
const CONTENT_HEIGHT = 277 * CSS_PER_MM
const PAGE_WIDTH = 210 * CSS_PER_MM
const PAGE_HEIGHT = 297 * CSS_PER_MM
const MARGIN = 10 * CSS_PER_MM
const SCALE = 300 / 96
const TIMEOUT = 30000

type LayoutOptions = { assertCurrent?: () => void; companion?: HTMLElement; onLayout?: (layout: CustomerPdfLayout) => void }
type PdfOptions = LayoutOptions & { filename: string; title?: string }
type PrintRule = { type?: number; cssText: string; cssRules?: ArrayLike<PrintRule>; style?: { cssText: string }; conditionText?: string; media?: { mediaText: string }; styleSheet?: CSSStyleSheet }

/** Activate the print branch in an ordinary, isolated iframe, including Tailwind's nested media rules. */
export function customerPdfMedia(media: string): string {
  const branches: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < media.length; index++) {
    if (media[index] === "(") depth++
    else if (media[index] === ")") depth--
    else if (media[index] === "," && depth === 0) { branches.push(media.slice(start, index)); start = index + 1 }
  }
  branches.push(media.slice(start))
  return branches.map((branch) => {
    const match = branch.trim().match(/^(?:(only|not)\s+)?(print|screen)\b(.*)$/i)
    if (!match) return branch.trim()
    if (match[2].toLowerCase() === "screen") {
      // `not all and (condition)` negates the entire query, so merely replacing
      // the word screen could accidentally enable it when condition is false.
      return match[1]?.toLowerCase() === "not" ? "all" : "not all"
    }
    return `${match[1]?.toLowerCase() === "not" ? "not all" : "all"}${match[3]}`
  }).join(", ")
}

function absoluteUrls(css: string, base: string): string {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, _quote, url: string) => {
    if (!url || url.startsWith("data:") || url.startsWith("#")) return whole
    return `url(${JSON.stringify(new URL(url, base).href)})`
  })
}

/** Keep cascade layers/supports/nesting intact instead of flattening print utilities into the wrong layer. */
export function customerPdfPrintRules(rules: ArrayLike<PrintRule>, base: string, fontFaces: string[] = []): string {
  return Array.from(rules).map((rule) => {
    if (rule.type === 3 && rule.styleSheet) {
      const imported = customerPdfPrintRules(rule.styleSheet.cssRules, rule.styleSheet.href || base, fontFaces)
      return rule.media?.mediaText ? `@media ${customerPdfMedia(rule.media.mediaText)}{${imported}}` : imported
    }
    if (rule.type === 5) {
      const font = absoluteUrls(rule.cssText, base)
      fontFaces.push(font)
      return font
    }
    if (rule.type === 4) return `@media ${customerPdfMedia(rule.conditionText || rule.media?.mediaText || "all")}{${customerPdfPrintRules(rule.cssRules || [], base, fontFaces)}}`
    if (rule.cssRules) {
      const opening = rule.cssText.indexOf("{")
      // CSSStyleRule also exposes cssRules in browsers with CSS nesting. Its
      // own declarations are separate from that child list and must survive.
      return `${rule.cssText.slice(0, opening + 1)}${absoluteUrls(rule.style?.cssText || "", base)}${customerPdfPrintRules(rule.cssRules, base, fontFaces)}}`
    }
    return absoluteUrls(rule.cssText, base)
  }).join("\n")
}

async function within<T>(work: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), TIMEOUT) })])
  } finally { clearTimeout(timer) }
}

async function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("打印图片读取失败，请重新读取交付版本后重试。"))
    reader.readAsDataURL(blob)
  })
}

async function embedUrls(css: string, cache: Map<string, Promise<string>>): Promise<string> {
  const matches = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)]
  let result = css
  for (const match of matches) {
    const url = match[2]
    if (url.startsWith("data:") || url.startsWith("#")) continue
    let pending = cache.get(url)
    if (!pending) {
      pending = within(fetch(url).then(async (response) => {
        if (!response.ok) throw new Error("字体或图片无法读取，请检查该素材后重试。")
        return dataUrl(await response.blob())
      }), "字体或图片读取超时，请检查连接后重试。")
      cache.set(url, pending)
    }
    result = result.replace(match[0], `url("${await pending}")`)
  }
  return result
}

async function decodeImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img")).filter((image) => image.getClientRects().length > 0)
  await within(Promise.all(images.map(async (image) => {
    try { await image.decode() }
    catch { throw new Error(`打印图片${image.alt ? `「${image.alt}」` : ""}加载失败，请修复该图片后重新导出。`) }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("打印图片没有有效尺寸，请修复该图片后重新导出。")
  })), "打印图片加载超时，请重新读取交付版本后重试。")
}

/** Flatten each image to readable pixels; a tainted cross-origin image must fail, never disappear. */
function readableImage(image: HTMLImageElement, owner: Document): string {
  const canvas = owner.createElement("canvas")
  const rect = image.getBoundingClientRect()
  const ratio = Math.min(1, (rect.width * SCALE) / image.naturalWidth, (rect.height * SCALE) / image.naturalHeight)
  canvas.width = Math.max(1, Math.ceil(image.naturalWidth * ratio))
  canvas.height = Math.max(1, Math.ceil(image.naturalHeight * ratio))
  try {
    const context = canvas.getContext("2d")
    if (!context) throw new Error("图片画布不可用")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png")
  } catch {
    throw new Error(`打印图片${image.alt ? `「${image.alt}」` : ""}不能安全读取，请将图片上传到本机素材后重试。`)
  } finally { canvas.width = 0; canvas.height = 0 }
}

function isVisible(element: Element, view: Window) {
  const style = view.getComputedStyle(element)
  return style.display !== "none" && element.getClientRects().length > 0
}

function measurePages(root: HTMLElement, view: Window) {
  const origin = root.getBoundingClientRect().top
  const boundaries: number[] = [0]
  const avoid: CustomerPdfBlock[] = []
  const breakBefore: number[] = []
  const blocks: { element: Element; top: number; bottom: number; heading: boolean; afterAvoid: boolean }[] = []
  let height = 0
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (!isVisible(element, view) || element.matches("style,script,link")) continue
    const style = view.getComputedStyle(element)
    if (style.position === "fixed") continue
    const rect = element.getBoundingClientRect()
    const top = Math.max(0, rect.top - origin)
    const bottom = Math.max(top, rect.bottom - origin)
    height = Math.max(height, bottom)
    boundaries.push(top, bottom)
    if (element === root) continue
    const forced = element.hasAttribute("data-customer-pdf-break-before") || /^(page|always|left|right)$/.test(style.breakBefore || style.pageBreakBefore)
    if (forced) breakBefore.push(top)
    const semantic = element.matches("tr,li,p,article,figure,h1,h2,h3,h4,h5,h6,thead,img,svg")
    const explicit = element.hasAttribute("data-customer-pdf-avoid-break")
    if (semantic || explicit || /avoid/.test(style.breakInside || style.pageBreakInside)) {
      avoid.push({ top, bottom, strict: semantic || explicit, label: element.matches("tr") ? "一行报价" : element.matches("article") ? "一条场景说明" : "一段打印内容" })
    }
    const keepWithNext = element.hasAttribute("data-customer-pdf-keep-with-next") || /avoid/.test(style.breakAfter || style.pageBreakAfter)
    if (semantic || keepWithNext) blocks.push({ element, top, bottom, heading: /^H[1-6]$/.test(element.tagName) || element.tagName === "THEAD", afterAvoid: keepWithNext })
  }
  // Keep a title/table header with the first following content block; adjacent rows remain independent.
  for (const block of blocks) {
    if (!block.heading && !block.afterAvoid) continue
    const next = blocks.filter((candidate) => candidate.top >= block.bottom - 0.5 && candidate.bottom > block.bottom + 0.5 && !candidate.element.contains(block.element)).sort((a, b) => a.top - b.top || a.bottom - b.bottom)[0]
    if (next) avoid.push({ top: block.top, bottom: next.bottom, strict: true, label: "标题及其后的内容" })
  }
  return { pages: paginateCustomerPdf({ height, pageHeight: CONTENT_HEIGHT, boundaries, avoid, breakBefore }), height }
}

async function inlineDocument(root: HTMLElement, view: Window, cache: Map<string, Promise<string>>, images: Map<string, string>, range: { top: number; bottom: number }): Promise<HTMLElement> {
  const owner = root.ownerDocument
  const origin = root.getBoundingClientRect().top
  const copy = async (element: Element): Promise<Element | null> => {
    if (element.matches("script,style,link,.document-footer,[data-customer-pdf-ignore]") || !isVisible(element, view)) return null
    const clone = element.cloneNode(false) as HTMLElement
    const computed = view.getComputedStyle(element)
    for (const name of Array.from(computed)) clone.style.setProperty(name, computed.getPropertyValue(name), computed.getPropertyPriority(name))
    const rect = element.getBoundingClientRect()
    if (element !== root && (rect.bottom - origin <= range.top || rect.top - origin >= range.bottom)) {
      // Preserve layout without serializing or decoding any off-page image.
      // Explicit dimensions keep flex/grid/table placeholders in their old slots.
      clone.removeAttribute("src")
      clone.removeAttribute("srcset")
      clone.removeAttribute("href")
      clone.removeAttribute("xlink:href")
      clone.style.setProperty("visibility", "hidden", "important")
      clone.style.setProperty("box-sizing", "border-box", "important")
      for (const name of ["width", "min-width", "max-width"]) clone.style.setProperty(name, `${rect.width}px`, "important")
      for (const name of ["height", "min-height", "max-height"]) clone.style.setProperty(name, `${rect.height}px`, "important")
      clone.style.setProperty("background-image", "none", "important")
      return clone
    }
    // Animations and CSS generated text should be frozen at their final printed appearance.
    clone.style.setProperty("animation", "none", "important")
    clone.style.setProperty("transition", "none", "important")
    const background = computed.backgroundImage
    if (background && background !== "none" && /url\(/i.test(background)) clone.style.backgroundImage = await embedUrls(background, cache)
    if (element.tagName === "IMG") {
      const image = clone as HTMLImageElement
      image.removeAttribute("srcset")
      image.removeAttribute("sizes")
      const original = element as HTMLImageElement
      const key = `${original.currentSrc || original.src}:${Math.ceil(rect.width * SCALE)}:${Math.ceil(rect.height * SCALE)}`
      let pixels = images.get(key)
      if (!pixels) { pixels = readableImage(original, owner); images.set(key, pixels) }
      image.setAttribute("src", pixels)
      image.setAttribute("loading", "eager")
    }
    const pseudo = (position: "::before" | "::after") => {
      const style = view.getComputedStyle(element, position)
      if (!style.content || ["none", "normal", '""'].includes(style.content)) return
      const span = owner.createElement("span")
      for (const name of Array.from(style)) span.style.setProperty(name, style.getPropertyValue(name))
      // Only literal generated text is supported. Counters/URLs need a real print element.
      if (!/^(['"]).*\1$/.test(style.content)) throw new Error("打印装饰内容无法生成，请使用浏览器打印。")
      span.textContent = style.content.slice(1, -1).replace(/\\(["'\\])/g, "$1")
      clone.appendChild(span)
    }
    if (element.namespaceURI === "http://www.w3.org/1999/xhtml") pseudo("::before")
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) { const result = await copy(child as Element); if (result) clone.appendChild(result) }
      else if (child.nodeType === 3) clone.appendChild(child.cloneNode())
    }
    if (element.namespaceURI === "http://www.w3.org/1999/xhtml") pseudo("::after")
    return clone
  }
  const result = await copy(root) as HTMLElement
  result.style.setProperty("position", "relative", "important")
  result.style.setProperty("inset", "auto", "important")
  result.style.setProperty("margin", "0", "important")
  result.style.setProperty("width", `${CONTENT_WIDTH}px`, "important")
  return result
}

async function renderPage(markup: string, fonts: string, top: number, bottom: number, height: number, footer: string, owner: Document): Promise<CustomerPdfJpegPage> {
  const canvas = owner.createElement("canvas")
  let image: HTMLImageElement | undefined
  canvas.width = Math.round(PAGE_WIDTH * SCALE)
  canvas.height = Math.round(PAGE_HEIGHT * SCALE)
  try {
    const context = canvas.getContext("2d")
    if (!context) throw new Error("此浏览器不能生成 PDF 页面，请使用浏览器打印。")
    context.fillStyle = "#fff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    // The SVG viewport clips a single page; there is never a document-height canvas.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}"><foreignObject x="${MARGIN}" y="${MARGIN}" width="${CONTENT_WIDTH}" height="${bottom - top}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${CONTENT_WIDTH}px;height:${bottom - top}px;overflow:hidden;background:white"><style>${fonts.replace(/</g, "\\3c ")}</style><div style="width:${CONTENT_WIDTH}px;height:${height}px;transform:translateY(-${top}px);transform-origin:top left">${markup}</div></div></foreignObject></svg>`
    image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    try { await within(image.decode(), "PDF 页面生成超时，请使用浏览器打印。") }
    catch { throw new Error("此浏览器无法生成 PDF 页面，请使用浏览器打印。") }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    // Some readers/browsers accept foreignObject SVGs but draw an empty image.
    // Check the document pixels before adding the footer so that cannot look successful.
    const probe = owner.createElement("canvas")
    probe.width = 80
    probe.height = 113
    try {
      const probeContext = probe.getContext("2d")
      if (!probeContext) throw new Error("无法检查 PDF 页面，请使用浏览器打印。")
      probeContext.drawImage(canvas, 0, 0, probe.width, probe.height)
      const pixels = probeContext.getImageData(0, 0, probe.width, probe.height).data
      let hasContent = false
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] < 250 || pixels[index + 1] < 250 || pixels[index + 2] < 250) { hasContent = true; break }
      }
      if (!hasContent) throw new Error("此浏览器生成了空白 PDF 页面，已停止下载。请使用浏览器打印。")
    } finally { probe.width = 0; probe.height = 0 }
    if (footer) {
      context.fillStyle = "#475569"
      context.font = `${(8 * 96 / 72) * SCALE}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillText(footer, canvas.width / 2, (PAGE_HEIGHT - 5 * CSS_PER_MM) * SCALE, CONTENT_WIDTH * SCALE)
    }
    const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PDF 页面压缩失败，请重试。")), "image/jpeg", 0.92))
    return { jpeg: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height }
  } finally { image?.removeAttribute("src"); canvas.width = 0; canvas.height = 0 }
}

/** Both documents are measured from the same fixed data and use one density. */
async function withCustomerPdfLayout<T>(root: HTMLElement, options: LayoutOptions, action: (prepared: {
  printable: HTMLElement; view: Window; measured: ReturnType<typeof measurePages>; layout: CustomerPdfLayout;
  embeddedFonts: string; cache: Map<string, Promise<string>>;
}) => Promise<T>): Promise<T> {
  options.assertCurrent?.()
  const owner = root.ownerDocument
  const iframe = owner.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.setAttribute("data-customer-pdf", "true")
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${CONTENT_WIDTH}px;height:${CONTENT_HEIGHT}px;border:0;pointer-events:none;`
  try {
    const fontFaces: string[] = []
    const cache = new Map<string, Promise<string>>()
    const css = Array.from(owner.styleSheets).map((sheet) => {
      try {
        const rules = customerPdfPrintRules(sheet.cssRules, sheet.href || owner.baseURI, fontFaces)
        return sheet.media.mediaText ? `@media ${customerPdfMedia(sheet.media.mediaText)}{${rules}}` : rules
      } catch { throw new Error("打印样式无法读取，请刷新页面后重试，或使用浏览器打印。") }
    }).join("\n")
    // Embed local web fonts too: SVG image documents cannot request outside fonts.
    const embeddedFonts = await embedUrls(fontFaces.join("\n"), cache)
    owner.body.appendChild(iframe)
    const target = iframe.contentDocument
    const view = iframe.contentWindow
    if (!target || !view) throw new Error("PDF 页面准备失败，请刷新后重试。")
    target.documentElement.lang = owner.documentElement.lang || "zh-CN"
    target.documentElement.className = owner.documentElement.className
    target.body.className = owner.body.className
    const base = target.createElement("base")
    base.href = owner.baseURI
    target.head.appendChild(base)
    const style = target.createElement("style")
    style.textContent = `${css}\n${embeddedFonts}\nhtml,body{width:190mm!important;margin:0!important;padding:0!important;background:white!important;overflow:visible!important}body *{visibility:visible!important}body>[data-customer-pdf-root]{position:relative!important;inset:auto!important;display:block!important;width:190mm!important;max-width:190mm!important;margin:0!important;padding:0!important;box-sizing:border-box!important}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}.document-footer,[data-customer-pdf-ignore]{display:none!important}`
    target.head.appendChild(style)
    const originals = [root, ...(options.companion ? [options.companion] : [])]
    const printables = originals.map((original) => {
      const printable = original.cloneNode(true) as HTMLElement
      printable.setAttribute("data-customer-pdf-root", "true")
      printable.querySelectorAll(".document-footer,[data-customer-pdf-ignore],script").forEach((element) => element.remove())
      printable.querySelectorAll("img").forEach((image) => { image.loading = "eager" })
      target.body.appendChild(printable)
      return printable
    })
    await Promise.all(printables.map(decodeImages))
    await within(target.fonts.ready, "打印字体加载超时，请刷新页面后重试。")
    target.fonts.forEach((font) => { if (font.status === "error") throw new Error("打印字体加载失败，请刷新页面后重试。") })
    options.assertCurrent?.()
    let measurements: ReturnType<typeof measurePages>[] = []
    const layout = selectCustomerPdfLayout((density) => {
      options.assertCurrent?.()
      for (const printable of printables) printable.setAttribute("data-customer-pdf-density", density)
      measurements = printables.map((printable) => measurePages(printable, view))
      return measurements.map((measured) => measured.pages.length)
    })
    options.assertCurrent?.()
    options.onLayout?.(layout)
    return await action({ printable: printables[0], view, measured: measurements[0], layout, embeddedFonts, cache })
  } finally { iframe.remove() }
}

/** Browser printing keeps its native text and print dialog, with the same density preflight. */
export async function prepareCustomerPdfPrint(root: HTMLElement, options: LayoutOptions = {}) {
  const layout = await withCustomerPdfLayout(root, options, async ({ layout }) => layout)
  options.assertCurrent?.()
  const originals = [root, ...(options.companion ? [options.companion] : [])]
  const previous = originals.map((element) => element.getAttribute("data-customer-pdf-density"))
  originals.forEach((element) => element.setAttribute("data-customer-pdf-density", layout.density))
  return { layout, release: () => originals.forEach((element, index) => {
    if (previous[index] === null) element.removeAttribute("data-customer-pdf-density")
    else element.setAttribute("data-customer-pdf-density", previous[index]!)
  }) }
}

/** Export only prepared fixed-version DOM. No business data is read or recalculated. */
export async function downloadCustomerPdf(root: HTMLElement, options: PdfOptions): Promise<void> {
  await withCustomerPdfLayout(root, options, async ({ printable, view, measured, layout, embeddedFonts, cache }) => {
    const owner = root.ownerDocument
    const brand = printable.querySelector(".document-brand strong")?.textContent?.trim() || ""
    const pages: CustomerPdfJpegPage[] = []
    for (const [index, page] of measured.pages.entries()) {
      options.assertCurrent?.()
      // Reuse repeated thumbnails within this page, then let its PNG strings go.
      const inline = await inlineDocument(printable, view, cache, new Map(), page)
      const markup = new XMLSerializer().serializeToString(inline)
      pages.push(await renderPage(markup, embeddedFonts, page.top, page.bottom, measured.height, customerPdfPageFooter(brand, index + 1, measured.pages.length, layout.totalPages), owner))
    }
    const bytes = createCustomerJpegPdf(pages, options.title)
    options.assertCurrent?.()
    const downloadUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }))
    const anchor = owner.createElement("a")
    try {
      anchor.href = downloadUrl
      anchor.download = options.filename.replace(/[\\/:*?"<>|]/g, "-")
      owner.body.appendChild(anchor)
      anchor.click()
    } finally {
      anchor.remove()
      // Safari consumes download URLs asynchronously.
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    }
  })
}
