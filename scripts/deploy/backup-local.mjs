#!/usr/bin/env node
/**
 * 本地设备版备份：数据库 + 上传文件数据卷 + 版本信息。
 *
 * ADR 0010：备份必须同时包含数据库、文件和配置，且「数据库结构变化后的恢复不能仅靠
 * 切回旧镜像」。所以更新流程在跑迁移之前一定要先成功执行本脚本。
 *
 * 用法：
 *   node scripts/deploy/backup-local.mjs [--dir backups/appliance] [--keep 7] [--label before-v0.3.0]
 */
import { execFile, spawn } from "node:child_process"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createWriteStream, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const DEFAULT_UPLOADS_VOLUME = "fmkj-v3-uploads"
/**
 * 设备上编排叫 docker-compose.appliance.yml，开发机上才是 docker-compose.yml。
 * 写死一个名字会让设备上的手工备份走错路（找不到编排 → 回退成连外部库 → 失败）。
 */
export const COMPOSE_FILE_CANDIDATES = [
  "docker-compose.yml",
  "docker-compose.appliance.yml",
  "docker-compose.appliance-external-db.yml",
]

export function defaultComposeFile(candidates = COMPOSE_FILE_CANDIDATES) {
  return candidates.find((name) => existsSync(name)) ?? candidates[0]
}

export const DEFAULT_COMPOSE_FILE = defaultComposeFile()
export const DEFAULT_DATABASE_SERVICE = "postgres"
/** 卷名由 compose 决定，备份不能写死，否则备到别的卷上还以为成功了。 */
export function uploadsVolume() {
  return process.env.FMKJ_UPLOADS_VOLUME?.trim() || DEFAULT_UPLOADS_VOLUME
}
export const DEFAULT_BACKUP_DIR = "backups/appliance"
export const DEFAULT_STATE_DIR = "deploy-state"

export function parseBackupArgs(argv) {
  const options = {
    dir: DEFAULT_BACKUP_DIR,
    keep: 7,
    label: "manual",
    databaseUrl: "",
    composeFile: DEFAULT_COMPOSE_FILE,
    databaseService: DEFAULT_DATABASE_SERVICE,
    stateDir: DEFAULT_STATE_DIR,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dir") options.dir = argv[++index]
    else if (arg === "--keep") options.keep = Number(argv[++index])
    else if (arg === "--label") options.label = argv[++index]
    else if (arg === "--database-url") options.databaseUrl = argv[++index]
    else if (arg === "--compose-file") options.composeFile = argv[++index]
    else if (arg === "--database-service") options.databaseService = argv[++index]
    else if (arg === "--state-dir") options.stateDir = argv[++index]
  }
  if (!Number.isSafeInteger(options.keep) || options.keep < 1) throw new Error("--keep 必须是正整数")
  return options
}

/** 目录名排序即时间排序；只保留最近 keep 份，其余按名返回待删除项。 */
export function retentionToDelete(entries, keep) {
  const backups = entries.filter((name) => /^\d{8}T\d{6}/.test(name)).sort()
  return backups.slice(0, Math.max(0, backups.length - keep))
}

export function backupDirName(date, label) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
  return `${stamp}-${String(label).replace(/[^a-zA-Z0-9._-]/g, "_")}`
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024, ...options })
}

/** compose 服务列表；compose 不可用时返回空数组。 */
export async function composeServices(composeFile) {
  try {
    const { stdout } = await run("docker", ["compose", "-f", composeFile, "config", "--services"])
    return String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 决定这次备份怎么连数据库。
 *
 * 编排里有数据库服务就走 `docker compose exec` 进容器 dump：本地 socket 不需要连接串，
 * 也不受「Linux 默认 bridge 解析不到宿主机」影响。外部库才回退到 `docker run` 那条路
 * （macOS Docker Desktop 有 host.docker.internal 才碰巧能过，真机上必须显式可达）。
 */
export async function resolveDatabaseAccess(options) {
  if (existsSync(options.composeFile)
    && (await composeServices(options.composeFile)).includes(options.databaseService)) {
    return { kind: "compose", composeFile: options.composeFile, service: options.databaseService }
  }
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || readLocalEnvFile(".env.production").DATABASE_URL
  if (!databaseUrl) throw new Error("缺少 DATABASE_URL，且编排里没有数据库服务：无法备份数据库")
  return { kind: "host", databaseUrl }
}

/** stdout 流式写文件：dump 可能几十上百 MB，不能整个读进内存。 */
async function runToFile(command, args, target) {
  await new Promise((resolveDone, rejectDone) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    const output = createWriteStream(target)
    let stderr = ""
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", rejectDone)
    output.on("error", rejectDone)
    output.on("finish", () => resolveDone())
    child.stdout.pipe(output)
    child.on("close", (code) => {
      if (code !== 0) {
        output.destroy()
        rejectDone(new Error(`${command} 退出码 ${code}：${stderr.trim().slice(0, 500)}`))
      }
    })
  })
}

async function dumpDatabaseViaCompose(access, target) {
  await runToFile(
    "docker",
    [
      "compose", "-f", access.composeFile, "exec", "-T", access.service,
      // $POSTGRES_USER / $POSTGRES_DB 由容器内的 shell 展开。
      "sh", "-c",
      'pg_dump --no-owner --no-privileges --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    resolve(target, "database.dump"),
  )
}

async function dumpDatabaseViaHost(databaseUrl, target) {
  // 用 postgres 镜像里的 pg_dump，设备上不需要装客户端。
  // 连接串通过容器环境传入而不是命令行参数，避免出现在宿主机 ps 输出里。
  await run(
    "docker",
    [
      "run", "--rm",
      // 裸 `-e PGURL`：连接串由 docker CLI 继承的环境传入，不出现在 argv。
      "-e", "PGURL",
      "-v", `${resolve(target)}:/backup`,
      "postgres:17-alpine",
      "sh", "-c", 'pg_dump --no-owner --no-privileges --format=custom --file=/backup/database.dump "$PGURL"',
    ],
    { env: { ...process.env, PGURL: databaseUrl } },
  )
}

async function archiveUploads(target) {
  await run("docker", [
    "run", "--rm",
    "-v", `${uploadsVolume()}:/data:ro`,
    "-v", `${resolve(target)}:/backup`,
    "alpine",
    "tar", "czf", "/backup/uploads.tar.gz", "-C", "/data", ".",
  ])
}

function readLocalEnvFile(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const index = trimmed.indexOf("=")
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "")
  }
  return values
}

export async function runBackup(options, now = new Date(), dependencies = {}) {
  const access = dependencies.databaseAccess ?? await resolveDatabaseAccess(options)

  const root = resolve(options.dir)
  await mkdir(root, { recursive: true })
  const target = resolve(root, backupDirName(now, options.label))
  await mkdir(target, { recursive: true })

  const steps = []
  const record = async (name, action) => {
    try {
      await action()
      steps.push({ name, status: "ok" })
    } catch (error) {
      steps.push({ name, status: "failed", detail: error instanceof Error ? error.message : String(error) })
      throw Object.assign(new Error(`备份步骤失败：${name}`), { steps, target })
    }
  }

  await record("database", () => (access.kind === "compose"
    ? dumpDatabaseViaCompose(access, target)
    : dumpDatabaseViaHost(access.databaseUrl, target)))
  await record("uploads", () => archiveUploads(target))

  // 版本信息让「恢复时到底回到哪一版」可核对。设备版把镜像写在编排的插值文件 `.env`
  // 里而不是 compose 的默认值里，所以先看环境、再看 `.env`、最后才是 compose 的兜底值。
  const declaredImage = process.env.FMKJ_IMAGE || readLocalEnvFile(".env").FMKJ_IMAGE || ""
  let composeImage = ""
  try {
    const compose = await readFile(options.composeFile, "utf8")
    composeImage = compose.match(/FMKJ_IMAGE:-([^}]+)}/)?.[1]
      ?? compose.match(/FMKJ_IMAGE[:=]\s*([^\s}]+)/)?.[1]
      ?? ""
  } catch { /* 元数据尽力而为 */ }
  const metadata = {
    createdAt: now.toISOString(),
    label: options.label,
    version: process.env.FMKJ_VERSION || "",
    image: declaredImage || composeImage,
    uploadsVolume: uploadsVolume(),
    steps,
  }
  await writeFile(resolve(target, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8")

  const keep = dependencies.keep ?? options.keep
  const entries = await readdir(root)
  const stale = retentionToDelete(entries, keep)
  for (const name of stale) await rm(resolve(root, name), { recursive: true, force: true })

  return { target, steps, pruned: stale, kept: entries.filter((name) => /^\d{8}T\d{6}/.test(name)).length - stale.length }
}

/**
 * 备份结果给管理页面看（只读展示）：写 deploy-state，不写备份目录里的任何东西。
 * 页面只关心「什么时候备的、成功没有、留了几份」，不展示宿主机目录结构。
 */
export async function writeBackupState(stateDir, state) {
  await mkdir(resolve(stateDir), { recursive: true })
  await writeFile(resolve(stateDir, "backup-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

async function main() {
  const options = parseBackupArgs(process.argv.slice(2))
  let result
  try {
    result = await runBackup(options)
  } catch (error) {
    await writeBackupState(options.stateDir, {
      createdAt: new Date().toISOString(),
      label: options.label,
      version: process.env.FMKJ_VERSION || "",
      kept: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {})
    throw error
  }
  const size = (await Promise.all(
    (await readdir(result.target)).map(async (name) => (await stat(resolve(result.target, name))).size),
  )).reduce((sum, value) => sum + value, 0)
  await writeBackupState(options.stateDir, {
    createdAt: new Date().toISOString(),
    label: options.label,
    version: process.env.FMKJ_VERSION || "",
    kept: result.kept,
    ok: true,
    error: null,
  }).catch(() => {})
  // 机器可读行：调用方（更新脚本）用它记录备份位置，不要去解析中文提示。
  console.log(`backup_dir=${result.target}`)
  console.log(`备份完成：${result.target}（${(size / 1024 / 1024).toFixed(1)} MB）`)
  for (const step of result.steps) console.log(`  ${step.status === "ok" ? "✓" : "✗"} ${step.name}`)
  if (result.pruned.length) console.log(`已清理旧备份：${result.pruned.join(", ")}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    // 把失败步骤的真实原因打出来。之前只印一句「备份步骤失败：database」，
    // 底层 stderr 全被吞掉，排查只能靠猜（设备上真的踩过）。
    for (const step of error?.steps ?? []) {
      if (step.status === "failed" && step.detail) console.error(`  原因（${step.name}）：${step.detail}`)
    }
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
