#!/usr/bin/env node
/**
 * 版本检查：只回答「有没有比现在更新的版本」，不安装任何东西。
 *
 * 为什么单独一个脚本：ADR 0010 要求业务应用不持有 docker socket 或宿主机命令执行能力，
 * 所以「去外面问一句有没有新版本」只能发生在宿主机侧（systemd timer 或管理员手动）。
 * 业务应用只读结果文件，不联网、不触发更新。
 *
 * 版本从哪里问（按顺序）：
 *   1. --index-url / FMKJ_UPDATE_INDEX_URL 指向的版本清单 JSON（推荐，自己可控）
 *   2. 镜像仓库的 tag 列表（--registry，或用 FMKJ_IMAGE 反推）
 * 两条路都不通时也写状态文件（error 字段），退出码仍是 0：定时任务不该因为断网报警。
 *
 * 用法：
 *   node scripts/deploy/check-update.mjs [--index-url https://…/versions.json] [--json]
 */
import { existsSync, readFileSync } from "node:fs"
import { createPublicKey, verify } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_STATE_DIR = "deploy-state"
export const DEFAULT_STATE_FILE = "update-check.json"

/**
 * 版本清单的签名口径：对「每行一个版本号」的文本签名，与 JSON 排版无关，
 * 运营方用 scripts/deploy/sign-version-index.mjs 生成，设备用公钥校验。
 */
export function versionsMessage(versions) {
  return (versions ?? []).map((value) => String(value).trim()).filter(Boolean).join("\n")
}

/** 公钥或签名有问题都返回 false：设备不该因为一份验不过的清单去升级。 */
export function verifyVersionIndex(versions, signature, publicKeyPem) {
  if (!signature || !publicKeyPem) return false
  try {
    return verify(null, Buffer.from(versionsMessage(versions), "utf8"), createPublicKey(publicKeyPem), Buffer.from(signature, "base64"))
  } catch {
    return false
  }
}

export function parseCheckArgs(argv) {
  const options = {
    current: "",
    indexUrl: "",
    registry: "",
    repository: "",
    registryInsecure: false,
    username: "",
    password: "",
    envFiles: [".env", ".env.production"],
    stateDir: DEFAULT_STATE_DIR,
    json: false,
    timeoutMs: 10000,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--current") options.current = argv[++index]
    else if (arg === "--index-url") options.indexUrl = argv[++index]
    else if (arg === "--registry") options.registry = argv[++index]
    else if (arg === "--repository") options.repository = argv[++index]
    else if (arg === "--registry-insecure") options.registryInsecure = true
    else if (arg === "--username") options.username = argv[++index]
    else if (arg === "--password") options.password = argv[++index]
    else if (arg === "--state-dir") options.stateDir = argv[++index]
    else if (arg === "--timeout") options.timeoutMs = Number(argv[++index])
    else if (arg === "--public-key") options.publicKey = argv[++index]
    else if (arg === "--allow-unsigned") options.allowUnsigned = true
    else if (arg === "--json") options.json = true
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error("--timeout 必须是正数毫秒")
  return options
}

/** `v1.2.3` / `1.2.3` 都能读；`latest`、`sha-abc` 这类不是版本号，返回 null。 */
export function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? "").trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** 返回 -1 / 0 / 1；无法解析的一方视为「更小」，让调用方决定怎么用。 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  }
  return 0
}

/**
 * 从候选里挑出「比当前新」的最高版本。当前版本读不出来时只报告最高版本，
 * updateAvailable 保持 false——不能因为版本号缺失就催着人升级。
 */
export function pickUpdate(current, versions) {
  const known = [...new Set((versions ?? []).map((value) => String(value ?? "").trim()).filter((value) => parseVersion(value)))]
  known.sort((left, right) => compareVersions(right, left))
  const latest = known[0] ?? null
  const parsedCurrent = parseVersion(current)
  return {
    latest,
    updateAvailable: Boolean(parsedCurrent && latest && compareVersions(latest, current) > 0),
  }
}

/** 版本清单 JSON：`["v1.2.3"]`、`{versions:[…]}`、`{latest:"v1.2.3"}` 三种写法都接受。 */
export function versionsFromIndex(payload) {
  if (Array.isArray(payload)) return payload.map(String)
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.versions)) return payload.versions.map(String)
    if (payload.latest !== undefined) return [String(payload.latest)]
  }
  return []
}

/** 仓库 tag 列表响应：`{ tags: ["v0.1.0", "latest"] }`。 */
export function versionsFromRegistry(payload) {
  return Array.isArray(payload?.tags) ? payload.tags.map(String) : []
}

/** `registry.example.com/ns/fmkj-v3:v0.1.0` → `{ registry, repository, tag }`。 */
export function parseImageReference(image) {
  const text = String(image ?? "").trim()
  if (!text) return { registry: "", repository: "", tag: "" }
  const colon = text.lastIndexOf(":")
  const slash = text.lastIndexOf("/")
  const hasTag = colon > slash
  const tag = hasTag ? text.slice(colon + 1) : ""
  const name = hasTag ? text.slice(0, colon) : text
  const firstSlash = name.indexOf("/")
  // 第一段含 `.` 或 `:` 或等于 localhost 才算仓库主机名，否则是 Docker Hub 的命名空间。
  const head = firstSlash === -1 ? "" : name.slice(0, firstSlash)
  const isHost = Boolean(head) && (head.includes(".") || head.includes(":") || head === "localhost")
  return isHost
    ? { registry: head, repository: name.slice(firstSlash + 1), tag }
    : { registry: "", repository: name, tag }
}

/** 读 `.env` / `.env.production` 这类 KEY=VALUE 文件；值里带引号也去掉。 */
export function readEnvFiles(paths) {
  const values = {}
  for (const path of paths ?? []) {
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
      const index = trimmed.indexOf("=")
      values[trimmed.slice(0, index).trim()] ??= trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "")
    }
  }
  return values
}

/** 当前版本：显式参数 > 环境变量 > `.env` 的 FMKJ_VERSION > FMKJ_IMAGE 的 tag。 */
export function resolveCurrentVersion(options, env = process.env, fileValues = {}) {
  const image = options.image || env.FMKJ_IMAGE || fileValues.FMKJ_IMAGE || ""
  return (options.current || env.FMKJ_VERSION || fileValues.FMKJ_VERSION || parseImageReference(image).tag || "").trim()
}

export function checkStatePath(stateDir = DEFAULT_STATE_DIR) {
  return resolve(stateDir, DEFAULT_STATE_FILE)
}

export async function writeCheckState(stateDir, state) {
  await mkdir(resolve(stateDir), { recursive: true })
  await writeFile(checkStatePath(stateDir), `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

async function fetchJson(url, options, fetchImpl) {
  const headers = {}
  if (options.username) {
    headers.authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`
  }
  let response
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(options.timeoutMs) })
  } catch (error) {
    // 裸 "fetch failed" 看不出是断网、DNS 还是证书问题，把底层原因带上（真机排障靠它）。
    const cause = error?.cause?.code ?? error?.cause?.message ?? error?.code
    throw new Error(cause ? `${url} 请求失败：${cause}` : `${url} 请求失败：${error instanceof Error ? error.message : error}`)
  }
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new Error(`${url} 返回的不是 JSON（版本清单要看 JSON 格式）`)
  }
}

/** 问一次「外面有哪些版本」。返回 { source, versions }。 */
export async function fetchAvailableVersions(options, env = process.env, fetchImpl = fetch) {
  const fileValues = readEnvFiles(options.envFiles)
  const indexUrl = options.indexUrl || env.FMKJ_UPDATE_INDEX_URL || fileValues.FMKJ_UPDATE_INDEX_URL || ""
  if (indexUrl) {
    const payload = await fetchJson(indexUrl, options, fetchImpl)
    return { source: "index", versions: versionsFromIndex(payload), signature: typeof payload?.signature === "string" ? payload.signature : "" }
  }

  const image = env.FMKJ_IMAGE || fileValues.FMKJ_IMAGE || ""
  const fromImage = parseImageReference(image)
  const registry = options.registry || env.FMKJ_REGISTRY || fromImage.registry
  const repository = options.repository || env.FMKJ_REGISTRY_REPOSITORY || fromImage.repository
  if (!registry || !repository) {
    throw new Error("没有版本来源：请设置 FMKJ_UPDATE_INDEX_URL，或用 --registry 指定镜像仓库")
  }
  const scheme = options.registryInsecure || env.FMKJ_REGISTRY_INSECURE === "true" ? "http" : "https"
  const url = `${scheme}://${registry}/v2/${repository}/tags/list`
  const payload = await fetchJson(url, options, fetchImpl)
  return { source: "registry", versions: versionsFromRegistry(payload), signature: typeof payload?.signature === "string" ? payload.signature : "" }
}

/**
 * 检查一遍并写状态。任何失败都记进 state.error，不抛给定时任务。
 * 结果只写文件，不安装、不拉取镜像。
 */
export async function runCheck(options, now = new Date(), dependencies = {}) {
  const env = dependencies.env ?? process.env
  const fetchImpl = dependencies.fetch ?? fetch
  const fileValues = readEnvFiles(options.envFiles)
  const currentVersion = resolveCurrentVersion(options, env, fileValues)
  const state = {
    checkedAt: now.toISOString(),
    currentVersion: currentVersion || null,
    latestVersion: null,
    updateAvailable: false,
    source: null,
    versionsChecked: 0,
    signature: "",
    error: null,
  }

  const publicKey = (options.publicKey || env.FMKJ_RELEASE_PUBLIC_KEY || fileValues.FMKJ_RELEASE_PUBLIC_KEY || "").replace(/\\n/g, "\n").trim()

  try {
    const { source, versions, signature } = await fetchAvailableVersions(options, env, fetchImpl)

    // 配了发布公钥就只认签过名的清单：否则「有新版本」可能被人伪造，引导设备升级到恶意镜像。
    if (publicKey) {
      if (!signature) {
        if (!options.allowUnsigned) throw new Error("版本清单没有签名：已配置公钥的设备只接受签过名的清单")
      } else if (!verifyVersionIndex(versions, signature, publicKey)) {
        throw new Error("版本清单签名校验不通过：可能不是可信发布方，本次不提示升级")
      } else {
        state.signature = "verified"
      }
    }

    const { latest, updateAvailable } = pickUpdate(currentVersion, versions)
    state.source = source
    state.versionsChecked = versions.length
    state.latestVersion = latest
    state.updateAvailable = updateAvailable
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  }

  await writeCheckState(options.stateDir, state)
  return state
}

export function formatCheckResult(state) {
  const lines = [`检查时间：${state.checkedAt}`]
  lines.push(`当前版本：${state.currentVersion ?? "未知"}`)
  if (state.signature === "verified") lines.push("版本清单签名：已验证")
  if (state.error) lines.push(`检查失败：${state.error}`)
  else if (state.updateAvailable) lines.push(`有新版本：${state.latestVersion}（当前 ${state.currentVersion}）`)
  else lines.push(`已是最新（候选 ${state.versionsChecked} 个，最高 ${state.latestVersion ?? "无"}）`)
  lines.push("本脚本只检查，不安装。装新版本请运行 scripts/deploy/update-local.mjs --to <版本>。")
  return lines.join("\n")
}

async function main() {
  const options = parseCheckArgs(process.argv.slice(2))
  const state = await runCheck(options)
  console.log(options.json ? JSON.stringify(state, null, 2) : formatCheckResult(state))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
