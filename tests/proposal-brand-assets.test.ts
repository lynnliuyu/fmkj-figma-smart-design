import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { collectProposalBrands, normalizeProposalBrand, resolveProposalBrand } from "../lib/proposal-brand-assets"

/** `public/assets/brand-icons/manifest.json` 是图标素材包的唯一权威清单：logoSrc 必须照它写。 */
const PACK_MANIFEST = JSON.parse(
  readFileSync(join(process.cwd(), "public", "assets", "brand-icons", "manifest.json"), "utf8"),
) as { slug: string; group: string; file: string; sourceUrl: string }[]

const PACK_LOGOS = new Map(
  PACK_MANIFEST.filter((entry) => entry.group === "brands").map((entry) => [entry.slug, entry.file] as const),
)

/** 数据库 `SELECT DISTINCT brand FROM products` 在 2026-10-23 的真实取值（26 条）。 */
const DB_BRANDS: readonly [string, string][] = [
  ["Apple/苹果", "apple"],
  ["Aqara", "aqara"],
  ["H3C", "h3c"],
  ["HDL", "hdl"],
  ["Somfy", "somfy"],
  ["TP-LINK/Tplink", "tplink"],
  ["中弘", "zhonghong"],
  ["今闪", "jinshan"],
  ["华为/Huawei", "huawei"],
  ["大华/Dahua", "dahua"],
  ["小米/xiaomi", "xiaomi"],
  ["平头熊/PTX", "ptx"],
  ["施耐德/Schneider", "schneider"],
  ["易来/yeelight", "yeelight"],
  ["杜亚", "dooya"],
  ["松下/Panasonic", "panasonic"],
  ["格力", "gree"],
  ["欧瑞博/ORVIBO", "orvibo"],
  ["海康威视/Hikvision", "hikvision"],
  ["涂鸦/Tuya", "tuya"],
  ["罗格朗/Legrand", "legrand"],
  ["苏米/SUMI", "sumi"],
  ["萤石/Ezviz", "ezviz"],
  ["锐捷/Ruijie", "ruijie"],
  ["领普/Linptech", "linptech"],
  ["鹿客/Loock", "loock"],
]

/** 本轮从素材包接入的 22 个品牌：数据库原始字符串 + 素材包 slug + 常见写法。 */
const NEW_PACK_BRANDS: readonly { db: string; slug: string; variants: readonly string[] }[] = [
  { db: "锐捷/Ruijie", slug: "ruijie", variants: ["锐捷", "Ruijie", "锐捷 Ruijie", "ruijie"] },
  { db: "H3C", slug: "h3c", variants: ["新华三", "h3c", "H3C 新华三"] },
  { db: "TP-LINK/Tplink", slug: "tplink", variants: ["TP-LINK", "Tplink", "tplink", "普联"] },
  { db: "领普/Linptech", slug: "linptech", variants: ["领普", "Linptech", "linptech"] },
  { db: "平头熊/PTX", slug: "ptx", variants: ["平头熊", "PTX", "ptx"] },
  { db: "鹿客/Loock", slug: "loock", variants: ["鹿客", "Loock", "Lockin", "lockin"] },
  { db: "苏米/SUMI", slug: "sumi", variants: ["苏米", "SUMI", "sumi"] },
  { db: "华为/Huawei", slug: "huawei", variants: ["华为", "Huawei", "huawei"] },
  { db: "中弘", slug: "zhonghong", variants: ["Zhonghong", "zhonghong"] },
  { db: "今闪", slug: "jinshan", variants: ["Jinshan", "jinshan"] },
  { db: "欧瑞博/ORVIBO", slug: "orvibo", variants: ["欧瑞博", "ORVIBO", "orvibo"] },
  { db: "萤石/Ezviz", slug: "ezviz", variants: ["萤石", "Ezviz", "EZVIZ", "ezviz"] },
  { db: "大华/Dahua", slug: "dahua", variants: ["大华", "Dahua", "dahua"] },
  { db: "海康威视/Hikvision", slug: "hikvision", variants: ["海康威视", "Hikvision", "HIKVISION", "hikvision"] },
  { db: "涂鸦/Tuya", slug: "tuya", variants: ["涂鸦", "Tuya", "tuya"] },
  { db: "HDL", slug: "hdl", variants: ["hdl", "河东科技", "HDL 河东科技"] },
  { db: "Somfy", slug: "somfy", variants: ["somfy", "尚飞", "SOMFY"] },
  { db: "施耐德/Schneider", slug: "schneider", variants: ["施耐德", "Schneider", "施耐德电气", "Schneider Electric"] },
  { db: "罗格朗/Legrand", slug: "legrand", variants: ["罗格朗", "Legrand", "legrand"] },
  { db: "松下/Panasonic", slug: "panasonic", variants: ["松下", "Panasonic", "panasonic"] },
  { db: "格力", slug: "gree", variants: ["GREE", "gree", "格力电器"] },
  { db: "杜亚", slug: "dooya", variants: ["Dooya", "DOOYA", "dooya"] },
]

const localPath = (publicPath: string) => join(process.cwd(), "public", publicPath)

function expectCleanSvg(publicPath: string) {
  const svg = readFileSync(localPath(publicPath), "utf8")
  expect(svg, publicPath).toContain("<svg")
  expect(svg, publicPath).not.toContain("<text")
  expect(svg, publicPath).not.toMatch(/<script|<foreignObject/)
  // 只允许 W3C 命名空间链接，其它外链（位图/字体/引用）一律不允许出现在素材里
  const external = svg.replace(/https?:\/\/www\.w3\.org[^"'\s]*/g, "")
  expect(external, publicPath).not.toMatch(/https?:\/\//)
}

describe("首次提案的产品品牌", () => {
  it("只接受明确别名，能处理英文大小写与全角字形", () => {
    expect(normalizeProposalBrand("　ＡＱＡＲＡ  绿米 ")).toBe("aqara 绿米")
    expect(resolveProposalBrand("　ＡＱＡＲＡ  绿米 ")?.id).toBe("aqara")
    expect(resolveProposalBrand("Yeelight")?.id).toBe("yeelight")
    expect(resolveProposalBrand("Aqara 智能开关")?.logoSrc).toBeNull()
    expect(resolveProposalBrand("小米生态链某品牌")?.id).toBe("custom:小米生态链某品牌")
  })

  it("只按报价保存的品牌字段取值，不从品名猜测，也不改动原数据", () => {
    const items = [
      { brand: "绿米", name: "小米智能开关" },
      { brand: "AQARA", name: "另一个商品" },
      { brand: " 小众自有品牌 ", name: "Yeelight 灯带" },
      { brand: null, name: "Apple HomePod" },
    ]
    const before = structuredClone(items)
    expect(collectProposalBrands(items).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "aqara", name: "Aqara 绿米" },
      { id: "custom:小众自有品牌", name: "小众自有品牌" },
    ])
    expect(items).toEqual(before)
  })

  it("小米、米家及生态名称分开，不拿 MI 标识冒充米家", () => {
    expect(resolveProposalBrand("小米")?.logoSrc).toBe("/assets/proposals/brands/xiaomi.png")
    expect(resolveProposalBrand("米家")?.logoSrc).toBe("/assets/proposals/brands/mijia.png")
    expect(resolveProposalBrand("Xiaomi Home")?.kind).toBe("ecosystem")
    expect(resolveProposalBrand("Matter")?.kind).toBe("protocol")
    expect(collectProposalBrands([{ brand: "Matter" }, { brand: "HomeKit" }, { brand: "米家 App" }, { brand: "Apple" }]).map(({ id }) => id)).toEqual(["apple"])
  })

  it("空品牌不展示，未知品牌与未授权图形保留文字回退", () => {
    expect(resolveProposalBrand(undefined)).toBeNull()
    expect(resolveProposalBrand(" \n ")).toBeNull()
    expect(resolveProposalBrand("Apple")).toMatchObject({ name: "Apple 苹果", logoSrc: null })
    expect(resolveProposalBrand("自有品牌")).toMatchObject({ name: "自有品牌", logoSrc: null, sourceUrl: null })
  })

  it("图形都来自有记录的官网本地资产，避开已有手绘替代标识", () => {
    for (const name of ["Aqara", "小米", "米家", "Yeelight"]) {
      const asset = resolveProposalBrand(name)!
      expect(asset.logoSrc).toMatch(/^\/assets\/proposals\/brands\//)
      expect(existsSync(localPath(asset.logoSrc!))).toBe(true)
      expect(asset.sourceUrl).toMatch(/^https:\/\//)
      expect(asset.assetSourceUrl).toMatch(/^https:\/\//)
      expect(asset.usageNote).toContain("不表示品牌授权")
    }
    const svg = readFileSync(localPath(resolveProposalBrand("Aqara")!.logoSrc!), "utf8")
    expect(svg).toContain("<svg")
    expect(svg).not.toContain("<text")
    expect(svg).not.toMatch(/<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/)
  })

  it("数据库里的每个品牌字符串都能解析到已登记品牌，且带图形", () => {
    for (const [raw, id] of DB_BRANDS) {
      const asset = resolveProposalBrand(raw)
      expect(asset, raw).not.toBeNull()
      expect(asset!.id, raw).toBe(id)
      expect(asset!.kind, raw).toBe("brand")
      expect(asset!.id.startsWith("custom:"), raw).toBe(false)
      if (id !== "apple") expect(asset!.logoSrc, raw).toBeTruthy()
    }
  })

  it("新增的 22 个品牌用数据库原始字符串与常见写法都能命中", () => {
    expect(NEW_PACK_BRANDS).toHaveLength(22)
    for (const { db, slug, variants } of NEW_PACK_BRANDS) {
      for (const probe of [db, ...variants]) {
        const asset = resolveProposalBrand(probe)
        expect(asset?.id, probe).toBe(slug)
        expect(asset?.kind, probe).toBe("brand")
      }
    }
  })

  it("新增品牌的 logoSrc 与素材包 manifest 完全一致，且文件真实存在", () => {
    for (const { db, slug } of NEW_PACK_BRANDS) {
      const expected = PACK_LOGOS.get(slug)
      expect(expected, `manifest 缺少 ${slug}`).toBeTruthy()
      const asset = resolveProposalBrand(db)!
      expect(asset.logoSrc, db).toBe(expected)
      expect(asset.logoSrc, db).toMatch(new RegExp(`^/assets/brand-icons/brands/${slug}\\.(svg|png)$`))
      expect(existsSync(localPath(asset.logoSrc!)), asset.logoSrc!).toBe(true)
    }
  })

  it("新增品牌的来源、授权口径与核对日期都已填写", () => {
    for (const { db } of NEW_PACK_BRANDS) {
      const asset = resolveProposalBrand(db)!
      expect(asset.name, db).not.toMatch(/^custom/)
      expect(asset.sourceUrl, db).toMatch(/^https:\/\//)
      expect(asset.assetSourceUrl, db).toMatch(/^https:\/\//)
      expect(asset.usageNote, db).toContain("不表示品牌授权")
      expect(asset.verifiedOn, db).toBe("2026-10-23")
    }
  })

  it("有图形的品牌一律使用干净 SVG：无 <text>、无脚本、无外链", () => {
    for (const { slug } of NEW_PACK_BRANDS) {
      const logoSrc = PACK_LOGOS.get(slug)!
      if (!logoSrc.endsWith(".svg")) continue
      expectCleanSvg(logoSrc)
    }
    for (const [raw, id] of DB_BRANDS) {
      const logoSrc = resolveProposalBrand(raw)!.logoSrc
      if (!logoSrc?.endsWith(".svg")) continue
      expectCleanSvg(logoSrc)
      expect(id, raw).toBeTruthy()
    }
  })

  it("保持精确匹配：品牌名带规格或后缀时回退为文字，不做子串匹配", () => {
    for (const probe of ["锐捷网络设备", "海康威视摄像头", "小米智能开关", "Aqara 智能开关", "格力空调", "HDL 模块"]) {
      expect(resolveProposalBrand(probe)?.id, probe).toBe(`custom:${normalizeProposalBrand(probe)}`)
    }
  })

  it("既有政策不变：Apple 无图形，生态与协议条目不进品牌收集", () => {
    expect(resolveProposalBrand("Apple/苹果")).toMatchObject({ id: "apple", kind: "brand", logoSrc: null, assetSourceUrl: null })
    expect(resolveProposalBrand("Apple Home")).toMatchObject({ kind: "ecosystem", logoSrc: null })
    expect(resolveProposalBrand("Xiaomi Home")).toMatchObject({ kind: "ecosystem", logoSrc: null })
    expect(resolveProposalBrand("Matter")).toMatchObject({ kind: "protocol", logoSrc: null })
    expect(collectProposalBrands([{ brand: "Apple Home" }, { brand: "Matter" }, { brand: "米家 App" }])).toEqual([])
    expect(collectProposalBrands([{ brand: "锐捷/Ruijie" }, { brand: "锐捷" }, { brand: "Matter" }]).map(({ id }) => id)).toEqual(["ruijie"])
  })
})
