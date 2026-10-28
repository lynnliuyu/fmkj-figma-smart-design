import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

import { acknowledgeQuotePointChanges, lineTotal, mergeQuoteDraftLoad, pointMapRevisionForQuote, quoteItemsSavePayload, unique, type QuoteLineItem } from "../lib/quote-authoring"
import { sumMoney } from "../lib/money"

const source = readFileSync(new URL("../components/quotes/use-quote-authoring.ts", import.meta.url), "utf8")
const parsed = ts.createSourceFile("use-quote-authoring.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function productionFunction(name: string) {
  let found: ts.FunctionDeclaration | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    if (!found) ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!found) throw new Error(`Missing production function: ${name}`)
  return found.getText(parsed)
}
const executable = ts.transpileModule(`${productionFunction("loadSavedDraft")}\n${productionFunction("saveDraftWithImages")}\nreturn { loadSavedDraft, saveDraftWithImages };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const line = { id: "product", lineId: "manual", name: "合成开关", room: "全屋", spec: "合成", category: "开关", unit: "个", price: 200, cost: 0, image: "", quantity: 2, discount: 100 } as QuoteLineItem

function harness(options: { failRead?: boolean; localQueue?: boolean } = {}) {
  const editor = { projectKey: "project-a", items: [] as QuoteLineItem[], rooms: [] as string[], installationFee: 0, dirty: false, revision: 0, pendingPointRemovals: [], pendingPointRoomMoves: [], feeEdited: false, roomsEdited: false, roomChanges: [] }
  const editorRef = { current: editor }
  let failRead = options.failRead ?? false
  const fetcher = vi.fn(async (_path: string, request?: RequestInit) => {
    if (request?.method === "POST") return new Response(JSON.stringify({ data: { id: "quote-id", quoteNo: "QT-TEST", updatedAt: "2026-10-24T00:00:00Z" } }))
    if (failRead) return new Response(JSON.stringify({ error: "数据库暂时繁忙" }), { status: 500 })
    return new Response(JSON.stringify({ data: { id: "quote-id", quoteNo: "QT-TEST", updatedAt: "2026-10-24T00:00:00Z", items: [line], rooms: ["全屋"], installationFee: 10 } }))
  })
  const setQuoteSaveError = vi.fn()
  const bindings = {
    active: true, projectKey: "project-a", selectedProjectId: "project-a", selectedProject: "合成项目", requestedProjectId: "project-a",
    editorRef, pendingPointMapSnapshotRef: { current: null }, loadedQuoteProjectRef: { current: null }, projectDraftsRef: { current: new Map() }, pendingLoadRef: { current: null },
    savingRef: { current: false }, savingProjectRef: { current: null }, projectSelectionRevisionRef: { current: 0 }, savedQuoteIdentityRef: { current: null },
    fetch: fetcher, setQuoteSaveError, setIsLoadingQuote: vi.fn(), setQuoteLoadError: vi.fn(), setItems: vi.fn(), setRooms: vi.fn(), setInstallationFeeValue: vi.fn(), setSaveState: vi.fn(), setQuoteNo: vi.fn(), setStatus: vi.fn(),
    consumeQuoteDraftItems: () => options.localQueue ? [line] : [], consumePointMapQuoteSnapshot: () => null,
    mergeQuoteDraftLoad, pointMapRevisionForQuote, unique, quoteRooms: ["全屋"], sumMoney, lineTotal, quoteItemsSavePayload, acknowledgeQuotePointChanges,
    syncLocalPointDraft: vi.fn(async () => false), pointMapLocalStore: () => ({}),
  }
  const handlers = new Function(...Object.keys(bindings), executable)(...Object.values(bindings)) as { loadSavedDraft: () => Promise<void>; saveDraftWithImages: (refresh: boolean) => Promise<boolean> }
  return { ...bindings, ...handlers, fetcher, retryRead() { failRead = false } }
}

describe("a failed quote read cannot overwrite the stored quote", () => {
  it("blocks saving the uninitialized empty editor after a failed cloud read", async () => {
    const test = harness({ failRead: true })
    await test.loadSavedDraft()
    await expect(test.saveDraftWithImages(false)).resolves.toBe(false)
    expect(test.fetcher.mock.calls.filter(([, request]) => request?.method === "POST")).toHaveLength(0)
    expect(test.setQuoteSaveError).toHaveBeenLastCalledWith(expect.stringContaining("读取"))
  })

  it("keeps local queued work but refuses a partial replacement after the read failed", async () => {
    const test = harness({ failRead: true, localQueue: true })
    await test.loadSavedDraft()
    expect(test.editorRef.current.items).toHaveLength(1)
    await expect(test.saveDraftWithImages(false)).resolves.toBe(false)
    expect(test.fetcher.mock.calls.filter(([, request]) => request?.method === "POST")).toHaveLength(0)
    expect(test.editorRef.current.dirty).toBe(true)
  })

  it("allows saving once a complete read succeeds, including after retry", async () => {
    const test = harness({ failRead: true })
    await test.loadSavedDraft()
    test.retryRead()
    await test.loadSavedDraft()
    await expect(test.saveDraftWithImages(false)).resolves.toBe(true)
    const request = test.fetcher.mock.calls.find(([, request]) => request?.method === "POST")?.[1]
    expect(JSON.parse(String(request?.body))).toMatchObject({ items: [{ productId: "product", quantity: 2, price: 200 }], installationFee: 10 })
  })
})
