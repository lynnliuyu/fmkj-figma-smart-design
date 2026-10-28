import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cadReviewHtml, detectCadReviewSheets, exportCadReview, parseCadReviewArgs, readTitleAnnotations, viewportModelWindow } from "../scripts/export-cad-review.mjs"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const frame = (handle = "a", x = 0) => ({ handle, layer: "BS-图框", visible: true, geometry: { type: "insert" }, bounds: [[x, 0], [x + 420, 297]] })
const text = (value: string, x = 20) => ({ layer: "BS-图框", geometry: { type: "text", value, insert: { x, y: 20 } } })
const vp = (handle = "v", x = 10) => ({ handle, geometry: { type: "viewport", center: { x: x + 100, y: 150 }, width: 180, height: 200, viewHeight: 10000, viewCenter: { x: 50000, y: 60000 }, frozenLayers: ["家具"] }, bounds: [[x, 30], [x + 180, 270]] })

describe("CAD 原图对照", () => {
  it("同名同编号的旧方案保留为不同图框，原始 CAD 范围不会按插入点猜测", () => {
    const pages = detectCadReviewSheets("Model", [text("P-01"), text("P-01", 1020)], [frame("a"), frame("b", 1000)])
    expect(pages.map((p: { handle: string }) => p.handle)).toEqual(["a", "b"])
    expect(pages.map((p: { labels: string[] }) => p.labels)).toEqual([["P-01"], ["P-01"]])
    expect(pages[0].bounds).toEqual([[0, 0], [420, 297]])
  })
  it("布局内一个图框的多个视口不被拆成多页，非图框层上的图框可识别", () => {
    const paperFrame = { ...frame(), layer: "D-弱电" }
    const sheets = detectCadReviewSheets("平面图", [text("灯控图")], [paperFrame, vp(), vp("v2", 210)])
    expect(sheets).toHaveLength(1)
    expect(sheets[0].viewports.map((v: { handle: string }) => v.handle)).toEqual(["v", "v2"])
    expect(sheets[0].viewports[0].frozenLayers).toEqual(["家具"])
    expect(detectCadReviewSheets("Model", [], [paperFrame])).toEqual([])
  })
  it("排除图纸空间相机和退化视口，按视口比例还原模型窗口", () => {
    expect(viewportModelWindow(vp())).toEqual([[45500, 55000], [54500, 65000]])
    expect(viewportModelWindow({ geometry: { ...vp().geometry, viewCenter: vp().geometry.center, viewHeight: 200 } })).toBeNull()
    expect(viewportModelWindow({ geometry: { ...vp().geometry, height: 0 } })).toBeNull()
    expect(detectCadReviewSheets("Model", [], [{ ...frame(), bounds: [[0, 0], [NaN, 20]] }])).toEqual([])
  })
  it("图层 0 上按出图比例绘制的图框可识别，图名取自图名标注块属性", () => {
    // 1 unit = 28.25 mm (1:80 sheet): the A1 frame is 33901 x 23760 units, not mm.
    const scale = 28.25
    const frameAt = (handle: string, x: number, y: number) => ({ handle, layer: "0", visible: true, geometry: { type: "insert" }, bounds: [[x, y], [x + 841 * scale, y + 594 * scale]] })
    const titleBlock = (handle: string, x: number, y: number, name: string, number: string) => ({ handle, layer: "B-1.图名标注", geometry: { type: "insert", insert: { x, y }, attribs: [{ tag: "图名1", text: { value: name } }, { tag: "编号", text: { value: number } }, { tag: "图名", text: { value: "原始结构图" } }] } })
    // A furniture block with the same proportions but no title must not become a page.
    const furniture = { handle: "f", layer: "0", visible: true, geometry: { type: "insert" }, bounds: [[100, 100], [100 + 841 * scale, 100 + 594 * scale]] }
    const frames = [frameAt("a", 0, 0), frameAt("b", 2000, 0)]
    const titles = readTitleAnnotations([titleBlock("t1", 0, 0, "富二楼顶面布置图", "PM-15"), titleBlock("t2", 2000, 0, "富一楼平面布置图", "PM-19")])
    expect(titles.map(title => title.text)).toEqual(["PM-15 富二楼顶面布置图", "PM-19 富一楼平面布置图"])
    const sheets = detectCadReviewSheets("Model", [titleBlock("t1", 0, 0, "富二楼顶面布置图", "PM-15"), titleBlock("t2", 2000, 0, "富一楼平面布置图", "PM-19")], [...frames, furniture], titles)
    expect(sheets.map((sheet: { handle: string }) => sheet.handle)).toEqual(["a", "b"])
    expect(sheets.map((sheet: { labels: string[] }) => sheet.labels)).toEqual([["PM-15 富二楼顶面布置图"], ["PM-19 富一楼平面布置图"]])
  })
  it("通用图层上没有图名的等比例块不会被当成图框", () => {
    const bare = { handle: "x", layer: "0", visible: true, geometry: { type: "insert" }, bounds: [[0, 0], [420, 297]] }
    expect(detectCadReviewSheets("Model", [], [bare, { ...bare, handle: "y", bounds: [[500, 0], [920, 297]] }])).toEqual([])
  })
  it("图中文字只作为数据，不进入 HTML 或脚本执行", () => {
    const html = cadReviewHtml({ sourceName: "<img src=x onerror=alert(1)>", overviews: [], sheets: [{ id: "page-001", space: "Model", labels: ["</script><script>alert(1)</script>"], pdf: "page-001.pdf", png: "page-001.png", warning: "<script>bad</script>" }] })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;img")
    expect(html).toContain("\\u003cscript>")
    expect(html).toContain("图框识别不是完整性确认")
  })
  it("拒绝缺值、重复、未知参数，不把任意命令当成 CLI 参数", () => {
    expect(parseCadReviewArgs(["--help"])).toEqual({ help: true })
    expect(() => parseCadReviewArgs(["--source", "x.dwg"])).toThrow()
    expect(() => parseCadReviewArgs(["--source", "x.dwg", "--source", "y.dwg", "--out-dir", "new"])).toThrow()
    expect(() => parseCadReviewArgs(["--command", "erase"])).toThrow()
    expect(parseCadReviewArgs(["--source", "x.dwg", "--out-dir", "new"]).colorMode).toBe("readable")
    expect(() => parseCadReviewArgs(["--source", "x.dwg", "--out-dir", "new", "--color-mode", "unknown"])).toThrow()
  })
  it("默认导出在栅格化前应用阅读配色，保留原色文件供切换", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-readable-test-")); roots.push(root)
    const source = join(root, "source.dwg"), outDir = join(root, "out"); await writeFile(source, "source")
    const rasterized: string[] = []
    const result = await exportCadReview({ source, outDir }, {
      readViewports: async () => ({ viewports: new Map(), warnings: [] }), createClient: () => ({ async initialize() {}, async close() {}, async tool(name: string) { return name === "query_entities" ? { count: 0, entities: [] } : {} }, async execute(name: string, args: Record<string, unknown>) { if (name === "layout.list") return []; if (name === "exportpdf") await writeFile(String(args.path), "native bright yellow"); return {} } }),
      readablePdf: async (input: string, output: string) => { expect(await readFile(input, "utf8")).toBe("native bright yellow"); await writeFile(output, "dark reading palette") },
      rasterize: async (input: string, output: string) => { rasterized.push(await readFile(input, "utf8")); await writeFile(output, "rendered") },
    })
    expect(result.colorMode).toBe("readable")
    expect(rasterized).toEqual(["native bright yellow", "dark reading palette"])
    expect(await readFile(join(outDir, "overview-01.original.pdf"), "utf8")).toBe("native bright yellow")
    const html = await readFile(join(outDir, "index.html"), "utf8")
    expect(html).toContain('id="palette"')
    expect(html).toContain("清晰黑白（推荐）")
    expect(html).toContain("overview-01.original.png")
  })
  it("完整出口用只读副本，产物带来源摘要；已有目录拒绝覆盖", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-review-test-")); roots.push(root)
    const source = join(root, "客户.dwg"), outDir = join(root, "out")
    await writeFile(source, "synthetic source")
    let closed = false
    const calls: string[] = []
    const client = {
      async initialize() {}, async close() { closed = true },
      async tool(name: string, args: Record<string, unknown>) {
        calls.push(name)
        if (name === "open") { expect(args.path).not.toBe(source); expect((await stat(String(args.path))).mode & 0o777).toBe(0o400); return {} }
        if (name === "query_entities") return { count: 0, entities: [] }
        throw new Error(name)
      },
      async execute(name: string, args: Record<string, unknown>) {
        calls.push(name)
        if (name === "layout.list") return []
        if (name === "layout.set") return {}
        if (name === "exportpdf") { await writeFile(String(args.path), "%PDF-synthetic"); return {} }
        throw new Error(name)
      },
    }
    const result = await exportCadReview({ source, outDir, colorMode: "original" }, { readViewports: async () => ({ viewports: new Map(), warnings: [] }), createClient: () => client, rasterize: async (_pdf: string, png: string) => writeFile(png, "synthetic PNG") })
    expect(closed).toBe(true)
    expect(calls).not.toContain("pagesetup") // CADCraft cannot persist Model page setups.
    expect(result.completeness).toBe("requires-human-review")
    expect(result.overviews).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
    expect(await readFile(source, "utf8")).toBe("synthetic source")
    expect((await readdir(outDir)).some(p => p.startsWith(".cad-review-"))).toBe(false)
    await expect(exportCadReview({ source, outDir, colorMode: "original" })).rejects.toThrow()
  })
  it("含图块裁剪时使用原始 DXF 渲染，不能退回丢失裁剪的 CADCraft PDF", async () => {
    const root = await mkdtemp(join(tmpdir(),"cad-clipping-export-")); roots.push(root)
    const source=join(root,"source.dwg"),outDir=join(root,"out");await writeFile(source,"synthetic DWG")
    let rendered=false
    const result=await exportCadReview({source,outDir},{
      readViewports:async()=>({viewports:new Map(),warnings:[],renderDxf:Buffer.from("original DXF with SPATIAL_FILTER"),spatialFilterCount:1}),
      createClient:()=>({async initialize(){},async close(){},async tool(name: string){return name === "query_entities" ? {count:0,entities:[]} : {}},async execute(name: string){if(name === "layout.list")return [];if(name === "exportpdf")throw new Error("Lossy native rendering must not run");return {}}}),
      readablePdf:async()=>{},
      renderClipped:async(m: {overviews: {pdf: string;png: string;originalPdf: string;originalPng: string}[]},path: string,_metadata: unknown,_staging: string,output: string)=>{rendered=true;expect(await readFile(path,"utf8")).toContain("SPATIAL_FILTER");for(const p of m.overviews)for(const file of [p.pdf,p.png,p.originalPdf,p.originalPng])await writeFile(join(output,file),"correct clipped output");return [{id:"overview-01"}]},
    })
    expect(rendered).toBe(true)
    expect(result.renderer).toBe("ezdxf-xclip")
  })
  it("明确指定布局时保留全图清单和原页号，裁剪路径不重复打开或修改 CAD", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-selected-space-")); roots.push(root)
    const source = join(root, "source.dwg"), outDir = join(root, "out"); await writeFile(source, "source")
    let space = "Model", opens = 0
    const viewport = vp()
    const metadata = { handle: "v", paperCenter: viewport.geometry.center, displayCenter: { x: 50000, y: 60000 }, targetPoint: { x: 0, y: 0, z: 0 }, viewDirection: { x: 0, y: 0, z: 1 }, twistAngle: 0, width: 180, height: 200, viewHeight: 10000, flags: 0, frozenLayers: ["家具"] }
    const result = await exportCadReview({ source, outDir, colorMode: "original", space: "平面图", includeOverviews: false }, {
      readViewports: async () => ({ viewports: new Map([["V", metadata]]), warnings: [], renderDxf: Buffer.from("preserved clipping"), spatialFilterCount: 1 }),
      createClient: () => ({ async initialize() {}, async close() {}, async tool(name: string, args: Record<string, unknown>) {
        if (name === "open") { opens++; return {} }
        if (name === "query_entities") return args.limit === 0 ? { count: 99, entities: [] } : { count: space === "Model" ? 1 : 3, entities: space === "Model" ? [frame("old")] : [frame("new"), viewport, text("平面布置图")] }
        throw new Error(name)
      }, async execute(name: string, args: Record<string, unknown>) {
        if (name === "layout.list") return [{ name: "平面图" }]
        if (name === "layout.set") { space = String(args.name); return {} }
        if (name === "viewport.set") return {}
        if (name === "properties") return { objects: space === "Model" ? [frame("old")] : [frame("new"), viewport] }
        throw new Error(name)
      } }),
      renderClipped: async (manifest: { sheets: { id: string; pdf: string; png: string }[] }, _source: string, _metadata: unknown, _staging: string, output: string) => {
        for (const page of manifest.sheets) { await writeFile(join(output, page.pdf), "PDF"); await writeFile(join(output, page.png), "PNG") }
        return manifest.sheets.map(page => ({ id: page.id }))
      },
    })
    expect(opens).toBe(1)
    expect(result.overviews).toHaveLength(0)
    expect(result.sheets.map((page: { id: string }) => page.id)).toEqual(["page-002"])
    expect(result.inventory.map((item: { space: string; sheets: unknown[] }) => [item.space, item.sheets.length])).toEqual([["Model", 1], ["平面图", 1]])
    expect(result.selection).toEqual({ space: "平面图", includeOverviews: false })
    expect(result.warnings.join(" ")).toContain("不代表整份原图已完整导出")
  })
  it("完整导出每次重开布局都恢复视口，并用世界坐标检查模型内容", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-viewports-export-")); roots.push(root)
    const source = join(root,"source.dwg"), outDir = join(root,"out"); await writeFile(source,"synthetic source")
    let space = "Model", restored = false, restores = 0
    const viewport = vp("A")
    const metadata = { handle:"A", paperCenter:viewport.geometry.center, displayCenter:{x:20,y:30}, targetPoint:{x:1000,y:2000,z:0}, viewDirection:{x:0,y:0,z:1}, twistAngle:0, width:180, height:200, viewHeight:10000, flags:0, frozenLayers:["灯控"] }
    const entities = [frame(),viewport,text("灯具定位图")]
    const client = {
      async initialize() {}, async close() {},
      async tool(name: string,args: Record<string, unknown>) {
        if (name === "open") { restored=false; return {} }
        if (name === "query_entities") {
          if (args.limit === 0) { expect(args.window).toEqual([[-3480,-2970],[5520,7030]]); return {count:1900,entities:[]} }
          return {count:space === "Model" ? 0 : entities.length,entities:space === "Model" ? [] : entities}
        }
        throw new Error(name)
      },
      async execute(name: string,args: Record<string, unknown>) {
        if(name === "layout.list")return [{name:"平面图"}]
        if(name === "layout.set"){space=String(args.name);return {}}
        if(name === "viewport.set"){if(args.center){expect(args.center).toEqual([1020,2030]);restored=true;restores++}return {}}
        if(name === "properties")return {objects:[frame(),viewport]}
        if(name === "exportpdf"){if(space !== "Model")expect(restored).toBe(true);await writeFile(String(args.path),"synthetic PDF");return {}}
        if(name === "pagesetup")return {}
        throw new Error(name)
      },
    }
    const result=await exportCadReview({source,outDir,colorMode:"original"},{readViewports:async()=>({viewports:new Map([["A",metadata]]),warnings:[]}),createClient:()=>client,rasterize:async (_pdf: string,png: string)=>writeFile(png,"PNG")})
    expect(restores).toBe(3) // discovery, overview reopen, individual sheet reopen
    const sheet = result.sheets[0] as { warning?: string; viewports: { modelEntityCount: number; frozenLayers: string[] }[] }
    expect(sheet.warning).toBeUndefined()
    expect(sheet.viewports[0].modelEntityCount).toBe(1900)
    expect(sheet.viewports[0].frozenLayers).toEqual(["灯控"])
  })
  it("CAD 失败时关闭会话、清理衍生副本，不输出成功清单或改原图", async () => {
    const root = await mkdtemp(join(tmpdir(), "cad-review-failure-")); roots.push(root)
    const source = join(root, "客户.dwg"), outDir = join(root, "out"); await writeFile(source, "unchanged")
    let closed = false
    await expect(exportCadReview({ source, outDir, colorMode: "original" }, { readViewports: async () => ({ viewports: new Map(), warnings: [] }), createClient: () => ({ async initialize() {}, async close() { closed = true }, async tool() { throw new Error("synthetic CAD failure") } }) })).rejects.toThrow("synthetic CAD failure")
    expect(closed).toBe(true)
    expect(await readdir(outDir)).toEqual([])
    expect(await readFile(source, "utf8")).toBe("unchanged")
  })
})
