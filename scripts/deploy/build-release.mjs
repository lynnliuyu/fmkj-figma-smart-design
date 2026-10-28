#!/usr/bin/env node
/**
 * 出一版设备镜像：构建 → 打标签 → 推送，末尾直接给出设备上要执行的更新命令。
 *
 * 为什么要有守卫：Next 的构建在 Docker 里要 2–4GB 内存。Docker Desktop 默认只分到
 * 1–2GB 时，构建会 OOM——表现是构建卡住几十分钟、Docker 守护进程重启、连同你正在跑的
 * 开发和数据库容器一起被杀。本脚本先量一下 Docker 的内存，不够就直接拒绝，并告诉你去哪调。
 *
 * 用法：
 *   node scripts/deploy/build-release.mjs --version v0.2.0 --repository 10.0.0.235:5443/fmkj-v3
 *   node scripts/deploy/build-release.mjs --version v0.2.0 --repository ... --dry-run
 *   node scripts/deploy/build-release.mjs --version v0.2.0 --repository ... --no-push
 *
 * 环境变量：FMKJ_REPOSITORY（默认镜像仓库）、FMKJ_PLATFORM（默认 linux/arm64）。
 */
import { execFile } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)

export const MIN_DOCKER_MEMORY_BYTES = 4 * 1024 * 1024 * 1024

export function parseReleaseArgs(argv) {
  const options = {
    version: "",
    repository: process.env.FMKJ_REPOSITORY || "fmkj-v3",
    platform: process.env.FMKJ_PLATFORM || "linux/arm64",
    push: true,
    dryRun: false,
    checkout: "",
    npmRegistry: "",
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--version") options.version = argv[++index]
    else if (arg === "--repository") options.repository = argv[++index]
    else if (arg === "--platform") options.platform = argv[++index]
    else if (arg === "--no-push") options.push = false
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--checkout") options.checkout = argv[++index]
    else if (arg === "--npm-registry") options.npmRegistry = argv[++index]
  }
  if (!options.version) throw new Error("缺少 --version <版本>：每次发布都要有明确版本号，不能用 latest")
  if (!/^v?\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(options.version)) {
    throw new Error(`版本号格式不对：${options.version}；用 v0.2.0 这种`)
  }
  return options
}

export function imageRef(options) {
  return `${options.repository}:${options.version}`
}

/** 低于门槛就拒绝：宁可让人去调内存，也别把机器拖崩。 */
export function memoryGuardMessage(totalBytes) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return "读不到 Docker 的内存上限，跳过检查（构建仍可能 OOM）"
  if (totalBytes >= MIN_DOCKER_MEMORY_BYTES) return ""
  const gb = (totalBytes / 1024 / 1024 / 1024).toFixed(1)
  return [
    `Docker 只分到 ${gb} GB 内存，构建下一个版本需要至少 4 GB。`,
    "Docker Desktop → 设置 → Resources → Memory 调到 6 GB（点 Apply & Restart），",
    "或把这一步放到服务器上跑。强行构建会把 Docker 拖崩，连正在跑的容器和开发服务一起被杀。",
  ].join("\n")
}

export function deviceUpdateCommand(options) {
  return [
    "cd /opt/fmkj/app",
    `/opt/fmkj/tools/node/bin/node scripts/deploy/update-local.mjs --to ${options.version} \\`,
    `  --repository ${options.repository} --compose-file docker-compose.appliance.yml`,
  ].join("\n")
}

export async function release(options, dependencies = {}) {
  const log = dependencies.log ?? ((message) => console.log(message))
  const exec = dependencies.exec ?? (async (command, args) => (await run(command, args, { maxBuffer: 64 * 1024 * 1024 })).stdout.trim())

  const memory = Number(await exec("docker", ["info", "--format", "{{.MemTotal}}"]).catch(() => "0"))
  const guard = memoryGuardMessage(memory)
  if (guard && !options.dryRun) throw new Error(guard)

  let revision = ""
  try {
    revision = await exec("git", ["rev-parse", "--short", "HEAD"])
    const dirty = await exec("git", ["status", "--porcelain"])
    if (dirty && !options.dryRun) {
      throw new Error("工作区有未提交的改动：镜像会和你以为的那份代码对不上。先提交，或加 --dry-run 只看命令。")
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("工作区")) throw error
    revision = revision || "unknown"
  }

  const image = imageRef(options)
  const buildArgs = [
    "buildx", "build",
    "--platform", options.platform,
    "-t", image,
    "--label", `org.opencontainers.image.version=${options.version}`,
    "--label", `org.opencontainers.image.revision=${revision}`,
    ...(options.checkout ? ["--build-arg", `FMKJ_CHECKOUT=${options.checkout}`] : []),
    // 国内构建时容器里连 npm 官方源容易超时（下载 pnpm 二进制 30 秒就断）。
    ...(options.npmRegistry ? ["--build-arg", `NPM_REGISTRY=${options.npmRegistry}`] : []),
    ...(options.push ? ["--push"] : ["--load"]),
    ".",
  ]

  log(`版本：${options.version}（提交 ${revision}）`)
  log(`镜像：${image}`)
  log(`平台：${options.platform}`)
  if (guard) log(`提醒：${guard}`)
  log(`构建命令：docker ${buildArgs.join(" ")}`)

  if (options.dryRun) {
    log("--dry-run：不构建、不推送")
  } else {
    log("开始构建（首次约 10–20 分钟，之后有缓存会快很多）…")
    await exec("docker", buildArgs)
    log(`已推送：${image}`)
  }

  log("\n设备上执行这一条就能更新：")
  log(deviceUpdateCommand(options))
  return { image, revision }
}

async function main() {
  const options = parseReleaseArgs(process.argv.slice(2))
  await release(options)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
