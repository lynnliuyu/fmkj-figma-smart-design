/**
 * 在浏览器内把页面直接生成标准 A4 PDF 文件并下载（不依赖 window.print，在预览 iframe 里也能直接导出）。
 *
 * - 方案页（多张横向 A4 卡片）：每张卡片一页横向 A4（841.89 × 595.28 pt）；
 * - 报价单（纵向 A4 长文）：按 A4 比例自动分页，并在切页位置向上寻找空白行，避免把文字或图片截断。
 */

export type PageJpeg = {
  bytes: Uint8Array
  widthPx: number
  heightPx: number
  widthPt: number
  heightPt: number
}

/** 1×1 透明 PNG：当某张图片 404、跨域或损坏时作为兜底占位，避免整份 PDF 导出失败 */
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII='

const inlineUrlCache = new Map<string, string>()

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

type Rgb = [number, number, number]

/** 纸张底色：取画布左上角（页边距内）的颜色。暖白、燕麦等有底色的风格也能正确识别空白行 */
function paperColor(ctx: CanvasRenderingContext2D): Rgb {
  const d = ctx.getImageData(4, 4, 1, 1).data
  return [d[0], d[1], d[2]]
}

/** 像素和纸张底色是否明显不同（文字、线条、图片） */
const inked = (data: Uint8ClampedArray, i: number, bg: Rgb) =>
  Math.abs(data[i] - bg[0]) > 13 ||
  Math.abs(data[i + 1] - bg[1]) > 13 ||
  Math.abs(data[i + 2] - bg[2]) > 13

/** 在 targetY 往上找一整行几乎只有纸色的位置切页，避免截断文字或表格边线 */
function findSafeCutY(
  ctx: CanvasRenderingContext2D,
  width: number,
  targetY: number,
  minY: number,
  bg: Rgb,
): number {
  const searchH = Math.min(180, targetY - minY)
  if (searchH <= 8) return targetY
  const startY = targetY - searchH
  const data = ctx.getImageData(0, startY, width, searchH).data
  const marginX = Math.floor(width * 0.04)
  for (let row = searchH - 1; row >= 0; row--) {
    let dark = 0
    const rowOffset = row * width * 4
    for (let x = marginX; x < width - marginX; x += 2) {
      const i = rowOffset + x * 4
      if (inked(data, i, bg)) {
        dark++
        if (dark > 3) break
      }
    }
    if (dark === 0) return startY + row
  }
  return targetY
}

/** 读取页面内不可从中间切断的块（点位图、房间卡片、表格行、页脚等）在画布上的纵向范围 */
function collectAtomicBlocks(root: HTMLElement, scale: number): { top: number; bottom: number }[] {
  const rootRect = root.getBoundingClientRect()
  const blocks: { top: number; bottom: number }[] = []
  for (const el of root.querySelectorAll<HTMLElement>(
    '[data-pdf-block], .break-inside-avoid, tr, header, footer',
  )) {
    const r = el.getBoundingClientRect()
    if (r.height <= 0) continue
    blocks.push({
      top: Math.max(0, Math.floor((r.top - rootRect.top) * scale)),
      bottom: Math.ceil((r.bottom - rootRect.top) * scale),
    })
  }
  // 标题与紧跟它的下一块保持在同一页，避免标题单独留在页底
  for (const el of root.querySelectorAll<HTMLElement>('[data-pdf-keep-next]')) {
    if (el.closest('[data-pdf-keep-first-row]')) continue
    const r = el.getBoundingClientRect()
    if (r.height <= 0) continue
    const top = Math.max(0, Math.floor((r.top - rootRect.top) * scale))
    const bottom = Math.ceil((r.bottom - rootRect.top) * scale) + Math.round(140 * scale)
    blocks.push({ top, bottom })
  }
  // 交底分组按实际首行高度保护，长型号换行后仍能与房间标题、表头一起分页。
  for (const section of root.querySelectorAll<HTMLElement>('[data-pdf-keep-first-row]')) {
    const firstRow = section.querySelector<HTMLElement>('tbody tr')
    if (!firstRow) continue
    const start = section.getBoundingClientRect()
    const end = firstRow.getBoundingClientRect()
    if (start.height <= 0 || end.height <= 0) continue
    blocks.push({
      top: Math.max(0, Math.floor((start.top - rootRect.top) * scale)),
      bottom: Math.ceil((end.bottom - rootRect.top) * scale),
    })
  }
  // 文档末尾的 footer 与它上方的签字栏保持在同一页，防止最后一页只剩单独一行页脚
  const footerEl = root.querySelector<HTMLElement>('footer')
  if (footerEl) {
    const fr = footerEl.getBoundingClientRect()
    if (fr.height > 0) {
      const fBottom = Math.ceil((fr.bottom - rootRect.top) * scale)
      const fTop = Math.max(
        0,
        Math.floor((fr.top - rootRect.top) * scale) - Math.round(140 * scale),
      )
      blocks.push({ top: fTop, bottom: fBottom })
    }
  }
  return blocks.sort((a, b) => a.top - b.top)
}

/** 强制从新的一页开始的位置（例如合同的附件），标记为 data-pdf-break-before */
function collectBreaks(root: HTMLElement, scale: number): number[] {
  const rootRect = root.getBoundingClientRect()
  return [...root.querySelectorAll<HTMLElement>('[data-pdf-break-before]')]
    .map(
      (el) =>
        Math.floor((el.getBoundingClientRect().top - rootRect.top) * scale) - Math.round(4 * scale),
    )
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
}

function isStripMostlyBlank(
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  endY: number,
  bg: Rgb,
): boolean {
  const h = endY - startY
  if (h <= 0) return true
  const data = ctx.getImageData(0, startY, width, h).data
  const marginX = Math.floor(width * 0.04)
  let darkPixels = 0
  for (let row = 0; row < h; row += 2) {
    const rowOffset = row * width * 4
    for (let x = marginX; x < width - marginX; x += 4) {
      const i = rowOffset + x * 4
      if (inked(data, i, bg)) {
        darkPixels++
        if (darkPixels > 12) return false
      }
    }
  }
  return true
}

/** 把纵向长画布按 A4 比例切成多页 A4 画布（按 DOM 块边界切页，不劈开卡片、点位图或表格行） */
function slicePortraitCanvas(
  source: HTMLCanvasElement,
  domEl: HTMLElement,
  scale: number,
): PageJpeg[] {
  const W_PT = 595.28
  const H_PT = 841.89
  const safeWidth = Math.max(8, source.width)
  const fullPageH = Math.max(12, Math.round(safeWidth * (H_PT / W_PT)))
  const padY = Math.round(fullPageH * 0.035)
  const contentH = fullPageH - padY * 2
  const srcCtx = source.getContext('2d', { willReadFrequently: true })!
  const bg = paperColor(srcCtx)
  const blocks = collectAtomicBlocks(domEl, scale)
  const breaks = collectBreaks(domEl, scale)

  const pages: PageJpeg[] = []
  let y = 0
  while (y < source.height - 8) {
    if (pages.length > 0 && isStripMostlyBlank(srcCtx, safeWidth, y, source.height, bg)) {
      break
    }
    const isFirst = y === 0
    const maxSlice = isFirst ? fullPageH - padY : contentH
    let nextY = y + maxSlice
    const forced = breaks.find((b) => b > y + 8 && b <= Math.min(nextY, source.height))
    if (forced !== undefined) {
      nextY = forced
    } else if (nextY >= source.height - 16) {
      nextY = source.height
    } else {
      const minCut = y + Math.floor(maxSlice * 0.35)
      // 只要切线压在某个原子块内部，就把切线移到该块上方
      let changed = true
      let atBlockBoundary = false
      while (changed) {
        changed = false
        for (const b of blocks) {
          // 相邻表格行共享边界。向前留空会落入上一行，逐行回退到整张表开头；
          // 保留精确边界，并容忍 floor/ceil 带来的 1px 重叠。
          if (b.top > minCut && b.top + 2 < nextY && b.bottom - 2 > nextY) {
            nextY = b.top
            atBlockBoundary = true
            changed = true
          }
        }
      }
      if (!atBlockBoundary) {
        nextY = findSafeCutY(
          srcCtx,
          safeWidth,
          nextY,
          Math.max(minCut, nextY - Math.round(48 * scale)),
          bg,
        )
      }
    }
    const sliceH = Math.max(1, nextY - y)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = safeWidth
    pageCanvas.height = fullPageH
    const pCtx = pageCanvas.getContext('2d')!
    // 续页上下留白用纸张底色填充，有底色的风格不会出现白边
    pCtx.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`
    pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    pCtx.drawImage(source, 0, y, safeWidth, sliceH, 0, isFirst ? 0 : padY, safeWidth, sliceH)
    pages.push({
      bytes: dataUrlToBytes(pageCanvas.toDataURL('image/jpeg', 0.92)),
      widthPx: pageCanvas.width,
      heightPx: pageCanvas.height,
      widthPt: W_PT,
      heightPt: H_PT,
    })
    y = nextY
  }
  return pages
}

/** 把多页 JPEG 组装成标准 PDF 1.4 二进制文件 */
export function buildPdfFromJpegs(pages: PageJpeg[]): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [0]
  let length = 0

  const pushStr = (s: string) => {
    const b = enc.encode(s)
    chunks.push(b)
    length += b.byteLength
  }
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b)
    length += b.byteLength
  }
  const startObj = (id: number) => {
    offsets[id] = length
    pushStr(`${id} 0 obj\n`)
  }
  const endObj = () => pushStr('\nendobj\n')

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')

  // 1: Catalog, 2: Pages
  // 每页占 3 个对象：pageId = 3 + i*3, contentId = 4 + i*3, imgId = 5 + i*3
  const pageIds = pages.map((_, i) => 3 + i * 3)

  startObj(1)
  pushStr('<< /Type /Catalog /Pages 2 0 R >>')
  endObj()

  startObj(2)
  pushStr(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  )
  endObj()

  pages.forEach((p, i) => {
    const pageId = 3 + i * 3
    const contentId = 4 + i * 3
    const imgId = 5 + i * 3
    const w = p.widthPt.toFixed(2)
    const h = p.heightPt.toFixed(2)
    const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`

    startObj(pageId)
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    )
    endObj()

    startObj(contentId)
    pushStr(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
    endObj()

    startObj(imgId)
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.byteLength} >>\nstream\n`,
    )
    pushBytes(p.bytes)
    pushStr('\nendstream')
    endObj()
  })

  const totalObjs = 2 + pages.length * 3
  const xrefOffset = length
  pushStr(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`)
  for (let id = 1; id <= totalObjs; id++) {
    pushStr(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  pushStr(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

function inferMimeFromUrl(url: string, headerType?: string | null): string {
  const ct = (headerType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (ct.startsWith('image/')) return ct
  const clean = url.split('?')[0]?.split('#')[0]?.toLowerCase() ?? ''
  if (clean.endsWith('.svg')) return 'image/svg+xml'
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg'
  if (clean.endsWith('.webp')) return 'image/webp'
  if (clean.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

async function fetchImageAsDataUrl(rawUrl: string): Promise<string> {
  if (!rawUrl || rawUrl.startsWith('data:')) return rawUrl || TRANSPARENT_PNG
  const abs = new URL(rawUrl, window.location.href).href
  const hit = inlineUrlCache.get(abs)
  if (hit) return hit
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(abs, { signal: ctrl.signal, credentials: 'same-origin' })
    if (!res.ok) return TRANSPARENT_PNG
    const ct = res.headers.get('Content-Type') ?? ''
    if (
      ct &&
      !ct.toLowerCase().startsWith('image/') &&
      !ct.toLowerCase().includes('octet-stream')
    ) {
      return TRANSPARENT_PNG
    }
    const blob = await res.blob()
    if (!blob.size) return TRANSPARENT_PNG
    const mime = inferMimeFromUrl(abs, ct)
    const normalizedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime })
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () =>
        resolve(
          typeof reader.result === 'string' && reader.result.startsWith('data:image/')
            ? reader.result
            : TRANSPARENT_PNG,
        )
      reader.onerror = () => resolve(TRANSPARENT_PNG)
      reader.readAsDataURL(normalizedBlob)
    })
    if (dataUrl !== TRANSPARENT_PNG) inlineUrlCache.set(abs, dataUrl)
    return dataUrl
  } catch {
    return TRANSPARENT_PNG
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 导出前把节点内的 <img> 与 SVG <image> 全部转为合法的 data:image/... 地址，
 * 并临时展开因窄屏响应式被隐藏的导出节点、清除窄屏预览 zoom/transform，确保 100% 按原始 A4 / 1440px 物理尺寸导出。
 */
async function prepareNodeForExport(el: HTMLElement): Promise<() => void> {
  const restores: (() => void)[] = []

  // 1. 若节点或其祖先因响应式样式处于 display:none 或带有窄屏预览 zoom，临时还原为 1:1 物理尺寸
  let cur: HTMLElement | null = el
  while (cur && cur !== document.body) {
    const cs = window.getComputedStyle(cur)
    if (cs.display === 'none') {
      const target = cur
      const prev = target.style.getPropertyValue('display')
      const prevPrio = target.style.getPropertyPriority('display')
      target.style.setProperty('display', 'block', 'important')
      restores.push(() => {
        if (prev) target.style.setProperty('display', prev, prevPrio)
        else target.style.removeProperty('display')
      })
    }
    if (cur === el || (cs.zoom && cs.zoom !== '1')) {
      const target = cur
      const prevZoom = target.style.zoom
      target.style.zoom = '1'
      restores.push(() => {
        if (prevZoom) target.style.zoom = prevZoom
        else target.style.removeProperty('zoom')
      })
    }
    if (cs.transform && cs.transform !== 'none') {
      const target = cur
      const prevTransform = target.style.transform
      target.style.transform = 'none'
      restores.push(() => {
        if (prevTransform) target.style.transform = prevTransform
        else target.style.removeProperty('transform')
      })
    }
    cur = cur.parentElement
  }

  // 若是纵向长文档（flow）但受外层窄屏限制宽度不足 A4（794px），临时固定为 210mm 标准宽度
  if (el.dataset.exportPage === 'flow' && el.offsetWidth < 740) {
    const prevW = el.style.width
    const prevMinW = el.style.minWidth
    el.style.width = '210mm'
    el.style.minWidth = '210mm'
    restores.push(() => {
      el.style.width = prevW
      el.style.minWidth = prevMinW
    })
  }

  // 2. 预内联所有 <img>，避免 html-to-image 遇到 ?v=5 参数、lazy 图片或 404 图片时报错中断
  const imgs = [...el.querySelectorAll<HTMLImageElement>('img')]
  await Promise.all(
    imgs.map(async (img) => {
      const origSrc = img.getAttribute('src') ?? ''
      const origSrcset = img.getAttribute('srcset')
      const origLoading = img.getAttribute('loading')
      const targetUrl = img.currentSrc || origSrc
      const dataUrl = await fetchImageAsDataUrl(targetUrl)
      img.loading = 'eager'
      if (origSrcset !== null) img.removeAttribute('srcset')
      img.src = dataUrl
      await new Promise<void>((r) => {
        if (img.complete) return r()
        img.addEventListener('load', () => r(), { once: true })
        img.addEventListener('error', () => r(), { once: true })
        setTimeout(r, 600)
      })
      restores.push(() => {
        if (origLoading !== null) img.setAttribute('loading', origLoading)
        else img.removeAttribute('loading')
        if (origSrcset !== null) img.setAttribute('srcset', origSrcset)
        if (origSrc) img.setAttribute('src', origSrc)
      })
    }),
  )

  // 3. 预内联所有 SVG <image>
  const svgImgs = [...el.querySelectorAll<SVGImageElement>('image')]
  await Promise.all(
    svgImgs.map(async (svgImg) => {
      const href = svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href') || ''
      if (!href || href.startsWith('data:')) return
      const dataUrl = await fetchImageAsDataUrl(href)
      svgImg.setAttribute('href', dataUrl)
      restores.push(() => svgImg.setAttribute('href', href))
    }),
  )

  return () => {
    for (const fn of restores.reverse()) {
      try {
        fn()
      } catch {
        // ignore restore errors
      }
    }
  }
}

function loadSvgDataUrl(svgDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .catch(() => null)
          .finally(() => resolve(img))
      } else {
        resolve(img)
      }
    }
    img.onerror = () => reject(new Error('SVG 图像解码失败'))
    img.src = svgDataUrl
  })
}

async function renderElementToCanvas(
  el: HTMLElement,
  opts: { width?: number; height?: number; pixelRatio: number; isSlide: boolean },
): Promise<HTMLCanvasElement> {
  const { toSvg, toCanvas } = await import('html-to-image')
  const w =
    opts.width || Math.max(1, el.offsetWidth || Math.round(el.getBoundingClientRect().width) || 794)
  const h =
    opts.height ||
    Math.max(1, el.offsetHeight || Math.round(el.getBoundingClientRect().height) || 1123)
  const bg = opts.isSlide ? getComputedStyle(el).backgroundColor : ''
  const backgroundColor =
    bg && bg !== 'transparent' && !/^rgba\([^)]*,\s*0\)$/.test(bg) ? bg : '#ffffff'
  const baseOptions = {
    pixelRatio: opts.pixelRatio,
    width: w,
    height: h,
    backgroundColor,
    cacheBust: false,
    includeQueryParams: true,
    imagePlaceholder: TRANSPARENT_PNG,
    style: {
      margin: '0',
      boxShadow: 'none',
      ...(opts.isSlide ? { transform: 'none', transformOrigin: 'top left' } : {}),
    },
  }

  const drawSvgToCanvas = async (skipFonts: boolean) => {
    const svgUrl = await toSvg(el, { ...baseOptions, skipFonts })
    const img = await loadSvgDataUrl(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * opts.pixelRatio)
    canvas.height = Math.round(h * opts.pixelRatio)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  try {
    return await drawSvgToCanvas(false)
  } catch {
    try {
      return await drawSvgToCanvas(true)
    } catch {
      return await toCanvas(el, { ...baseOptions, skipFonts: true })
    }
  }
}

/**
 * 把页面元素渲染成 PDF 页（JPEG）：
 * - data-export-page="flow" 的纵向长文（报价单、合同、交底清单）按 A4 自动分页；
 * - 其余元素（方案页、点位图页）每个一页，按自身比例成页；只有一个元素时按宽高比判断。
 */
export async function renderPagesToJpegs(elements: HTMLElement[]): Promise<PageJpeg[]> {
  const pdfPages: PageJpeg[] = []
  const pixelRatio = 2
  for (const el of elements) {
    const restore = await prepareNodeForExport(el)
    try {
      const isSlide = el.dataset.exportPage === 'slide' || el.offsetWidth === 1440
      const naturalW = isSlide ? 1440 : undefined
      const naturalH = isSlide ? 960 : undefined
      const canvas = await renderElementToCanvas(el, {
        pixelRatio,
        width: naturalW,
        height: naturalH,
        isSlide,
      })
      const flow = el.dataset.exportPage === 'flow' || Boolean(el.closest('#quote-preview'))
      const isLandscapeCard =
        isSlide || (!flow && (elements.length > 1 || canvas.width > canvas.height * 1.15))
      if (isLandscapeCard) {
        // 横版卡片按自身比例成页（A4 比例的卡片仍是标准 A4；3:2 的方案页不会被压扁）
        pdfPages.push({
          bytes: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)),
          widthPx: canvas.width,
          heightPx: canvas.height,
          widthPt: 841.89,
          heightPt: Math.round(841.89 * (canvas.height / Math.max(1, canvas.width)) * 100) / 100,
        })
      } else {
        const domH = Math.max(1, el.offsetHeight || el.getBoundingClientRect().height)
        const scale = canvas.height / domH
        pdfPages.push(...slicePortraitCanvas(canvas, el, scale))
      }
    } finally {
      restore()
    }
  }
  return pdfPages
}

/** 把页面元素按标准分页安全渲染为高清图片 Data URL 列表（供「导出图片」与小程序内长按存图使用） */
export async function renderPagesToPngDataUrls(elements: HTMLElement[]): Promise<string[]> {
  await waitForPageAssets(elements)
  const pdfPages = await renderPagesToJpegs(elements)
  return pdfPages.map((p) => bytesToDataUrl(p.bytes, 'image/jpeg'))
}

/**
 * 下载生成好的文件。链接先挂到页面上再点击（部分浏览器不处理未挂载的链接），
 * 释放地址的时间留足，避免大文件还没写完就被回收。
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export type ExportedPdfBundle = {
  blob: Blob
  pageCount: number
  previewDataUrls: string[]
}

function bytesToDataUrl(bytes: Uint8Array, mime = 'image/jpeg'): string {
  let bin = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

export async function exportPagesAsPdf(elements: HTMLElement[], fileName: string) {
  const pdfPages = await renderPagesToJpegs(elements)
  downloadBlob(buildPdfFromJpegs(pdfPages), `${fileName}.pdf`)
  return pdfPages.length
}

export async function exportPagesAsPdfBundle(
  elements: HTMLElement[],
  fileName: string,
): Promise<ExportedPdfBundle> {
  await waitForPageAssets(elements)
  const pdfPages = await renderPagesToJpegs(elements)
  if (!pdfPages.length) {
    throw new Error('没有可导出的页面内容')
  }
  const blob = buildPdfFromJpegs(pdfPages)
  try {
    downloadBlob(blob, `${fileName}.pdf`)
  } catch {
    // 部分内置 WebView 拦截自动下载时忽略异常，由结果弹窗提供链接下载与长图保存
  }
  const previewDataUrls = pdfPages.slice(0, 12).map((p) => bytesToDataUrl(p.bytes))
  return {
    blob,
    pageCount: pdfPages.length,
    previewDataUrls,
  }
}

/** 等页面里的字体和图片都加载完（导出前调用，避免缺字、缺图） */
export async function waitForPageAssets(scopes?: HTMLElement[], timeoutMs = 2500) {
  const roots: ParentNode[] = scopes && scopes.length ? scopes : [document]
  const imgs = roots
    .flatMap((r) => [...r.querySelectorAll<HTMLImageElement>('img')])
    .filter((img) => {
      if (!img.complete) {
        img.loading = 'eager'
        return true
      }
      return false
    })
  const svgImages = roots.flatMap((r) => [...r.querySelectorAll('image')])
  await Promise.race([
    Promise.all([
      document.fonts?.ready,
      ...imgs.map(
        (img) =>
          new Promise((r) => {
            img.addEventListener('load', r, { once: true })
            img.addEventListener('error', r, { once: true })
          }),
      ),
      ...svgImages.map((el) => {
        const href = el.getAttribute('href')
        if (!href || href.startsWith('data:')) return null
        return new Promise((r) => {
          const probe = new Image()
          probe.onload = probe.onerror = r
          probe.src = href
        })
      }),
    ]),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ])
}
