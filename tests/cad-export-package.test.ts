import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateRawSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"
import { PACKAGE_MODES, packageExport, pageStems, safeName, splitLabels, zipBuffer } from "../scripts/cad-export-package.mjs"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

/** 独立解析 ZIP（只用 Node zlib），用于反向验证写入器。 */
function readZip(buffer: Buffer) {
  const entries: { name: string; data: Buffer }[] = []
  let offset = 0
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8)
    const size = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8")
    const start = offset + 30 + nameLength + extraLength
    const body = buffer.subarray(start, start + size)
    entries.push({ name, data: method === 8 ? inflateRawSync(body) : Buffer.from(body) })
    offset = start + size
  }
  return entries
}

describe("CAD 单张交付整理", () => {
  it("图号与图名分独立标签或同一标签都能拆开", () => {
    expect(splitLabels(["P-09", "灯具定位图"])).toEqual({ number: "P-09", name: "灯具定位图" })
    expect(splitLabels(["平面布置图", "P-04"])).toEqual({ number: "P-04", name: "平面布置图" })
    expect(splitLabels(["PM-15 富二楼顶面布置图"])).toEqual({ number: "PM-15", name: "富二楼顶面布置图" })
    expect(splitLabels(["灯具布置图"])).toEqual({ number: "", name: "灯具布置图" })
    expect(splitLabels([])).toEqual({ number: "", name: "" })
  })

  it("重名页各自成文件并加页号，不互相覆盖", () => {
    const manifest = { sheets: [
      { id: "page-002", labels: ["YS-02 富一楼原始结构图"] },
      { id: "page-005", labels: ["YS-02 富一楼原始结构图"] },
      { id: "page-003", labels: ["PM-13 富二楼平面布置图"] },
    ] }
    const stems = pageStems(manifest).map((item: { stem: string }) => item.stem)
    expect(stems).toEqual(["YS-02-富一楼原始结构图", "YS-02-富一楼原始结构图-page-005", "PM-13-富二楼平面布置图"])
    expect(new Set(stems).size).toBe(3)
  })

  it("文件名去掉路径分隔符与保留字符", () => {
    expect(safeName("a/b\\c:d*e?f\"g<h>i|j")).toBe("abcdefghij")
    expect(safeName("  P-04 平面布置图 ")).toBe("P-04平面布置图")
  })

  it("生成的 ZIP 能被独立解析回原始字节（含中文文件名）", () => {
    const entries = [
      { name: "P-04-平面布置图.png", data: Buffer.from("png-bytes-".repeat(500)) },
      { name: "P-04-平面布置图.pdf", data: Buffer.from("%PDF-1.7 tiny") },
      { name: "空文件.txt", data: Buffer.alloc(0) },
    ]
    const zip = zipBuffer(entries)
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50)
    const parsed = readZip(zip)
    expect(parsed.map(item => item.name)).toEqual(entries.map(item => item.name))
    for (const [index, item] of parsed.entries()) expect(item.data.equals(entries[index].data)).toBe(true)
  })

  it("整理出单页图片、单页 PDF、每页压缩包、整套与清单", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-package-")); roots.push(root)
    const source = join(root, "export"); await mkdir(source)
    const sheet = (id: string, labels: string[]) => ({ id, kind: "sheet", space: "Model", labels, pdf: `${id}.pdf`, png: `${id}.png`, originalPdf: `${id}.original.pdf`, originalPng: `${id}.original.png` })
    const manifest = {
      format: "fmkj-cad-review", version: 3, colorMode: "readable", sourceName: "客户图纸.dwg", sourceSha256: "a".repeat(64),
      createdAt: "2026-10-21T00:00:00.000Z", completeness: "requires-human-review", combinedPdf: "all-pages.pdf",
      overviews: [], sheets: [sheet("page-002", ["YS-02 富一楼原始结构图"]), sheet("page-005", ["YS-02 富一楼原始结构图"])], warnings: [],
    }
    await writeFile(join(source, "manifest.json"), JSON.stringify(manifest))
    for (const page of manifest.sheets) for (const name of [page.pdf, page.png, page.originalPdf, page.originalPng]) await writeFile(join(source, name), `${name} bytes`)
    await writeFile(join(source, "all-pages.pdf"), "combined")

    const out = join(root, "交付")
    const result = await packageExport(source, out, PACKAGE_MODES)
    expect(result.pages).toBe(2)
    expect(result.written).toEqual({ png: 4, pdf: 4, zip: 2, set: 3 })
    // 每页一个压缩包，内含该页两种配色的 PNG 与 PDF。
    const pageZip = readZip(await readFile(join(out, "单页压缩包", "YS-02-富一楼原始结构图.zip")))
    expect(pageZip.map(item => item.name).sort()).toEqual([
      "YS-02-富一楼原始结构图-原色.pdf", "YS-02-富一楼原始结构图-原色.png",
      "YS-02-富一楼原始结构图.pdf", "YS-02-富一楼原始结构图.png",
    ])
    // 重复图名各自成文件。
    expect(await readFile(join(out, "单页图片", "YS-02-富一楼原始结构图-page-005.png"), "utf8")).toBe("page-005.png bytes")
    // 整套含合并 PDF，清单 CSV 带 BOM 且记录图号。
    expect(await readFile(join(out, "整套", "全部图纸-合并.pdf"), "utf8")).toBe("combined")
    const csv = await readFile(join(out, "清单.csv"), "utf8")
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain('"YS-02","富一楼原始结构图","page-002"')
  })

  it("没有逐页图框时明确报错，不产出空交付目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-package-empty-")); roots.push(root)
    const source = join(root, "export"); await mkdir(source)
    await writeFile(join(source, "manifest.json"), JSON.stringify({ sheets: [], overviews: [{ id: "overview-01" }], sourceName: "x.dwg" }))
    await expect(packageExport(source, join(root, "out"))).rejects.toThrow("没有逐页图框")
  })
})
