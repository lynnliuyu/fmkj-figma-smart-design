import { describe, expect, it } from "vitest"

import { parseExportArgs, projectSliceTables } from "../scripts/deploy/export-project-slice.mjs"

const PROJECT_ID = "340e68f5-8cb6-438c-ab28-3079ebf39199"

describe("项目分片导出", () => {
  it("refuses anything that is not a project uuid", () => {
    expect(() => projectSliceTables("邦泰璟和")).toThrow(/uuid/)
    // 防止把项目名直接拼进 SQL：必须先是合法 uuid。
    expect(() => projectSliceTables("' OR 1=1 --")).toThrow(/uuid/)
  })

  it("walks the project's own tables parent-first and never touches the global catalog", () => {
    const tables = projectSliceTables(PROJECT_ID).map((entry: { table: string }) => entry.table)
    expect(tables[0]).toBe("users")
    expect(tables[1]).toBe("projects")
    expect(tables).toContain("project_point_map_designs")
    expect(tables).toContain("project_deliveries")
    expect(tables).toContain("quote_items")
    // 产品库、设备类型属于全局资料，按 Plan 033 的边界不跟着项目搬。
    expect(tables).not.toContain("products")
    expect(tables).not.toContain("device_types")
    expect(tables).not.toContain("category_default_products")
  })

  it("scopes quotes through their parent", () => {
    const byTable = new Map(
      projectSliceTables(PROJECT_ID).map((entry: { table: string; where: string }) => [entry.table, entry.where]),
    )
    expect(byTable.get("quote_items")).toContain(`SELECT id FROM quotes WHERE project_id='${PROJECT_ID}'`)
    expect(byTable.get("activity_logs")).toContain(`entity_id='${PROJECT_ID}'::uuid`)
  })

  it("requires a project unless it is only listing", () => {
    expect(() => parseExportArgs([])).toThrow(/--project/)
    expect(parseExportArgs(["--list"]).list).toBe(true)
    expect(parseExportArgs(["--project", "邦泰璟和", "--out", "/tmp/x.sql"]))
      .toMatchObject({ project: "邦泰璟和", out: "/tmp/x.sql", container: "fmkj-v3-db" })
  })
})
