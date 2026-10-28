import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  composeDatabaseProbe,
  decideFailureAction,
  hostDatabaseProbe,
  imageReference,
  parseEnvValue,
  parseUpdateArgs,
  probeHttp,
  runUpdate,
  STEP_ORDER,
  upsertEnvLines,
} from "../scripts/deploy/update-local.mjs"
import {
  backupDirName,
  defaultComposeFile,
  parseBackupArgs,
  resolveDatabaseAccess,
  retentionToDelete,
} from "../scripts/deploy/backup-local.mjs"

const cleanups: string[] = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

describe("备份脚本找到正确的编排文件", () => {
  // 设备上编排叫 docker-compose.appliance.yml，开发机上叫 docker-compose.yml。
  // 设备专属检查单独保留，公开版的归档格式测试不依赖宿主机脚本。
  it("按候选顺序挑第一个存在的", () => {
    expect(defaultComposeFile(["package.json", "docker-compose.appliance.yml"])).toBe("package.json")
  })

  it("一个都不存在时用第一个候选（让报错指向被期望的名字）", () => {
    expect(defaultComposeFile(["没有这个文件.yml", "也没有这个.yml"])).toBe("没有这个文件.yml")
  })
})

describe("本地设备更新参数", () => {
  it("refuses to update without an explicit version or to latest", () => {
    expect(() => parseUpdateArgs([])).toThrow(/--to/)
    expect(() => parseUpdateArgs(["--to", "latest"])).toThrow(/latest/)
  })

  it("defaults to the registry source and a versioned image reference", () => {
    const options = parseUpdateArgs(["--to", "v0.3.0"])
    expect(options.source).toBe("registry")
    expect(imageReference(options)).toBe("fmkj-v3:v0.3.0")
  })

  it("rejects an unknown update source", () => {
    expect(() => parseUpdateArgs(["--to", "v1", "--source", "ftp"])).toThrow(/registry/)
  })
})

describe("更新失败后的处置", () => {
  it("stops for restore once migrations ran, because the schema moved", () => {
    expect(decideFailureAction(["preflight", "backup", "fetch", "migrate"])).toMatchObject({
      action: "stop-for-restore",
    })
  })

  it("keeps the previous image serving when the database was not touched", () => {
    expect(decideFailureAction(["preflight", "backup", "fetch"])).toMatchObject({
      action: "restart-previous",
    })
  })

  it("aborts without pretending anything changed", () => {
    expect(decideFailureAction(["preflight"])).toMatchObject({ action: "abort" })
  })

  it("refuses to silently switch back to the old image after a migration", () => {
    const decision = decideFailureAction(["migrate", "switch"])
    expect(decision.action).toBe("stop-for-restore")
    expect(decision.reason).toContain("恢复")
  })
})

describe("更新后的校验", () => {
  it("treats a 2xx or redirect from the login page as alive", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 })
    const sleep = vi.fn(async () => {})
    const result = await probeHttp(
      { healthUrl: "http://127.0.0.1:3000/login", healthAttempts: 5, healthIntervalMs: 1 },
      { fetchImpl: fetchImpl as never, sleep },
    )
    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it("reports why the new container never answered", async () => {
    const result = await probeHttp(
      { healthUrl: "http://127.0.0.1:3000/login", healthAttempts: 2, healthIntervalMs: 1 },
      { fetchImpl: (async () => ({ status: 503 })) as never, sleep: async () => {} },
    )
    expect(result).toMatchObject({ ok: false })
    expect(result.detail).toContain("503")
  })

  it("surfaces the underlying connection error instead of a bare fetch failed", async () => {
    const failure = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })
    const result = await probeHttp(
      { healthUrl: "http://127.0.0.1:9/login", healthAttempts: 1, healthIntervalMs: 1 },
      { fetchImpl: (async () => { throw failure }) as never, sleep: async () => {} },
    )
    expect(result.detail).toContain("ECONNREFUSED")
  })

  it("reads the backup location from a machine-readable line, not the Chinese summary", () => {
    const stdout = "backup_dir=/opt/fmkj/backups/appliance/20261021T120847Z-before-v0.1.0\n备份完成：/opt/fmkj/backups/appliance/20261021T120847Z-before-v0.1.0（0.0 MB）\n"
    expect(parseEnvValue(stdout, "backup_dir")).toBe(
      "/opt/fmkj/backups/appliance/20261021T120847Z-before-v0.1.0",
    )
  })

  it("records the running version back into the compose interpolation file", () => {
    // 已存在的键替换、缺失的键追加、注释与无关变量原样保留。
    const before = [
      "# 设备版编排变量",
      "FMKJ_IMAGE=fmkj-v3:v0.1.0",
      "FMKJ_BIND=0.0.0.0",
      "",
    ].join("\n")
    expect(upsertEnvLines(before, { FMKJ_IMAGE: "10.0.0.235:5443/fmkj-v3:v0.1.1", FMKJ_VERSION: "v0.1.1" }))
      .toBe([
        "# 设备版编排变量",
        "FMKJ_IMAGE=10.0.0.235:5443/fmkj-v3:v0.1.1",
        "FMKJ_BIND=0.0.0.0",
        "FMKJ_VERSION=v0.1.1",
        "",
      ].join("\n"))
  })

  it("reads the running version from the container environment", () => {
    expect(parseEnvValue("PATH=/usr/bin\nFMKJ_VERSION=v0.3.0\n", "FMKJ_VERSION")).toBe("v0.3.0")
    expect(parseEnvValue("FMKJ_VERSION=unknown\n", "FMKJ_VERSION")).toBe("unknown")
    expect(parseEnvValue("OTHER=1\n", "FMKJ_VERSION")).toBe("")
  })

  it("probes the database inside the compose service, without a connection string on the command line", () => {
    const probe = composeDatabaseProbe({ composeFile: "docker-compose.appliance.yml" })
    expect(probe.args.join(" ")).toContain("compose -f docker-compose.appliance.yml exec -T postgres")
    expect(probe.args.join(" ")).toContain("select 1")
    // 用户/库名由容器内的 shell 展开，命令行上看不到凭据。
    expect(probe.args.join(" ")).toContain('"$POSTGRES_USER"')
    expect(probe.args.join(" ")).not.toMatch(/password|secret/i)
  })

  it("keeps the external-database fallback probe connection string out of argv", () => {
    const probe = hostDatabaseProbe("postgresql://user:secret@db:5432/fmkj")
    expect(probe.args.join(" ")).toContain("select 1")
    // 连接串只能出现在子进程环境里，不能出现在 argv（宿主机 ps 可见）。
    expect(probe.args.join(" ")).not.toContain("secret")
    expect(probe.args).toContain("PGURL")
    expect(probe.env).toEqual({ PGURL: "postgresql://user:secret@db:5432/fmkj" })
  })
})

describe("本地设备备份", () => {
  it("validates retention and sanitizes the label into the directory name", () => {
    expect(() => parseBackupArgs(["--keep", "0"])).toThrow(/正整数/)
    const stamp = new Date("2026-10-21T11:22:33.000Z")
    expect(backupDirName(stamp, "before-v0.3.0")).toBe("20261021T112233Z-before-v0.3.0")
    // 「手动 备份/危险」共 8 个字符，全部替换成下划线，避免目录名里出现路径分隔符。
    expect(backupDirName(stamp, "手动 备份/危险")).toBe("20261021T112233Z-________")
  })

  it("prunes oldest backups first and ignores unrelated directories", () => {
    const entries = [
      "20261001T000000Z-a",
      "20261003T000000Z-c",
      "20261002T000000Z-b",
      "notes.txt",
    ]
    expect(retentionToDelete(entries, 2)).toEqual(["20261001T000000Z-a"])
    expect(retentionToDelete(entries, 5)).toEqual([])
  })

  it("accepts the appliance compose file and falls back to an external database only when needed", async () => {
    expect(parseBackupArgs(["--compose-file", "docker-compose.appliance.yml", "--database-service", "db"]))
      .toMatchObject({ composeFile: "docker-compose.appliance.yml", databaseService: "db" })
    vi.stubEnv("DATABASE_URL", "")
    // 编排文件不存在（外部库场景）时，没有连接串就必须明确失败，而不是备出一个空文件。
    await expect(resolveDatabaseAccess({
      composeFile: "does-not-exist.yml", databaseService: "postgres", databaseUrl: "",
    })).rejects.toThrow(/DATABASE_URL/)
    await expect(resolveDatabaseAccess({
      composeFile: "does-not-exist.yml", databaseService: "postgres",
      databaseUrl: "postgresql://user:secret@db:5432/fmkj",
    })).resolves.toMatchObject({ kind: "host" })
  })
})

describe("更新编排", () => {
  it("walks the fixed step order and never touches docker in a dry run", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "fmkj-update-"))
    cleanups.push(stateDir)
    const options = {
      ...parseUpdateArgs(["--to", "v0.3.0", "--dry-run", "--state-dir", stateDir]),
    }
    const state = await runUpdate(options, new Date("2026-10-21T11:22:33.000Z"), { log: () => {} })
    expect(state.steps.map((step: { id: string }) => step.id)).toEqual(STEP_ORDER)
    // 宿主机脚本要在动数据库之前同步，失败处置才是 restart-previous（安全）
    expect(STEP_ORDER.indexOf("scripts")).toBeLessThan(STEP_ORDER.indexOf("migrate"))
    expect(state.steps.every((step: { status: string }) => step.status === "skipped")).toBe(true)
    expect(state.status).toBe("succeeded")
    const written = JSON.parse(await readFile(join(stateDir, "update-state.json"), "utf8"))
    expect(written).toMatchObject({ target: "v0.3.0", image: "fmkj-v3:v0.3.0" })
  })
})
