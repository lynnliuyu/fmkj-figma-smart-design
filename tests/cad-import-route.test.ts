import { createServer } from "node:http"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createCadImportApiHandlers } from "../lib/cad-import-api"
import { CadImportError, cadImportConfig, mergeDraftIntoPlan, requestCadImport } from "../lib/point-map-cad-import"
import { emptyPointMapPlan } from "../lib/point-map-plan"
import { PointMapServiceError } from "../lib/point-map-service"

const projectId = "11111111-1111-4111-8111-111111111111"
const context = { params: Promise.resolve({ id: projectId }) }
const token = "t".repeat(40)

const draft = {
  format: "fmkj-point-map-draft", version: 1, coordinateSystem: "image-percent",
  floors: [{ id: "floor-1", name: "一层", floorplanName: "base.png", floorplanDataUrl: "data:image/png;base64,iVBORw0KGgo=", imageWidth: 3000, imageHeight: 2358, sourcePage: 29,
    cad: { format: "cadcraft", version: 1, drawingId: "一层", drawingSha256: "a".repeat(64), window: [0, 0, 23640.8, 18570.7] } }],
  points: [{ id: "floor-1-L-001", name: "筒灯 L-001", room: "未分房间", iconId: "downlight", status: "planned", x: 41.2, y: 63.8, productId: "", note: "", placed: false, floorId: "floor-1", code: "L-001", source: "analysis", confidence: "medium", reviewReason: "需复核" }],
  scenes: [],
}

const account = { accountId: "acc-1" } as never
const request = (body = "0\nSECTION\n0\nENDSEC\n0\nEOF\n", name = "客户.dxf") =>
  new Request(`http://localhost/api/projects/${projectId}/cad-import?filename=${encodeURIComponent(name)}&floorName=${encodeURIComponent("一层")}`, {
    method: "POST", headers: { "content-type": "application/octet-stream" }, body,
  })

function handlers(overrides: Record<string, unknown> = {}) {
  return createCadImportApiHandlers({
    getContext: async () => account,
    config: () => ({ baseUrl: "http://127.0.0.1:4328", token }),
    read: async () => ({ data: null, revision: 0, versions: [] }),
    importDraft: async () => ({ draft: draft as never, id: "job-1" }),
    save: async (_a: unknown, _id: string, input: { plan: unknown; expectedRevision: number }) => ({ data: input.plan as never, revision: input.expectedRevision + 1, versions: [] }),
    ...overrides,
  } as never)
}

const servers: { close(): Promise<void> }[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())) })

/** 最小假服务：验证客户端的上传 → 轮询 → 取草稿协议与鉴权头。 */
async function fakeService(options: { token: string; pollFailures?: number }) {
  let polls = 0
  const server = createServer(async (request, response) => {
    const authorized = request.headers.authorization === `Bearer ${options.token}`
    const json = (status: number, body: unknown) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)) }
    if (!authorized) return json(401, { error: "需要有效的 Bearer Token。" })
    if (request.method === "POST" && request.url?.startsWith("/v1/cad-imports?")) {
      request.resume() // 丢弃上传体：这个假服务只验证协议与鉴权
      return json(202, { id: "job-1", status: "queued", statusUrl: "/v1/cad-imports/job-1" })
    }
    if (request.url === "/v1/cad-imports/job-1") {
      polls += 1
      if (options.pollFailures && polls <= options.pollFailures) return json(200, { id: "job-1", status: "running" })
      return json(200, { id: "job-1", status: "succeeded", result: { draftUrl: "/v1/cad-imports/job-1/files/draft.json" } })
    }
    if (request.url === "/v1/cad-imports/job-1/files/draft.json") return json(200, draft)
    return json(404, { error: "not found" })
  })
  await new Promise<void>(accept => server.listen(0, "127.0.0.1", accept))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("missing address")
  servers.push({ close: () => new Promise<void>(accept => { server.closeAllConnections(); server.close(() => accept()) }) })
  return `http://127.0.0.1:${address.port}`
}

describe("设计站 CAD 导入路由", () => {
  it("导入草稿并写入项目，返回新增点位数与版本", async () => {
    const response = await handlers().POST(request(), context)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ revision: 1, added: 1, skipped: 0, floor: "一层", pointCount: 1, importId: "job-1" })
    // 返回已落库的方案，前端不必再请求一次
    expect(body.plan.points).toHaveLength(1)
    expect(body.plan.floors[0].name).toBe("一层")
    // 响应里绝不能出现服务端令牌
    expect(JSON.stringify(body)).not.toContain(token)
  })

  it("未登录返回 401", async () => {
    const response = await handlers({ getContext: async () => null }).POST(request(), context)
    expect(response.status).toBe(401)
  })

  it("未配置对接服务时返回 503 且说明该配什么", async () => {
    const response = await handlers({ config: () => null }).POST(request(), context)
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain("CAD_IMPORT_SERVICE_URL")
  })

  it("文件名带路径或后缀不符时拒绝", async () => {
    for (const name of ["../evil.dwg", "no-extension", "x.exe"]) {
      const response = await handlers().POST(request("data", name), context)
      expect(response.status).toBe(400)
    }
  })

  it("上游失败与超时映射为可读错误，不写库", async () => {
    const save = vi.fn()
    for (const [error, status] of [
      [new CadImportError("CAD_IMPORT_FAILED", "导入未完成", 422), 422],
      [new CadImportError("CAD_IMPORT_TIMEOUT", "导入超时", 504), 504],
      [new CadImportError("CAD_IMPORT_UNAUTHORIZED", "凭据被拒绝", 403), 403],
      [new PointMapServiceError("PROJECT_NOT_FOUND", 404), 404],
    ] as const) {
      const response = await handlers({ importDraft: async () => { throw error }, save }).POST(request(), context)
      expect(response.status).toBe(status)
    }
    expect(save).not.toHaveBeenCalled()
  })

  it("版本冲突原样透传，调用方可以重试", async () => {
    const save = vi.fn(async () => { throw new PointMapServiceError("POINT_MAP_REVISION_CONFLICT", 409, "版本冲突") })
    const response = await handlers({ save }).POST(request(), context)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain("版本冲突")
  })

  it("重复导入同一草稿不重复建点", () => {
    const plan = emptyPointMapPlan(projectId)
    const first = mergeDraftIntoPlan(plan, draft as never)
    const second = mergeDraftIntoPlan(first.plan, draft as never)
    expect(first.added).toBe(1)
    expect(second.added + second.skipped).toBe(1)
    expect(second.plan.points.filter(point => point.code === "L-001")).toHaveLength(1)
  })

  it("客户端走真实 HTTP：上传、轮询到成功并取回可解析的草稿", async () => {
    const baseUrl = await fakeService({ token, pollFailures: 1 })
    const { draft: received, id } = await requestCadImport({ baseUrl, token }, { filename: "客户.dxf", bytes: new Uint8Array([1, 2, 3]), floorName: "一层" })
    expect(id).toBe("job-1")
    expect(received.points).toHaveLength(1)
    expect(received.coordinateSystem).toBe("image-percent")
  })

  it("客户端把 401 与连接失败翻译成可读错误", async () => {
    const baseUrl = await fakeService({ token })
    await expect(requestCadImport({ baseUrl, token: "w".repeat(40) }, { filename: "x.dxf", bytes: new Uint8Array([1]) }))
      .rejects.toThrow(/凭据/)
    await expect(requestCadImport({ baseUrl: "http://127.0.0.1:1", token }, { filename: "x.dxf", bytes: new Uint8Array([1]) }))
      .rejects.toThrow(/无法连接/)
  })

  it("配置校验：缺地址或令牌视为未配置，非法地址明确报错", () => {
    expect(cadImportConfig({} as never)).toBeNull()
    expect(cadImportConfig({ CAD_IMPORT_SERVICE_URL: "http://x", CAD_IMPORT_SERVICE_TOKEN: token } as never)).toEqual({ baseUrl: "http://x", token })
    expect(() => cadImportConfig({ CAD_IMPORT_SERVICE_URL: "ftp://x", CAD_IMPORT_SERVICE_TOKEN: token } as never)).toThrow(CadImportError)
    expect(() => cadImportConfig({ CAD_IMPORT_SERVICE_URL: "http://x", CAD_IMPORT_SERVICE_TOKEN: "short" } as never)).toThrow(CadImportError)
  })
})
