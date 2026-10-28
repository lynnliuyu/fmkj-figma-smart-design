import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cadImportApiConfig, createCadImportApi } from "../scripts/cad-import-api.mjs"
import { parsePointMapDraft } from "../lib/point-map-design"

const token = "t".repeat(32)
const headers = { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }
const drawing = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n"
const apis: { close(): Promise<void> }[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(apis.splice(0).map(api => api.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

type Task = { source: string; outDir: string; space?: string; floorName?: string }

const draftFor = (floorName = "一层") => ({
  format: "fmkj-point-map-draft", version: 1, coordinateSystem: "image-percent",
  floors: [{ id: "floor-1", name: floorName, floorplanName: "base.png", floorplanDataUrl: "data:image/png;base64,iVBORw0KGgo=", imageWidth: 3000, imageHeight: 2358, sourcePage: 29,
    cad: { format: "cadcraft", version: 1, drawingId: floorName, drawingSha256: "a".repeat(64), window: [0, 0, 23640.8, 18570.7] } }],
  points: [{ id: "page-029-L-001", name: "筒灯 L-001", room: "未分房间", iconId: "downlight", status: "planned", x: 41.2, y: 63.8, productId: "", note: "", placed: false, floorId: "floor-1", code: "L-001", source: "analysis", confidence: "medium", reviewReason: "需复核" }],
  scenes: [],
})

async function successfulImport(task: Task) {
  expect(await readFile(task.source, "utf8")).toBe(drawing)
  const floor = join(task.outDir, "floor")
  await mkdir(floor, { recursive: true })
  const draft = draftFor(task.floorName)
  await writeFile(join(floor, "draft.json"), JSON.stringify(draft))
  await writeFile(join(floor, "base.png"), "png-bytes")
  await writeFile(join(floor, "ref-lighting.png"), "png-bytes")
  await writeFile(join(floor, "floor.json"), JSON.stringify({ floor: task.floorName, points: 1 }))
  await writeFile(join(task.outDir, "result.json"), JSON.stringify({ sourceSha256: "a".repeat(64), fileName: "x.dwg", summary: { byIcon: { downlight: 1 }, warnings: [] } }))
}

async function setup(overrides = {}, dependencies = {}) {
  const root = await mkdtemp(join(tmpdir(), "cad-import-api-")); roots.push(root)
  const config = { ...cadImportApiConfig({ CAD_IMPORT_API_TOKEN: token, CAD_IMPORT_DATA_DIR: root }), ...overrides }
  const api = await createCadImportApi(config, { startWorker: (task: Task) => ({ done: successfulImport(task), cancel() {} }), logError() {}, ...dependencies } as never)
  apis.push(api as never)
  await new Promise<void>(accept => (api as { server: import("node:http").Server }).server.listen(0, "127.0.0.1", accept))
  const address = (api as { server: import("node:http").Server }).server.address()
  if (!address || typeof address === "string") throw new Error("missing test address")
  return { base: `http://127.0.0.1:${address.port}` }
}

async function waitForJob(base: string, path: string) {
  for (let n = 0; n < 100; n++) {
    const job = await (await fetch(base + path, { headers })).json()
    if (["succeeded", "failed"].includes(job.status)) return job
    await new Promise(accept => setTimeout(accept, 10))
  }
  throw new Error("job did not settle")
}

describe("CAD 导入接口", () => {
  it("配置必须有长令牌，默认只监听本机", () => {
    expect(() => cadImportApiConfig({})).toThrow("CAD_IMPORT_API_TOKEN")
    expect(() => cadImportApiConfig({ CAD_IMPORT_API_TOKEN: "short" })).toThrow()
    expect(cadImportApiConfig({ CAD_IMPORT_API_TOKEN: token })).toMatchObject({ host: "127.0.0.1", port: 4328, maxPending: 4 })
  })

  it("上传、轮询、取草稿与底图全流程，令牌缺失一律 401", async () => {
    const { base } = await setup()
    expect((await fetch(base + "/health")).status).toBe(401)
    const response = await fetch(base + "/v1/cad-imports?filename=客户平面.dxf&space=平面图&floorName=一层", { method: "POST", headers, body: drawing })
    expect(response.status).toBe(202)
    const accepted = await response.json()
    const job = await waitForJob(base, accepted.statusUrl)
    expect(job.status).toBe("succeeded")
    expect(job.result).toMatchObject({ floor: "一层", pointCount: 1, imageWidth: 3000, byIcon: { downlight: 1 } })
    // 返回的草稿必须是设计站能直接解析的
    const draft = parsePointMapDraft(JSON.parse(await (await fetch(base + job.result.draftUrl, { headers })).text()))
    expect(draft.points[0].iconId).toBe("downlight")
    const png = await fetch(base + `/v1/cad-imports/${job.id}/files/base.png`, { headers })
    expect(png.status).toBe(200)
    expect(png.headers.get("content-type")).toBe("image/png")
    expect((await fetch(base + `/v1/cad-imports/${job.id}/files/draft.json`)).status).toBe(401)
  })

  it("拒绝路径、未知文件与非白名单产物", async () => {
    const { base } = await setup()
    const accepted = await (await fetch(base + "/v1/cad-imports?filename=../evil.dwg", { method: "POST", headers, body: drawing })).json()
    expect(accepted.error).toContain("DWG / DXF 文件名")
    const ok = await (await fetch(base + "/v1/cad-imports?filename=ok.dxf", { method: "POST", headers, body: drawing })).json()
    await waitForJob(base, ok.statusUrl)
    expect((await fetch(base + `/v1/cad-imports/${ok.id}/files/job.json`, { headers })).status).toBe(404)
    expect((await fetch(base + `/v1/cad-imports/${ok.id}/files/..%2Fjob.json`, { headers })).status).toBe(404)
  })

  it("DWG 后缀但内容不是 DWG 时返回 422，不进入队列", async () => {
    const { base } = await setup()
    const response = await fetch(base + "/v1/cad-imports?filename=fake.dwg", { method: "POST", headers, body: drawing })
    expect(response.status).toBe(422)
    const real = await fetch(base + "/v1/cad-imports?filename=real.dwg", { method: "POST", headers, body: "AC1032 DWG BINARY" })
    expect(real.status).toBe(202)
  })

  it("失败任务不开放半成品下载", async () => {
    const { base } = await setup({}, {
      startWorker: () => ({ done: Promise.reject(new Error("synthetic import failure")), cancel() {} }),
    })
    const accepted = await (await fetch(base + "/v1/cad-imports?filename=x.dxf", { method: "POST", headers, body: drawing })).json()
    const job = await waitForJob(base, accepted.statusUrl)
    expect(job.status).toBe("failed")
    expect(job.error).toContain("导入未完成")
    expect((await fetch(base + `/v1/cad-imports/${job.id}/files/draft.json`, { headers })).status).toBe(409)
  })
})
