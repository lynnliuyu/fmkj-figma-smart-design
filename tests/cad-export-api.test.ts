import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { request as httpRequest } from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { cadExportApiConfig, createCadExportApi, startCadExportWorker } from "../scripts/cad-export-api.mjs"
import { renderClippedCadReview } from "../scripts/cadcraft/clipped-review.mjs"

const roots: string[] = []
const apis: Awaited<ReturnType<typeof createCadExportApi>>[] = []
const token = randomBytes(32).toString("hex")
const drawing = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"
const headers = { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }
type Options = { source: string; outDir: string; colorMode: string }

afterEach(async () => {
  await Promise.all(apis.splice(0).map(api => api.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function successfulExport(options: Options) {
  expect(await readFile(options.source, "utf8")).toBe(drawing)
  await mkdir(options.outDir)
  const page = { id: "page-001", kind: "sheet", space: "Model", labels: ["一层平面布置图"], pdf: "page-001.pdf", png: "page-001.png" }
  const manifest = { sourceSha256: "test-sha", overviews: [], sheets: [page], warnings: ["请核对总览"] }
  await writeFile(join(options.outDir, "manifest.json"), JSON.stringify(manifest))
  await writeFile(join(options.outDir, "index.html"), "<html>review</html>")
  await writeFile(join(options.outDir, page.pdf), "%PDF-test")
  await writeFile(join(options.outDir, page.png), "test-png")
}

async function setup(overrides = {}, dependencies = {}) {
  const root = await mkdtemp(join(tmpdir(), "cad-export-api-")); roots.push(root)
  const config = { ...cadExportApiConfig({ CAD_EXPORT_API_TOKEN: token, CAD_EXPORT_DATA_DIR: root }), ...overrides }
  const api = await createCadExportApi(config, {
    startWorker: (options: Options) => ({ done: successfulExport(options), cancel() {} }),
    logError() {}, ...dependencies,
  })
  apis.push(api)
  await new Promise<void>(accept => api.server.listen(0, "127.0.0.1", accept))
  const address = api.server.address()
  if (!address || typeof address === "string") throw new Error("Missing test address")
  return { api, root, config, base: `http://127.0.0.1:${address.port}` }
}

async function waitForJob(base: string, path: string) {
  for (let n = 0; n < 100; n++) {
    const job = await (await fetch(base + path, { headers })).json()
    if (["succeeded", "failed"].includes(job.status)) return job
    await new Promise(accept => setTimeout(accept, 10))
  }
  throw new Error("Job did not settle")
}

describe("CAD 导出 HTTP 接口", () => {
  it("配置必须有长密钥，默认仅监听本机并限制文件和队列", () => {
    expect(() => cadExportApiConfig({})).toThrow("CAD_EXPORT_API_TOKEN")
    expect(() => cadExportApiConfig({ CAD_EXPORT_API_TOKEN: "short" })).toThrow()
    expect(() => cadExportApiConfig({ CAD_EXPORT_API_TOKEN: token, CAD_EXPORT_PORT: "0" })).toThrow()
    expect(cadExportApiConfig({ CAD_EXPORT_API_TOKEN: token })).toMatchObject({ host: "127.0.0.1", maxPending: 4, maxBytes: 104857600 })
    expect(() => cadExportApiConfig({ CAD_EXPORT_API_TOKEN: token, CAD_EXPORT_WEB: "1", CAD_EXPORT_HOST: "0.0.0.0" })).toThrow("回环")
  })

  it("上传、异步查询、布局分类、下载与清理走真实 HTTP，所有出口都鉴权", async () => {
    const { base, root } = await setup()
    expect((await fetch(base + "/health")).status).toBe(401)
    const response = await fetch(base + "/v1/exports?filename=input.dxf", { method: "POST", headers, body: drawing })
    expect(response.status).toBe(202)
    const accepted = await response.json()
    const job = await waitForJob(base, accepted.statusUrl)
    expect(job.status).toBe("succeeded")
    expect(job.result).toMatchObject({ sheetCount: 1, completeness: "requires-human-review", warnings: ["请核对总览"] })
    expect(job.result.pages[0].category).toBe("layout")
    expect(job.timings.exportMs).toBeGreaterThanOrEqual(0)
    expect(job.timings.totalMs).toBeGreaterThanOrEqual(job.timings.exportMs)
    expect(JSON.stringify(job)).not.toContain(root)
    const pdfUrl = job.result.pages[0].pdfUrl
    expect((await fetch(base + pdfUrl)).status).toBe(401)
    const pdf = await fetch(base + pdfUrl, { headers })
    expect(pdf.headers.get("content-type")).toBe("application/pdf")
    expect(await pdf.text()).toBe("%PDF-test")
    const png = await fetch(base + job.result.pages[0].pngUrl, { headers })
    expect(png.headers.get("content-type")).toBe("image/png")
    expect(png.headers.get("content-disposition")).toContain("inline")
    expect((await fetch(base + accepted.statusUrl + "/files/input.dxf", { headers })).status).toBe(404)
    expect((await fetch(base + accepted.statusUrl + "/files/%2e%2e%2fjob.json", { headers })).status).toBe(404)
    expect((await fetch(base + accepted.statusUrl, { method: "DELETE", headers })).status).toBe(200)
    expect((await fetch(base + accepted.statusUrl, { headers })).status).toBe(404)
    expect(await readdir(root)).toEqual([])
  })

  it("下载文件名按图号-图名给出，原色文件可见，且对图纸文字做防注入处理", async () => {
    const { base } = await setup({}, {
      startWorker: (options: Options) => ({ done: (async () => {
        await mkdir(options.outDir)
        const pages = [
          { id: "page-001", kind: "sheet", space: "Model", labels: ["PM-13 富二楼平面布置图"], deliveryStem: "PM-13-富二楼平面布置图", pdf: "page-001.pdf", png: "page-001.png", originalPdf: "page-001.original.pdf", originalPng: "page-001.original.png" },
          // 图纸文字属于不可信输入：带引号、换行与控制字符，必须清洗后才进响应头。
          { id: "page-002", kind: "sheet", space: "Model", labels: ["P-02 旧墙拆除图"], deliveryStem: "P-02 旧墙\"拆除\r\n图", pdf: "page-002.pdf", png: "page-002.png" },
        ]
        await writeFile(join(options.outDir, "manifest.json"), JSON.stringify({ sourceSha256: "test-sha", overviews: [], sheets: pages, warnings: [] }))
        for (const page of pages) for (const key of ["pdf", "png", "originalPdf", "originalPng"]) {
          const name = (page as unknown as Record<string, string | undefined>)[key]
          if (name) await writeFile(join(options.outDir, name), "file-bytes")
        }
        await writeFile(join(options.outDir, "index.html"), "<html>review</html>")
      })(), cancel() {} }),
    })
    const accepted = await (await fetch(base + "/v1/exports?filename=input.dxf", { method: "POST", headers, body: drawing })).json()
    const job = await waitForJob(base, accepted.statusUrl)
    expect(job.status).toBe("succeeded")
    const page = job.result.pages[0]
    expect(page.displayName).toBe("PM-13 富二楼平面布置图")
    expect(page.fileNames).toEqual({
      pdf: "PM-13-富二楼平面布置图.pdf", png: "PM-13-富二楼平面布置图.png",
      originalPdf: "PM-13-富二楼平面布置图-原色.pdf", originalPng: "PM-13-富二楼平面布置图-原色.png",
    })
    expect(page.originalPngUrl).toContain("page-001.original.png")
    // PDF 默认作为附件下载，中文名走 RFC 5987，ASCII 回退保留磁盘名。
    const pdf = await fetch(base + page.pdfUrl, { headers })
    expect(pdf.status).toBe(200)
    const disposition = pdf.headers.get("content-disposition") ?? ""
    expect(disposition).toContain("attachment")
    expect(disposition).toContain('filename="page-001.pdf"')
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent("PM-13-富二楼平面布置图.pdf")}`)
    // PNG 默认用于预览（inline），加 download=1 才强制下载。
    expect((await fetch(base + page.pngUrl, { headers })).headers.get("content-disposition")).toContain("inline")
    expect((await fetch(base + page.pngUrl + "?download=1", { headers })).headers.get("content-disposition")).toContain("attachment")
    // 恶意图名被清洗：文件名里没有引号、换行或路径分隔符，响应头也没有换行注入。
    const evil = job.result.pages[1]
    expect(evil.fileNames.pdf).toBe("P-02旧墙拆除图.pdf")
    const evilHeaders = (await fetch(base + evil.pdfUrl, { headers })).headers.get("content-disposition") ?? ""
    expect(evilHeaders).not.toMatch(/[\r\n]/)
    // 只有 ASCII 回退那一对引号；中文名整段百分号编码，不会带出裸引号。
    expect(evilHeaders.match(/"/g) ?? []).toHaveLength(2)
    expect(/filename\*=UTF-8''([^;]*)/.exec(evilHeaders)?.[1]).toBe(encodeURIComponent("P-02旧墙拆除图.pdf"))
  })

  it("拒绝路径、伪造文件、超大文件、客户端可执行参数和错误上传类型", async () => {
    const { base, root } = await setup({ maxBytes: 100 })
    for (const name of ["../input.dxf", "x\\input.dxf", "a.txt"]) {
      expect((await fetch(base + "/v1/exports?filename=" + encodeURIComponent(name), { method: "POST", headers, body: drawing })).status).toBe(400)
    }
    const url = base + "/v1/exports?filename=input.dxf"
    expect((await fetch(url + "&cli=bad", { method: "POST", headers, body: drawing })).status).toBe(400)
    expect((await fetch(url, { method: "POST", headers: { authorization: headers.authorization }, body: drawing })).status).toBe(415)
    expect((await fetch(url, { method: "POST", headers, body: "bad CAD" })).status).toBe(422)
    expect((await fetch(url, { method: "POST", headers, body: "a".repeat(101) })).status).toBe(413)
    // No Content-Length: check the streaming limit too.
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("a".repeat(101))); controller.close() } })
    const streamingResponse = await fetch(url, { method: "POST", headers, body: stream, duplex: "half" } as RequestInit)
    expect(streamingResponse.status).toBe(413)
    expect(await readdir(root)).toEqual([])
  })

  it("网页仅在本机开启，使用 HttpOnly 会话且拒绝跨站提交", async () => {
    const { base } = await setup({ webEnabled: true })
    const page = await fetch(base + "/")
    expect(page.status).toBe(200)
    const cookie = page.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
    expect(await page.text()).not.toContain(token)
    const browserHeaders = { cookie: cookie.split(";")[0], "content-type": "application/octet-stream" }
    expect((await fetch(base + "/health", { headers: browserHeaders })).status).toBe(200)
    const path = base + "/v1/exports?filename=browser.dxf"
    expect((await fetch(path, { method: "POST", headers: browserHeaders, body: drawing })).status).toBe(403)
    expect((await fetch(path, { method: "POST", headers: { ...browserHeaders, origin: "https://untrusted.example" }, body: drawing })).status).toBe(403)
    const accepted = await fetch(path, { method: "POST", headers: { ...browserHeaders, origin: base }, body: drawing })
    expect(accepted.status).toBe(202)
    const job = await accepted.json()
    await waitForJob(base, job.statusUrl)
    const script = await fetch(base + "/export-web.js")
    expect(script.headers.get("content-type")).toContain("javascript")
    const foreignHostStatus = await new Promise<number | undefined>((accept, reject) => {
      const request = httpRequest(base + "/", { headers: { host: "untrusted.example" } }, response => { response.resume(); accept(response.statusCode) })
      request.on("error", reject); request.end()
    })
    expect(foreignHostStatus).toBe(401)
    const { base: apiOnly } = await setup()
    expect((await fetch(apiOnly + "/")).status).toBe(401)
  })

  it("单个 CAD worker 串行工作，队列满时拒绝，失败不开放半成品且不泄露内部路径", async () => {
    let rejectWork: (error: Error) => void = () => {}
    let started = 0
    const { base } = await setup({ maxPending: 1 }, {
      startWorker: () => { started++; return { done: new Promise((_accept, reject) => { rejectWork = reject }), cancel() { rejectWork(new Error("cancelled")) } } },
    })
    const post = () => fetch(base + "/v1/exports?filename=input.dxf", { method: "POST", headers, body: drawing })
    const accepted = await (await post()).json()
    expect((await post()).status).toBe(429)
    await expect.poll(() => started).toBe(1)
    expect((await fetch(base + accepted.statusUrl, { method: "DELETE", headers })).status).toBe(409)
    rejectWork(new Error("private /srv/customer/source.dxf failure"))
    const job = await waitForJob(base, accepted.statusUrl)
    expect(job.status).toBe("failed")
    expect(job.error).not.toContain("/srv")
    expect((await fetch(base + accepted.statusUrl + "/files/manifest.json", { headers })).status).toBe(409)
  })

  it("重启后保留已完成任务，把未完成任务标记为失败", async () => {
    const { api, config, base, root } = await setup()
    const accepted = await (await fetch(base + "/v1/exports?filename=input.dxf", { method: "POST", headers, body: drawing })).json()
    await waitForJob(base, accepted.statusUrl)
    await api.close(); apis.splice(apis.indexOf(api), 1)
    const incomplete = "10000000-0000-4000-8000-000000000001"
    await mkdir(join(root, incomplete))
    await writeFile(join(root, incomplete, "job.json"), JSON.stringify({ id: incomplete, status: "running", filename: "interrupted.dxf" }))
    const restored = await createCadExportApi(config, { logError() {} }); apis.push(restored)
    await new Promise<void>(accept => restored.server.listen(0, "127.0.0.1", accept))
    const address = restored.server.address()
    if (!address || typeof address === "string") throw new Error("Missing address")
    const nextBase = `http://127.0.0.1:${address.port}`
    expect((await (await fetch(nextBase + accepted.statusUrl, { headers })).json()).status).toBe("succeeded")
    const recovered = await (await fetch(nextBase + "/v1/exports/" + incomplete, { headers })).json()
    expect(recovered.status).toBe("failed")
    expect(recovered.error).toContain("重启")
  })

  it("多个任务按顺序运行，前一个结束后才启动下一个", async () => {
    let release: () => void = () => {}
    const started: string[] = []
    const { base } = await setup({ maxPending: 2 }, {
      startWorker: (options: Options) => {
        started.push(options.source)
        return {
          done: new Promise<void>(accept => { release = accept }).then(() => successfulExport(options)),
          cancel() { release() },
        }
      },
    })
    const post = async (name: string) => (await fetch(base + "/v1/exports?filename=" + name, { method: "POST", headers, body: drawing })).json()
    const first = await post("first.dxf"), second = await post("second.dxf")
    await expect.poll(() => started.length).toBe(1)
    expect((await (await fetch(base + second.statusUrl, { headers })).json()).status).toBe("queued")
    release()
    expect((await waitForJob(base, first.statusUrl)).status).toBe("succeeded")
    await expect.poll(() => started.length).toBe(2)
    expect(started[0]).toContain("first.dxf")
    expect(started[1]).toContain("second.dxf")
    release()
    expect((await waitForJob(base, second.statusUrl)).status).toBe("succeeded")
  })

  it("真实 worker 超时后清理挂起的 CAD 子进程", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-export-timeout-")); roots.push(root)
    const cli = join(root, "hanging-cli.mjs"), pidPath = join(root, "cli.pid")
    await writeFile(cli, `#!/usr/bin/env node\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(pidPath)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`, { mode: 0o700 })
    const source = join(root, "test.dxf")
    await writeFile(source, drawing)
    const worker = startCadExportWorker({ source, outDir: join(root, "output"), cli, colorMode: "original" }, { progress() {}, timeoutMs: 5000 })
    await expect(worker.done).rejects.toThrow("超时")
    const pid = Number(await readFile(pidPath, "utf8"))
    await expect.poll(() => {
      try { process.kill(pid, 0); return false } catch { return true }
    }).toBe(true)
  })

  it("裁剪渲染按单页计时中止，返回明确错误且不产生成功结果", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-page-budget-")); roots.push(root)
    const python = join(root, "fake-python.mjs")
    await writeFile(python, "#!/usr/bin/env node\nif(process.argv.includes('-c'))process.exit(0);\nconsole.log('Rendering page-heavy');\nsetInterval(()=>{},1000);\n", { mode: 0o700 })
    await expect(renderClippedCadReview({ overviews: [], sheets: [], colorMode: "original" }, join(root, "source.dxf"), { viewports: new Map() }, root, root, python, () => {}, { pageTimeoutMs: 80 })).rejects.toMatchObject({ code: "CAD_RENDER_BUDGET" })
    expect(await readdir(root)).not.toContain("render-result.json")
  })
})
