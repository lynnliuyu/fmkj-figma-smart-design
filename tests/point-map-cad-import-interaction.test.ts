import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

import { emptyPointMapPlan } from "../lib/point-map-plan"
import { normalizeDesignPlan } from "../lib/point-map-design"

const source = readFileSync(new URL("../components/projects/point-map-workbench.tsx", import.meta.url), "utf8")
const parsed = ts.createSourceFile("point-map-workbench.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function productionNode(name: string) {
  let found: ts.Node | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name) found = node.initializer
    if (!found) ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!found) throw new Error(`Missing production node: ${name}`)
  return found.getText(parsed)
}

// Execute the real event handler with only its browser and React boundaries supplied.
// The server's returned plan intentionally omits a not-yet-saved local point.
function harness(options: { dirty?: boolean; uploading?: boolean; fail?: boolean } = {}) {
  const stored = normalizeDesignPlan(emptyPointMapPlan("project-a"))
  const local = structuredClone(stored)
  local.points.push({ id: "local-point", name: "刚刚添加的开关", room: "客厅", iconId: "switch-1", x: 20, y: 30, placed: true, status: "planned", productId: "", note: "", floorId: local.activeFloorId })
  const imported = structuredClone(stored)
  imported.points.push({ ...local.points[0], id: "cad-point", name: "CAD 待复核开关" })
  const planRef = { current: local }
  const projectRef = { current: "project-a" }
  let finish!: () => void
  const gate = new Promise<void>((resolve) => { finish = resolve })
  const fetcher = vi.fn(async () => {
    await gate
    if (options.fail) throw new Error("旧项目导入失败")
    return new Response(JSON.stringify({ plan: imported, revision: 2, added: 1, floor: "全屋", imageWidth: 3000, imageHeight: 2000 }))
  })
  const setMessage = vi.fn(), setPlan = vi.fn(), setDirty = vi.fn(), setCadBusy = vi.fn()
  const bindings = {
    editingDisabled: false, cadBusy: false, dirty: options.dirty ?? false,
    cadImportPendingRef: { current: false }, pendingUploadsRef: { current: options.uploading ? 1 : 0 },
    selectedProjectId: "project-a", cadSpace: "", cadFloorName: "全屋", fetch: fetcher,
    setCadBusy, setMessage, normalizeDesignPlan, planRef, projectRef, setPlan, setDirty,
    setCloudRevision: vi.fn(), setCloudPlan: vi.fn(), setCloudState: vi.fn(),
    persistLocal: vi.fn(), resetViewport: vi.fn(), errorMessage: (error: Error) => error.message,
  }
  const executable = ts.transpileModule(`${productionNode("importCadFile")}\nreturn importCadFile;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const importCadFile = new Function(...Object.keys(bindings), executable)(...Object.values(bindings)) as (file: File) => Promise<void>
  const file = new File(["fictional CAD fixture"], "合成测试.dxf")
  return { ...bindings, file, importCadFile, finish, local, imported, fetcher }
}

describe("CAD import preserves the point-map editor's current work", () => {
  it("keeps an unsaved local design and asks to save before importing server-side", async () => {
    const test = harness({ dirty: true })
    test.finish()
    await test.importCadFile(test.file)
    expect(test.fetcher).not.toHaveBeenCalled()
    expect(test.planRef.current).toBe(test.local)
    expect(test.setMessage).toHaveBeenLastCalledWith(expect.stringContaining("先保存"))
  })

  it("waits for an in-progress floor image read before importing", async () => {
    const test = harness({ uploading: true })
    test.finish()
    await test.importCadFile(test.file)
    expect(test.fetcher).not.toHaveBeenCalled()
    expect(test.planRef.current).toBe(test.local)
    expect(test.setMessage).toHaveBeenLastCalledWith(expect.stringContaining("底图"))
  })

  it("does not submit the same file twice before React has rendered the busy state", async () => {
    const test = harness()
    const first = test.importCadFile(test.file)
    const second = test.importCadFile(test.file)
    test.finish()
    await Promise.all([first, second])
    expect(test.fetcher).toHaveBeenCalledOnce()
    expect(test.planRef.current.points.map((point) => point.id)).toEqual(["cad-point"])
  })

  it("does not display an old project's late failure in the newly selected project", async () => {
    const test = harness({ fail: true })
    const importing = test.importCadFile(test.file)
    test.projectRef.current = "project-b"
    test.finish()
    await importing
    expect(test.setMessage).not.toHaveBeenCalled()
    expect(test.planRef.current).toBe(test.local)
  })

  it("locks edits and undo while CAD processing is in progress", () => {
    const disabled = new Function("selectedProjectId", "readOnly", "cloudState", "busy", "localRestoring", "cadBusy", `return ${productionNode("editingDisabled")};`)
    expect(disabled("project-a", false, "ready", false, false, true)).toBe(true)
    expect(disabled("project-a", false, "ready", false, false, false)).toBe(false)
  })
})
