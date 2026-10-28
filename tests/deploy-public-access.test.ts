import { describe, expect, it } from "vitest"

import { cookieFlags } from "../scripts/deploy/check-public-access.mjs"

describe("外网自检读 Cookie 安全标志", () => {
  it("认得出 Secure / HttpOnly / SameSite", () => {
    const flags = cookieFlags("session=abc; Path=/; HttpOnly; Secure; SameSite=Lax")
    expect(flags).toEqual({ httpOnly: true, sameSite: true, secure: true })
  })

  it("缺安全标志时不会误判为通过", () => {
    expect(cookieFlags("session=abc; Path=/").secure).toBe(false)
    expect(cookieFlags(undefined).httpOnly).toBe(false)
  })
})
