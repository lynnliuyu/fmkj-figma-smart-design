import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { generateKeyPairSync } from "node:crypto"
import { writeFileSync } from "node:fs"
import { join as joinPath } from "node:path"
import {
  compareVersions,
  parseCheckArgs,
  parseImageReference,
  parseVersion,
  pickUpdate,
  runCheck,
  verifyVersionIndex,
  versionsFromIndex,
  versionsFromRegistry,
} from "../scripts/deploy/check-update.mjs"
import { signVersions } from "../scripts/deploy/sign-version-index.mjs"
import { getDeployStatus, redactDetail } from "../lib/deploy-status"

const cleanups: string[] = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fmkj-check-"))
  cleanups.push(dir)
  return dir
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe("版本号比较", () => {
  it("只把三段数字当版本，其他 tag 一律忽略", () => {
    expect(parseVersion("v0.1.2")).toEqual([0, 1, 2])
    expect(parseVersion("0.1.2")).toEqual([0, 1, 2])
    expect(parseVersion("latest")).toBeNull()
    expect(parseVersion("sha-9f2c1ab")).toBeNull()
    expect(parseVersion("")).toBeNull()
  })

  it("按大小比较而不是按字符串比较", () => {
    expect(compareVersions("v0.9.0", "v0.10.0")).toBe(-1)
    expect(compareVersions("v0.1.0", "v0.1.0")).toBe(0)
    expect(compareVersions("v1.0.0", "v0.99.9")).toBe(1)
  })

  it("挑出比当前更高的最高版本，忽略非版本 tag", () => {
    expect(pickUpdate("v0.1.0", ["v0.1.0", "v0.1.1", "latest", "v0.0.9"]))
      .toEqual({ latest: "v0.1.1", updateAvailable: true })
  })

  it("已经是最新时明确报告没有更新", () => {
    expect(pickUpdate("v0.2.0", ["v0.1.0", "v0.2.0"]))
      .toEqual({ latest: "v0.2.0", updateAvailable: false })
  })

  it("当前版本读不出来时不催升级，只报告最高版本", () => {
    expect(pickUpdate("", ["v0.1.0", "v0.2.0"]))
      .toEqual({ latest: "v0.2.0", updateAvailable: false })
  })
})

describe("版本来源解析", () => {
  it("接受数组、versions 字段和单个 latest 三种清单写法", () => {
    expect(versionsFromIndex(["v1.0.0"])).toEqual(["v1.0.0"])
    expect(versionsFromIndex({ versions: ["v1.0.0", "v2.0.0"] })).toEqual(["v1.0.0", "v2.0.0"])
    expect(versionsFromIndex({ latest: "v3.0.0" })).toEqual(["v3.0.0"])
    expect(versionsFromIndex({})).toEqual([])
  })

  it("读仓库 tag 列表，缺字段时返回空数组", () => {
    expect(versionsFromRegistry({ tags: ["v0.1.0"] })).toEqual(["v0.1.0"])
    expect(versionsFromRegistry({})).toEqual([])
  })

  it("带主机名的镜像地址能反推出仓库地址与货名", () => {
    expect(parseImageReference("registry.example.com:5443/ns/fmkj-v3:v0.1.0"))
      .toEqual({ registry: "registry.example.com:5443", repository: "ns/fmkj-v3", tag: "v0.1.0" })
  })

  it("不带主机名时不当成仓库主机，避免去问一个不存在的域名", () => {
    expect(parseImageReference("fmkj-v3:v0.1.0"))
      .toEqual({ registry: "", repository: "fmkj-v3", tag: "v0.1.0" })
  })
})

describe("检查参数", () => {
  it("拒绝非法的超时时间", () => {
    expect(() => parseCheckArgs(["--timeout", "0"])).toThrow(/timeout/)
  })
})

describe("检查一遍并写状态", () => {
  it("清单里有更高版本时写 updateAvailable 并保留两个版本号", async () => {
    const stateDir = await tempDir()
    const files = await tempDir()
    await writeFile(join(files, ".env"), "FMKJ_VERSION=v0.1.0\n", "utf8")
    const options = parseCheckArgs(["--state-dir", stateDir, "--index-url", "https://example.com/v.json"])
    options.envFiles = [join(files, ".env")]

    const state = await runCheck(options, new Date("2026-10-22T00:00:00Z"), {
      env: {},
      fetch: async () => jsonResponse({ versions: ["v0.1.0", "v0.1.1"] }),
    })

    expect(state).toMatchObject({
      currentVersion: "v0.1.0",
      latestVersion: "v0.1.1",
      updateAvailable: true,
      source: "index",
      error: null,
    })
    const written = JSON.parse(await readFile(join(stateDir, "update-check.json"), "utf8"))
    expect(written.checkedAt).toBe("2026-10-22T00:00:00.000Z")
    expect(written.latestVersion).toBe("v0.1.1")
  })

  it("断网时把原因写进状态而不抛错，定时任务不该因为离线失败", async () => {
    const stateDir = await tempDir()
    const options = parseCheckArgs(["--state-dir", stateDir, "--index-url", "https://example.com/v.json"])
    options.envFiles = []

    const state = await runCheck(options, new Date(), {
      env: { FMKJ_VERSION: "v0.1.0" },
      fetch: async () => { throw new Error("getaddrinfo ENOTFOUND example.com") },
    })

    expect(state.error).toMatch(/ENOTFOUND/)
    expect(state.updateAvailable).toBe(false)
    expect(JSON.parse(await readFile(join(stateDir, "update-check.json"), "utf8")).error)
      .toMatch(/ENOTFOUND/)
  })

  it("没有任何版本来源时给出可照做的提示，而不是静默通过", async () => {
    const stateDir = await tempDir()
    const options = parseCheckArgs(["--state-dir", stateDir])
    options.envFiles = []

    const state = await runCheck(options, new Date(), { env: {}, fetch: async () => jsonResponse({}) })

    expect(state.error).toMatch(/FMKJ_UPDATE_INDEX_URL/)
  })
})

describe("管理员页面读取部署状态", () => {
  it("打包检查、更新、备份三份结果，并且不泄露宿主机目录", async () => {
    const dir = await tempDir()
    await writeFile(join(dir, "update-check.json"), JSON.stringify({
      checkedAt: "2026-10-22T00:00:00.000Z",
      currentVersion: "v0.1.0",
      latestVersion: "v0.1.1",
      updateAvailable: true,
      source: "index",
      error: null,
    }), "utf8")
    await writeFile(join(dir, "update-state.json"), JSON.stringify({
      status: "failed",
      target: "v0.1.1",
      startedAt: "2026-10-21T23:00:00.000Z",
      finishedAt: "2026-10-21T23:05:00.000Z",
      steps: [{ id: "fetch", status: "failed", detail: "找不到 /opt/fmkj/app/x.yml" }],
    }), "utf8")
    await writeFile(join(dir, "backup-state.json"), JSON.stringify({
      createdAt: "2026-10-21T22:00:00.000Z",
      label: "nightly",
      version: "v0.1.0",
      kept: 7,
      ok: true,
      error: null,
    }), "utf8")

    const status = await getDeployStatus({ env: { FMKJ_DEPLOY_STATE_DIR: dir } })

    expect(status.available).toBe(true)
    expect(status.check).toMatchObject({ updateAvailable: true, latestVersion: "v0.1.1" })
    expect(status.update).toMatchObject({ status: "failed", failedStep: "fetch", target: "v0.1.1" })
    expect(status.backup).toMatchObject({ ok: true, kept: 7, label: "nightly" })
  })

  it("目录没挂载时报告不可用，页面据此显示「不是设备版部署」", async () => {
    const status = await getDeployStatus({ env: { FMKJ_DEPLOY_STATE_DIR: join(await tempDir(), "missing") } })

    expect(status).toMatchObject({ available: false, check: null, update: null, backup: null })
  })

  it("失败原因里的宿主机路径被抹掉", () => {
    expect(redactDetail("找不到 /opt/fmkj/app/docker-compose.appliance.yml 这个文件"))
      .toBe("找不到 … 这个文件")
    expect(redactDetail("")).toBeNull()
  })
})

describe("版本清单验签", () => {
  const pair = generateKeyPairSync("ed25519")
  const privatePem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString()
  const publicPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString()
  const versions = ["v0.1.0", "v0.2.0"]

  it("签过名的清单验得过，改一个版本号就验不过", () => {
    const signature = signVersions(versions, privatePem)
    expect(verifyVersionIndex(versions, signature, publicPem)).toBe(true)
    expect(verifyVersionIndex(["v0.1.0", "v9.9.9"], signature, publicPem)).toBe(false)
    expect(verifyVersionIndex(versions, "", publicPem)).toBe(false)
    expect(verifyVersionIndex(versions, signature, "不是公钥")).toBe(false)
  })

  it("配了公钥但清单没签名：报错并且不提示升级", async () => {
    const stateDir = await tempDir()
    const options = parseCheckArgs(["--state-dir", stateDir, "--index-url", "https://example.com/v.json"])
    options.envFiles = []

    const state = await runCheck(options, new Date(), {
      env: { FMKJ_VERSION: "v0.1.0", FMKJ_RELEASE_PUBLIC_KEY: publicPem },
      fetch: async () => jsonResponse({ versions }),
    })

    expect(state.error).toMatch(/没有签名/)
    expect(state.updateAvailable).toBe(false)
  })

  it("签名不对：报错并且不提示升级", async () => {
    const stateDir = await tempDir()
    const options = parseCheckArgs(["--state-dir", stateDir, "--index-url", "https://example.com/v.json"])
    options.envFiles = []

    const state = await runCheck(options, new Date(), {
      env: { FMKJ_VERSION: "v0.1.0", FMKJ_RELEASE_PUBLIC_KEY: publicPem },
      fetch: async () => jsonResponse({ versions, signature: signVersions(["v1.0.0"], privatePem) }),
    })

    expect(state.error).toMatch(/签名校验不通过/)
    expect(state.updateAvailable).toBe(false)
  })

  it("签名正确时正常提示有新版本，并记下签名状态", async () => {
    const stateDir = await tempDir()
    const options = parseCheckArgs(["--state-dir", stateDir, "--index-url", "https://example.com/v.json"])
    options.envFiles = []

    const state = await runCheck(options, new Date(), {
      env: { FMKJ_VERSION: "v0.1.0", FMKJ_RELEASE_PUBLIC_KEY: publicPem },
      fetch: async () => jsonResponse({ versions, signature: signVersions(versions, privatePem) }),
    })

    expect(state).toMatchObject({ signature: "verified", latestVersion: "v0.2.0", updateAvailable: true, error: null })
  })

  it("签名工具产出的文件能被检查脚本直接读懂", async () => {
    const dir = await tempDir()
    const indexFile = joinPath(dir, "versions.json")
    const keyFile = joinPath(dir, "key.pem")
    writeFileSync(indexFile, JSON.stringify({ versions }), "utf8")
    writeFileSync(keyFile, privatePem, "utf8")

    const { signIndexFile } = await import("../scripts/deploy/sign-version-index.mjs")
    const result = signIndexFile({ file: indexFile, key: keyFile, out: joinPath(dir, "signed.json") })
    const signed = JSON.parse(await readFile(result.out, "utf8"))

    expect(verifyVersionIndex(signed.versions, signed.signature, publicPem)).toBe(true)
    expect(result.count).toBe(2)
  })
})
