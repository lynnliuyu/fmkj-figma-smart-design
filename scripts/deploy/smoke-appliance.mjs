#!/usr/bin/env node
/**
 * 发货前自检：把「这台设备到底能不能用」压成一条命令。
 *
 * 为什么需要：每次更新镜像、换一台设备、或者客户说「打不开」时，逐个点页面很容易漏。
 * 这里只做**只读**检查——登录、看系统健康、读产品数、看同步配置、导出一份备份但丢掉不落地。
 * 不会改数据、不会恢复备份、不会触发同步。
 *
 * 用法：
 *   node scripts/deploy/smoke-appliance.mjs --base http://127.0.0.1:8890 \
 *     --email you@example.com --password '你的密码'
 *   node scripts/deploy/smoke-appliance.mjs --base http://127.0.0.1:8890 --cookie "session=eyJ..."
 *
 * 退出码 0 = 全过；非 0 = 有检查项失败（逐条打印原因）。
 */
import { request } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { request as httpsRequest } from "node:https"

export function parseSmokeArgs(argv) {
  const options = { base: "http://127.0.0.1:8890", email: "", password: "", cookie: "", timeoutMs: 15000, expectSetup: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--base") options.base = argv[++index]
    else if (arg === "--email") options.email = argv[++index]
    else if (arg === "--password") options.password = argv[++index]
    else if (arg === "--cookie") options.cookie = argv[++index]
    else if (arg === "--timeout") options.timeoutMs = Number(argv[++index])
    else if (arg === "--expect-setup") options.expectSetup = true
  }
  if (!options.expectSetup && !options.cookie && (!options.email || !options.password)) {
    throw new Error("需要 --cookie，或 --email 与 --password；全新设备还没管理员时用 --expect-setup")
  }
  return options
}

/** 用 node:http 而不是 fetch：要拿到 Set-Cookie 与流式统计字节数。 */
export function send(options, method, path, { body, headers = {} } = {}) {
  const url = new URL(path, options.base)
  const client = url.protocol === "https:" ? httpsRequest : request
  return new Promise((resolve, reject) => {
    const req = client(url, { method, headers, timeout: options.timeoutMs }, (response) => {
      let bytes = 0
      let head = Buffer.alloc(0)
      const chunks = []
      response.on("data", (chunk) => {
        bytes += chunk.length
        if (head.length < 512) head = Buffer.concat([head, chunk.subarray(0, 512 - head.length)])
        if (chunks.length < 64) chunks.push(chunk)   // 只留前几十块，够判断内容
      })
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        head,
        bytes,
        headers: response.headers,
        status: response.statusCode ?? 0,
      }))
    })
    req.on("timeout", () => req.destroy(new Error(`超时（${options.timeoutMs}ms）`)))
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

function cookieFrom(headers) {
  const raw = headers["set-cookie"]
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const session = list.map((entry) => entry.split(";")[0]).find((entry) => entry.startsWith("session="))
  return session ?? ""
}

/** gzip 魔数对不上，就说明下载下来的不是备份（而是错误 JSON）。 */
export function looksLikeBackup(head) {
  return Boolean(head) && head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b
}

export async function runSmoke(options, log = console.log) {
  const results = []
  const record = (name, ok, detail) => { results.push({ detail, name, ok }); log(`${ok ? "✓" : "✗"} ${name}${detail ? `：${detail}` : ""}`) }

  // 全新设备：还没有管理员，检查的是「能不能让客户自己把账号设起来」。
  if (options.expectSetup) {
    const status = await send(options, "GET", "/api/setup")
    let needsSetup = false
    try { needsSetup = JSON.parse(status.body).needsSetup === true } catch { /* 下面按失败处理 */ }
    record("数据库就绪且等待初始化", status.status === 200 && needsSetup, needsSetup ? "这台设备还没有管理员" : `状态：${status.body.slice(0, 80)}`)

    const page = await send(options, "GET", "/setup")
    record("初始化页可打开", page.status === 200, `HTTP ${page.status}`)

    const guarded = await send(options, "GET", "/api/admin/products")
    record("没设管理员前管理接口被拦", guarded.status === 401 || guarded.status === 307, `HTTP ${guarded.status}`)

    const failed = results.filter((entry) => !entry.ok)
    return { failed: failed.length, total: results.length, results }
  }

  // 1) 站点活着
  const login = await send(options, "GET", "/login")
  record("登录页可访问", login.status === 200, `HTTP ${login.status}，${login.bytes} 字节`)

  // 2) 拿到会话
  let cookie = options.cookie
  if (!cookie) {
    const body = JSON.stringify({ email: options.email, mode: "password", password: options.password })
    const response = await send(options, "POST", "/api/auth/login", {
      body,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    })
    cookie = cookieFrom(response.headers)
    const blocked = response.status === 429
    record("管理员可登录", response.status === 200 && Boolean(cookie),
      blocked ? "被登录限流拦住了（429）：刚有人试错密码，等 15 分钟再跑" : `HTTP ${response.status}`)
  } else {
    record("使用给定的会话", cookie.startsWith("session="), "跳过密码登录")
  }

  const auth = { Cookie: cookie }

  // 3) 管理员页面（同时验证权限与数据库读）
  const system = await send(options, "GET", "/admin/system", { headers: auth })
  record("系统健康页可打开", system.status === 200 && system.body.includes("系统健康"), `HTTP ${system.status}`)

  // 4) 产品库
  const products = await send(options, "GET", "/api/admin/products", { headers: auth })
  let productCount = -1
  try { productCount = (JSON.parse(products.body).products ?? []).length } catch { /* 下面按失败处理 */ }
  record("产品库可读", products.status === 200 && productCount >= 0, `${productCount} 个产品`)

  // 5) 官方同步配置（没配也算通过，只是这台设备没接订阅）
  const sync = await send(options, "GET", "/api/admin/catalog/sync", { headers: auth })
  let syncState = "读不到"
  try {
    const status = JSON.parse(sync.body).status ?? {}
    syncState = status.configured
      ? `已配置（上次：${status.lastRun ? `${status.lastRun.status}，新增 ${status.lastRun.created}` : "还没有同步记录"}）`
      : "未配置（自建模式，正常）"
  } catch { /* 下面按失败处理 */ }
  record("同步状态可读", sync.status === 200, syncState)

  // 6) 备份能导出（只统计字节数，包不落地）
  const backup = await send(options, "GET", "/api/admin/backup", { headers: auth })
  const isGzip = looksLikeBackup(backup.head)
  record("备份可导出", backup.status === 200 && backup.bytes > 1024 && isGzip,
    `HTTP ${backup.status}，${(backup.bytes / 1024 / 1024).toFixed(2)} MB${isGzip ? "，是有效的 gzip 包" : "，但内容不是 gzip"}`)

  // 7) 未登录必须被拦（安全底线）
  const anonymous = await send(options, "GET", "/api/admin/products")
  record("未登录访问被拦", anonymous.status === 401 || anonymous.status === 307, `HTTP ${anonymous.status}`)

  const failed = results.filter((entry) => !entry.ok)
  return { failed: failed.length, total: results.length, results }
}

async function main() {
  const options = parseSmokeArgs(process.argv.slice(2))
  console.log(`发货前自检：${options.base}\n`)
  const summary = await runSmoke(options)
  console.log(`\n${summary.total - summary.failed}/${summary.total} 项通过`)
  if (summary.failed) {
    console.log("有检查项失败，先别发货。逐条看上面的 ✗。")
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
