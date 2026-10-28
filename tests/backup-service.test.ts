import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Writable } from "node:stream"
import { gzipSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"

import { tarHeader } from "../lib/backup-archive"
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, restoreBackup, schemaDigest, type BackupManifest } from "../lib/backup-service"

const COLUMNS = [
  { table_name: "projects", column_name: "name", data_type: "text", is_nullable: "NO", column_default: "" },
  { table_name: "users", column_name: "name", data_type: "text", is_nullable: "NO", column_default: "" },
]
const CSV = { projects: "name\n示例客户项目\n", users: "name\n示例账号\n" }

function database() {
  const statements: string[] = []
  const copied: string[] = []
  const release = vi.fn()
  const connect = vi.fn(async () => ({
    query(sql: unknown) {
      if (typeof sql === "string") {
        statements.push(sql)
        return Promise.resolve({ rows: [] })
      }
      return new Writable({ write(chunk, _encoding, done) { copied.push(chunk.toString()); done() } })
    },
    release,
  }))
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("information_schema.columns")) return { rows: COLUMNS }
    if (sql.includes("information_schema.tables")) return { rows: [{ table_name: "projects" }, { table_name: "users" }, { table_name: "schema_migrations" }] }
    throw new Error(`Unexpected database call: ${sql}`)
  })
  return { db: { connect, query } as never, connect, copied, release, statements }
}

async function fixture(tables = ["projects", "users"]): Promise<BackupManifest> {
  return {
    appVersion: "v0.3.5", createdAt: "2026-10-23T00:00:00.000Z", database: "synthetic", fileStorage: "local",
    format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, schemaDigest: await schemaDigest({ db: database().db }),
    tables: tables.map((name) => {
      const csv = CSV[name as keyof typeof CSV]
      return { name, rows: 1, bytes: Buffer.byteLength(csv), sha256: createHash("sha256").update(csv).digest("hex") }
    }),
    tablesSkipped: [], uploads: { files: 0, bytes: 0 },
  }
}

function archive(manifest: unknown, contents: Record<string, string> = CSV, uploads: Array<[string, string | Buffer]> = []): Buffer {
  const files: Array<[string, string | Buffer]> = [["manifest.json", JSON.stringify(manifest)], ...Object.entries(contents).map(([name, csv]): [string, string] => [`database/${name}.csv`, csv]), ...uploads]
  const blocks = files.flatMap(([name, text]) => {
    const content = Buffer.isBuffer(text) ? text : Buffer.from(text)
    return [tarHeader(name, content.byteLength), content, Buffer.alloc((512 - content.byteLength % 512) % 512)]
  })
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

function appleDouble(): Buffer {
  const metadata = Buffer.alloc(70)
  metadata.writeUInt32BE(0x00051607, 0)
  metadata.writeUInt32BE(0x00020000, 4)
  metadata.write("Mac OS X        ", 8, "ascii")
  metadata.writeUInt16BE(1, 24)
  metadata.writeUInt32BE(9, 26) // FinderInfo
  metadata.writeUInt32BE(38, 30)
  metadata.writeUInt32BE(32, 34)
  return metadata
}

describe("整库恢复必须使用完整备份", () => {
  it("在连接写入事务之前拒绝导出时跳过任何表的备份", async () => {
    const db = database()
    const manifest = await fixture(["projects"])
    manifest.tablesSkipped = ["users"]

    await expect(restoreBackup(archive(manifest), { db: db.db })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("导出时这些表没有备份成功：users") })
    expect(db.connect).not.toHaveBeenCalled()
    expect(db.statements).toEqual([])
  })

  it("即使跳过清单被清空，也不能用缺表的备份清空现有资料", async () => {
    const db = database()
    await expect(restoreBackup(archive(await fixture(["projects"])), { db: db.db })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("缺少这些表：users") })
    expect(db.connect).not.toHaveBeenCalled()
  })

  it("不接受空表清单，避免把整库变为空库", async () => {
    const db = database()
    await expect(restoreBackup(archive(await fixture([])), { db: db.db })).rejects.toThrow("缺少这些表：projects、users")
    expect(db.connect).not.toHaveBeenCalled()
  })

  it("不接受缺失的导出状态或重复的表清单", async () => {
    const db = database()
    const manifest = await fixture()
    const withoutSkipped: Partial<BackupManifest> = { ...manifest }
    delete withoutSkipped.tablesSkipped
    await expect(restoreBackup(archive(withoutSkipped), { db: db.db })).rejects.toThrow("清单不完整")
    manifest.tables.push(manifest.tables[0])
    await expect(restoreBackup(archive(manifest), { db: db.db })).rejects.toThrow("重复包含 projects")
    expect(db.connect).not.toHaveBeenCalled()
  })

  it("缺少表文件或内容损坏时也在写入前停止", async () => {
    const db = database()
    const manifest = await fixture()
    await expect(restoreBackup(archive(manifest, { projects: CSV.projects }), { db: db.db })).rejects.toThrow("缺少 users 的内容")
    await expect(restoreBackup(archive(manifest, { ...CSV, users: "name\n被改动\n" }), { db: db.db })).rejects.toThrow("users 内容与清单不一致")
    expect(db.connect).not.toHaveBeenCalled()
  })

  it("完整备份仍能整体恢复，并保留迁移账本", async () => {
    const db = database()
    const result = await restoreBackup(archive(await fixture()), { db: db.db, env: { FILE_STORAGE: "local" } })
    expect(result).toMatchObject({ rows: 2, tables: ["projects", "users"], warnings: [] })
    expect(db.statements).toEqual(["begin", "set local session_replication_role = replica", 'truncate "projects", "users" cascade', "commit"])
    expect(db.copied).toEqual(Object.values(CSV))
    expect(db.release).toHaveBeenCalledOnce()
  })

  it("附件缺失或长度不符时，在替换数据库前停止", async () => {
    const db = database()
    const manifest = await fixture()
    manifest.uploads = { files: 1, bytes: 5 }
    await expect(restoreBackup(archive(manifest), { db: db.db })).rejects.toThrow(/附件.*不一致|附件.*不完整/)
    await expect(restoreBackup(archive(manifest, CSV, [["uploads/p/a.txt", "shorter"]]), { db: db.db })).rejects.toThrow(/附件.*不一致|附件.*不完整/)
    expect(db.connect).not.toHaveBeenCalled()
  })

  it("附件清单缺失和重名附件都不能造成部分还原", async () => {
    const db = database()
    const manifest = await fixture()
    const broken: Partial<BackupManifest> = { ...manifest }
    delete broken.uploads
    await expect(restoreBackup(archive(broken), { db: db.db })).rejects.toThrow(/附件.*清单/)
    manifest.uploads = { files: 2, bytes: 10 }
    await expect(restoreBackup(archive(manifest, CSV, [["uploads/p/a.txt", "first"], ["uploads/p/a.txt", "later"]]), { db: db.db })).rejects.toThrow(/重复.*附件|附件.*重复/)
    expect(db.connect).not.toHaveBeenCalled()
  })

  it("macOS重打包附带的合法配套AppleDouble元数据不计作业务附件，也不写回", async () => {
    const db = database()
    const manifest = await fixture()
    manifest.uploads = { files: 1, bytes: 5 }
    const root = await mkdtemp(join(tmpdir(), "fmkj-restore-macos-"))
    try {
      const result = await restoreBackup(archive(manifest, CSV, [
        ["uploads/p/._a.txt", appleDouble()], ["uploads/p/a.txt", "hello"],
      ]), { db: db.db, env: { FILE_STORAGE: "local" }, storageRoot: root })
      expect(result.uploads).toEqual({ files: 1, warning: null })
      expect(await readFile(join(root, "p/a.txt"), "utf8")).toBe("hello")
      expect(await readdir(join(root, "p"))).toEqual(["a.txt"])
      expect(db.statements.at(-1)).toBe("commit")
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("用系统tar重新打包后仍能还原真实附件，兼容系统附带的元数据", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmkj-restore-tar-"))
    try {
      const source = join(root, "source")
      const restored = join(root, "restored")
      await mkdir(join(source, "database"), { recursive: true })
      await mkdir(join(source, "uploads/p"), { recursive: true })
      const manifest = await fixture()
      manifest.uploads = { files: 1, bytes: 5 }
      await writeFile(join(source, "manifest.json"), JSON.stringify(manifest))
      for (const [table, csv] of Object.entries(CSV)) await writeFile(join(source, `database/${table}.csv`), csv)
      await writeFile(join(source, "uploads/p/普通附件.txt"), "hello")
      const env = { ...process.env }
      delete env.COPYFILE_DISABLE
      const repacked = execFileSync("tar", ["--format", "pax", "-czf", "-", "-C", source,
        "manifest.json", "database/projects.csv", "database/users.csv", "uploads/p/普通附件.txt"], { env })
      const result = await restoreBackup(repacked, { db: database().db, env: { FILE_STORAGE: "local" }, storageRoot: restored })
      expect(result.uploads).toEqual({ files: 1, warning: null })
      expect(await readFile(join(restored, "p/普通附件.txt"), "utf8")).toBe("hello")
      expect(await readdir(join(restored, "p"))).toEqual(["普通附件.txt"])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("._名称不能掩盖额外文件，孤立或损坏的AppleDouble也不能被忽略", async () => {
    const db = database()
    const manifest = await fixture()
    manifest.uploads = { files: 1, bytes: 5 }
    const invalid = appleDouble()
    invalid.writeUInt32BE(999, 34) // 声明的数据已超出实际内容
    for (const content of [Buffer.from("ordinary file"), invalid]) {
      await expect(restoreBackup(archive(manifest, CSV, [["uploads/p/a.txt", "hello"], ["uploads/p/._a.txt", content]]), { db: db.db })).rejects.toThrow(/附件.*不一致/)
    }
    manifest.uploads = { files: 0, bytes: 0 }
    await expect(restoreBackup(archive(manifest, CSV, [["uploads/p/._missing.txt", appleDouble()]]), { db: db.db })).rejects.toThrow(/附件.*不一致/)
    expect(db.connect).not.toHaveBeenCalled()
  })

  it("对象存储的零附件备份正常完成，不误报附件待处理", async () => {
    const result = await restoreBackup(archive({ ...await fixture(), fileStorage: "blob" }), { db: database().db, env: { FILE_STORAGE: "blob" } })
    expect(result.uploads).toEqual({ files: 0, warning: null })
    expect(result.warnings).toEqual([])
  })
})
