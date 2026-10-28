import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

import { parsePointMapQuoteSnapshot, POINT_MAP_QUOTE_SNAPSHOT_EVENT, POINT_MAP_QUOTE_SNAPSHOT_PREFIX } from "../lib/quote-draft"

const source = readFileSync(new URL("../components/quotes/use-quote-authoring.ts", import.meta.url), "utf8")
const parsed = ts.createSourceFile("use-quote-authoring.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function liveSnapshotEffect() {
  let callback: ts.Expression | undefined
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === "React.useEffect" && node.arguments[0]?.getText(parsed).includes("setSnapshotSignal")) callback = node.arguments[0]
    if (!callback) ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!callback) throw new Error("Missing production snapshot subscription")
  return callback.getText(parsed)
}

function harness() {
  const values = new Map<string, string>()
  const window = Object.assign(new EventTarget(), { localStorage: { getItem: (key: string) => values.get(key) ?? null } })
  const setSnapshotSignal = vi.fn()
  const bindings = { window, setSnapshotSignal, parsePointMapQuoteSnapshot, POINT_MAP_QUOTE_SNAPSHOT_EVENT, POINT_MAP_QUOTE_SNAPSHOT_PREFIX, selectedProjectId: "project-a", pendingPointMapSnapshotRef: { current: null }, editorRef: { current: { projectKey: "project-a" } } }
  const executable = ts.transpileModule(`return (${liveSnapshotEffect()})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const cleanup = new Function(...Object.keys(bindings), executable)(...Object.values(bindings)) as () => void
  const fromOtherTab = (projectId: string, newValue: string | null) => window.dispatchEvent(Object.assign(new Event("storage"), { key: POINT_MAP_QUOTE_SNAPSHOT_PREFIX + projectId, newValue }))
  const fromSameTab = (projectId: string) => {
    values.set(POINT_MAP_QUOTE_SNAPSHOT_PREFIX + projectId, JSON.stringify({ projectId, items: [] }))
    window.dispatchEvent(new CustomEvent(POINT_MAP_QUOTE_SNAPSHOT_EVENT, { detail: { projectId } }))
  }
  return { setSnapshotSignal, cleanup, fromOtherTab, fromSameTab }
}

describe("open quote responds to its point-map preview", () => {
  it("refreshes when another tab publishes a new preview for the current project", () => {
    const test = harness()
    test.fromOtherTab("project-a", '{"projectId":"project-a","items":[]}')
    expect(test.setSnapshotSignal).toHaveBeenCalledOnce()
    test.cleanup()
  })

  it("keeps the existing same-tab notification and ignores other projects", () => {
    const test = harness()
    test.fromSameTab("project-b")
    test.fromOtherTab("project-b", '{"items":[]}')
    expect(test.setSnapshotSignal).not.toHaveBeenCalled()
    test.fromSameTab("project-a")
    expect(test.setSnapshotSignal).toHaveBeenCalledOnce()
    test.cleanup()
  })

  it("does not reload for a consumed or removed preview and removes both listeners", () => {
    const test = harness()
    test.fromOtherTab("project-a", "")
    test.fromOtherTab("project-a", null)
    expect(test.setSnapshotSignal).not.toHaveBeenCalled()
    test.cleanup()
    test.fromSameTab("project-a")
    test.fromOtherTab("project-a", '{"items":[]}')
    expect(test.setSnapshotSignal).not.toHaveBeenCalled()
  })
})
