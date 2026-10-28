import { afterEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({ getPool: vi.fn(() => ({ query: vi.fn(async (sql: string) => {
  if (!sql) throw new Error("Missing SQL")
  return { rows: [] as Record<string, unknown>[] }
}) })) }))
vi.mock("@/lib/server-db", () => ({ getPool: db.getPool }))

import { generateAndSendCode, verifyCode } from "../lib/verification"
import { loginOptions } from "../lib/login-options"

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe("unconfigured verification delivery", () => {
  it("does not create or log undeliverable codes in normal operation", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("AUTH_DEV_MODE", "false")
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = await generateAndSendCode("fictional@example.invalid", "reset-password")
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/未启用|未配置/)
    expect(db.getPool).not.toHaveBeenCalled()
    expect(warning).not.toHaveBeenCalled()
  })

  it("hides code-based login when no real delivery exists", () => {
    expect(loginOptions({ NODE_ENV: "production", AUTH_DEV_MODE: "false" }).showSmsLogin).toBe(false)
  })
})

describe("single-use verification code", () => {
  it("allows only one concurrent consumer to claim a valid code", async () => {
    let consumed = false
    const query = vi.fn(async (sql: string) => {
      const text = sql.trim().toLowerCase()
      if (text.startsWith("select")) return { rows: consumed ? [] : [{ id: "fictional-code" }] }
      const accepted = !consumed
      consumed = true
      return { rows: text.includes("returning id") && accepted ? [{ id: "fictional-code" }] : [] }
    })
    db.getPool.mockReturnValue({ query })
    const accepted = await Promise.all([
      verifyCode("fictional@example.invalid", "123456", "reset-password"),
      verifyCode("fictional@example.invalid", "123456", "reset-password"),
    ])
    expect(accepted.filter(Boolean)).toHaveLength(1)
  })
})
