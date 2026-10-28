import { describe, expect, it, vi } from "vitest"
import sharp from "sharp"

import { createCustomerJpegPdf, customerPdfPageFooter, paginateCustomerPdf, selectCustomerPdfLayout, CustomerPdfPaginationError } from "../lib/customer-pdf-pages"
import { customerPdfMedia, customerPdfPrintRules, downloadCustomerPdf } from "../lib/customer-pdf"

describe("customer PDF page boundaries", () => {
  it("moves the complete quote row to the next page instead of cutting its verification text", () => {
    expect(paginateCustomerPdf({ height: 230, pageHeight: 100, boundaries: [20, 80, 90, 100, 110, 150, 180, 210], avoid: [{ top: 80, bottom: 110, strict: true, label: "报价行" }] })).toEqual([
      { top: 0, bottom: 80 }, { top: 80, bottom: 180 }, { top: 180, bottom: 230 },
    ])
  })

  it("keeps a scene's heading and description together", () => {
    expect(paginateCustomerPdf({ height: 175, pageHeight: 100, boundaries: [60, 80, 100, 125, 175], avoid: [{ top: 80, bottom: 125, strict: true }] })).toEqual([
      { top: 0, bottom: 80 }, { top: 80, bottom: 175 },
    ])
  })

  it("starts a floor on its own page without generating an empty leading or trailing page", () => {
    expect(paginateCustomerPdf({ height: 200, pageHeight: 100, boundaries: [0, 55, 155, 200], breakBefore: [0, 55, 155, 200], avoid: [{ top: 55, bottom: 155, strict: true }] })).toEqual([
      { top: 0, bottom: 55 }, { top: 55, bottom: 155 }, { top: 155, bottom: 200 },
    ])
  })

  it("can split an oversized container while keeping each child row intact", () => {
    expect(paginateCustomerPdf({ height: 230, pageHeight: 100, boundaries: [0, 80, 150, 230], avoid: [{ top: 0, bottom: 230 }, { top: 0, bottom: 80, strict: true }, { top: 80, bottom: 150, strict: true }, { top: 150, bottom: 230, strict: true }] })).toEqual([
      { top: 0, bottom: 80 }, { top: 80, bottom: 150 }, { top: 150, bottom: 230 },
    ])
  })

  it("flows two complete floor cards onto one page when there is room", () => {
    expect(paginateCustomerPdf({ height: 240, pageHeight: 250, boundaries: [0, 35, 40, 135, 140, 240], avoid: [{ top: 40, bottom: 135, strict: true }, { top: 140, bottom: 240, strict: true }] })).toEqual([{ top: 0, bottom: 240 }])
  })

  it("reports an oversized indivisible scene rather than silently clipping it", () => {
    expect(() => paginateCustomerPdf({ height: 230, pageHeight: 100, boundaries: [0, 230], avoid: [{ top: 0, bottom: 230, strict: true, label: "一条场景说明" }] })).toThrow("一条场景说明超过一页")
  })

  it("tolerates subpixel rounding without adding an almost empty final page", () => {
    expect(paginateCustomerPdf({ height: 200.2, pageHeight: 100, boundaries: [0, 100, 200.2] })).toHaveLength(2)
  })
})

describe("complete customer delivery page budget", () => {
  it("allows exactly ten combined pages and keeps the roomiest readable layout", () => {
    const measure = vi.fn(() => [6, 4])
    expect(selectCustomerPdfLayout(measure)).toEqual({ density: "standard", pageCounts: [6, 4], totalPages: 10, maxPages: 10 })
    expect(measure).toHaveBeenCalledOnce()
  })

  it("compresses both files together instead of allowing ten pages for each file", () => {
    const measure = vi.fn((density: string) => density === "standard" ? [6, 6] : density === "compact" ? [5, 6] : [5, 5])
    expect(selectCustomerPdfLayout(measure)).toMatchObject({ density: "dense", pageCounts: [5, 5], totalPages: 10 })
    expect(measure.mock.calls.map(([density]) => density)).toEqual(["standard", "compact", "dense"])
  })

  it("refuses the complete package when every readable layout exceeds ten; never truncates pages", () => {
    expect(() => selectCustomerPdfLayout(() => [6, 5])).toThrow("仍需 11 页")
  })

  it("rechecks after changing content or export order; no previous quote count is reused", () => {
    expect(selectCustomerPdfLayout(() => [2, 3]).totalPages).toBe(5)
    expect(selectCustomerPdfLayout(() => [3, 2]).totalPages).toBe(5)
    expect(() => selectCustomerPdfLayout(() => [3, 8])).toThrow("超过交付上限 10 页")
  })

  it("can retry a smaller diagram but propagates missing-asset or version errors", () => {
    expect(selectCustomerPdfLayout((density) => {
      if (density === "standard") throw new CustomerPdfPaginationError("图幅过大")
      return [2, 2]
    }).density).toBe("compact")
    expect(() => selectCustomerPdfLayout(() => { throw new Error("版本已切换") })).toThrow("版本已切换")
    expect(() => selectCustomerPdfLayout(() => [0, 2])).toThrow("页数检查失败")
  })

  it("writes a page count on every page even if no brand name was provided", () => {
    expect(customerPdfPageFooter("繁梦空间", 2, 4, 7)).toBe("繁梦空间 · 第 2 / 4 页 · 交付共 7 页")
    expect(customerPdfPageFooter("", 1, 1, 1)).toBe("第 1 / 1 页 · 交付共 1 页")
  })
})

describe("print CSS isolation", () => {
  it("enables print media and excludes screen branches, including negation", () => {
    expect(customerPdfMedia("print")).toBe("all")
    expect(customerPdfMedia("only screen and (min-width: 800px)")).toBe("not all")
    expect(customerPdfMedia("screen and (max-width: 1px)")).toBe("not all")
    expect(customerPdfMedia("not screen")).toBe("all")
    expect(customerPdfMedia("not screen and (max-width: 1px)")).toBe("all")
    expect(customerPdfMedia("not print")).toBe("not all")
    expect(customerPdfMedia("print, screen")).toBe("all, not all")
  })

  it("preserves Tailwind layers and nested supports while activating nested print rules", () => {
    const css = customerPdfPrintRules([{ cssText: "@layer utilities {}", cssRules: [{ cssText: ".print\\:block {}", cssRules: [{ type: 4, conditionText: "print", cssText: "@media print {}", cssRules: [{ cssText: "display: block;" }] }] }, { cssText: "@supports (display: grid) {}", cssRules: [{ cssText: ".grid { display: grid; }" }] }] }], "https://example.invalid/app/")
    expect(css).toContain("@layer utilities {")
    expect(css).toContain(".print\\:block {@media all{display: block;}")
    expect(css).toContain("@supports (display: grid) {.grid { display: grid; }}")
  })

  it("preserves ordinary declarations when modern CSSStyleRule has an empty nested-rule list", () => {
    expect(customerPdfPrintRules([{ type: 1, cssText: ".ink { color: red; }", style: { cssText: "color: red;" }, cssRules: [] }], "https://example.invalid/")).toBe(".ink {color: red;}")
  })

  it("preserves parent declarations alongside nested print utilities", () => {
    const css = customerPdfPrintRules([{ type: 1, cssText: ".print\\:block { display: none; @media print { display: block; } }", style: { cssText: "display: none;" }, cssRules: [{ type: 4, cssText: "@media print { display: block; }", conditionText: "print", cssRules: [{ cssText: "display: block;" }] }] }], "https://example.invalid/")
    expect(css).toBe(".print\\:block {display: none;@media all{display: block;}}")
  })

  it("retains font faces with absolute URLs so they can be embedded into page images", () => {
    const fonts: string[] = []
    customerPdfPrintRules([{ type: 5, cssText: '@font-face { font-family: Inter; src: url("../fonts/local.woff2"); }' }], "https://example.invalid/css/app.css", fonts)
    expect(fonts).toEqual(['@font-face { font-family: Inter; src: url("https://example.invalid/fonts/local.woff2"); }'])
  })
})

describe("opaque JPEG PDF envelope", () => {
  it("writes byte-accurate classic xrefs and JPEG stream lengths for multiple A4 pages", async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).jpeg().toBuffer())
    const bytes = createCustomerJpegPdf([{ jpeg, width: 8, height: 8 }, { jpeg, width: 8, height: 8 }], "客户 V1 · ¥9200 🏠")
    const pdf = Buffer.from(bytes).toString("latin1")
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true)
    expect(pdf).toContain("/Count 2")
    expect(pdf).toContain("/MediaBox [0 0 595.275591 841.889764]")
    expect(pdf).toContain("/Producer (FMKJ JPEG PDF 1.4)")
    expect(pdf).not.toMatch(/Skia|HeadlessChrome|\/SMask|\/Font\b|\/ObjStm|\/XRef\b/)
    expect(pdf.match(/\/ColorSpace \/DeviceRGB/g)).toHaveLength(2)
    const xrefOffset = Number(pdf.match(/startxref\n(\d+)/)![1])
    expect(pdf.slice(xrefOffset, xrefOffset + 4)).toBe("xref")
    const xref = pdf.slice(xrefOffset).split("\n")
    expect(xref[1]).toBe("0 10")
    for (let id = 1; id < 10; id++) {
      const offset = Number(xref[id + 2].slice(0, 10))
      expect(pdf.slice(offset, offset + `${id} 0 obj`.length)).toBe(`${id} 0 obj`)
    }
    for (const match of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const streamStart = match.index! + match[0].length
      const streamLength = Number(match[1])
      expect(pdf.slice(streamStart + streamLength)).toMatch(/^\n?endstream/)
    }
    expect(pdf).toContain("/Title <FEFF")
    expect(pdf.endsWith("%%EOF\n")).toBe(true)
  })

  it("refuses empty documents or broken page images", () => {
    expect(() => createCustomerJpegPdf([])).toThrow("没有可导出的页面")
    expect(() => createCustomerJpegPdf([{ jpeg: new Uint8Array([1, 2]), width: 2480, height: 3508 }])).toThrow("不是有效的 JPEG")
  })
})

describe("download lifetime", () => {
  it("checks a stale fixed version before touching the document", async () => {
    const guard = vi.fn(() => { throw new Error("版本已切换") })
    await expect(downloadCustomerPdf({} as HTMLElement, { filename: "V1.pdf", assertCurrent: guard })).rejects.toThrow("版本已切换")
    expect(guard).toHaveBeenCalledOnce()
  })

  function fakeDocument(guard?: () => void) {
    const printable = { setAttribute: vi.fn(), querySelectorAll: vi.fn(() => []) }
    const target = { documentElement: { lang: "", className: "" }, body: { className: "", appendChild: vi.fn() }, head: { appendChild: vi.fn() }, createElement: vi.fn(() => ({})), fonts: { ready: Promise.resolve(), forEach: vi.fn() } }
    const iframe = { setAttribute: vi.fn(), style: { cssText: "" }, remove: vi.fn(), contentDocument: target, contentWindow: {} }
    const owner = { baseURI: "file:///fixture.html", styleSheets: [], documentElement: { lang: "zh-CN", className: "" }, body: { className: "", appendChild: vi.fn() }, createElement: vi.fn(() => iframe) }
    const root = { ownerDocument: owner, cloneNode: vi.fn(() => printable) } as unknown as HTMLElement
    return { iframe, owner, target, root, run: () => downloadCustomerPdf(root, { filename: "V1.pdf", assertCurrent: guard }) }
  }

  it("removes the isolated iframe when a version changes while resources are loading", async () => {
    let checks = 0
    const fixture = fakeDocument(() => { if (++checks === 2) throw new Error("版本已切换") })
    await expect(fixture.run()).rejects.toThrow("版本已切换")
    expect(fixture.owner.body.appendChild).toHaveBeenCalledWith(fixture.iframe)
    expect(fixture.iframe.remove).toHaveBeenCalledOnce()
    expect(fixture.owner.createElement).toHaveBeenCalledTimes(1)
  })

  it("removes the iframe when fonts fail rather than downloading missing text", async () => {
    const fixture = fakeDocument()
    fixture.target.fonts.forEach.mockImplementation(() => { throw new Error("打印字体加载失败") })
    await expect(fixture.run()).rejects.toThrow("打印字体加载失败")
    expect(fixture.iframe.remove).toHaveBeenCalledOnce()
  })
})
