import { execFileSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const cleanups: string[] = []
afterEach(async () => { await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

describe("公开版导出的测试与所带能力保持一致", () => {
  it("实际导出后不带设备测试，保留的备份归档和注册检查可以直接运行", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "fmkj-public-export-"))
    cleanups.push(fixture)
    const source = join(fixture, "source")
    const target = join(fixture, "public")
    await mkdir(source)
    await mkdir(target)
    const deviceTests = (await readdir(resolve("tests"))).filter((file) => /^deploy-.*\.test\.ts$/.test(file))
    const retainedTests = ["backup-archive.test.ts", "self-signup.test.ts"]
    const files = [
      "scripts/open-source-export.mjs", "scripts/open-source-manifest.json", "scripts/deploy/check-public-access.mjs",
      "lib/backup-archive.ts", "lib/self-signup.ts", "vitest.config.mts",
      ...[...deviceTests, ...retainedTests, "appliance-handbook.test.ts", "open-source-export-policy.test.ts"].map((file) => `tests/${file}`),
    ]
    for (const file of files) {
      await mkdir(dirname(join(source, file)), { recursive: true })
      await cp(resolve(file), join(source, file))
    }
    await writeFile(join(source, "package.json"), '{"name":"synthetic-public-export","type":"module","private":true}\n')
    execFileSync("git", ["init", "--quiet"], { cwd: source })
    execFileSync("git", ["add", "."], { cwd: source })
    execFileSync("git", ["-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "commit", "--quiet", "-m", "synthetic fixture"], { cwd: source })
    execFileSync("git", ["init", "--quiet"], { cwd: target })
    execFileSync(process.execPath, [join(source, "scripts/open-source-export.mjs"), "--target", target, "--apply"], { cwd: source, stdio: "pipe" })

    const publicTests = await readdir(join(target, "tests"))
    expect(publicTests.sort()).toEqual(retainedTests.toSorted())
    await expect(readdir(join(target, "scripts/deploy"))).rejects.toMatchObject({ code: "ENOENT" })
    await symlink(resolve("node_modules"), join(target, "node_modules"), "dir")
    const output = execFileSync(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "--reporter=json"], { cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    const result = JSON.parse(output)
    expect(result.success).toBe(true)
    expect(result.numFailedTests).toBe(0)
    expect(result.numPassedTests).toBeGreaterThan(0)
    expect(result.testResults).toHaveLength(retainedTests.length)
    expect(result.testResults.every((file: { status: string }) => file.status === "passed")).toBe(true)
  })
})
