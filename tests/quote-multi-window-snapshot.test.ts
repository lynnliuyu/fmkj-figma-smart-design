import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

import * as quoteDraft from "../lib/quote-draft"
import { mergeQuoteDraftLoad, pointMapRevisionForQuote, unique, type QuoteLineItem, type SavedQuoteResponse } from "../lib/quote-authoring"

const projectId = "project-a"
const prefix = quoteDraft.POINT_MAP_QUOTE_SNAPSHOT_PREFIX
const source = readFileSync(new URL("../components/quotes/use-quote-authoring.ts", import.meta.url), "utf8")
const parsed = ts.createSourceFile("use-quote-authoring.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function productionNode(name: string) {
  let found: ts.Node | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    if (name === "snapshotEffect" && ts.isCallExpression(node) && node.expression.getText(parsed) === "React.useEffect" && node.arguments[0]?.getText(parsed).includes("setSnapshotSignal")) found = node.arguments[0]
    if (!found) ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!found) throw new Error(`Missing production node: ${name}`)
  return found.getText(parsed)
}
const compile = (body: string) => ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText

class SharedStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
const line = (room = "全屋 / 客厅", patch: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  id: "switch", lineId: `source:${room}`, name: "合成默认开关", room, spec: "一键", category: "开关", unit: "个", price: 200, cost: 0, image: "", quantity: 1, discount: 100,
  pointMapProjectId: projectId, pointMapRevision: 1, pointIds: ["old-point"], ...patch,
})
function snapshot(revision: number, targetProject = projectId): quoteDraft.PointMapQuoteSnapshot {
  return { projectId: targetProject, revision, rooms: ["全屋 / 客厅", "全屋 / 玄关"], items: [
    { ...line(), project: "合成项目", projectId: targetProject, pointMapProjectId: targetProject, pointMapRevision: revision },
    { ...line("全屋 / 玄关", { quantity: revision - 1, pointIds: Array.from({ length: revision - 1 }, (_, i) => `new-${i}`) }), project: "合成项目", projectId: targetProject, pointMapProjectId: targetProject, pointMapRevision: revision },
  ] }
}
const cloudQuote: SavedQuoteResponse = { data: { id: "quote", quoteNo: "QT-TEST", updatedAt: "2026-10-26T00:00:00Z", items: [line()], rooms: ["全屋 / 客厅"], installationFee: 10 } }

/** Two copies of the real listener and async loader share only browser storage.
 * Each loader reads the unchanged server quote after a controllable wait, matching
 * the real point-map workflow: saving points has not saved the quote yet. */
function quoteWindow(storage: SharedStorage, edited = false) {
  const browser = Object.assign(new EventTarget(), { localStorage: storage })
  const pendingPointMapSnapshotRef = { current: null as { projectId: string; raw: string; revision?: number } | null }
  const manual = line("自定义房间", { id: "manual", lineId: "manual", price: 77, quantity: 3, pointMapProjectId: undefined, pointMapRevision: undefined, pointIds: undefined })
  const editorRef = { current: { projectKey: projectId, items: edited ? [line(undefined, { price: 555, discount: 85 }), manual] : [line()], rooms: edited ? ["全屋 / 客厅", "自定义房间"] : ["全屋 / 客厅"], installationFee: edited ? 37 : 10, dirty: edited, revision: 0, pointMapRevision: 1, pendingPointRemovals: [] as string[], pendingPointRoomMoves: [] as Array<{ pointIds: string[]; room: string }>, roomsEdited: edited, feeEdited: edited, roomChanges: [] } }
  const loadedQuoteProjectRef = { current: null as string | null }
  const reads: Array<{ finish: (quote?: SavedQuoteResponse) => void; done: Promise<void> }> = []
  let currentLoad: { cancel: () => void } | undefined
  let lastLoad = Promise.resolve()
  const bindings: Record<string, unknown> = {
    ...quoteDraft, window: browser, projectKey: projectId, selectedProjectId: projectId, selectedProject: "合成项目", requestedProjectId: projectId,
    pendingPointMapSnapshotRef, editorRef, loadedQuoteProjectRef, projectDraftsRef: { current: new Map() }, savedQuoteIdentityRef: { current: null }, savingRef: { current: false }, savingProjectRef: { current: null },
    setIsLoadingQuote: vi.fn(), setQuoteLoadError: vi.fn(), setItems: vi.fn(), setRooms: vi.fn(), setInstallationFeeValue: vi.fn(), setSaveState: vi.fn(), setQuoteNo: vi.fn(),
    consumeQuoteDraftItems: () => [], consumePointMapQuoteSnapshot: (id: string, explicitStorage?: SharedStorage, raw?: string) => quoteDraft.consumePointMapQuoteSnapshot(id, explicitStorage ?? storage, raw),
    mergeQuoteDraftLoad, pointMapRevisionForQuote, unique, quoteRooms: ["全屋"],
  }
  bindings.fetch = vi.fn(() => new Promise<Response>((resolve) => {
    let finishRead!: () => void
    const done = new Promise<void>((accept) => { finishRead = accept })
    reads.push({ finish: (quote = cloudQuote) => { resolve(new Response(JSON.stringify(quote))); void lastLoad.then(finishRead) }, done })
  }))
  const loaderFactory = new Function(...Object.keys(bindings), compile(`let active = true; ${productionNode("loadSavedDraft")} return { loadSavedDraft, cancel() { active = false; } };`))
  const startLoad = () => {
    currentLoad?.cancel()
    const load = loaderFactory(...Object.values(bindings)) as { loadSavedDraft: () => Promise<void>; cancel: () => void }
    currentLoad = load
    lastLoad = load.loadSavedDraft()
    return lastLoad
  }
  bindings.setSnapshotSignal = vi.fn(startLoad)
  const effectBindings = { ...bindings, setSnapshotSignal: bindings.setSnapshotSignal }
  const cleanup = new Function(...Object.keys(effectBindings), compile(`return (${productionNode("snapshotEffect")})();`))(...Object.values(effectBindings)) as () => void
  return { browser, editorRef, loadedQuoteProjectRef, reads, pendingPointMapSnapshotRef, startLoad, cleanup, signal: bindings.setSnapshotSignal as ReturnType<typeof vi.fn>, loadError: bindings.setQuoteLoadError as ReturnType<typeof vi.fn> }
}
function publish(storage: SharedStorage, windows: ReturnType<typeof quoteWindow>[], value: quoteDraft.PointMapQuoteSnapshot) {
  const raw = JSON.stringify(value)
  storage.setItem(prefix + value.projectId, raw)
  for (const window of windows) window.browser.dispatchEvent(Object.assign(new Event("storage"), { key: prefix + value.projectId, newValue: raw }))
}
const quantities = (window: ReturnType<typeof quoteWindow>) => window.editorRef.current.items.filter((item) => item.pointMapProjectId).map(({ room, quantity }) => [room, quantity])

describe("multiple open quote windows keep their own received point-map preview", () => {
  it("updates both windows even though the first cloud read consumes shared storage", async () => {
    const storage = new SharedStorage(), first = quoteWindow(storage), second = quoteWindow(storage)
    publish(storage, [first, second], snapshot(2))
    expect(first.reads).toHaveLength(1)
    expect(second.reads).toHaveLength(1)
    first.reads[0].finish(); await first.reads[0].done
    expect(storage.getItem(prefix + projectId)).toBe("")
    second.reads[0].finish(); await second.reads[0].done
    for (const window of [first, second]) {
      expect(quantities(window)).toEqual([["全屋 / 客厅", 1], ["全屋 / 玄关", 1]])
      expect(window.editorRef.current.pointMapRevision).toBe(2)
      expect(window.pendingPointMapSnapshotRef.current).toBeNull()
      window.cleanup()
    }
  })

  it("uses the newest received preview when cloud reads finish out of order", async () => {
    const storage = new SharedStorage(), first = quoteWindow(storage), second = quoteWindow(storage)
    publish(storage, [first, second], snapshot(2))
    publish(storage, [first, second], snapshot(3))
    for (const window of [first, second]) { window.reads[1].finish(); await window.reads[1].done }
    for (const window of [first, second]) { window.reads[0].finish(); await window.reads[0].done }
    for (const window of [first, second]) {
      expect(quantities(window)).toEqual([["全屋 / 客厅", 1], ["全屋 / 玄关", 2]])
      expect(window.editorRef.current.pointMapRevision).toBe(3)
      window.cleanup()
    }
  })

  it("does not replace a received newer preview with a late older event", async () => {
    const storage = new SharedStorage(), window = quoteWindow(storage)
    publish(storage, [window], snapshot(3))
    publish(storage, [window], snapshot(2))
    expect(window.reads).toHaveLength(1)
    expect(storage.getItem(prefix + projectId)).toBe("")
    window.reads[0].finish(); await window.reads[0].done
    expect(quantities(window)).toEqual([["全屋 / 客厅", 1], ["全屋 / 玄关", 2]])
    expect(window.editorRef.current.pointMapRevision).toBe(3)
    window.cleanup()
  })

  it("does not clear a newer shared preview before its event reaches this window", async () => {
    const storage = new SharedStorage(), window = quoteWindow(storage)
    publish(storage, [window], snapshot(2))
    const newerRaw = JSON.stringify(snapshot(3))
    storage.setItem(prefix + projectId, newerRaw)
    window.reads[0].finish(); await window.reads[0].done
    expect(storage.getItem(prefix + projectId)).toBe(newerRaw)
    expect(quantities(window)).toEqual([["全屋 / 客厅", 1], ["全屋 / 玄关", 1]])
    window.browser.dispatchEvent(Object.assign(new Event("storage"), { key: prefix + projectId, newValue: newerRaw }))
    window.reads[1].finish(); await window.reads[1].done
    expect(quantities(window)).toEqual([["全屋 / 客厅", 1], ["全屋 / 玄关", 2]])
    expect(storage.getItem(prefix + projectId)).toBe("")
    publish(storage, [window], snapshot(2))
    expect(window.reads).toHaveLength(2)
    expect(storage.getItem(prefix + projectId)).toBe("")
    window.cleanup()
  })

  it("preserves edited prices, discount, fee and manual room rows in both windows", async () => {
    const storage = new SharedStorage(), first = quoteWindow(storage, true), second = quoteWindow(storage, true)
    publish(storage, [first, second], snapshot(2))
    for (const window of [first, second]) {
      window.reads[0].finish(); await window.reads[0].done
      expect(window.editorRef.current.items.find((item) => item.room === "全屋 / 客厅")).toMatchObject({ price: 555, discount: 85 })
      expect(window.editorRef.current.items.find((item) => item.id === "manual")).toMatchObject({ room: "自定义房间", price: 77, quantity: 3 })
      expect(window.editorRef.current.installationFee).toBe(37)
      expect(quantities(window)).toHaveLength(2)
      window.cleanup()
    }
  })

  it("keeps edits made while the cloud reads are pending", async () => {
    const storage = new SharedStorage(), first = quoteWindow(storage), second = quoteWindow(storage)
    publish(storage, [first, second], snapshot(2))
    for (const window of [first, second]) {
      window.editorRef.current = { ...window.editorRef.current,
        items: [line(undefined, { price: 321, discount: 75 }), line("手工新增房间", { id: "manual", lineId: "manual-new", pointMapProjectId: undefined, pointMapRevision: undefined, pointIds: undefined })],
        rooms: ["全屋 / 客厅", "手工新增房间"], roomsEdited: true, feeEdited: true, installationFee: 88, dirty: true,
      }
      window.reads[0].finish(); await window.reads[0].done
      expect(window.editorRef.current.items.find((item) => item.room === "全屋 / 客厅")).toMatchObject({ price: 321, discount: 75 })
      expect(window.editorRef.current.items.find((item) => item.id === "manual")).toMatchObject({ room: "手工新增房间" })
      expect(window.editorRef.current.installationFee).toBe(88)
      expect(window.editorRef.current.rooms).toContain("手工新增房间")
      expect(quantities(window)).toHaveLength(2)
      window.cleanup()
    }
  })

  it.each([false, true])("uses a newer saved source instead of a stale event, preserving edited=%s", async (edited) => {
    const storage = new SharedStorage(), window = quoteWindow(storage, edited)
    publish(storage, [window], snapshot(2))
    const newer = snapshot(3)
    window.reads[0].finish({ data: { ...cloudQuote.data, items: newer.items.map((item) => ({ ...item, discount: 100 })), rooms: newer.rooms } })
    await window.reads[0].done
    expect(quantities(window)).toEqual([["全屋 / 客厅", 1], ["全屋 / 玄关", 2]])
    expect(window.editorRef.current.pointMapRevision).toBe(3)
    expect(window.editorRef.current.items.filter((item) => item.pointMapProjectId).map((item) => item.pointMapRevision)).toEqual([3, 3])
    if (edited) {
      expect(window.editorRef.current.items.find((item) => item.room === "全屋 / 客厅")).toMatchObject({ price: 555, discount: 85 })
      expect(window.editorRef.current.items.find((item) => item.id === "manual")).toMatchObject({ room: "自定义房间", price: 77, quantity: 3 })
      expect(window.editorRef.current.installationFee).toBe(37)
    }
    window.cleanup()
  })

  it("does not replay an unversioned initial preview over a known saved source", async () => {
    const storage = new SharedStorage(), window = quoteWindow(storage, true)
    const legacy = snapshot(2)
    delete legacy.revision
    storage.setItem(prefix + projectId, JSON.stringify(legacy))
    const loading = window.startLoad()
    const newer = snapshot(3)
    window.reads[0].finish({ data: { ...cloudQuote.data, items: newer.items.map((item) => ({ ...item, discount: 100 })), rooms: newer.rooms } })
    await loading
    expect(quantities(window)).toEqual([["全屋 / 客厅", 1], ["全屋 / 玄关", 2]])
    expect(window.editorRef.current.pointMapRevision).toBe(3)
    expect(window.editorRef.current.items.filter((item) => item.pointMapProjectId).map((item) => item.pointMapRevision)).toEqual([3, 3])
    expect(window.editorRef.current.items.find((item) => item.room === "全屋 / 客厅")).toMatchObject({ price: 555, discount: 85 })
    expect(window.editorRef.current.installationFee).toBe(37)
    expect(storage.getItem(prefix + projectId)).toBe("")
    window.cleanup()
  })

  it.each(["remove-before", "remove-during", "move-before", "move-during"])("keeps pending %s intent and its original revision when sources changed", async (scenario) => {
    const storage = new SharedStorage(), window = quoteWindow(storage, true)
    const edit = () => {
      if (scenario.startsWith("remove")) window.editorRef.current = { ...window.editorRef.current, items: window.editorRef.current.items.filter((item) => !item.pointIds?.includes("old-point")), pendingPointRemovals: ["old-point"] }
      else window.editorRef.current = { ...window.editorRef.current, items: window.editorRef.current.items.map((item) => item.pointIds?.includes("old-point") ? { ...item, room: "全屋 / 书房" } : item), pendingPointRoomMoves: [{ pointIds: ["old-point"], room: "全屋 / 书房" }] }
    }
    if (scenario.endsWith("before")) edit()
    publish(storage, [window], snapshot(3))
    if (scenario.endsWith("during")) edit()
    const newer = snapshot(3)
    window.reads[0].finish({ data: { ...cloudQuote.data, items: newer.items.map((item) => ({ ...item, discount: 100 })), rooms: newer.rooms } })
    await window.reads[0].done
    if (scenario.startsWith("remove")) {
      expect(window.editorRef.current.items.some((item) => item.pointIds?.includes("old-point"))).toBe(false)
      expect(window.editorRef.current.pendingPointRemovals).toEqual(["old-point"])
    } else {
      expect(window.editorRef.current.items.find((item) => item.pointIds?.includes("old-point"))).toMatchObject({ room: "全屋 / 书房", pointMapRevision: 1 })
      expect(window.editorRef.current.pendingPointRoomMoves).toEqual([{ pointIds: ["old-point"], room: "全屋 / 书房" }])
    }
    expect(window.editorRef.current.pointMapRevision).toBe(1)
    expect(window.editorRef.current.items.find((item) => item.id === "manual")).toMatchObject({ price: 77, room: "自定义房间" })
    expect(window.editorRef.current.installationFee).toBe(37)
    expect(window.loadedQuoteProjectRef.current).toBeNull()
    expect(window.loadError).toHaveBeenLastCalledWith(expect.stringMatching(/本机|冲突/))
    window.cleanup()
  })

  it("does not accept malformed, mismatched or invalid-revision event data", () => {
    const storage = new SharedStorage(), window = quoteWindow(storage)
    for (const raw of ["not json", "null", JSON.stringify({ projectId, items: [{}] }), JSON.stringify({ ...snapshot(2), revision: -1 }), JSON.stringify({ ...snapshot(2), items: snapshot(2, "other-project").items })]) {
      window.browser.dispatchEvent(Object.assign(new Event("storage"), { key: prefix + projectId, newValue: raw }))
    }
    expect(window.reads).toHaveLength(0)
    expect(window.pendingPointMapSnapshotRef.current).toBeNull()
    window.cleanup()
  })

  it("keeps initial-open one-time consumption and ignores other projects", async () => {
    const storage = new SharedStorage(), window = quoteWindow(storage)
    publish(storage, [window], snapshot(2, "other-project"))
    expect(window.reads).toHaveLength(0)
    storage.setItem(prefix + projectId, JSON.stringify(snapshot(2)))
    const loading = window.startLoad()
    window.reads[0].finish(); await loading
    expect(quantities(window)).toHaveLength(2)
    expect(quoteDraft.consumePointMapQuoteSnapshot(projectId, storage)).toBeNull()
    expect(window.pendingPointMapSnapshotRef.current).toBeNull()
    window.cleanup()
  })
})
