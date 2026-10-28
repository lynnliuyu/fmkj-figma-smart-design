import { createRequire } from "node:module"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import nextConfig from "../next.config.mjs"
import { checkBuildTraces } from "../scripts/deploy/check-build-traces.mjs"

// Exercise the same matcher and options that Next uses to filter trace lists.
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch")
const cleanups: string[] = []
afterEach(async () => { await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

async function fixture(tracedFiles: string[], standaloneFiles: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), "fmkj-build-tracing-"))
  cleanups.push(root)
  const trace = join(root, ".next/server/app/api/projects/[id]/deliveries/route.js.nft.json")
  await mkdir(dirname(trace), { recursive: true })
  await writeFile(trace, JSON.stringify({ version: 1, files: tracedFiles.map((file) => relative(dirname(trace), join(root, file))) }))
  const standalone = join(root, ".next/standalone")
  await mkdir(standalone, { recursive: true })
  for (const file of standaloneFiles) {
    const pathname = join(standalone, file)
    await mkdir(dirname(pathname), { recursive: true })
    await writeFile(pathname, "synthetic")
  }
  return root
}

describe("standalone private build artifacts", () => {
  it("applies root-only private exclusions to every route while retaining assets and dependency dist folders", () => {
    const root = resolve(".")
    const rules = nextConfig.outputFileTracingExcludes ?? {}
    for (const route of ["/", "/point-map", "/api/projects/[id]/deliveries", "/api/projects/[id]/deliveries/[deliveryId]"]) {
      const patterns = Object.entries(rules).filter(([glob]) => picomatch(glob, { dot: true, contains: true })(route)).flatMap(([, patterns]) => patterns)
      const isExcluded = picomatch(patterns.map((pattern) => join(root, pattern)), { dot: true, contains: true })
      for (const file of ["output/customer.pdf", ".local/credentials.json", "tmp/preview.png", "dist/fmkj-install/install.sh", "backups/customer.dump", "docs/architecture-data/project.json", ".env.local", ".git/config", "config/mcporter.json"]) expect(isExcluded(join(root, file)), `${route}: ${file}`).toBe(true)
      for (const file of ["public/assets/products/photo.png", "public/assets/proposals/photo.jpg", "node_modules/next/dist/server/next-server.js", "node_modules/.pnpm/example/node_modules/example/dist/index.js"]) expect(isExcluded(join(root, file)), `${route}: ${file}`).toBe(false)
    }
  })

  it("detects private files in both trace manifests and the standalone result", async () => {
    const root = await fixture(["output/customer.pdf", "dist/fmkj-install/install.sh", "public/assets/product.png"], [".local/credentials.json", "docs/architecture-data/customer.json", ".env.production"])
    const result = await checkBuildTraces({ root })
    expect(result.traceCount).toBe(1)
    expect(result.privateFiles.map((file) => file.path)).toEqual(expect.arrayContaining(["output/customer.pdf", "dist/fmkj-install/install.sh", ".local/credentials.json", "docs/architecture-data/customer.json", ".env.production"]))
    expect(result.privateFiles).toHaveLength(5)
  })

  it("accepts required static assets and dependency distribution files", async () => {
    const root = await fixture(["public/assets/product.png", "node_modules/next/dist/server/next-server.js"], ["public/assets/product.png", "node_modules/.pnpm/pkg/node_modules/pkg/dist/index.js", "server.js"])
    expect(await checkBuildTraces({ root })).toEqual({ traceCount: 1, tracedFileCount: 2, privateFiles: [] })
  })

  it("does not report an absent build as checked", async () => {
    const root = await fixture([])
    await rm(join(root, ".next/server"), { recursive: true })
    await expect(checkBuildTraces({ root })).rejects.toThrow("请先完成 pnpm build")
  })
})
