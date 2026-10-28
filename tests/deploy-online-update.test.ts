import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/admin-auth", () => ({
  requireSuperAdmin: vi.fn(async () => ({ user: { userId: "10000000-0000-0000-0000-000000000001" } })),
}))

import { GET, POST } from "../app/api/admin/system/update/route"
import {
  clearUpdateRequest,
  describeUpdateProgress,
  isDeployVersion,
  readAgentState,
  readUpdateRequest,
  writeUpdateRequest,
} from "../lib/deploy-update"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fmkj-update-"))
  process.env.FMKJ_DEPLOY_STATE_DIR = dir
})

afterEach(async () => {
  delete process.env.FMKJ_DEPLOY_STATE_DIR
  await rm(dir, { force: true, recursive: true })
})

async function writeCheck(overrides: Record<string, unknown> = {}) {
  await writeFile(join(dir, "update-check.json"), JSON.stringify({
    checkedAt: new Date().toISOString(),
    currentVersion: "v0.1.4",
    error: null,
    latestVersion: "v0.2.0",
    signature: "verified",
    source: "index",
    updateAvailable: true,
    ...overrides,
  }), "utf8")
}

function post(body: unknown) {
  return POST(new Request("http://localhost/api/admin/system/update", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }) as never)
}

describe("更新请求的读写", () => {
  it("只接受规范的版本号", () => {
    expect(isDeployVersion("v0.2.0")).toBe(true)
    expect(isDeployVersion("v1.10.3-rc.1")).toBe(true)
    for (const bad of ["latest", "0.2.0", "v0.2", "v0.2.0; rm -rf /", "", " v0.2.0 extra", null]) {
      expect(isDeployVersion(bad as never)).toBe(false)
    }
  })

  it("前后多了空格会被当成同一个版本（同事手输时很常见）", async () => {
    expect(isDeployVersion(" v0.2.0 ")).toBe(true)
    await writeUpdateRequest(dir, { action: "update", requestedBy: "u", to: " v0.2.0 " })
    expect((await readUpdateRequest(dir))?.to).toBe("v0.2.0")
  })

  it("写进去再读出来是同一件事", async () => {
    const request = await writeUpdateRequest(dir, { action: "update", requestedBy: "user-1", to: "v0.2.0" })
    const read = await readUpdateRequest(dir)
    expect(read).toMatchObject({ action: "update", to: "v0.2.0" })
    expect(read?.id).toBe(request.id)
    expect(read?.expired).toBe(false)
  })

  it("检查请求不写版本号；更新请求没版本号就拒绝", async () => {
    await writeUpdateRequest(dir, { action: "check", requestedBy: "user-1" })
    expect((await readUpdateRequest(dir))?.to).toBeNull()
    await clearUpdateRequest(dir)
    await expect(writeUpdateRequest(dir, { action: "update", requestedBy: "u", to: "latest" })).rejects.toThrow("UPDATE_TARGET_INVALID")
  })

  it("太旧的请求标记为过期（断电重启后不该翻出来自己装）", async () => {
    await mkdir(join(dir, "requests"), { recursive: true })
    await writeFile(join(dir, "requests", "update-request.json"), JSON.stringify({
      action: "update", id: "x", requestedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), requestedBy: "u", to: "v0.2.0",
    }), "utf8")
    expect((await readUpdateRequest(dir))?.expired).toBe(true)
  })

  it("管家没跑过就没有它的状态", async () => {
    expect(await readAgentState(dir)).toBeNull()
    await writeFile(join(dir, "updater-state.json"), JSON.stringify({
      action: "update", finishedAt: new Date().toISOString(), id: "x", message: "", startedAt: new Date().toISOString(), status: "succeeded", target: "v0.2.0",
    }), "utf8")
    expect((await readAgentState(dir))?.status).toBe("succeeded")
  })
})

describe("页面上的进度文案", () => {
  const agent = (status: string, extra: Record<string, unknown> = {}) => ({
    action: "update" as const, finishedAt: "", id: "r1", message: null, startedAt: new Date().toISOString(), status, target: "v0.2.0", ...extra,
  })

  it("正在执行时说清楚要等多久、别断电", () => {
    const progress = describeUpdateProgress({ agent: agent("running"), checkStale: false, request: { action: "update", ageMs: 1000, id: "r1", to: "v0.2.0" } })
    expect(progress.busy).toBe(true)
    expect(progress.message).toMatch(/请勿断电/)
  })

  it("请求排队中但不忙时，会区分「等设备」和「管家没响应」", () => {
    const waiting = describeUpdateProgress({ agent: null, checkStale: false, request: { action: "update", ageMs: 4000, id: "r1", to: "v0.2.0" } })
    expect(waiting.message).toMatch(/等待设备执行/)
    const stale = describeUpdateProgress({ agent: null, checkStale: false, request: { action: "update", ageMs: 10 * 60 * 1000, id: "r1", to: "v0.2.0" } })
    expect(stale.tone).toBe("warn")
    expect(stale.message).toMatch(/更新管家没有响应/)
  })

  it("迁移之后失败的要求人工恢复，并明确不要切回旧版本", () => {
    const progress = describeUpdateProgress({ agent: agent("failed-needs-restore", { message: "迁移已执行" }), checkStale: false, request: null })
    expect(progress.tone).toBe("error")
    expect(progress.message).toMatch(/不要切回旧版本/)
  })

  it("成功与还没检查过都有明确说法", () => {
    expect(describeUpdateProgress({ agent: agent("succeeded"), checkStale: false, request: null }).tone).toBe("ok")
    expect(describeUpdateProgress({ agent: null, checkStale: true, request: null }).message).toMatch(/还没有检查过版本/)
  })
})

describe("更新接口", () => {
  it("还没检查过就说先检查一次", async () => {
    const response = await post({ action: "update", to: "v0.2.0" })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("CHECK_REQUIRED")
  })

  it("只能更新到「检查到的最新版本」", async () => {
    await writeCheck()
    const wrong = await post({ action: "update", to: "v9.9.9" })
    expect(wrong.status).toBe(400)
    expect((await wrong.json()).error).toBe("VERSION_NOT_OFFERED")

    const ok = await post({ action: "update", to: "v0.2.0" })
    expect(ok.status).toBe(200)
    expect((await readUpdateRequest(dir))?.to).toBe("v0.2.0")
  })

  it("检查结果说没有新版本时不给装", async () => {
    await writeCheck({ currentVersion: "v0.1.4", latestVersion: "v0.2.0", updateAvailable: false })
    const response = await post({ action: "update", to: "v0.2.0" })
    expect(response.status).toBe(400)
    expect((await response.json()).message).toMatch(/已经是最新版本/)
  })

  it("已经在跑的版本不再装一遍（当前版本以容器自己的为准）", async () => {
    await writeCheck({ currentVersion: "v0.1.4", latestVersion: "v0.2.0" })
    process.env.FMKJ_VERSION = "v0.2.0"
    const response = await post({ action: "update", to: "v0.2.0" })
    delete process.env.FMKJ_VERSION

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("ALREADY_CURRENT")
  })

  it("上一条请求还在排队时不重复下发", async () => {
    await post({ action: "check" })
    const again = await post({ action: "check" })
    expect(again.status).toBe(409)
    expect((await again.json()).error).toBe("REQUEST_PENDING")
  })

  it("管家正在跑的时候不让再点", async () => {
    await writeFile(join(dir, "updater-state.json"), JSON.stringify({
      action: "update", finishedAt: "", id: "r1", message: "", startedAt: new Date().toISOString(), status: "running", target: "v0.2.0",
    }), "utf8")
    const response = await post({ action: "check" })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe("UPDATE_IN_PROGRESS")
  })

  it("GET 把版本、进度、上次结果一起给页面", async () => {
    await writeCheck()
    await writeUpdateRequest(dir, { action: "check", requestedBy: "u" })
    const payload = await (await GET()).json()
    expect(payload.currentVersion).toBe("v0.1.4")
    expect(payload.check.latestVersion).toBe("v0.2.0")
    expect(payload.progress.message).toBeTruthy()
  })

  it("不认识的操作直接拒绝", async () => {
    const response = await post({ action: "shutdown" })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("UNKNOWN_ACTION")
  })
})

describe("请求文件是整体写入的", () => {
  it("不会留下写了一半的内容给管家读到", async () => {
    await writeUpdateRequest(dir, { action: "update", requestedBy: "u", to: "v0.2.0" })
    const content = await readFile(join(dir, "requests", "update-request.json"), "utf8")
    expect(() => JSON.parse(content)).not.toThrow()
    expect(content.endsWith("\n")).toBe(true)
  })
})
