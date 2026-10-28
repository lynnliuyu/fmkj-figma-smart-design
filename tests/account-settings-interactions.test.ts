import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

function handler(file: string, name: string, bindings: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found: ts.FunctionDeclaration | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    if (!found) ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!found) throw new Error(`Missing production handler: ${name}`)
  const executable = ts.transpileModule(`${found.getText(parsed)}\nreturn ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return new Function(...Object.keys(bindings), executable)(...Object.values(bindings)) as (...args: unknown[]) => Promise<void>
}

function profileHarness(fetcher: typeof fetch) {
  const profile = { name: "原姓名", companyName: "测试店" }
  const bindings = {
    fetch: fetcher, profile, name: "新姓名", companyName: "测试店", avatarUrl: "", companyAvatarUrl: "",
    canManageCompany: true, setSaving: vi.fn(), setMessage: vi.fn(), setProfile: vi.fn(),
    notifyAccountProfileUpdated: vi.fn(), setUploading: vi.fn(), setAvatarUrl: vi.fn(), setCompanyAvatarUrl: vi.fn(),
  }
  return {
    ...bindings,
    save: handler("../components/settings/settings-forms.tsx", "saveProfile", bindings),
    upload: handler("../components/settings/settings-forms.tsx", "uploadImage", bindings),
  }
}

describe("settings button failure recovery", () => {
  it.each(["network", "response"])("re-enables profile saving and preserves the input after a %s failure", async (failure) => {
    const fetcher = vi.fn(async () => {
      if (failure === "network") throw new TypeError("Failed to fetch")
      return new Response("upstream unavailable", { status: 502 })
    })
    const test = profileHarness(fetcher)
    await test.save()
    expect(test.setSaving).toHaveBeenLastCalledWith(false)
    expect(test.setMessage).toHaveBeenLastCalledWith(expect.stringMatching(/失败|重试|网络/))
    expect(test.setProfile).not.toHaveBeenCalled()
    expect(test.notifyAccountProfileUpdated).not.toHaveBeenCalled()
  })

  it("clears image uploading after a network failure so the file can be selected again", async () => {
    const test = profileHarness(vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    await test.upload(new File(["test"], "avatar.png", { type: "image/png" }), "avatar")
    expect(test.setUploading).toHaveBeenLastCalledWith(null)
    expect(test.setAvatarUrl).not.toHaveBeenCalled()
    expect(test.setMessage).toHaveBeenLastCalledWith(expect.stringMatching(/失败|重试|网络/))
  })

  it("publishes a successfully saved profile only after the server acknowledges it", async () => {
    const saved = { name: "新姓名", companyName: "测试店" }
    const test = profileHarness(vi.fn(async () => new Response(JSON.stringify({ profile: saved }))))
    await test.save()
    expect(test.setProfile).toHaveBeenCalledWith(saved)
    expect(test.notifyAccountProfileUpdated).toHaveBeenCalledWith(saved)
    expect(test.setSaving).toHaveBeenLastCalledWith(false)
  })

  it("keeps a failed member-creation dialog open and allows retrying", async () => {
    const bindings = {
      createEmail: "test@example.invalid", createName: "测试成员", createPassword: "ExampleOnly123", createRole: "editor",
      fetch: vi.fn(async () => { throw new TypeError("Failed to fetch") }),
      setSavingCreate: vi.fn(), setTeam: vi.fn(), setCreateOpen: vi.fn(), setCreateEmail: vi.fn(), setCreateName: vi.fn(), setCreatePassword: vi.fn(), setCreateRole: vi.fn(),
      toast: { error: vi.fn(), success: vi.fn() }, formatTeamError: (value: string) => value,
    }
    await handler("../components/account/account-team-settings.tsx", "createMember", bindings)()
    expect(bindings.setSavingCreate).toHaveBeenLastCalledWith(false)
    expect(bindings.setCreateOpen).not.toHaveBeenCalled()
    expect(bindings.toast.error).toHaveBeenCalledWith(expect.stringMatching(/失败|重试|网络/))
  })

  it("keeps member settings open and releases the button after a failed save", async () => {
    const bindings = {
      managedMember: { id: "fictional-member" }, savingMember: false, managedRole: "viewer", managedStatus: "disabled", transferToUserId: "fictional-owner",
      fetch: vi.fn(async () => { throw new TypeError("Failed to fetch") }),
      setSavingMember: vi.fn(), setTeam: vi.fn(), setManagedMember: vi.fn(),
      toast: { error: vi.fn(), success: vi.fn() }, formatTeamError: (value: string) => value,
    }
    await handler("../components/account/account-team-settings.tsx", "saveMemberSettings", bindings)()
    expect(bindings.setSavingMember).toHaveBeenLastCalledWith(false)
    expect(bindings.setManagedMember).not.toHaveBeenCalled()
    expect(bindings.toast.error).toHaveBeenCalledWith(expect.stringMatching(/失败|重试|网络/))
  })

  it("does not stop a member before a project handover recipient is selected", async () => {
    const bindings = {
      managedMember: { id: "fictional-member" }, savingMember: false, managedRole: "viewer", managedStatus: "disabled", transferToUserId: "",
      fetch: vi.fn(), toast: { error: vi.fn() },
    }
    await handler("../components/account/account-team-settings.tsx", "saveMemberSettings", bindings)()
    expect(bindings.fetch).not.toHaveBeenCalled()
    expect(bindings.toast.error).toHaveBeenCalledWith("请选择接手项目的成员")
  })
})
