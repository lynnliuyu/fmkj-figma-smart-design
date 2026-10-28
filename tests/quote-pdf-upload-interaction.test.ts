import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

const source = readFileSync(new URL("../components/quotes/use-quote-authoring.ts", import.meta.url), "utf8")
const parsed = ts.createSourceFile("use-quote-authoring.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler: ts.FunctionDeclaration | undefined
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "uploadQuotePdf") handler = node
  if (!handler) ts.forEachChild(node, visit)
}
visit(parsed)
if (!handler) throw new Error("Missing production PDF upload handler")
const executable = ts.transpileModule(`${handler.getText(parsed)}\nreturn uploadQuotePdf;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText

function harness(options: { uploadFailure?: boolean; attachmentFailure?: boolean; networkFailure?: boolean } = {}) {
  const editorRef = { current: { projectKey: "project-a", dirty: true } }
  let finish!: () => void
  const gate = new Promise<void>((resolve) => { finish = resolve })
  const fetcher = vi.fn(async (path: string, request?: RequestInit) => {
    expect(request?.method).toBe("POST")
    await gate
    if (options.networkFailure) throw new TypeError("网络未连接")
    if (path === "/api/upload") return new Response(JSON.stringify(options.uploadFailure ? { error: "文件类型不支持" } : { data: { contentType: "application/pdf", fileName: "合成报价.pdf", size: 20, url: "/api/files/quotes/test.pdf" } }), { status: options.uploadFailure ? 400 : 200 })
    return new Response(JSON.stringify(options.attachmentFailure ? { error: "没有归档权限" } : { data: { id: "attachment" } }), { status: options.attachmentFailure ? 403 : 201 })
  })
  const setSaveState = vi.fn(), setQuoteSaveError = vi.fn(), setQuoteUploadNotice = vi.fn(), setIsUploadingPdf = vi.fn()
  const bindings = { selectedProjectId: "project-a", editorRef, uploadingPdfRef: { current: false }, fetch: fetcher, setSaveState, setQuoteSaveError, setQuoteUploadNotice, setIsUploadingPdf }
  const uploadQuotePdf = new Function(...Object.keys(bindings), executable)(...Object.values(bindings)) as (file: File | null) => Promise<boolean>
  return { ...bindings, fetcher, finish, uploadQuotePdf, file: new File(["fictional PDF data"], "合成报价.pdf", { type: "application/pdf" }) }
}

describe("PDF attachment upload stays separate from saving quote changes", () => {
  it("archives a PDF without claiming that unsaved price edits were saved", async () => {
    const test = harness()
    test.finish()
    await test.uploadQuotePdf(test.file)
    expect(test.setSaveState).not.toHaveBeenCalled()
    expect(test.editorRef.current.dirty).toBe(true)
    expect(test.setQuoteUploadNotice).toHaveBeenLastCalledWith(expect.stringContaining("仍需"))
    expect(JSON.parse(String(test.fetcher.mock.calls[1][1]?.body))).toMatchObject({ projectId: "project-a", kind: "quote_pdf" })
  })

  it.each([
    [{ uploadFailure: true }, "文件类型不支持"],
    [{ attachmentFailure: true }, "没有归档权限"],
    [{ networkFailure: true }, "网络未连接"],
  ] as const)("shows a failed upload or archive result without an unhandled rejection: %j", async (options, message) => {
    const test = harness(options)
    test.finish()
    await expect(test.uploadQuotePdf(test.file)).resolves.toBe(false)
    expect(test.setQuoteSaveError).toHaveBeenLastCalledWith(expect.stringContaining(message))
    expect(test.setIsUploadingPdf).toHaveBeenLastCalledWith(false)
    expect(test.setSaveState).not.toHaveBeenCalled()
  })

  it("does not show a previous project's completion after switching projects", async () => {
    const test = harness()
    const uploading = test.uploadQuotePdf(test.file)
    test.editorRef.current = { projectKey: "project-b", dirty: false }
    test.finish()
    await uploading
    expect(test.setSaveState).not.toHaveBeenCalled()
    expect(test.setQuoteUploadNotice.mock.calls.filter(([value]) => Boolean(value))).toHaveLength(0)
    expect(JSON.parse(String(test.fetcher.mock.calls[1][1]?.body))).toMatchObject({ projectId: "project-a" })
  })

  it("does not upload twice before the disabled input has rendered", async () => {
    const test = harness()
    const first = test.uploadQuotePdf(test.file)
    const second = test.uploadQuotePdf(test.file)
    test.finish()
    await Promise.all([first, second])
    expect(test.fetcher).toHaveBeenCalledTimes(2)
  })
})
