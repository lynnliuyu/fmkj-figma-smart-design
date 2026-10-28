#!/usr/bin/env node
/**
 * 把某个项目从源库导出成一个可搬到设备的 SQL 分片（产品库之外的业务数据）。
 *
 * 为什么需要它：设备版**不走接口同步业务数据**（ADR 0010），搬项目只能靠备份/恢复这条路。
 * 整库恢复会把别人的项目一起带过去，所以这里按项目 id 定向导出相关表的行。
 *
 * 用法（在源库所在机器上执行，默认连本机的 fmkj-v3-db 容器）：
 *   node scripts/deploy/export-project-slice.mjs --list
 *   node scripts/deploy/export-project-slice.mjs --project "邦泰璟和" --out /tmp/bangtai.sql
 *
 * 生成的 SQL 用 COPY ... FROM stdin 装载，并在事务里临时关掉外键触发器
 * （projects 与 products 都有自引用/环状约束，按行定向装载会撞顺序问题）。
 * 目标库必须是**空项目**：同一项目 id 已存在时会主键冲突，脚本不做覆盖。
 */
import { execFile, spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 一个项目牵连到的表与过滤条件，顺序按依赖从父到子排。
 * 只包含「项目自己的东西」：产品库、设备类型、类别默认目录属于全局资料，不在这里搬。
 */
export function projectSliceTables(projectId) {
  if (!UUID.test(projectId)) throw new Error(`项目 id 不是合法 uuid：${projectId}`)
  const quotes = `SELECT id FROM quotes WHERE project_id='${projectId}'`
  return [
    {
      table: "users",
      where: `id IN (SELECT owner_id FROM projects WHERE id='${projectId}'`
        + ` UNION SELECT created_by FROM projects WHERE id='${projectId}')`,
    },
    { table: "projects", where: `id='${projectId}'` },
    { table: "project_point_map_designs", where: `project_id='${projectId}'` },
    { table: "project_point_map_versions", where: `project_id='${projectId}'` },
    { table: "project_deliveries", where: `project_id='${projectId}'` },
    { table: "project_members", where: `project_id='${projectId}'` },
    { table: "project_attachments", where: `project_id='${projectId}'` },
    { table: "project_site_photos", where: `project_id='${projectId}'` },
    { table: "project_product_prices", where: `project_id='${projectId}'` },
    { table: "project_category_default_products", where: `project_id='${projectId}'` },
    { table: "quotes", where: `project_id='${projectId}'` },
    { table: "quote_items", where: `quote_id IN (${quotes})` },
    {
      table: "activity_logs",
      where: `entity_id='${projectId}'::uuid OR entity_id IN (${quotes})`,
    },
  ]
}

export function parseExportArgs(argv) {
  const options = {
    project: "",
    out: "",
    container: process.env.FMKJ_SOURCE_CONTAINER || "fmkj-v3-db",
    database: process.env.FMKJ_SOURCE_DATABASE || "fmkj",
    user: process.env.FMKJ_SOURCE_USER || "postgres",
    list: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--project") options.project = argv[++index]
    else if (arg === "--out") options.out = argv[++index]
    else if (arg === "--container") options.container = argv[++index]
    else if (arg === "--database") options.database = argv[++index]
    else if (arg === "--user") options.user = argv[++index]
    else if (arg === "--list") options.list = true
  }
  if (!options.list && !options.project) throw new Error("缺少 --project <项目名或 id>（用 --list 先看有哪些项目）")
  return options
}

async function psql(options, sql) {
  const { stdout } = await execFileAsync(
    "docker",
    ["exec", options.container, "psql", "-U", options.user, "-d", options.database, "-tAc", sql],
    { maxBuffer: 64 * 1024 * 1024 },
  )
  return stdout.trim()
}

/** 把 psql 的 COPY TO STDOUT 结果原样写进文件：大字段（底图、交付快照）不能进内存。 */
async function copyToFile(options, table, where, stream) {
  // 必须用 spawn 而不是 execFile：交付快照单项目就有几十 MB，execFile 的 stdout 缓冲会直接爆掉。
  await new Promise((resolveDone, rejectDone) => {
    const child = spawn(
      "docker",
      [
        "exec", options.container,
        "psql", "-U", options.user, "-d", options.database,
        "-c", `COPY (SELECT * FROM ${table} WHERE ${where}) TO STDOUT`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    )
    let stderr = ""
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", rejectDone)
    child.on("close", (code) => {
      if (code !== 0) rejectDone(new Error(`${table} 导出失败：${stderr.trim().slice(0, 300)}`))
      else resolveDone()
    })
    child.stdout.pipe(stream, { end: false })
  })
}

async function streamWrite(stream, text) {
  if (!stream.write(text)) await new Promise((done) => stream.once("drain", done))
}

async function listProjects(options) {
  const rows = await psql(options, "SELECT id || ' | ' || name FROM projects ORDER BY created_at")
  console.log(rows || "（源库里没有项目）")
}

async function exportSlice(options) {
  const target = options.project
  const resolved = UUID.test(target)
    ? target
    : await psql(options, `SELECT id FROM projects WHERE name = '${target.replace(/'/g, "''")}' LIMIT 1`)
  if (!resolved || !UUID.test(resolved)) throw new Error(`找不到项目：${target}（用 --list 看名称）`)

  const name = await psql(options, `SELECT name FROM projects WHERE id='${resolved}'`)
  const out = resolve(options.out || `project-slice-${resolved}.sql`)
  await mkdir(dirname(out), { recursive: true })

  const stream = createWriteStream(out)
  const counts = []
  await streamWrite(stream, "BEGIN;\nSET session_replication_role = replica;\n")
  for (const { table, where } of projectSliceTables(resolved)) {
    const rows = Number(await psql(options, `SELECT count(*) FROM ${table} WHERE ${where}`) || 0)
    counts.push({ table, rows })
    await streamWrite(stream, `COPY ${table} FROM stdin;\n`)
    await copyToFile(options, table, where, stream)
    await streamWrite(stream, "\\.\n")
  }
  await streamWrite(stream, "SET session_replication_role = DEFAULT;\nCOMMIT;\n")
  await new Promise((done) => stream.end(done))

  // 过滤器里的 id 也可能为空集，写出来让人一眼看到搬了什么、什么没搬。
  console.log(`项目：${name}（${resolved}）`)
  console.log(`导出：${out}`)
  for (const { table, rows } of counts) console.log(`  ${rows.toString().padStart(6)}  ${table}`)
  return { out, resolved, counts }
}

async function main() {
  const options = parseExportArgs(process.argv.slice(2))
  if (options.list) {
    await listProjects(options)
    return
  }
  await exportSlice(options)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
