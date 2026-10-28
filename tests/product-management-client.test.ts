import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { deactivateAdminProducts, mutateAdminProduct } from "../lib/product-management-client"

describe("产品批量操作如实汇总结果", () => {
  it("实际批量停用按钮保留失败选择，并显示真实成功数量", async () => {
    // 执行生产按钮的异步处理器，验证成功汇总不会被最后一次 setMessage 覆盖。
    const source = readFileSync(new URL("../app/admin/products/product-management.tsx", import.meta.url), "utf8")
    const start = source.indexOf("  async function deactivateSelectedProducts()")
    const end = source.indexOf("\n  function patchProduct", start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const handler = source.slice(start, end)
    const fetch = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("good")
      ? Response.json({ product: { id: "good", status: "inactive" } })
      : Response.json({ details: { product: "产品已经变化" } }, { status: 409 }))
    const setMessage = vi.fn()
    const setSelected = vi.fn()
    const setSavingId = vi.fn()
    const batch = (ids: string[], options: Record<string, unknown> = {}) => deactivateAdminProducts(ids, { ...options, fetch })
    const execute = new Function("selectedProducts", "setSavingId", "deactivate", "setSelected", "setMessage", "deactivateAdminProducts", "setProducts", "toast", `${handler}; return deactivateSelectedProducts()`)
    await execute([{ id: "good" }, { id: "conflict" }], setSavingId,
      async (product: { id: string }) => (await batch([product.id])).failures.length === 0,
      setSelected, setMessage, batch, vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() })

    expect(setMessage).toHaveBeenLastCalledWith(expect.stringMatching(/已停用 1 件.*未完成 1 件/))
    expect([...setSelected.mock.calls.at(-1)![0]]).toEqual(["conflict"])
    expect(setSavingId).toHaveBeenLastCalledWith(null)
  })

  it("一条成功一条被拒时，只把成功的产品算作已停用", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("good")
      ? Response.json({ product: { id: "good", status: "inactive" } })
      : Response.json({ details: { product: "产品已经变化，请刷新" } }, { status: 409 }))
    const onDeactivated = vi.fn()
    const result = await deactivateAdminProducts(["good", "conflict"], { fetch, onDeactivated })
    expect(result.products.map((product) => product.id)).toEqual(["good"])
    expect(result.failures).toEqual([{ id: "conflict", message: "产品已经变化，请刷新" }])
    expect(onDeactivated).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("某条断网不吞掉其余产品的结果，失败项可以保留选择重试", async () => {
    const result = await deactivateAdminProducts(["offline", "good"], { fetch: async (url) => {
      if (String(url).endsWith("offline")) throw new Error("网络连接中断")
      return Response.json({ product: { id: "good", status: "inactive" } })
    } })
    expect(result.products).toHaveLength(1)
    expect(result.failures).toEqual([{ id: "offline", message: "网络连接中断" }])
  })

  it("返回错误页面或缺少产品信息时不能显示成功", async () => {
    await expect(mutateAdminProduct("/api/admin/products/p", { method: "PATCH", body: {} }, {
      fetch: async () => new Response("服务暂时不可用", { status: 503 }),
    })).rejects.toThrow("操作未完成")
    await expect(mutateAdminProduct("/api/admin/products/p", { method: "PATCH", body: {} }, {
      fetch: async () => Response.json({}),
    })).rejects.toThrow("确认操作结果")
  })
})
