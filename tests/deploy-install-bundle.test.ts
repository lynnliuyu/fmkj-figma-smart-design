import { execFileSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { makeBundle } from "../scripts/deploy/make-install-bundle.mjs"

const cleanups: string[] = []
afterEach(async () => { await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

async function sourceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fmkj-install-bundle-"))
  cleanups.push(root)
  await mkdir(join(root, "scripts"), { recursive: true })
  await mkdir(join(root, "deploy"), { recursive: true })
  await cp(resolve("scripts/deploy"), join(root, "scripts/deploy"), { recursive: true })
  await cp(resolve("deploy/systemd"), join(root, "deploy/systemd"), { recursive: true })
  await cp(resolve("deploy/public-access"), join(root, "deploy/public-access"), { recursive: true })
  for (const file of ["docker-compose.appliance.yml", "docker-compose.appliance-external-db.yml"]) await cp(resolve(file), join(root, file))
  await mkdir(join(root, "scripts/deploy/__pycache__"))
  await writeFile(join(root, "scripts/deploy/__pycache__/development.pyc"), "development-only")
  return root
}

describe("设备装机包", () => {
  it("真实打包后包含更新服务入口及其运行脚本，仍排除开发工具", async () => {
    const root = await sourceFixture()
    const result = await makeBundle({ version: "v0.3.5" }, { root, log() {} })
    const files = execFileSync("tar", ["tzf", result.archive], { encoding: "utf8" }).trim().split("\n")
    const service = await readFile(join(result.stage, "deploy/systemd/fmkj-updater.service"), "utf8")
    const entry = /ExecStart=.*node (scripts\/[^\s]+)/.exec(service)?.[1]
    expect(entry).toBe("scripts/deploy/updater-agent.mjs")
    expect(files).toContain(`./${entry}`)
    for (const file of ["update-local.mjs", "check-update.mjs", "backup-local.mjs", "first-boot.sh", "prepare-golden.sh"]) expect(files).toContain(`./scripts/deploy/${file}`)
    for (const file of ["build-release.mjs", "make-device-card.py", "make-install-bundle.mjs", "sign-version-index.mjs", "__pycache__/development.pyc"]) expect(files).not.toContain(`./scripts/deploy/${file}`)
    execFileSync(process.execPath, ["--check", join(result.stage, entry!)], { stdio: "pipe" })
  })

  it("缺少更新入口时拒绝产出会装坏的包", async () => {
    const root = await sourceFixture()
    await rm(join(root, "scripts/deploy/updater-agent.mjs"))
    await expect(makeBundle({ version: "v0.3.5" }, { root, log() {} })).rejects.toThrow("缺少设备更新所需的 scripts/deploy/updater-agent.mjs")
  })
})
