import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"
import { buildQuotePrintSnapshot } from "../lib/quote-print-snapshot"
import type { ProjectDeliverySnapshot } from "../lib/project-delivery"

const source = readFileSync(new URL("../components/projects/project-presentation.tsx", import.meta.url), "utf8")
const parsed = ts.createSourceFile("presentation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function handler(name: string) {
  let result = ""
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(parsed)
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!result) throw new Error(`Missing handler ${name}`)
  return result
}

function harness({ preview = false } = {}) {
  const fixed = {
    id: "fixed-v1", version: 1, createdAt: "2026-10-27T00:00:00Z",
    project: { id: "test-project", name: "合成验收项目" },
    quote: { quoteNo: "QT-FIXED", status: "draft", subtotal: 21.25, discount: 1.2, installationFee: 5.33, total: 25.38, items: [], rooms: [] },
  } as unknown as ProjectDeliverySnapshot
  const floors = [{ id: "floor", name: "一层", src: "blob:fixed-floor" }]
  const current = { projectId: "test-project", snapshot: preview ? { ...fixed, id: null, version: 0 } : fixed, floors }
  const lifecycle = { current: 1 }, requestId = { current: 1 }
  const document = { title: "原页面" }
  const setError = vi.fn(), setPrinting = vi.fn(), setQuotePrint = vi.fn(), setNotice = vi.fn()
  const print = vi.fn()
  const downloadCustomerPdf = vi.fn(async (root, options) => {
    options.assertCurrent()
    options.onLayout?.({ pageCounts: root.id === "scheme" ? [2, 3] : [3, 2], totalPages: 5 })
  })
  const release = vi.fn()
  const prepareCustomerPdfPrint = vi.fn(async (_root, options) => { options.assertCurrent(); return { release } })
  const prepareProjectDeliveryOutput = vi.fn(async () => fixed)
  const showSnapshot = vi.fn(async (load: () => Promise<ProjectDeliverySnapshot>) => ({ ...current, snapshot: await load() }))
  const bindings = {
    data: current, dataRef: { current }, layoutDirty: false, busy: false, lifecycle, requestId,
    projectId: "test-project", documentBrand: { companyName: "合成品牌" }, document, window: { print },
    rootRef: { current: { id: "scheme" } }, quoteDocumentRef: { current: { id: "quote" } },
    requestAnimationFrame: (callback: () => void) => callback(), waitForPrintImages: vi.fn(async () => {}),
    flushSync: (callback: () => void) => callback(), setQuotePrint, setPrinting, setError, setNotice,
    prepareProjectDeliveryOutput, showSnapshot, downloadCustomerPdf, prepareCustomerPdfPrint, buildQuotePrintSnapshot,
  }
  const executable = ts.transpileModule([handler("outputDelivery"), handler("printPresentation"), handler("downloadFixedQuote"), "return { printPresentation, downloadFixedQuote };"].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const actions = new Function(...Object.keys(bindings), executable)(...Object.values(bindings)) as {
    printPresentation: (mode: "download" | "print") => Promise<void>
    downloadFixedQuote: () => Promise<void>
  }
  return { ...bindings, ...actions, fixed, floors, print, release }
}

describe("customer PDFs from the selected fixed delivery", () => {
  it("downloads both historical documents without saving or generating today's version", async () => {
    const test = harness()
    await test.printPresentation("download")
    await test.downloadFixedQuote()
    expect(test.prepareProjectDeliveryOutput).not.toHaveBeenCalled()
    expect(test.showSnapshot).not.toHaveBeenCalled()
    expect(test.downloadCustomerPdf).toHaveBeenNthCalledWith(1, { id: "scheme" }, expect.objectContaining({ filename: "合成验收项目-V1-智能家居方案.pdf" }))
    expect(test.downloadCustomerPdf).toHaveBeenNthCalledWith(2, { id: "quote" }, expect.objectContaining({ filename: "合成验收项目-V1-报价单.pdf" }))
    expect(test.downloadCustomerPdf.mock.calls[0][1].companion).toEqual({ id: "quote" })
    expect(test.downloadCustomerPdf.mock.calls[1][1].companion).toEqual({ id: "scheme" })
    expect(test.setNotice).toHaveBeenLastCalledWith("交付页数：方案 2 页 + 报价单 3 页 = 共 5 / 10 页。全部报价行已保留。")
    expect(test.setQuotePrint).toHaveBeenNthCalledWith(1, expect.objectContaining({ deliveryVersion: 1, total: 25.38, quoteNo: "QT-FIXED", floorImages: test.floors }))
    expect(test.setQuotePrint).toHaveBeenLastCalledWith(null)
    expect(test.print).not.toHaveBeenCalled()
    expect(test.document.title).toBe("原页面")
    expect(test.setPrinting).toHaveBeenLastCalledWith(false)
  })

  it("fixes a saved-data preview once before downloading", async () => {
    const test = harness({ preview: true })
    await test.printPresentation("download")
    expect(test.prepareProjectDeliveryOutput).toHaveBeenCalledOnce()
    expect(test.downloadCustomerPdf).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ filename: "合成验收项目-V1-智能家居方案.pdf" }))
  })

  it("keeps the operator's browser print route independent of PDF packaging", async () => {
    const test = harness()
    await test.printPresentation("print")
    expect(test.waitForPrintImages).toHaveBeenCalledOnce()
    expect(test.print).toHaveBeenCalledOnce()
    expect(test.prepareCustomerPdfPrint).toHaveBeenCalledWith({ id: "scheme" }, expect.objectContaining({ companion: { id: "quote" } }))
    expect(test.release).toHaveBeenCalledOnce()
    expect(test.downloadCustomerPdf).not.toHaveBeenCalled()
    expect(test.document.title).toBe("原页面")
  })

  it.each(["printPresentation", "downloadFixedQuote"] as const)("cancels %s when the project changes during capture", async (action) => {
    const test = harness()
    test.downloadCustomerPdf.mockImplementationOnce(async (_root, options) => {
      test.lifecycle.current++
      options.assertCurrent()
    })
    await (action === "printPresentation" ? test.printPresentation("download") : test.downloadFixedQuote())
    expect(test.print).not.toHaveBeenCalled()
    expect(test.document.title).toBe("原页面")
  })

  it("cleans up temporary quote content and reports a packaging failure", async () => {
    const test = harness()
    test.downloadCustomerPdf.mockRejectedValueOnce(new Error("图片无法封装"))
    await test.downloadFixedQuote()
    expect(test.setQuotePrint).toHaveBeenLastCalledWith(null)
    expect(test.setError).toHaveBeenLastCalledWith("图片无法封装")
    expect(test.setPrinting).toHaveBeenLastCalledWith(false)
    expect(test.print).not.toHaveBeenCalled()
  })

  it.each(["printPresentation", "downloadFixedQuote"] as const)("stops %s when the complete delivery is over budget", async (action) => {
    const test = harness()
    test.downloadCustomerPdf.mockRejectedValueOnce(new Error("仍需 11 页，超过交付上限 10 页，已停止导出。"))
    await (action === "printPresentation" ? test.printPresentation("download") : test.downloadFixedQuote())
    expect(test.setError).toHaveBeenLastCalledWith(expect.stringContaining("超过交付上限 10 页"))
    expect(test.setQuotePrint).toHaveBeenLastCalledWith(null)
    expect(test.print).not.toHaveBeenCalled()
    expect(test.setPrinting).toHaveBeenLastCalledWith(false)
  })
})
