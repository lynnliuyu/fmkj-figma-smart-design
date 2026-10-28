#!/usr/bin/env node
/**
 * 设备上的「更新管家」。
 *
 * 为什么需要它：网页不能直接装软件——业务应用被关在隔离容器里，故意不给它 docker socket
 * 和宿主机命令执行能力（ADR 0010）。所以应用只把「我想装 v0.2.0」写成 deploy-state 里的
 * 一个请求文件，管家在设备上当搬运工：
 *
 *   看到请求 → 校验（只认版本号）→ 跑既有的更新脚本（备份→拉镜像→迁移→切换→自检）
 *   → 把结果写回 updater-state.json 供页面显示。
 *
 * 安全边界：管家**只认版本号**这一个输入，只调用仓库里那两个固定脚本，参数用数组传（不拼 shell）。
 * 即使网页被攻破，最多也只能触发一次「安装某个正式发布的版本」，无法变成任意命令执行。
 *
 * 用法（宿主机上跑，由 systemd 守护，见 deploy/systemd/fmkj-updater.service）：
 *   node scripts/deploy/updater-agent.mjs --app-dir /opt/fmkj/app --repository <仓库>/fmkj-v3 \
 *     --compose-file docker-compose.appliance.yml --state-dir /opt/fmkj/app/deploy-state
 *   # 只跑一轮（排障用）：加 --once
 *   # 上次更新被断电打断、确认要重新允许更新：加 --clear-interrupted
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { decideFailureAction, readUpdateState } from "./update-local.mjs"

export const REQUEST_DIR = "requests"
export const REQUEST_FILE = "update-request.json"
export const RUNNING_FILE = "update-request.running.json"
export const AGENT_STATE_FILE = "updater-state.json"
export const AGENT_LOG_FILE = "updater-log.txt"
export const LOCK_FILE = "update.lock"
export const VERSION_PATTERN = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/
/** 请求超过这个时间就作废：断电重启后不该翻出昨天的请求自己装一遍。 */
export const REQUEST_EXPIRY_MS = 30 * 60 * 1000
/** 请求文件读多大：正常不到 1KB，超过就当成脏数据。 */
export const REQUEST_MAX_BYTES = 8 * 1024
export const LOG_MAX_BYTES = 512 * 1024

export function requestPath(stateDir) {
  return resolve(stateDir, REQUEST_DIR, REQUEST_FILE)
}

/**
 * 老版本应用把请求写在 deploy-state 根目录（后来才分出 requests/ 子目录）。
 * 升级过程中，提交更新请求的正是「还没升级的那个版本」，所以两个位置都得认，
 * 否则第一次点按钮的老设备永远升不上来。按顺序找，先新的后旧的。
 */
export function requestCandidates(stateDir) {
  return [requestPath(stateDir), resolve(stateDir, REQUEST_FILE)]
}

export function parseAgentArgs(argv) {
  const here = fileURLToPath(import.meta.url)
  const options = {
    appDir: resolve(here, "..", "..", ".."),
    clearInterrupted: false,
    composeFile: "docker-compose.appliance.yml",
    node: process.execPath,
    once: false,
    pollSeconds: 5,
    repository: process.env.FMKJ_REPOSITORY || "fmkj-v3",
    stateDir: process.env.FMKJ_DEPLOY_STATE_DIR || "deploy-state",
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--app-dir") options.appDir = resolve(argv[++index])
    else if (arg === "--state-dir") options.stateDir = resolve(argv[++index])
    else if (arg === "--repository") options.repository = argv[++index]
    else if (arg === "--compose-file") options.composeFile = argv[++index]
    else if (arg === "--node") options.node = argv[++index]
    else if (arg === "--poll-seconds") options.pollSeconds = Math.max(1, Number(argv[++index]) || 5)
    else if (arg === "--once") options.once = true
    else if (arg === "--clear-interrupted") options.clearInterrupted = true
  }
  return options
}

/**
 * 校验请求。只接受两种动作，更新动作必须带合法版本号且不能是太旧的请求。
 * 返回 `{ ok:false, reason }` 时管家不会执行任何东西。
 */
export function validateRequest(raw, now = new Date()) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "请求不是有效的 JSON 对象" }
  const action = raw.action === "update" ? "update" : raw.action === "check" ? "check" : ""
  if (!action) return { ok: false, reason: `不支持的操作：${String(raw.action).slice(0, 40)}` }

  const requestedAt = Date.parse(String(raw.requestedAt ?? ""))
  const ageMs = Number.isFinite(requestedAt) ? now.getTime() - requestedAt : Number.POSITIVE_INFINITY
  if (ageMs > REQUEST_EXPIRY_MS) return { ok: false, reason: "请求已过期（超过 30 分钟），不再执行" }

  if (action === "update") {
    const to = String(raw.to ?? "").trim()
    if (!VERSION_PATTERN.test(to)) return { ok: false, reason: `版本号不合法：${to.slice(0, 40)}` }
    return { action, id: String(raw.id ?? ""), ok: true, to }
  }
  return { action, id: String(raw.id ?? ""), ok: true, to: null }
}

/** 读 .env 里的版本号：检查更新时要用它当「当前版本」。 */
export function envVersion(content) {
  const match = /^FMKJ_VERSION=(.*)$/m.exec(String(content ?? ""))
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : ""
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return null
  }
}

async function writeAgentState(stateDir, state) {
  await mkdir(stateDir, { recursive: true })
  await writeFile(resolve(stateDir, AGENT_STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

export async function appendLog(stateDir, line) {
  const path = resolve(stateDir, AGENT_LOG_FILE)
  const stamp = new Date().toISOString()
  await appendFile(path, `[${stamp}] ${line}\n`, "utf8").catch(() => undefined)
  try {
    const info = await stat(path)
    if (info.size > LOG_MAX_BYTES) {
      const content = await readFile(path, "utf8")
      await writeFile(path, content.slice(-Math.floor(LOG_MAX_BYTES / 2)), "utf8")
    }
  } catch {
    // 日志轮转失败不影响更新本身。
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * 上次更新被断电/被杀留下的锁。
 *
 * 不能一律清理重试：如果迁移已经跑过，数据库结构已经是新版本，只能人工用备份恢复（ADR 0010）。
 * 迁移之前中断的（比如卡在拉镜像）清掉锁放行，重试是安全的。
 */
export async function resolveInterrupted(options, dependencies = {}) {
  const lockPath = resolve(options.stateDir, LOCK_FILE)
  if (!existsSync(lockPath)) return { blocked: false, note: "" }

  const holder = Number((await readFile(lockPath, "utf8").catch(() => "")).trim())
  if (pidAlive(holder)) return { blocked: false, note: `已有更新在执行（pid ${holder}），这一轮跳过` }

  const previous = await readStateSafe(options, dependencies)
  const completed = Array.isArray(previous?.steps)
    ? previous.steps.filter((step) => step?.status === "ok").map((step) => String(step.id))
    : []
  const decision = decideFailureAction(completed)

  if (decision.action === "stop-for-restore" && !options.clearInterrupted) {
    return {
      blocked: true,
      message: "上次更新没有正常结束，而且数据库迁移已经执行过——不能自动重试。请用本次备份恢复数据库后再装（不要切回旧版本）。",
      note: decision.reason,
    }
  }

  await rm(lockPath, { force: true })
  return { blocked: false, note: `清理了上次中断留下的锁（${decision.action}）：${decision.reason}` }
}

async function readStateSafe(options, dependencies) {
  if (dependencies.readUpdateState) return dependencies.readUpdateState(options.stateDir)
  return readUpdateState(options.stateDir).catch(() => null)
}

/** 把请求文件改成「执行中」——改名是原子的，避免两个管家抢同一条请求。 */
export async function claimRequest(stateDir) {
  const to = resolve(stateDir, REQUEST_DIR, RUNNING_FILE)
  await mkdir(resolve(stateDir, REQUEST_DIR), { recursive: true })
  for (const from of requestCandidates(stateDir)) {
    try {
      await rename(from, to)
      return to
    } catch {
      // 换下一个候选位置；都没有就说明这轮没有请求。
    }
  }
  return null
}

function runScript(options, script, args, onLine) {
  return new Promise((resolvePromise) => {
    const child = spawn(options.node, [resolve(options.appDir, "scripts", "deploy", script), ...args], {
      cwd: options.appDir,
      env: process.env,
    })
    const forward = (stream) => stream.on("data", (chunk) => onLine(String(chunk).trimEnd()))
    forward(child.stdout)
    forward(child.stderr)
    child.on("error", (error) => resolvePromise({ code: 1, error }))
    child.on("close", (code) => resolvePromise({ code: code ?? 1, error: null }))
  })
}

/**
 * 执行一轮：看有没有请求，有就干完它。
 * 返回 null 表示这轮没有请求（管家继续等）。
 */
export async function runAgentOnce(options, dependencies = {}) {
  const log = dependencies.log ?? (() => {})
  const now = dependencies.now ?? new Date()
  const stateDir = options.stateDir
  await mkdir(stateDir, { recursive: true })

  // 先处理上次留下的锁，避免「一断电就再也更新不了」。
  const interrupted = await resolveInterrupted(options, dependencies)
  if (interrupted.blocked) {
    await writeAgentState(stateDir, {
      action: "update",
      finishedAt: now.toISOString(),
      id: "",
      message: interrupted.message,
      startedAt: now.toISOString(),
      status: "interrupted",
      target: null,
    })
    await appendLog(stateDir, `拒绝自动重试：${interrupted.message}`)
    log(interrupted.message)
    return { status: "interrupted" }
  }
  if (interrupted.note) {
    await appendLog(stateDir, interrupted.note)
    log(interrupted.note)
  }

  const runningPath = await claimRequest(stateDir)
  if (!runningPath) return null

  const raw = await readJson(runningPath)
  let request = { action: "", id: "", to: null }
  try {
    const info = await stat(runningPath)
    if (info.size > REQUEST_MAX_BYTES) throw new Error("请求文件过大")
    request = validateRequest(raw, now)
  } catch (error) {
    request = { ok: false, reason: error instanceof Error ? error.message : "请求读取失败" }
  }

  if (!request.ok) {
    await writeAgentState(stateDir, {
      action: "check",
      finishedAt: now.toISOString(),
      id: String(raw?.id ?? ""),
      message: `请求被拒绝：${request.reason}`,
      startedAt: now.toISOString(),
      status: "failed",
      target: null,
    })
    await appendLog(stateDir, `拒绝请求：${request.reason}`)
    await rm(runningPath, { force: true })
    return { status: "failed", reason: request.reason }
  }

  const startedAt = new Date().toISOString()
  await writeAgentState(stateDir, {
    action: request.action,
    finishedAt: "",
    id: request.id,
    message: "",
    startedAt,
    status: "running",
    target: request.to,
  })
  await appendLog(stateDir, `开始执行：${request.action}${request.to ? ` → ${request.to}` : ""}`)

  const emit = (line) => {
    if (line) log(line)
    void appendLog(stateDir, line)
  }

  // 测试与排练时可以把「怎么跑脚本」换掉；线上就是真的 spawn。
  const run = dependencies.runScript ?? runScript
  let result
  if (request.action === "check") {
    const version = envVersion(await readFile(resolve(options.appDir, ".env"), "utf8").catch(() => ""))
    result = await run(options, "check-update.mjs", [
      "--state-dir", stateDir,
      ...(version ? ["--current", version] : []),
    ], emit)
  } else {
    result = await run(options, "update-local.mjs", [
      "--to", request.to,
      "--repository", options.repository,
      "--compose-file", options.composeFile,
      "--state-dir", stateDir,
    ], emit)
  }

  // 更新成功后顺手再查一次版本：否则页面还停在「有新版本 vX」，按钮催你再装一遍
  // （实际会被 ALREADY_CURRENT 拦住，但客户看到的是混乱的信息）。
  if (request.action === "update" && result.code === 0) {
    const version = envVersion(await readFile(resolve(options.appDir, ".env"), "utf8").catch(() => ""))
    await appendLog(stateDir, "更新完成，顺手刷新版本检查结果")
    await run(options, "check-update.mjs", ["--state-dir", stateDir, ...(version ? ["--current", version] : [])], emit)
  }

  const updateState = await readStateSafe(options, dependencies)
  const failed = updateState?.status && updateState.status !== "succeeded" ? updateState : null
  const status = result.code === 0 ? "succeeded" : failed?.status ?? "failed"
  const message = result.error
    ? result.error.message
    : result.code === 0
      ? ""
      : String(failed?.failure?.message ?? updateState?.failure?.message ?? `脚本退出码 ${result.code}`)

  await writeAgentState(stateDir, {
    action: request.action,
    finishedAt: new Date().toISOString(),
    id: request.id,
    message,
    startedAt,
    status,
    target: request.to,
  })
  await appendLog(stateDir, `执行结束：${status}${message ? ` — ${message}` : ""}`)
  await rm(runningPath, { force: true })
  return { message, status, target: request.to }
}

export async function runAgentLoop(options, dependencies = {}) {
  const log = dependencies.log ?? ((message) => console.log(message))
  log(`更新管家已启动：每 ${options.pollSeconds} 秒看一次请求（${options.stateDir}）`)
  for (;;) {
    try {
      await runAgentOnce(options, { ...dependencies, log })
    } catch (error) {
      log(`这一轮出错（继续等下一轮）：${error instanceof Error ? error.message : error}`)
    }
    if (options.once) return
    await new Promise((done) => setTimeout(done, options.pollSeconds * 1000))
  }
}

async function main() {
  const options = parseAgentArgs(process.argv.slice(2))
  if (options.once) {
    const result = await runAgentOnce(options, { log: (message) => console.log(message) })
    console.log(options.once && result ? `本轮结果：${result.status}` : "本轮没有请求")
    return
  }
  await runAgentLoop(options)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
