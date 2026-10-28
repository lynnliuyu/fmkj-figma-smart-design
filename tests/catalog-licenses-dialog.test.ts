import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

const source = readFileSync(new URL("../app/admin/products/catalog-licenses-dialog.tsx", import.meta.url), "utf8")
const parsed = ts.createSourceFile("licenses.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function productionHandler(name: string): string {
  let found: ts.FunctionDeclaration | undefined
  let copy: ts.ArrowFunction | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    if (ts.isJsxAttribute(node) && node.name.getText(parsed) === "onClick" && node.getText(parsed).includes("navigator.clipboard")) {
      const expression = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined
      if (expression && ts.isArrowFunction(expression)) copy = expression
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (found) return found.getText(parsed)
  if (name === "copyFreshKey" && copy) return `const copyFreshKey = ${copy.getText(parsed)};`
  throw new Error(`Missing production handler: ${name}`)
}

function harness(fetcher: typeof fetch, clipboard?: { writeText: (value: string) => Promise<void> }) {
  const lifecycle = { current: 1 }, requestId = { current: 0 }
  const setMessage = vi.fn(), setLicenses = vi.fn(), setBusy = vi.fn(), setFreshKey = vi.fn(), setLoading = vi.fn(), setLoaded = vi.fn()
  const bindings = { fetch: fetcher, navigator: { clipboard }, lifecycle, requestId, freshKey: "fictional-one-time-key", setMessage, setLicenses, setBusy, setFreshKey, setLoading, setLoaded }
  const javascript = ts.transpileModule([productionHandler("load"), productionHandler("call"), productionHandler("copyFreshKey"), "return { load, call, copyFreshKey };"].join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  const handlers = new Function(...Object.keys(bindings), javascript)(...Object.values(bindings)) as {
    load: () => Promise<boolean>; call: (method: string, body: unknown) => Promise<boolean>; copyFreshKey: () => Promise<void>
  }
  return { ...bindings, ...handlers }
}

describe("设备凭据的真实操作反馈", () => {
  it("列表请求失败时显示错误，不能当作没有凭据", async () => {
    const test = harness(async () => Response.json({ error: "读取失败" }, { status: 500 }))
    await expect(test.load()).resolves.toBe(false)
    expect(test.setMessage).toHaveBeenCalledWith(expect.stringMatching(/读取|加载/))
    expect(test.setLicenses).not.toHaveBeenCalled()
  })

  it("新建或停用途中断网时给出反馈并恢复按钮", async () => {
    const test = harness(async () => { throw new Error("网络中断") })
    await expect(test.call("POST", { label: "虚构设备" })).resolves.toBe(false)
    expect(test.setMessage).toHaveBeenCalled()
    expect(test.setBusy).toHaveBeenLastCalledWith(false)
  })

  it.each(["missing", "denied"])("剪贴板%s时不显示已复制", async (mode) => {
    const rejected = Promise.reject(new Error("不允许复制"))
    void rejected.catch(() => {})
    const test = harness(async () => Response.json({}), mode === "missing" ? undefined : { writeText: () => rejected })
    await test.copyFreshKey()
    expect(test.setMessage).not.toHaveBeenCalledWith("已复制到剪贴板")
    expect(test.setMessage).toHaveBeenCalledWith(expect.stringMatching(/手动复制/))
  })

  it("关闭重开后不采用上一次窗口的延迟列表", async () => {
    let resolve!: (response: Response) => void
    const response = new Promise<Response>((done) => { resolve = done })
    const test = harness(() => response)
    const loading = test.load()
    test.lifecycle.current += 1
    resolve(Response.json({ licenses: [{ id: "stale" }] }))
    await loading
    expect(test.setLicenses).not.toHaveBeenCalled()
  })

  it("新凭据已创建但列表刷新失败时仍保留唯一明文，并明确区分结果", async () => {
    const test = harness(async (_url, input) => input?.method === "POST"
      ? Response.json({ key: "fictional-new-key" }, { status: 201 })
      : Response.json({ error: "列表暂时不可读" }, { status: 503 }))
    await expect(test.call("POST", { label: "虚构设备" })).resolves.toBe(true)
    expect(test.setFreshKey).toHaveBeenCalledWith("fictional-new-key")
    expect(test.setMessage).toHaveBeenLastCalledWith(expect.stringMatching(/已创建.*列表刷新失败/))
  })

  it("复制真正成功后才显示成功提示", async () => {
    const writeText = vi.fn(async () => {})
    const test = harness(async () => Response.json({}), { writeText })
    await test.copyFreshKey()
    expect(writeText).toHaveBeenCalledWith("fictional-one-time-key")
    expect(test.setMessage).toHaveBeenLastCalledWith("已复制到剪贴板")
  })
})
