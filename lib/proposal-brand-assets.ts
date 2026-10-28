/**
 * Referential marks for first proposals. Identity comes only from the saved
 * quotation's `brand` field; product names and later catalogue data are not used.
 *
 * `logoSrc` values are copied verbatim from `public/assets/brand-icons/manifest.json`,
 * which is the single source of truth for the icon pack (some brands ship `.svg`,
 * others only `.png`; guessing the extension produces 404s in the client document).
 *
 * `aliases` must always contain the raw `products.brand` string exactly as stored in
 * the database (e.g. "锐捷/Ruijie"), plus common Chinese/English/case variants,
 * because matching is exact after normalization — never substring.
 */
export type ProposalBrandKind = "brand" | "ecosystem" | "protocol"

export type ProposalBrandAsset = Readonly<{
  id: string
  name: string
  kind: ProposalBrandKind
  logoSrc: string | null
  sourceUrl: string | null
  assetSourceUrl: string | null
  usageNote: string
  verifiedOn: string | null
}>

type KnownBrand = ProposalBrandAsset & { aliases: readonly string[] }

const REFERENTIAL_USE = "仅用于识别本方案已保存的产品品牌，不表示品牌授权、合作或兼容认证。"

const KNOWN_BRANDS: readonly KnownBrand[] = [
  {
    id: "aqara", name: "Aqara 绿米", kind: "brand",
    aliases: ["aqara", "绿米", "绿米联创", "aqara绿米", "aqara 绿米", "绿米 aqara", "绿米/aqara", "aqara/绿米"],
    logoSrc: "/assets/proposals/brands/aqara.svg",
    sourceUrl: "https://www.aqara.com/en/about-us/brand-story/",
    assetSourceUrl: "https://www.aqara.com/wp-content/uploads/2023/03/aqara_logo.svg",
    usageNote: REFERENTIAL_USE, verifiedOn: "2026-10-23",
  },
  {
    id: "xiaomi", name: "小米 Xiaomi", kind: "brand",
    aliases: ["小米", "xiaomi", "小米 xiaomi", "xiaomi 小米", "小米科技", "小米/xiaomi"],
    logoSrc: "/assets/proposals/brands/xiaomi.png",
    sourceUrl: "https://www.mi.com/",
    assetSourceUrl: "https://i01.appmifile.com/webfile/globalimg/mobile/logo/mi.png",
    usageNote: REFERENTIAL_USE, verifiedOn: "2026-10-23",
  },
  {
    id: "mijia", name: "米家 MIJIA", kind: "brand",
    aliases: ["米家", "mijia", "米家 mijia", "mijia 米家"],
    logoSrc: "/assets/proposals/brands/mijia.png",
    sourceUrl: "https://home.mi.com/",
    assetSourceUrl: "https://cdn.web-global.fds.api.mi-img.com/mijia/prod/home/main.ec78fdc73e.js",
    usageNote: `${REFERENTIAL_USE} 图形来自米家官网页头，不使用“已接入米家”认证章。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "yeelight", name: "Yeelight 易来", kind: "brand",
    aliases: ["yeelight", "易来", "yeelight 易来", "易来 yeelight", "yeelight pro", "易来pro", "易来 pro", "易来/yeelight"],
    logoSrc: "/assets/proposals/brands/yeelight.png",
    sourceUrl: "https://en.yeelight.com/",
    assetSourceUrl: "https://en.yeelight.com/wp-content/uploads/sites/4/2022/07/Yeelight-Logo-05.png",
    usageNote: REFERENTIAL_USE, verifiedOn: "2026-10-23",
  },
  {
    id: "apple", name: "Apple 苹果", kind: "brand",
    aliases: ["apple", "苹果", "apple 苹果", "苹果 apple", "apple/苹果"],
    logoSrc: null,
    sourceUrl: "https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html",
    assetSourceUrl: null,
    usageNote: "使用文字识别品牌；未提供销售宣传物料的图形授权，故不展示 Apple 图形商标。",
    verifiedOn: "2026-10-23",
  },
  {
    id: "apple-home", name: "Apple Home", kind: "ecosystem",
    aliases: ["apple home", "apple homekit", "homekit", "苹果家庭", "苹果 home", "苹果home", "苹果homekit"],
    logoSrc: null,
    sourceUrl: "https://www.apple.com/home-app/",
    assetSourceUrl: null,
    usageNote: "智能家居生态名称，不是设备品牌；不能据此认定报价内产品已获得兼容认证。",
    verifiedOn: "2026-10-23",
  },
  {
    id: "xiaomi-home", name: "Xiaomi Home / 米家 App", kind: "ecosystem",
    aliases: ["xiaomi home", "mi home", "米家app", "米家 app", "小米智能家庭"],
    logoSrc: null,
    sourceUrl: "https://home.mi.com/",
    assetSourceUrl: null,
    usageNote: "智能家居生态名称，与米家、小米产品品牌分别表达，不据此推断接入能力。",
    verifiedOn: "2026-10-23",
  },
  {
    id: "matter", name: "Matter", kind: "protocol",
    aliases: ["matter"],
    logoSrc: null,
    sourceUrl: "https://csa-iot.org/all-solutions/matter/",
    assetSourceUrl: null,
    usageNote: "通信标准名称，不是设备品牌；不能将名称出现视为该项目或产品获得认证。",
    verifiedOn: "2026-10-23",
  },

  // --- 2026-10-23 起接入品牌图标素材包（public/assets/brand-icons/manifest.json）---
  {
    id: "ruijie", name: "锐捷 Ruijie", kind: "brand",
    aliases: ["锐捷/Ruijie", "锐捷", "Ruijie", "锐捷 Ruijie", "Ruijie 锐捷", "锐捷网络", "ruijie networks"],
    logoSrc: "/assets/brand-icons/brands/ruijie.svg",
    sourceUrl: "https://www.ruijie.com.cn/",
    assetSourceUrl: "https://www-file.ruijie.com.cn/chineseResources/UIA/news/images/logo.svg",
    usageNote: `${REFERENTIAL_USE} 图形为锐捷官网矢量中英文字标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "h3c", name: "H3C 新华三", kind: "brand",
    aliases: ["H3C", "新华三", "h3c 新华三", "新华三 H3C", "新华三技术"],
    logoSrc: "/assets/brand-icons/brands/h3c.png",
    sourceUrl: "https://www.h3c.com/cn/",
    assetSourceUrl: "https://resource.h3c.com/cn/tres/NewWebUI/2020/images/logo.png",
    usageNote: `${REFERENTIAL_USE} 图形已裁去官网图内的灰色中文标语，只保留红色 H3C 字标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "tplink", name: "TP-LINK 普联", kind: "brand",
    aliases: ["TP-LINK/Tplink", "TP-LINK", "Tplink", "TP-Link", "tplink", "普联", "TP-LINK 普联", "普联 TP-LINK"],
    logoSrc: "/assets/brand-icons/brands/tplink.svg",
    sourceUrl: "https://www.tp-link.com/",
    assetSourceUrl: "https://icon-sets.iconify.design/simple-icons/tplink/",
    usageNote: `${REFERENTIAL_USE} 图形来自 Simple Icons（CC0）的 TP-Link 单色标，不使用第三方同名图标集。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "linptech", name: "领普 Linptech", kind: "brand",
    aliases: ["领普/Linptech", "领普", "Linptech", "linptech", "领普 Linptech", "Linptech 领普"],
    logoSrc: "/assets/brand-icons/brands/linptech.png",
    sourceUrl: "https://www.linptech.com/",
    assetSourceUrl: "https://www.linptech.com/wp-content/uploads/2021/01/cropped-LOGO512-512-03.jpg",
    usageNote: `${REFERENTIAL_USE} 图形为官网 Linptech 字标的浅底可用版（深底字标做背景透明化处理），不是几何图形标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "ptx", name: "平头熊 PTX", kind: "brand",
    aliases: ["平头熊/PTX", "平头熊", "PTX", "ptx", "平头熊 PTX", "PTX 平头熊", "平头熊智能"],
    logoSrc: "/assets/brand-icons/brands/ptx.png",
    sourceUrl: "https://www.ptxzn.com/",
    assetSourceUrl: "https://32764426.s21i.faiusr.com/4/ABUIABAEGAAg5sTAtgYo-LzG_AUwgAo4gAo.png?v=1740962578",
    usageNote: `${REFERENTIAL_USE} 图形为官网页头标志的浅底可用版，仅 204×204 位图，无矢量版。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "loock", name: "鹿客 Lockin", kind: "brand",
    aliases: ["鹿客/Loock", "鹿客", "Loock", "loock", "鹿客 Loock", "Lockin", "lockin", "鹿客 Lockin"],
    logoSrc: "/assets/brand-icons/brands/loock.png",
    sourceUrl: "https://www.lockin.com/",
    assetSourceUrl: "https://www.lockin.com/images/logo-black.png",
    usageNote: `${REFERENTIAL_USE} 品牌英文名现为 Lockin（原 Loock），官网只提供位图字标，无矢量版。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "sumi", name: "苏米 SUMI", kind: "brand",
    aliases: ["苏米/SUMI", "苏米", "SUMI", "sumi", "苏米 SUMI", "SUMI 苏米", "苏米智控"],
    logoSrc: "/assets/brand-icons/brands/sumi.png",
    sourceUrl: "https://www.sumi-technology.com/",
    assetSourceUrl: "https://www.sumi-technology.com/images/icon/logosumi.png",
    usageNote: `${REFERENTIAL_USE} 图形为浅色背景可用版：官方白色字标部分改为深墨色，渐变图形未改。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "huawei", name: "华为 Huawei", kind: "brand",
    aliases: ["华为/Huawei", "华为", "Huawei", "huawei", "华为 Huawei", "Huawei 华为", "华为技术"],
    logoSrc: "/assets/brand-icons/brands/huawei.svg",
    sourceUrl: "https://www.huawei.com/cn/",
    assetSourceUrl: "https://icon-sets.iconify.design/simple-icons/huawei/",
    usageNote: `${REFERENTIAL_USE} 图形来自 Simple Icons（CC0）的华为花瓣标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "zhonghong", name: "中弘 Zhonghong", kind: "brand",
    aliases: ["中弘", "Zhonghong", "zhonghong", "中弘 Zhonghong", "中弘数字", "青岛中弘"],
    logoSrc: "/assets/brand-icons/brands/zhonghong.png",
    sourceUrl: "https://www.zhonghongtech.cn/",
    assetSourceUrl: "https://s1.iotexpo.com.cn/IOTE/CoLogo/SZ202309/C23D6688915B0901.png",
    usageNote: `${REFERENTIAL_USE} 图形取自品牌方公开的公司 logo（展会官方展商页记录），官网未提供可直接下载的图形文件。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "jinshan", name: "今闪 Jinshan", kind: "brand",
    aliases: ["今闪", "Jinshan", "jinshan", "今闪 Jinshan", "今闪智能"],
    logoSrc: "/assets/brand-icons/brands/jinshan.png",
    sourceUrl: "https://jinshan-iot.com/",
    assetSourceUrl: "https://jinshan-iot.com/assets/brand/logo.png",
    usageNote: `${REFERENTIAL_USE} 图形为今闪官网品牌 logo；此品牌做暖通智能控制，与金山/Kingsoft 无关。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "orvibo", name: "欧瑞博 ORVIBO", kind: "brand",
    aliases: ["欧瑞博/ORVIBO", "欧瑞博", "ORVIBO", "orvibo", "欧瑞博 ORVIBO", "ORVIBO 欧瑞博"],
    logoSrc: "/assets/brand-icons/brands/orvibo.svg",
    sourceUrl: "https://www.orvibo.com/",
    assetSourceUrl: "https://static.orvibo.com/guanwang_second/front/images/2020/nav/logo-38c948b4cf.svg",
    usageNote: `${REFERENTIAL_USE} 图形为官网矢量字标，官网原白色填充已改为深色以保证浅底可见，图形未改。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "ezviz", name: "萤石 EZVIZ", kind: "brand",
    aliases: ["萤石/Ezviz", "萤石", "Ezviz", "ezviz", "EZVIZ", "萤石 Ezviz", "萤石 EZVIZ", "萤石网络"],
    logoSrc: "/assets/brand-icons/brands/ezviz.svg",
    sourceUrl: "https://www.ezviz.com/",
    assetSourceUrl: "https://mfs.ys7.com/mall/c3c0d060e2d402aa2405259276a7a1db.svg",
    usageNote: `${REFERENTIAL_USE} 图形为萤石官网彩色矢量中英文字标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "dahua", name: "大华 Dahua", kind: "brand",
    aliases: ["大华/Dahua", "大华", "Dahua", "dahua", "大华 Dahua", "大华股份", "大华技术"],
    logoSrc: "/assets/brand-icons/brands/dahua.png",
    sourceUrl: "https://www.dahuatech.com/",
    assetSourceUrl: "https://www.dahuatech.com/bocweb/web/img/logo.png",
    usageNote: `${REFERENTIAL_USE} 图形为大华股份官网页头位标，官网无可直取的矢量版本。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "hikvision", name: "海康威视 Hikvision", kind: "brand",
    aliases: ["海康威视/Hikvision", "海康威视", "Hikvision", "hikvision", "HIKVISION", "海康威视 Hikvision", "海康"],
    logoSrc: "/assets/brand-icons/brands/hikvision.png",
    sourceUrl: "https://www.hikvision.com/cn/",
    assetSourceUrl: "https://www.hikvisionindia.com/media/app_config/favicon.png",
    usageNote: `${REFERENTIAL_USE} 图形是官方红色 H 标记（官网站点图标），不是完整 HIKVISION 字标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "tuya", name: "涂鸦 Tuya", kind: "brand",
    aliases: ["涂鸦/Tuya", "涂鸦", "Tuya", "tuya", "涂鸦 Tuya", "涂鸦智能"],
    logoSrc: "/assets/brand-icons/brands/tuya.svg",
    sourceUrl: "https://www.tuya.com/",
    assetSourceUrl: "https://www.tuya.com/",
    usageNote: `${REFERENTIAL_USE} 图形为涂鸦官网页头内联矢量标；不使用“Powered by Tuya”等认证标识。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "hdl", name: "HDL 河东科技", kind: "brand",
    aliases: ["HDL", "hdl", "河东", "河东科技", "HDL 河东科技", "HDL河东", "hdl automation"],
    logoSrc: "/assets/brand-icons/brands/hdl.png",
    sourceUrl: "https://www.hdlautomation.com/",
    assetSourceUrl: "https://apps.apple.com/cn/app/hdl-on/id1029839624",
    usageNote: `${REFERENTIAL_USE} 图形来自 HDL 官方 App（HDL-ON）图标，自带深色底衬，不是透明底企业字标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "somfy", name: "尚飞 Somfy", kind: "brand",
    aliases: ["Somfy", "somfy", "SOMFY", "尚飞", "尚飞 Somfy", "Somfy 尚飞"],
    logoSrc: "/assets/brand-icons/brands/somfy.svg",
    sourceUrl: "https://www.somfypro.fr/",
    assetSourceUrl: "https://www.somfypro.fr/assets/somfy-pro-dark-DjzhBnWe.svg",
    usageNote: `${REFERENTIAL_USE} 图形是「somfy PRO」专业渠道字标，不是消费级标准 logo。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "schneider", name: "施耐德 Schneider Electric", kind: "brand",
    aliases: ["施耐德/Schneider", "施耐德", "Schneider", "schneider", "施耐德 Schneider", "施耐德电气", "Schneider Electric"],
    logoSrc: "/assets/brand-icons/brands/schneider.svg",
    sourceUrl: "https://www.se.com/",
    assetSourceUrl: "https://icon-sets.iconify.design/simple-icons/schneiderelectric/",
    usageNote: `${REFERENTIAL_USE} 图形来自 Simple Icons（CC0）记录的施耐德电气官方 logo 文件；施耐德官网对自动访问返回 403，未能直接抓页面。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "legrand", name: "罗格朗 Legrand", kind: "brand",
    aliases: ["罗格朗/Legrand", "罗格朗", "Legrand", "legrand", "罗格朗 Legrand", "Legrand 罗格朗"],
    logoSrc: "/assets/brand-icons/brands/legrand.svg",
    sourceUrl: "https://www.legrand.com/",
    assetSourceUrl: "https://www.legrand.us/_ui/responsive/theme-lambda/images/logo/legrand-logo-desktop.svg",
    usageNote: `${REFERENTIAL_USE} 图形为官网矢量字标的深色可用版（原白色填充改为深色），图形未改。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "panasonic", name: "松下 Panasonic", kind: "brand",
    aliases: ["松下/Panasonic", "松下", "Panasonic", "panasonic", "松下 Panasonic", "Panasonic 松下"],
    logoSrc: "/assets/brand-icons/brands/panasonic.svg",
    sourceUrl: "https://panasonic.cn/",
    assetSourceUrl: "https://icon-sets.iconify.design/simple-icons/panasonic/",
    usageNote: `${REFERENTIAL_USE} 图形来自 Simple Icons（CC0）的 Panasonic 单色字标。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "gree", name: "格力 GREE", kind: "brand",
    aliases: ["格力", "GREE", "gree", "格力 GREE", "格力电器", "珠海格力"],
    logoSrc: "/assets/brand-icons/brands/gree.png",
    sourceUrl: "https://www.gree.com/",
    assetSourceUrl: "https://gree.com.br/wp-content/uploads/2025/01/favicon-1.png",
    usageNote: `${REFERENTIAL_USE} 图形取自格力海外官网记录的公司 logo（蓝色 GREE 标）。`,
    verifiedOn: "2026-10-23",
  },
  {
    id: "dooya", name: "杜亚 Dooya", kind: "brand",
    aliases: ["杜亚", "Dooya", "dooya", "DOOYA", "杜亚 Dooya", "杜亚机电"],
    logoSrc: "/assets/brand-icons/brands/dooya.png",
    sourceUrl: "https://www.dooya.com/",
    assetSourceUrl: "https://www.dooya.com/favicon.ico",
    usageNote: `${REFERENTIAL_USE} 图形取自杜亚官网站点图标，原不透明白底已改为透明。`,
    verifiedOn: "2026-10-23",
  },
]

/** Exact alias matching after typography normalization; never substring matching. */
export function normalizeProposalBrand(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
}

const ALIASES = new Map(KNOWN_BRANDS.flatMap((brand) => brand.aliases.map((alias) => [normalizeProposalBrand(alias), brand] as const)))

/** Ecosystem / protocol results are classified, so callers need not present them as brands. */
export function resolveProposalBrand(value: string | null | undefined): ProposalBrandAsset | null {
  const key = normalizeProposalBrand(value)
  if (!key) return null
  const known = ALIASES.get(key)
  if (known) {
    const { aliases: _aliases, ...asset } = known
    return asset
  }
  return {
    id: `custom:${key}`, name: value!.trim(), kind: "brand", logoSrc: null,
    sourceUrl: null, assetSourceUrl: null, verifiedOn: null,
    usageNote: "按已保存报价显示品牌原文；暂无已核对的图形标识，使用文字展示。",
  }
}

/** Only saved brand fields, in quotation order; unknown brands retain a text fallback. */
export function collectProposalBrands(items: readonly { brand?: string | null }[]): ProposalBrandAsset[] {
  const result: ProposalBrandAsset[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const brand = resolveProposalBrand(item.brand)
    if (!brand || brand.kind !== "brand" || seen.has(brand.id)) continue
    seen.add(brand.id)
    result.push(brand)
  }
  return result
}
