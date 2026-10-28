import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

function productionHandler(file: string, name: string, bindings: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found: ts.FunctionDeclaration | undefined
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    if (!found) ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!found) throw new Error(`Handler missing: ${name}`)
  const code = ts.transpileModule(`${found.getText(parsed)};return ${name}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings)) as (...args: unknown[]) => Promise<void>
}

describe("workbench failures reach the user and finish waiting", () => {
  it("does not publish a new contract project list before its attachments finish loading", async () => {
    const setProjects = vi.fn(), setAttachmentsByProject = vi.fn(), setError = vi.fn(), setIsLoading = vi.fn()
    const load = productionHandler("../components/contracts/contracts-workbench.tsx", "loadContracts", {
      active: true, setProjects, setAttachmentsByProject, setError, setIsLoading,
      fetchProjectListRows: vi.fn().mockResolvedValue([{ id: "fictional-project" }]),
      loadContractAttachments: vi.fn().mockRejectedValue(new Error("HTTP 500")),
    })
    await load()
    expect(setProjects).not.toHaveBeenCalled()
    expect(setAttachmentsByProject).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith(expect.stringContaining("读取失败"))
    expect(setIsLoading).toHaveBeenLastCalledWith(false)
  })
  it.each(["http", "network", "invalid"])("dashboard reports %s failures instead of an empty dashboard", async (failure) => {
    const setError = vi.fn(), setProjects = vi.fn(), setActivities = vi.fn(), setLoading = vi.fn()
    const fetch = failure === "network" ? vi.fn().mockRejectedValue(new TypeError("offline")) : vi.fn().mockImplementation(async () => new Response(JSON.stringify(failure === "http" ? { error: "unavailable" } : {}), { status: failure === "http" ? 503 : 200 }))
    const load = productionHandler("../components/dashboard/operations-dashboard.tsx", "loadDashboard", { fetch, active: true, setError, setProjects, setActivities, setLoading })
    await expect(load()).resolves.toBeUndefined()
    expect(setError).toHaveBeenCalledWith(expect.stringMatching(/读取|加载/))
    expect(setProjects).not.toHaveBeenCalled()
    expect(setActivities).not.toHaveBeenCalled()
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it("contract upload reports network failure without leaving the upload button waiting", async () => {
    const setError = vi.fn(), setUploadingProjectId = vi.fn()
    const upload = productionHandler("../components/contracts/contracts-workbench.tsx", "uploadContract", {
      fetch: vi.fn().mockRejectedValue(new TypeError("offline")), FormData,
      setError, setUploadingProjectId, setAttachmentsByProject: vi.fn(), setPreviewProjectId: vi.fn(),
    })
    await expect(upload("fictional-project", new File(["test"], "contract.pdf", { type: "application/pdf" }))).resolves.toBeUndefined()
    expect(setError).toHaveBeenCalledWith(expect.stringMatching(/上传/))
    expect(setUploadingProjectId).toHaveBeenLastCalledWith(null)
  })
})
