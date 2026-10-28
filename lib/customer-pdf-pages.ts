/** CSS pixel coordinates measured from the existing, print-styled document. */
export type CustomerPdfBlock = { top: number; bottom: number; label?: string; strict?: boolean }
export type CustomerPdfPage = { top: number; bottom: number }

export const CUSTOMER_DELIVERY_MAX_PAGES = 10
export const CUSTOMER_PDF_DENSITIES = ["standard", "compact", "dense"] as const
export type CustomerPdfDensity = typeof CUSTOMER_PDF_DENSITIES[number]
export type CustomerPdfLayout = { density: CustomerPdfDensity; pageCounts: number[]; totalPages: number; maxPages: number }
export class CustomerPdfPaginationError extends Error {}

/** Measure the entire delivery at one density; never budget its two files independently. */
export function selectCustomerPdfLayout(measure: (density: CustomerPdfDensity) => readonly number[]): CustomerPdfLayout {
  let smallest: number | undefined
  let paginationError: CustomerPdfPaginationError | undefined
  for (const density of CUSTOMER_PDF_DENSITIES) {
    let counts: readonly number[]
    try { counts = measure(density) }
    catch (error) {
      if (!(error instanceof CustomerPdfPaginationError)) throw error
      paginationError = error
      continue
    }
    if (!counts.length || counts.some((count) => !Number.isInteger(count) || count < 1)) throw new Error("交付页数检查失败，请重新读取固定版本后重试。")
    const totalPages = counts.reduce((sum, count) => sum + count, 0)
    smallest = Math.min(smallest ?? totalPages, totalPages)
    if (totalPages <= CUSTOMER_DELIVERY_MAX_PAGES) return { density, pageCounts: [...counts], totalPages, maxPages: CUSTOMER_DELIVERY_MAX_PAGES }
  }
  throw new Error(smallest === undefined
    ? `交付内容无法在完整、可读的条件下排入 ${CUSTOMER_DELIVERY_MAX_PAGES} 页，已停止导出。${paginationError?.message ?? "请检查过长的单条说明。"}`
    : `方案与报价已压缩间距并合并楼层图，仍需 ${smallest} 页，超过交付上限 ${CUSTOMER_DELIVERY_MAX_PAGES} 页，已停止导出。所有报价行和金额均保留；请将项目分为独立交付范围后再试。`)
}

export function customerPdfPageFooter(brand: string, page: number, pages: number, totalPages: number): string {
  return [brand, `第 ${page} / ${pages} 页`, `交付共 ${totalPages} 页`].filter(Boolean).join(" · ")
}

/**
 * Choose page cuts in the gaps between real document blocks. The caller renders
 * one viewport at a time; a long quote never becomes one enormous canvas.
 */
export function paginateCustomerPdf({
  height,
  pageHeight,
  boundaries,
  avoid = [],
  breakBefore = [],
}: {
  height: number
  pageHeight: number
  boundaries: readonly number[]
  avoid?: readonly CustomerPdfBlock[]
  breakBefore?: readonly number[]
}): CustomerPdfPage[] {
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(pageHeight) || pageHeight <= 0) {
    throw new Error("打印内容没有可导出的页面，请重新读取交付版本后重试。")
  }
  const epsilon = 0.5
  for (const block of avoid) {
    if (block.strict && block.bottom - block.top > pageHeight + epsilon) {
      throw new CustomerPdfPaginationError(`${block.label || "一段打印内容"}超过一页，无法完整放入 PDF。请检查该段内容。`)
    }
  }
  // An oversized container may span pages, but its rows/paragraphs still may not.
  const protectedBlocks = avoid.filter((block) => block.bottom - block.top <= pageHeight + epsilon)
  const isSafe = (y: number) => !protectedBlocks.some((block) => y > block.top + epsilon && y < block.bottom - epsilon)
  const cuts = [...new Set([0, height, ...boundaries])].filter((y) => y >= 0 && y <= height && isSafe(y)).sort((a, b) => a - b)
  const forced = [...new Set(breakBefore)].filter((y) => y > epsilon && y < height - epsilon).sort((a, b) => a - b)
  const pages: CustomerPdfPage[] = []
  let top = 0
  while (height - top > epsilon) {
    const limit = Math.min(top + pageHeight, height)
    const nextForced = forced.find((y) => y > top + epsilon && y <= limit + epsilon)
    let bottom: number | undefined
    if (nextForced !== undefined) {
      if (!isSafe(nextForced)) throw new CustomerPdfPaginationError("打印内容的分页位置与完整段落冲突，请检查该段内容。")
      bottom = nextForced
    } else if (height <= limit + epsilon) {
      bottom = height
    } else {
      for (let index = cuts.length - 1; index >= 0; index--) {
        if (cuts[index] <= limit + epsilon && cuts[index] > top + epsilon) { bottom = cuts[index]; break }
      }
    }
    if (bottom === undefined || bottom <= top + epsilon) {
      throw new CustomerPdfPaginationError("一段打印内容无法安全分页，请检查该段内容。")
    }
    pages.push({ top, bottom })
    top = bottom
  }
  return pages
}

export type CustomerPdfJpegPage = { jpeg: Uint8Array; width: number; height: number }

const encode = (value: string) => new TextEncoder().encode(value)
const pdfString = (value: string) => `<FEFF${Array.from(value).map((char) => {
  // PDF text strings use UTF-16BE, including surrogate pairs for emoji.
  const code = char.codePointAt(0)!
  if (code <= 0xffff) return code.toString(16).padStart(4, "0")
  const adjusted = code - 0x10000
  return `${(0xd800 + (adjusted >> 10)).toString(16)}${(0xdc00 + (adjusted & 1023)).toString(16)}`
}).join("")}>`

/**
 * A deliberately narrow PDF 1.4 envelope: exactly one opaque RGB JPEG per A4
 * page, ordinary byte-offset xref, no fonts, masks, object streams or Skia data.
 * It does not implement a general-purpose PDF drawing or document model.
 */
export function createCustomerJpegPdf(pages: readonly CustomerPdfJpegPage[], title = "客户交付"): Uint8Array {
  if (!pages.length) throw new Error("PDF 没有可导出的页面。")
  const chunks: Uint8Array[] = []
  const offsets = [0]
  let length = 0
  const append = (bytes: Uint8Array | string) => {
    const chunk = typeof bytes === "string" ? encode(bytes) : bytes
    chunks.push(chunk)
    length += chunk.byteLength
  }
  const object = (id: number, body: string | (() => void)) => {
    offsets[id] = length
    append(`${id} 0 obj\n`)
    if (typeof body === "string") append(body)
    else body()
    append("\nendobj\n")
  }
  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index * 3} 0 R`).join(" ")}] >>`)
  object(3, `<< /Title ${pdfString(title)} /Creator (FMKJ Customer Export) /Producer (FMKJ JPEG PDF 1.4) >>`)
  pages.forEach((page, index) => {
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width <= 0 || page.height <= 0 || page.jpeg[0] !== 0xff || page.jpeg[1] !== 0xd8 || page.jpeg.at(-2) !== 0xff || page.jpeg.at(-1) !== 0xd9) {
      throw new Error("PDF 页面图片不是有效的 JPEG，已停止下载。")
    }
    const id = 4 + index * 3
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.275591 841.889764] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, () => {
      append(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.byteLength} >>\nstream\n`)
      append(page.jpeg)
      append("\nendstream")
    })
    const commands = "q\n595.275591 0 0 841.889764 0 0 cm\n/Im0 Do\nQ\n"
    object(id + 2, `<< /Length ${encode(commands).byteLength} >>\nstream\n${commands}endstream`)
  })
  const startXref = length
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
  for (let id = 1; id < offsets.length; id++) append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${startXref}\n%%EOF\n`)
  const result = new Uint8Array(length)
  let cursor = 0
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.byteLength }
  return result
}
