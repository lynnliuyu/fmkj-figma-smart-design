#!/usr/bin/env node
// 本地开发用：签发一个管理员 session cookie，供运维脚本调用 /api/admin/* 时携带。
// 用法：node scripts/mint-session.mjs [--user <uuid>] [--json]
// 只在本地开发环境使用；令牌不落盘、不写进任何配置文件。

import { readFileSync } from "node:fs"
import { SignJWT } from "jose"

const DEV_SECRET = "fmkj-local-development-session-secret"
const ADMIN_USER_ID = "e8112bd2-862f-4bae-8849-d489ac252b77"

function readEnv(key) {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    for (const line of text.split("\n")) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`))
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    }
  } catch {
    /* 没有 .env.local 就用开发默认密钥 */
  }
  return process.env[key]
}

const args = process.argv.slice(2)
const userIdx = args.indexOf("--user")
const userId = userIdx >= 0 ? args[userIdx + 1] : ADMIN_USER_ID
const secret = readEnv("AUTH_SECRET") || DEV_SECRET

const token = await new SignJWT({
  userId,
  email: null,
  phone: null,
  name: "运维脚本",
  role: "super_admin",
})
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("7d")
  .setIssuedAt()
  .setSubject(userId)
  .sign(new TextEncoder().encode(secret))

if (args.includes("--json")) {
  console.log(JSON.stringify({ cookie: `session=${token}` }))
} else {
  console.log(`session=${token}`)
}
