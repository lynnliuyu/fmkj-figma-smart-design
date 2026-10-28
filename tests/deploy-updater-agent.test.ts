import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  appendLog,
  claimRequest,
  envVersion,
  parseAgentArgs,
  REQUEST_DIR,
  REQUEST_FILE,
  requestCandidates,
  requestPath,
  resolveInterrupted,
  runAgentOnce,
  RUNNING_FILE,
  validateRequest,
} from "../scripts/deploy/updater-agent.mjs"

let dir = ""
let appDir = ""

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fmkj-agent-"))
  appDir = await mkdtemp(join(tmpdir(), "fmkj-app-"))
  await writeFile(join(appDir, ".env"), "FMKJ_VERSION=v0.1.4\nFMKJ_REPOSITORY=reg/fmkj-v3\n", "utf8")
})

afterEach(async () => {
  await rm(dir, { force: true, recursive: true })
  await rm(appDir, { force: true, recursive: true })
})

function options(extra: Record<string, unknown> = {}) {
  return {
    appDir,
    clearInterrupted: false,
    composeFile: "docker-compose.appliance.yml",
    node: process.execPath,
    once: true,
    pollSeconds: 1,
    repository: "reg/fmkj-v3",
    stateDir: dir,
    ...extra,
  }
}

async function writeRequest(body: Record<string, unknown>) {
  await mkdir(join(dir, REQUEST_DIR), { recursive: true })
  await writeFile(requestPath(dir), JSON.stringify({ id: "r1", requestedAt: new Date().toISOString(), requestedBy: "u", ...body }), "utf8")
}

const okRunner = (calls: unknown[][]) => async (_options: unknown, script: string, args: string[]) => {
  calls.push([script, args])
  return { code: 0, error: null }
}

describe("请求校验（管家唯一接受的输入）", () => {
  it("检查与更新两种动作都认，并各带该带的东西", () => {
    expect(validateRequest({ action: "check", id: "a", requestedAt: new Date().toISOString() })).toMatchObject({ action: "check", ok: true, to: null })
    expect(validateRequest({ action: "update", id: "b", requestedAt: new Date().toISOString(), to: "v0.2.0" })).toMatchObject({ action: "update", ok: true, to: "v0.2.0" })
  })

  it("版本号不合法就不执行——这是防命令注入的那道门", () => {
    for (const bad of ["latest", "v0.2", "v0.2.0; rm -rf /", "$(reboot)", "v0.2.0 && reboot", "../v0.2.0"]) {
      const result = validateRequest({ action: "update", id: "b", requestedAt: new Date().toISOString(), to: bad })
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/版本号不合法/)
    }
  })

  it("不认识的动作、太旧的请求都不执行", () => {
    expect(validateRequest({ action: "reboot", id: "c", requestedAt: new Date().toISOString() }).ok).toBe(false)
    expect(validateRequest({ action: "update", id: "d", requestedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(), to: "v0.2.0" }).reason).toMatch(/已过期/)
    expect(validateRequest(null).ok).toBe(false)
  })

  it("当前版本从 .env 里读（检查更新要用它对比）", () => {
    expect(envVersion("FMKJ_VERSION=v0.1.4\n")).toBe("v0.1.4")
    expect(envVersion('FMKJ_VERSION="v0.9.0"\n')).toBe("v0.9.0")
    expect(envVersion("")).toBe("")
  })
})

describe("上一次更新被打断留下的锁", () => {
  it("没有锁就正常放行", async () => {
    expect(await resolveInterrupted(options())).toMatchObject({ blocked: false })
  })

  it("锁的进程还活着：这一轮跳过，不抢", async () => {
    await writeFile(join(dir, "update.lock"), String(process.pid), "utf8")
    const result = await resolveInterrupted(options())
    expect(result.blocked).toBe(false)
    expect(result.note).toMatch(/已有更新在执行/)
  })

  it("进程已消失、迁移还没跑：清掉锁允许重试", async () => {
    await writeFile(join(dir, "update.lock"), "999999", "utf8")
    await writeFile(join(dir, "update-state.json"), JSON.stringify({
      status: "running", steps: [{ id: "preflight", status: "ok" }, { id: "fetch", status: "ok" }], target: "v0.2.0",
    }), "utf8")
    const result = await resolveInterrupted(options())
    expect(result.blocked).toBe(false)
    expect(result.note).toMatch(/清理了上次中断留下的锁/)
    await expect(readFile(join(dir, "update.lock"), "utf8")).rejects.toThrow()
  })

  it("迁移已经跑过：拒绝自动重试，必须人工恢复备份", async () => {
    await writeFile(join(dir, "update.lock"), "999999", "utf8")
    await writeFile(join(dir, "update-state.json"), JSON.stringify({
      status: "running", steps: [{ id: "fetch", status: "ok" }, { id: "migrate", status: "ok" }], target: "v0.2.0",
    }), "utf8")
    const result = await resolveInterrupted(options())
    expect(result.blocked).toBe(true)
    expect(result.message).toMatch(/不能自动重试/)
  })
})

describe("管家执行一轮", () => {
  it("没有请求就什么都不做", async () => {
    expect(await runAgentOnce(options())).toBeNull()
  })

  it("更新请求：只把版本号当参数传给更新脚本，并留下结果给页面看", async () => {
    await writeRequest({ action: "update", to: "v0.2.0" })
    const calls: unknown[][] = []
    const result = await runAgentOnce(options(), { runScript: okRunner(calls) })

    expect(result).toMatchObject({ status: "succeeded", target: "v0.2.0" })
    expect(calls[0][0]).toBe("update-local.mjs")
    expect(calls[0][1]).toContain("v0.2.0")
    // 更新成功后顺手刷一次版本检查，界面不会停在「有新版本」
    expect(calls[1][0]).toBe("check-update.mjs")
    const state = JSON.parse(await readFile(join(dir, "updater-state.json"), "utf8"))
    expect(state).toMatchObject({ action: "update", status: "succeeded", target: "v0.2.0" })
    await expect(readFile(join(dir, REQUEST_DIR, RUNNING_FILE), "utf8")).rejects.toThrow()
  })

  it("检查请求：把 .env 里的当前版本号一起传过去", async () => {
    await writeRequest({ action: "check" })
    const calls: unknown[][] = []
    await runAgentOnce(options(), { runScript: okRunner(calls) })
    expect(calls[0][0]).toBe("check-update.mjs")
    expect(calls[0][1]).toContain("--current")
    expect(calls[0][1]).toContain("v0.1.4")
  })

  it("非法请求：拒绝执行、写清原因，并把它从队列里拿走", async () => {
    await writeRequest({ action: "update", to: "v0.2.0; reboot" })
    const calls: unknown[][] = []
    const result = await runAgentOnce(options(), { runScript: okRunner(calls) })

    expect(calls).toHaveLength(0)
    expect(result?.status).toBe("failed")
    const state = JSON.parse(await readFile(join(dir, "updater-state.json"), "utf8"))
    expect(state.message).toMatch(/请求被拒绝/)
    await expect(readFile(join(dir, REQUEST_DIR, RUNNING_FILE), "utf8")).rejects.toThrow()
  })

  it("脚本失败时把失败状态如实报给页面", async () => {
    await writeRequest({ action: "update", to: "v0.2.0" })
    await writeFile(join(dir, "update-state.json"), JSON.stringify({
      failure: { message: "拉取镜像失败" }, status: "failed", steps: [{ id: "fetch", status: "failed" }], target: "v0.2.0",
    }), "utf8")
    const result = await runAgentOnce(options(), { runScript: async () => ({ code: 1, error: null }) })

    expect(result?.status).toBe("failed")
    expect(result?.message).toBe("拉取镜像失败")
  })

  it("老版本应用写的请求（根目录）也认——否则第一次点按钮的老设备升不上来", async () => {
    await writeFile(join(dir, REQUEST_FILE), JSON.stringify({ action: "check", id: "legacy", requestedAt: new Date().toISOString(), requestedBy: "u" }), "utf8")
    expect(requestCandidates(dir)[1]).toBe(join(dir, REQUEST_FILE))
    const calls: unknown[][] = []
    const result = await runAgentOnce(options(), { runScript: okRunner(calls) })

    expect(calls).toHaveLength(1)
    expect(result?.status).toBe("succeeded")
  })

  it("一条请求只会被一个管家领走（改名是原子的）", async () => {
    await writeRequest({ action: "check" })
    expect(await claimRequest(dir)).toBeTruthy()
    expect(await claimRequest(dir)).toBeNull()
  })

  it("断电打断后不再自动重试，并且说清楚为什么", async () => {
    await writeFile(join(dir, "update.lock"), "999999", "utf8")
    await writeFile(join(dir, "update-state.json"), JSON.stringify({
      status: "running", steps: [{ id: "migrate", status: "ok" }], target: "v0.2.0",
    }), "utf8")
    await writeRequest({ action: "update", to: "v0.2.0" })
    const calls: unknown[][] = []
    const result = await runAgentOnce(options(), { runScript: okRunner(calls) })

    expect(result?.status).toBe("interrupted")
    expect(calls).toHaveLength(0)
    expect(JSON.parse(await readFile(join(dir, "updater-state.json"), "utf8")).status).toBe("interrupted")
  })
})

describe("管家参数与日志", () => {
  it("默认值可用，显式参数能覆盖", () => {
    const parsed = parseAgentArgs(["--app-dir", appDir, "--state-dir", dir, "--poll-seconds", "3", "--once"])
    expect(parsed).toMatchObject({ appDir, once: true, pollSeconds: 3, stateDir: dir })
  })

  it("日志会落在 deploy-state 里，出问题能追", async () => {
    await appendLog(dir, "测试一行")
    expect(await readFile(join(dir, "updater-log.txt"), "utf8")).toMatch(/测试一行/)
  })
})
