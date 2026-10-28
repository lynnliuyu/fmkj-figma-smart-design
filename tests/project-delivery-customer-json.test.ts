import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

import { stripSnapshotCosts } from "../lib/snapshot-costs"

const source = readFileSync(new URL("../components/projects/project-presentation.tsx", import.meta.url), "utf8")
const parsed = ts.createSourceFile("project-presentation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function customerJsonClick(bindings: Record<string, unknown>): () => void {
  let click: ts.Expression | undefined
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(parsed) === "Button"
      && node.children.some((child) => ts.isJsxText(child) && child.text.includes("完整版本 JSON"))) {
      const attribute = node.openingElement.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(parsed) === "onClick")
      if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) click = attribute.initializer.expression
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!click) throw new Error("Missing complete customer JSON button handler")
  const executable = ts.transpileModule(`return (${click.getText(parsed)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  return new Function(...Object.keys(bindings), executable)(...Object.values(bindings)) as () => void
}

function fixture() {
  return {
    id: "fixed-delivery", version: 7, fingerprint: "fixed-fingerprint", createdAt: "2026-10-26T00:00:00Z", pointMapRevision: 4,
    project: { id: "fictional-project", name: "虚构客户方案" },
    quote: {
      quoteNo: "QT-FICTIONAL", total: 300, installationFee: 0,
      items: [{ id: "fictional-product", price: 300, cost: 100, quantity: 1, finalUnitPrice: 300, finalAmount: 300,
        productSnapshot: { costPrice: 110, historical: [{ cost_amount: 120, label: "原规格" }], name: "保存的产品名" } }],
      oldSnapshot: { costAmount: 130, subtotal: 300 },
    },
    plan: { points: [{ id: "point-one", x: 25, y: 30, legacySnapshot: { cost_price: 140, unit: "个" } }], scenes: [] },
    products: [{ id: "fictional-product", image: "data:image/png;base64,fixed", extra: { cost: 150, verified: false } }],
  }
}

describe("complete version JSON customer button", () => {
  it("removes internal costs at every depth when an administrator exports a fixed version", async () => {
    const fixed = fixture()
    const original = structuredClone(fixed)
    const downloadText = vi.fn()
    const outputDelivery = vi.fn(async (action: (value: { snapshot: typeof fixed }) => void) => action({ snapshot: fixed }))
    customerJsonClick({ downloadText, outputDelivery, stripSnapshotCosts })()
    await Promise.resolve()
    expect(outputDelivery).toHaveBeenCalledOnce()
    expect(downloadText).toHaveBeenCalledOnce()
    const [filename, text] = downloadText.mock.calls[0] as [string, string]
    expect(filename).toBe("虚构客户方案-V7-完整方案.json")
    const exported = JSON.parse(text)
    expect(exported.quote.items[0]).not.toHaveProperty("cost")
    expect(exported.quote.items[0].productSnapshot).not.toHaveProperty("costPrice")
    expect(exported.quote.items[0].productSnapshot.historical[0]).not.toHaveProperty("cost_amount")
    expect(exported.quote.oldSnapshot).not.toHaveProperty("costAmount")
    expect(exported.plan.points[0].legacySnapshot).not.toHaveProperty("cost_price")
    expect(exported.products[0].extra).not.toHaveProperty("cost")
    expect(exported.quote.items[0]).toMatchObject({ price: 300, quantity: 1, finalUnitPrice: 300, finalAmount: 300 })
    expect(exported.quote.total).toBe(300)
    expect(exported.plan.points[0]).toMatchObject({ id: "point-one", x: 25, y: 30 })
    expect(exported.products[0].image).toBe("data:image/png;base64,fixed")
    expect(exported.id).toBe("fixed-delivery")
    expect(exported.version).toBe(7)
    expect(exported.fingerprint).toBe("fixed-fingerprint")
    expect(fixed).toEqual(original)
    expect(fixed.quote.items[0].cost).toBe(100)
  })
})
