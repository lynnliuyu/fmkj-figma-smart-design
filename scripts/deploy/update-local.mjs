#!/usr/bin/env node
/**
 * 本地设备版更新流程（宿主机侧执行，不在业务容器内）。
 *
 * 为什么单独一个脚本：ADR 0010 要求业务应用不持有 docker socket 或任意宿主机命令执行能力。
 * 所以「谁有权更新」和「业务应用」是分开的：业务应用只读状态，执行发生在这里
 * （由宿主机 systemd timer 或管理员手动触发）。
 *
 * 顺序固定为：preflight → backup → fetch → migrate → switch → verify。
 * 失败处理按 ADR 0010：迁移已经跑过就不能只靠切回旧镜像，必须停下来让人恢复备份。
 *
 * 用法：
 *   node scripts/deploy/update-local.mjs --to v0.3.0 [--source registry|git] [--dry-run]
 */
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

// backup 放在 fetch 之后：既不改变「迁移前一定有备份」这条不变量，
// 又不会因为版本号打错/镜像不存在就留下一堆无谓备份。
export const STEP_ORDER = ["preflight", "fetch", "backup", "scripts", "migrate", "switch", "verify"]
export const DEFAULT_STATE_DIR = "deploy-state"
// 探活用 /login：它本来就在中间件的公开路径里，不需要为部署新开一个公开接口。
export const DEFAULT_HEALTH_URL = "http://127.0.0.1:8890/login"
// 设备版编排里的数据库服务名（docker-compose.appliance.yml）。
export const DEFAULT_DATABASE_SERVICE = "postgres"

export function parseUpdateArgs(argv) {
  const options = {
    to: "",
    source: "registry",
    repository: process.env.FMKJ_REPOSITORY || "fmkj-v3",
    composeFile: "docker-compose.yml",
    envFile: ".env.production",
    stateDir: DEFAULT_STATE_DIR,
    healthUrl: process.env.FMKJ_HEALTH_URL || DEFAULT_HEALTH_URL,
    databaseService: DEFAULT_DATABASE_SERVICE,
    gitDir: ".",
    dryRun: false,
    skipBackup: false,
    healthAttempts: 30,
    healthIntervalMs: 2000,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--to") options.to = argv[++index]
    else if (arg === "--source") options.source = argv[++index]
    else if (arg === "--repository") options.repository = argv[++index]
    else if (arg === "--compose-file") options.composeFile = argv[++index]
    else if (arg === "--env-file") options.envFile = argv[++index]
    else if (arg === "--state-dir") options.stateDir = argv[++index]
    else if (arg === "--health-url") options.healthUrl = argv[++index]
    else if (arg === "--database-service") options.databaseService = argv[++index]
    else if (arg === "--git-dir") options.gitDir = argv[++index]
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--skip-backup") options.skipBackup = true
  }
  if (!options.to) throw new Error("缺少 --to <版本>；更新必须针对明确版本，不用 latest")
  if (options.to === "latest") throw new Error("不允许更新到 latest：无法确认版本也无法回滚")
  if (!["registry", "git"].includes(options.source)) throw new Error("--source 只能是 registry 或 git")
  return options
}

/** registry 与 git 两种来源都产出同一个镜像引用，方便回滚时按 tag 切回。 */
export function imageReference(options) {
  return `${options.repository}:${options.to}`
}

/**
 * 失败后的处置。迁移已经把数据库结构推进到新版本了，此时切回旧镜像会跑在新结构上，
 * ADR 0010 明确说这不能算恢复——必须停下来，让人用备份恢复。
 */
export function decideFailureAction(completedSteps) {
  if (completedSteps.includes("migrate")) {
    return {
      action: "stop-for-restore",
      reason: "数据库迁移已经执行，切回旧镜像不算恢复；请用本次备份恢复数据库后再回滚镜像。",
    }
  }
  if (completedSteps.includes("fetch")) {
    return { action: "restart-previous", reason: "新版本还没有写入数据库，保留原镜像继续对外服务。" }
  }
  return { action: "abort", reason: "还没有改动镜像或数据库，直接终止。" }
}

/**
 * 探活。只要求目标返回成功响应，不解析响应体：部署脚本不该依赖业务页面内容。
 * 接受 2xx/3xx，因为 /login 可能重定向到已登录页面。
 */
export async function probeHttp(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const sleep = dependencies.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)))
  const attempts = options.healthAttempts ?? 30
  let last = "还没有响应"
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(options.healthUrl, { cache: "no-store", redirect: "manual" })
      if (response.status >= 200 && response.status < 400) return { ok: true }
      last = `HTTP ${response.status}`
    } catch (error) {
      // Node 的 fetch 只报 "fetch failed"，真正的原因在 cause 里（如 ECONNREFUSED）；
      // 排障时这一层差别很大。
      const cause = error && typeof error === "object" && error.cause && typeof error.cause === "object"
        ? error.cause.code
        : undefined
      last = error instanceof Error
        ? [error.message, cause].filter(Boolean).join(" / ")
        : String(error)
    }
    if (attempt < attempts - 1) await sleep(options.healthIntervalMs ?? 2000)
  }
  return { ok: false, detail: last }
}

/** 从 `printenv` 输出里取值；容器没设过该变量时返回空串。 */
export function parseEnvValue(stdout, key) {
  for (const line of String(stdout).split(/\r?\n/)) {
    const index = line.indexOf("=")
    if (index > 0 && line.slice(0, index).trim() === key) return line.slice(index + 1).trim()
  }
  return ""
}

/**
 * 数据库探针。默认走编排里的数据库服务（`docker compose exec`）：容器内的 psql 通过
 * 本地 socket 连接，既不用把连接串放到命令行，也不依赖「宿主机到容器」的网络可达性。
 *
 * 为什么不能沿用 `docker run postgres:17-alpine psql "$PGURL"`：在 Linux 上，默认 bridge
 * 网络的容器解析不到宿主机，也解析不到 compose 的服务名；macOS 的 Docker Desktop 会给每个
 * 容器注入 host.docker.internal，所以演练能过、真机会挂。这是只有真机才暴露的差异。
 */
export function composeDatabaseProbe(options, sql = "select 1") {
  return {
    command: "docker",
    args: [
      "compose", "-f", options.composeFile,
      "exec", "-T", options.databaseService ?? DEFAULT_DATABASE_SERVICE,
      // $POSTGRES_USER / $POSTGRES_DB 由容器内的 shell 展开，取的是容器自己的环境。
      "sh", "-c", `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "${sql}"`,
    ],
  }
}

/** 数据库不属于本编排（外部库 / 1Panel）时的回退探针；连接串只在子进程环境里，不进 argv。 */
export function hostDatabaseProbe(databaseUrl) {
  return {
    command: "docker",
    // 裸 `-e PGURL`：值由 docker CLI 自己继承的环境提供，因此不会出现在 argv 里。
    args: [
      "run", "--rm",
      "-e", "PGURL",
      "postgres:17-alpine",
      "sh", "-c", 'psql "$PGURL" -tAc "select 1"',
    ],
    env: { PGURL: databaseUrl },
  }
}

/** 编排里有哪些服务；compose 不可用时返回空数组，让调用方走回退路径。 */
export async function composeServices(options, env) {
  try {
    const { stdout } = await run("docker", ["compose", "-f", options.composeFile, "config", "--services"], { env })
    return String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/** 把 key=value 写进 env 文本：已存在就替换，不存在就追加，其它行原样保留。 */
export function upsertEnvLines(content, values) {
  const pending = new Map(Object.entries(values))
  const seen = new Set()
  const lines = String(content).split(/\r?\n/)
  const out = []
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/)
    const key = match?.[1]
    // 重复的键只保留第一条：.env 里后面的会覆盖前面的，留着重复会让更新失效
    // （真机踩过：镜像升级写对了第一行，后面一行老的又把它盖回旧版本）。
    if (key && pending.has(key)) {
      if (!seen.has(key)) {
        out.push(`${key}=${pending.get(key)}`)
        seen.add(key)
      }
      continue
    }
    out.push(line)
  }
  if (out.length && out[out.length - 1] === "") out.pop()
  for (const [key, value] of pending) if (!seen.has(key)) out.push(`${key}=${value}`)
  return `${out.join("\n")}\n`
}

/**
 * 更新成功后，把「现在跑的是哪一版」写回编排的插值文件。
 *
 * 不写回去的话，compose 里 `${FMKJ_IMAGE:-...}` 的兜底值还是旧版本：下次有人直接
 * `docker compose up -d`（没带 FMKJ_IMAGE）就会静默退回旧镜像，而且看不出原因。
 */
export async function recordRunningImage(options, image, log = () => {}) {
  const candidate = [".env", options.envFile].filter(Boolean).find((file) => existsSync(file))
  if (!candidate) {
    log("  没有找到 .env / 环境文件：跳过写回当前版本")
    return ""
  }
  const content = await readFile(candidate, "utf8")
  // 端口默认值改过（3000 → 8890）。老设备的 .env 里可能没写 FMKJ_PORT，
  // 默认值一变，升级后容器就换端口监听，而穿透与更新管家的健康检查仍指旧端口 → 公网入口直接断。
  // 所以升级时把「现在实际在用的端口」钉进 .env：老设备行为不变，新装设备才用新默认值。
  const pinnedPort = content.includes("FMKJ_PORT=") ? "" : await detectRunningPort()
  await writeFile(candidate, upsertEnvLines(content, {
    FMKJ_IMAGE: image,
    FMKJ_VERSION: options.to,
    ...(pinnedPort ? { FMKJ_PORT: pinnedPort } : {}),
  }), "utf8")
  log(`  已记录当前版本：${candidate} → ${image}${pinnedPort ? `（并锁定端口 ${pinnedPort}）` : ""}`)
  return candidate
}

/** 读正在运行的 app 容器对外映射的端口；拿不到就返回空字符串（不猜）。 */
async function detectRunningPort(containerName = "fmkj-v3") {
  try {
    const { stdout } = await run("docker", ["port", containerName, "3000/tcp"])
    const first = stdout.trim().split("\n")[0] ?? ""
    const port = first.split(":").pop()?.trim() ?? ""
    return /^\d+$/.test(port) ? port : ""
  } catch {
    return ""
  }
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, { maxBuffer: 32 * 1024 * 1024, ...options })
}

async function readState(stateDir) {
  const path = resolve(stateDir, "update-state.json")
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return null
  }
}

async function writeState(stateDir, state) {
  await mkdir(resolve(stateDir), { recursive: true })
  await writeFile(resolve(stateDir, "update-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

/** 维护锁：一次只允许一个更新，避免两个管理员同时点。 */
async function acquireLock(stateDir) {
  const path = resolve(stateDir, "update.lock")
  await mkdir(resolve(stateDir), { recursive: true })
  if (existsSync(path)) {
    const held = await readFile(path, "utf8").catch(() => "")
    throw new Error(`已有更新在执行中（锁：${path}，pid ${held.trim() || "未知"}）。确认没有进程在跑后再删除该文件。`)
  }
  await writeFile(path, String(process.pid), "utf8")
  return path
}

function composeArgs(options, command) {
  return ["compose", "-f", options.composeFile, ...command]
}

export async function runUpdate(options, now = new Date(), dependencies = {}) {
  const log = dependencies.log ?? ((message) => console.log(message))
  const steps = []
  const state = {
    status: "running",
    target: options.to,
    source: options.source,
    image: imageReference(options),
    startedAt: now.toISOString(),
    finishedAt: null,
    steps,
    backupDir: "",
    failure: null,
  }
  await writeState(options.stateDir, state)
  const lockPath = options.dryRun ? null : await acquireLock(options.stateDir)
  const dockerEnv = { ...process.env, FMKJ_IMAGE: state.image, FMKJ_VERSION: options.to }

  const step = async (id, action) => {
    log(`▶ ${id}`)
    const entry = { id, status: "running" }
    steps.push(entry)
    if (options.dryRun) {
      entry.status = "skipped"
      log(`  dry-run：跳过`)
      return
    }
    try {
      await action()
      entry.status = "ok"
      log(`  ✓ ${id}`)
    } catch (error) {
      entry.status = "failed"
      entry.detail = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  try {
    await step("preflight", async () => {
      await run("docker", ["--version"])
      await run("docker", ["compose", "version"])
      if (!existsSync(options.composeFile)) throw new Error(`找不到 compose 文件：${options.composeFile}`)
      if (!existsSync(options.envFile)) throw new Error(`找不到环境文件：${options.envFile}`)
      await run("docker", ["compose", "-f", options.composeFile, "config", "--quiet"], { env: dockerEnv })
    })

    await step("fetch", async () => {
      if (options.source === "registry") {
        await run("docker", ["pull", state.image], { env: dockerEnv })
        return
      }
      await run("git", ["-C", options.gitDir, "fetch", "--tags", "--prune"])
      await run("git", ["-C", options.gitDir, "checkout", options.to])
      await run("docker", [...composeArgs(options, ["build"])], { env: dockerEnv })
    })

    await step("backup", async () => {
      if (options.skipBackup) {
        log("  已显式跳过备份（--skip-backup）；数据库结构变化后无法恢复，请自行确认已有备份。")
        return
      }
      const script = resolve("scripts/deploy/backup-local.mjs")
      const args = [
        script,
        "--label", `before-${options.to}`,
        "--compose-file", options.composeFile,
        "--database-service", options.databaseService,
      ]
      // 把 FMKJ_IMAGE / FMKJ_VERSION 传给备份子进程，metadata.json 才能记下「这份备份
      // 对应哪一版镜像」，恢复时才有据可查。
      const { stdout } = await run(process.execPath, args, { env: dockerEnv })
      // 只认显式的 backup_dir=，不要从中文提示里抠路径（全角括号会污染结果）。
      state.backupDir = parseEnvValue(stdout, "backup_dir")
      if (!state.backupDir) throw new Error("备份脚本没有报告备份位置")
      log(`  备份位置：${state.backupDir}`)
    })

    // 宿主机侧的脚本（更新、管家、备份、首次开机）都在 /opt/fmkj/app/scripts 下，
    // 以前更新只换镜像，这些脚本永远停在装机那天的版本。这里从新镜像里把它们同步过来：
    // 放在 migrate 之前，万一这一步失败也还没动数据库，处置是 restart-previous（安全）。
    await step("scripts", async () => {
      if (options.source !== "registry") return
      const target = resolve("scripts")
      await mkdir(target, { recursive: true })
      // --user 0：镜像默认以普通账号（1001）跑，写不进 root 拥有的部署目录
      // （之前这里带 2>/dev/null || true，权限错误被吞掉，脚本其实一直没同步成功）。
      await run("docker", [
        "run", "--rm",
        "--user", "0:0",
        "-v", `${resolve(target)}:/out`,
        "--entrypoint", "sh",
        state.image,
        "-c", "cp -r /app/scripts/. /out/",
      ], { env: dockerEnv })
    })

    await step("migrate", async () => {
      // 用新镜像跑迁移，成功后才切换流量。
      await run("docker", [
        ...composeArgs(options, ["run", "--rm", "app", "node", "scripts/run-migration.mjs"]),
      ], { env: dockerEnv })
    })

    await step("switch", async () => {
      await run("docker", [...composeArgs(options, ["up", "-d", "--remove-orphans"])], { env: dockerEnv })
      // 写回当前版本，避免下次直接 `docker compose up -d` 时静默退回旧镜像。
      await recordRunningImage(options, state.image, log)
    })

    await step("verify", async () => {
      const alive = await probeHttp(options, dependencies)
      if (!alive.ok) throw new Error(`应用没有起来：${alive.detail}`)
      const { stdout } = await run("docker", [
        ...composeArgs(options, ["exec", "-T", "app", "printenv", "FMKJ_VERSION"]),
      ], { env: dockerEnv })
      const running = parseEnvValue(stdout, "FMKJ_VERSION")
      if (running && running !== "unknown" && running !== options.to) {
        throw new Error(`容器报告版本 ${running}，期望 ${options.to}`)
      }
      const databaseUrl = process.env.DATABASE_URL || dependencies.databaseUrl
      const services = await composeServices(options, dockerEnv)
      if (services.includes(options.databaseService)) {
        // 设备版：数据库就在同一个编排里，直接进容器探，不依赖宿主机网络。
        const probe = composeDatabaseProbe(options)
        await run(probe.command, probe.args, { env: dockerEnv })
      } else if (databaseUrl) {
        const probe = hostDatabaseProbe(databaseUrl)
        await run(probe.command, probe.args, { env: { ...dockerEnv, ...probe.env } })
      } else {
        log("  编排里没有数据库服务，宿主机也没有 DATABASE_URL：跳过数据库探针（只核对了应用与版本）。")
      }
    })

    state.status = "succeeded"
    state.finishedAt = new Date().toISOString()
    await writeState(options.stateDir, state)
    log(`更新完成：${options.to}`)
    return state
  } catch (error) {
    const completed = steps.filter((entry) => entry.status === "ok").map((entry) => entry.id)
    const decision = decideFailureAction(completed)
    state.status = decision.action === "stop-for-restore" ? "failed-needs-restore" : "failed"
    state.failure = {
      message: error instanceof Error ? error.message : String(error),
      ...decision,
      backupDir: state.backupDir,
    }
    state.finishedAt = new Date().toISOString()
    await writeState(options.stateDir, state)
    log(`更新失败：${state.failure.message}`)
    log(`处置：${decision.action} — ${decision.reason}`)
    if (state.backupDir) log(`备份位置：${state.backupDir}`)
    throw Object.assign(new Error(state.failure.message), { state })
  } finally {
    if (lockPath) await rm(lockPath, { force: true })
  }
}

/** 只读状态查询，给管理员和（后续的）管理页面用。 */
export async function readUpdateState(stateDir = DEFAULT_STATE_DIR) {
  return readState(stateDir)
}

async function main() {
  const argv = process.argv.slice(2)
  // --status 只读地报告上一次更新的结果，给管理员和（后续的）管理页面用。
  if (argv.includes("--status")) {
    const stateDir = argv.includes("--state-dir") ? argv[argv.indexOf("--state-dir") + 1] : DEFAULT_STATE_DIR
    const state = await readUpdateState(stateDir)
    console.log(state ? JSON.stringify(state, null, 2) : "还没有更新记录。")
    return
  }
  const options = parseUpdateArgs(argv)
  if (options.dryRun) console.log(`演练：${options.source} → ${imageReference(options)}`)
  await runUpdate(options)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
