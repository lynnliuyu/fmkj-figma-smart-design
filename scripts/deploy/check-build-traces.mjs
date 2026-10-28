#!/usr/bin/env node
/** Read-only check of Next's trace lists and the resulting standalone package. */
import { readdir, readFile, stat } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { isPrivateBuildPath } from "../../lib/build-artifact-policy.mjs"

async function* filesIn(directory, skipDirectories = new Set()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!skipDirectories.has(entry.name)) yield* filesIn(path, skipDirectories)
    } else yield path
  }
}

export async function checkBuildTraces({ root = process.cwd(), buildDirectory = ".next" } = {}) {
  root = resolve(root)
  const build = resolve(root, buildDirectory)
  const privateFiles = []
  let traceCount = 0
  let tracedFileCount = 0
  for await (const traceFile of filesIn(build, new Set(["standalone", "cache", "dev", "static"]))) {
    if (!traceFile.endsWith(".nft.json")) continue
    const trace = JSON.parse(await readFile(traceFile, "utf8"))
    if (!Array.isArray(trace.files) || trace.files.some((entry) => typeof entry !== "string")) throw new Error(`无效的构建文件清单：${relative(root, traceFile)}`)
    traceCount++
    for (const entry of trace.files) {
      tracedFileCount++
      const pathname = relative(root, resolve(dirname(traceFile), entry))
      if (isPrivateBuildPath(pathname)) privateFiles.push({ source: relative(root, traceFile), path: pathname })
    }
  }
  if (!traceCount) throw new Error("没有找到构建文件清单，请先完成 pnpm build。")
  const standalone = join(build, "standalone")
  if (!(await stat(standalone).catch(() => null))?.isDirectory()) throw new Error("没有找到 standalone 成品，请先完成 pnpm build。")
  for await (const file of filesIn(standalone)) {
    const pathname = relative(standalone, file)
    if (isPrivateBuildPath(pathname)) privateFiles.push({ source: relative(root, standalone), path: pathname })
  }
  return { traceCount, tracedFileCount, privateFiles }
}

async function main() {
  const result = await checkBuildTraces()
  if (result.privateFiles.length) {
    console.error(`构建成品含 ${result.privateFiles.length} 条本机私有资料引用，请勿分发。`)
    for (const entry of result.privateFiles.slice(0, 30)) console.error(`${entry.source}: ${entry.path}`)
    process.exitCode = 1
  } else console.log(`构建资料检查通过：${result.traceCount} 份清单、${result.tracedFileCount} 条文件引用，未包含本机私有目录或环境文件。`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
