#!/usr/bin/env node
/**
 * 外网访问自检：把设备通过内网穿透/反向代理暴露出去之前（以及之后），跑一遍这个。
 *
 * 为什么必须跑：设备本来是局域网里的东西，暴露到公网等于把大门挪到大街上。这个脚本只做**只读**
 * 检查，回答四个问题：是不是 HTTPS、陌生人还能不能自助注册、没登录能碰到什么、管理员设了没有。
 *
 * 用法：
 *   node scripts/deploy/check-public-access.mjs --url https://home.example.com
 *   # 能提供管理员账号时，顺带检查会话 Cookie 的安全标志
 *   node scripts/deploy/check-public-access.mjs --url https://home.example.com --email you@example.com --password '...'
 *
 * 退出码 0 = 全部通过；非 0 = 有必须处理的项没过，先别把这个网址给客户。
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { send } from "./smoke-appliance.mjs"

export function parsePublicCheckArgs(argv) {
  const options = { base: "", email: "", host: "", insecure: false, password: "", timeoutMs: 15000 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--url") options.base = argv[++index]
    else if (arg === "--email") options.email = argv[++index]
    else if (arg === "--password") options.password = argv[++index]
    else if (arg === "--host") options.host = argv[++index]
    else if (arg === "--insecure") options.insecure = true
    else if (arg === "--timeout") options.timeoutMs = Number(argv[++index])
  }
  if (!options.base) throw new Error("缺少 --url：要检查的是哪个外网地址（例如 https://home.example.com）")
  if (!/^https?:\/\//.test(options.base)) except("地址要以 http:// 或 https:// 开头")
  return options
}

function except(message) {
  throw new Error(message)
}

/** 会话 Cookie 必须是 Secure + HttpOnly，否则公网上等于把票据放在明文里。 */
export function cookieFlags(setCookie) {
  const value = String(setCookie ?? "")
  return {
    httpOnly: /httponly/i.test(value),
    sameSite: /samesite=/i.test(value),
    secure: /secure/i.test(value),
  }
}

export async function runPublicCheck(options, log = console.log) {
  const results = []
  const record = (name, ok, detail, hard = true) => {
    results.push({ detail, hard, name, ok })
    log(`${ok ? "✓" : hard ? "✗" : "!"} ${name}${detail ? `：${detail}` : ""}`)
  }

  if (options.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
  if (options.host) log(`（用 Host: ${options.host} 访问 ${options.base}，域名还没解析时用）`)
  const call = (method, path, init = {}) =>
    send(options, method, path, { ...init, headers: { ...(init.headers ?? {}), ...(options.host ? { Host: options.host } : {}) } })

  const https = options.base.startsWith("https://")
  record("用 HTTPS 访问", https, https ? options.base : "现在是 http，公网上密码会明文传输，必须换成 https", false)

  const login = await call("GET", "/login")
  record("登录页能打开", login.status === 200, `HTTP ${login.status}`)

  // 陌生人自助注册：设备版的编排默认关掉。开着就等于谁都能进客户这台机器。
  const signUp = await call("GET", "/sign-up")
  const closedByRedirect = signUp.status >= 300 && signUp.status < 400
  record(
    "自助注册页已关闭",
    closedByRedirect,
    closedByRedirect ? `跳转到 ${signUp.headers.location ?? "登录页"}` : `HTTP ${signUp.status}（还开着，陌生人能注册账号）`,
  )

  const register = await call("POST", "/api/auth/register", {
    body: JSON.stringify({ email: "probe@example.com", name: "probe", password: "probe-pass-123" }),
    headers: { "Content-Type": "application/json" },
  })
  record(
    "注册接口已拒绝（关键）",
    register.status === 403,
    register.status === 403 ? "返回 403，陌生人也建不了账号" : `HTTP ${register.status}，返回内容：${register.body.slice(0, 80)}`,
  )

  const admin = await call("GET", "/api/admin/products")
  record("管理接口需要登录", admin.status === 401 || admin.status === 307, `HTTP ${admin.status}`)

  const snapshot = await call("GET", "/api/catalog/snapshot")
  record("官方资料接口不裸奔", snapshot.status === 401 || snapshot.status === 404, `HTTP ${snapshot.status}`)

  // 还没设管理员就暴露出去，等于把「设置管理员」这一步让给第一个访问的人。
  const setup = await call("GET", "/api/setup")
  let needsSetup = false
  try { needsSetup = JSON.parse(setup.body).needsSetup === true } catch { /* 下面按失败处理 */ }
  record(
    "管理员已经设好了",
    !needsSetup,
    needsSetup ? "这台设备还没有管理员！暴露在公网上，第一个打开的人就能把管理员账号占了" : "已初始化",
  )

  if (options.email && options.password) {
    const loginResponse = await call("POST", "/api/auth/login", {
      body: JSON.stringify({ email: options.email, mode: "password", password: options.password }),
      headers: { "Content-Type": "application/json" },
    })
    const flags = cookieFlags(loginResponse.headers["set-cookie"])
    record(
      "登录成功且会话 Cookie 带安全标志",
      loginResponse.status === 200 && flags.secure && flags.httpOnly,
      loginResponse.status === 200
        ? `Secure=${flags.secure} HttpOnly=${flags.httpOnly} SameSite=${flags.sameSite}`
        : `登录返回 HTTP ${loginResponse.status}`,
      false,
    )
  } else {
    log("· 没给管理员账号，跳过 Cookie 安全标志检查（给了 --email/--password 才会查）")
  }

  const failed = results.filter((entry) => entry.hard && !entry.ok)
  return { failed: failed.length, results, total: results.length }
}

async function main() {
  const options = parsePublicCheckArgs(process.argv.slice(2))
  console.log(`外网访问自检：${options.base}\n`)
  const summary = await runPublicCheck(options)
  console.log(`\n${summary.total - summary.failed}/${summary.total} 项通过`)
  if (summary.failed) {
    console.log("有必须处理的项没过（上面带 ✗ 的），先别把这个网址给客户。")
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
