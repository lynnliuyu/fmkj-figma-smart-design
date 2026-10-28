import type { AdminProduct } from "./product-admin-service"

type Dependencies = { fetch?: typeof fetch }

export class ProductMutationClientError extends Error {
  constructor(message: string, public readonly details?: Record<string, string>) {
    super(message)
    this.name = "ProductMutationClientError"
  }
}

/** 单条和批量操作共用成功判断，服务器拒绝或断网都不能被算成“已保存”。 */
export async function mutateAdminProduct(
  path: string,
  input: { method: "POST" | "PATCH" | "DELETE"; body?: unknown },
  dependencies: Dependencies = {},
): Promise<AdminProduct> {
  const response = await (dependencies.fetch ?? fetch)(path, {
    method: input.method,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body), headers: { "Content-Type": "application/json" } }),
  })
  const payload = await response.json().catch(() => ({})) as { product?: AdminProduct; details?: Record<string, string>; error?: string }
  if (!response.ok) {
    throw new ProductMutationClientError(payload.details ? Object.values(payload.details).join("；") : payload.error ?? "操作未完成，请刷新列表后重试", payload.details)
  }
  if (!payload.product?.id) throw new Error("服务器没有返回产品资料，请刷新列表确认操作结果")
  return payload.product
}

export async function deactivateAdminProducts(
  productIds: string[],
  dependencies: Dependencies & { onDeactivated?: (product: AdminProduct) => void } = {},
): Promise<{ products: AdminProduct[]; failures: Array<{ id: string; message: string }> }> {
  const products: AdminProduct[] = []
  const failures: Array<{ id: string; message: string }> = []
  for (const id of productIds) {
    try {
      const product = await mutateAdminProduct(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" }, dependencies)
      products.push(product)
      dependencies.onDeactivated?.(product)
    } catch (error) {
      failures.push({ id, message: error instanceof Error ? error.message : "停用未完成" })
    }
  }
  return { products, failures }
}
