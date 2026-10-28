import { describe, expect, it, vi } from "vitest"

vi.mock("../lib/session-secret", () => ({
  getSessionSecretBytes: () => new TextEncoder().encode("fmkj-local-development-session-secret"),
}))

import { SignJWT } from "jose"
import { getSessionUserFromRequest, verifySessionToken } from "../lib/auth"

async function mint(userId = "e8112bd2-862f-4bae-8849-d489ac252b77") {
  return new SignJWT({
    userId,
    email: "admin@fmkj.com",
    phone: null,
    name: "Admin",
    role: "super_admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .setSubject(userId)
    .sign(new TextEncoder().encode("fmkj-local-development-session-secret"))
}

function requestWithSession(token?: string) {
  return {
    cookies: {
      get(name: string) {
        if (name !== "session" || !token) return undefined
        return { value: token }
      },
    },
  }
}

describe("getSessionUserFromRequest", () => {
  it("reads the session cookie from the request without using next/headers cookies()", async () => {
    const token = await mint()
    const user = await getSessionUserFromRequest(requestWithSession(token))
    expect(user).toMatchObject({
      userId: "e8112bd2-862f-4bae-8849-d489ac252b77",
      role: "super_admin",
      name: "Admin",
    })
    expect(await verifySessionToken(token)).toEqual(user)
  })

  it("returns null when the cookie is missing or invalid", async () => {
    expect(await getSessionUserFromRequest(requestWithSession())).toBeNull()
    expect(await getSessionUserFromRequest(requestWithSession("not-a-jwt"))).toBeNull()
  })
})
