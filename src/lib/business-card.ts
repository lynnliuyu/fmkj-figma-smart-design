/**
 * 名片：一张名片的两面，多套版式。
 *
 * 尺寸用 90 × 54 mm 的印刷比例（1.6667），渲染基准 1080 × 648 px，
 * 300dpi 对应 1063 × 638 px —— 1080 宽足够直接送印。
 *
 * ⚠️ 这里的 px 是**画布像素**，不是要缩放的网页单位：整张卡片按 1080×648
 * 真实排版，页面里用 ScaledFrame 缩小显示，导出时直接截这张原始节点。
 * 所以画布内部一律写死 px（text-[58px] 这种），别换成 rem —— 换 rem 会跟着
 * 用户浏览器字号变，印出来就和预览不一样了。
 */
export const CARD_W = 1080
export const CARD_H = 648
export const CARD_MM = { w: 90, h: 54 }

/** 导出倍率：3 倍 = 3240×1944，远超 300dpi 需要的 1063×638 */
export const CARD_EXPORT_SCALE = 3
/** 送印 dpi：写进 PNG 的 pHYs，印厂打开就是 90×54mm */
export const CARD_DPI = 300

export type CardSide = 'front' | 'back'

export type CardStyle = {
  /** 底色：实色或渐变 */
  bg: string
  /** 主文字色 */
  ink: string
  /** 次级文字色 */
  sub: string
  /** 细线 / 分割线 */
  line: string
  /** 强调色（图标、小标题） */
  accent: string
  /** 二维码托底（深色版用白块，否则透明） */
  qrPlate: string
  /** 合作品牌图标是否走白色版 */
  logoWhite: boolean
  /** 版式骨架 */
  layout: 'split' | 'center' | 'minimal' | 'grid'
  /** 背景装饰 */
  decor: 'grid' | 'stars' | 'arc' | 'none'
  /** 建筑/线框描边色（建筑风用） */
  frame?: string
  /** 数据/图元强调色（科技风数据条用） */
  data?: string
}

export type CardVariant = {
  key: string
  name: string
  /** 一句话说明这套版式适合什么场合 */
  note: string
  front: CardStyle
  back: CardStyle
}

export type CardInfo = {
  company: string
  name: string
  title: string
  phone: string
  site: string
  /** 微信二维码图片地址 */
  wechatQr: string
}

const INK = '#14120F'
const PAPER = '#F7F4EE'
const GOLD = '#A8763C'
const GOLD_L = '#D9AC63'
const NIGHT = '#0F1226'
const VIOLET = '#8B5CFF'
const BLUE = '#3C6BFF'

export type CardAssets = {
  logoFull: string
  logoFullWhite: string
  /** 图形标（不带中文名） */
  logo: string
  logoWhite: string
  mijia: string
  mijiaWhite: string
  appleHome: string
  knx: string
  qr: string
}

/**
 * 名片上出现的品牌资产。全部用主站 public/ 里已有的文件，
 * 不另存一份副本 —— 换了 logo 名片跟着换，不会出现「官网是新的、名片还是旧的」。
 */
export const CARD_ASSETS: CardAssets = {
  logoFull: '/brand/fmkj-logo.svg',
  logoFullWhite: '/brand/fmkj-logo-full-white.svg',
  logo: '/brand/fmkj-mark.svg',
  logoWhite: '/brand/fmkj-mark-mono-white.svg',
  mijia: '/brands/xiaomi.webp',
  /** 深色底用白色版，否则米家那个橙色块在深夜金上很扎眼 */
  mijiaWhite: '/brands/xiaomi-mono.webp',
  appleHome: '/ecosystem/apple-home.svg',
  knx: '/ecosystem/knx.svg',
  qr: '/brand/wechat-qr.png',
}

/** 「合作生态」：只写平台/协议名，用它们的官方标志，不做「认证」暗示。 */
export const CARD_ECOSYSTEM = [
  { key: 'mijia', label: '米家' },
  { key: 'apple', label: 'Apple Home' },
  { key: 'knx', label: 'KNX' },
] as const

export const CARD_VARIANTS: CardVariant[] = [
  {
    key: 'night-gold',
    name: '深夜金 · 标准商务',
    note: '正面深蓝黑压 logo，背面米白放二维码。最稳妥，印刷不挑纸。',
    front: {
      bg: `linear-gradient(135deg, ${NIGHT} 0%, #161A3C 55%, #0B0D1A 100%)`,
      ink: '#F5F0E6',
      sub: '#A9A392',
      line: 'rgba(217,172,99,0.28)',
      accent: GOLD_L,
      qrPlate: 'transparent',
      logoWhite: true,
      layout: 'split',
      decor: 'grid',
    },
    back: {
      bg: PAPER,
      ink: INK,
      sub: '#6F6659',
      line: '#D8CDBB',
      accent: GOLD,
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'split',
      decor: 'none',
    },
  },
  {
    key: 'paper-gold',
    name: '米白纸 · 设计工作室',
    note: '两面都用米白纸 + 金线，字少留白多。适合见设计师、甲方老板。',
    front: {
      bg: PAPER,
      ink: INK,
      sub: '#6F6659',
      line: '#D8CDBB',
      accent: GOLD,
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'center',
      decor: 'none',
    },
    back: {
      bg: '#F2EEE5',
      ink: INK,
      sub: '#6F6659',
      line: '#D8CDBB',
      accent: GOLD,
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'minimal',
      decor: 'none',
    },
  },
  {
    key: 'violet-tech',
    name: '星夜紫 · 科技感',
    note: '两面深色 + 品牌蓝紫渐变，背景星光。适合展会、智能家居圈子。',
    front: {
      bg: `radial-gradient(120% 140% at 85% 0%, #2A2160 0%, ${NIGHT} 55%, #080A14 100%)`,
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.62)',
      line: 'rgba(139,92,255,0.35)',
      accent: '#B9A6FF',
      qrPlate: '#FFFFFF',
      logoWhite: true,
      layout: 'grid',
      decor: 'stars',
    },
    back: {
      bg: `linear-gradient(160deg, #10132B 0%, #0A0C18 100%)`,
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.6)',
      line: 'rgba(139,92,255,0.3)',
      accent: '#B9A6FF',
      qrPlate: '#FFFFFF',
      logoWhite: true,
      layout: 'minimal',
      decor: 'arc',
    },
  },
  {
    key: 'ink-white',
    name: '留白 · 极简黑白',
    note: '黑白灰 + 一点品牌蓝。最百搭，也最省印厂沟通成本。',
    front: {
      bg: '#FFFFFF',
      ink: '#1A1A1A',
      sub: '#7A7A7A',
      line: '#E2E2E2',
      accent: BLUE,
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'minimal',
      decor: 'none',
    },
    back: {
      bg: '#FAFAFA',
      ink: '#1A1A1A',
      sub: '#7A7A7A',
      line: '#E2E2E2',
      accent: VIOLET,
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'split',
      decor: 'arc',
    },
  },
  {
    key: 'architecture-grid',
    name: '建筑制图 · 细线网格',
    note: '米白纸 + 蓝墨细线网格，像建筑图纸。适合设计师、工程与地产。',
    front: {
      bg: '#FBFAF6',
      ink: '#18314F',
      sub: '#50647B',
      line: '#C9D6E4',
      accent: '#2E6FDB',
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'grid',
      decor: 'grid',
      frame: '#D7E3F0',
      data: '#5B8DEF',
    },
    back: {
      bg: '#F5F6F2',
      ink: '#18314F',
      sub: '#50647B',
      line: '#C9D6E4',
      accent: '#2E6FDB',
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'split',
      decor: 'none',
      frame: '#D7E3F0',
      data: '#5B8DEF',
    },
  },
  {
    key: 'tech-panel',
    name: '现代科技 · 数据面板',
    note: '深蓝黑 + 青色数据细分，像设备面板。适合智能家居、软硬件与方案展台。',
    front: {
      bg: `linear-gradient(150deg, #0B1220 0%, #0E1B30 55%, #0A111E 100%)`,
      ink: '#EAF4FF',
      sub: '#90A6C0',
      line: 'rgba(74,222,222,0.30)',
      accent: '#4ADEDE',
      qrPlate: '#FFFFFF',
      logoWhite: true,
      layout: 'minimal',
      decor: 'none',
      data: '#3FB9C9',
    },
    back: {
      bg: '#0A111E',
      ink: '#FFFFFF',
      sub: '#8298B4',
      line: 'rgba(74,222,222,0.34)',
      accent: '#4ADEDE',
      qrPlate: '#FFFFFF',
      logoWhite: true,
      layout: 'minimal',
      decor: 'arc',
      data: '#3FB9C9',
    },
  },
  {
    key: 'warm-luxe',
    name: '暖色高端 · 香槟金',
    note: '暖灰底 + 香槟金细线，克制的高端。适合建材、门窗、全屋定制与私宅接待。',
    front: {
      bg: `linear-gradient(160deg, #F4EEE6 0%, #EDE2D4 100%)`,
      ink: '#3A2E22',
      sub: '#8A7763',
      line: '#D8C2A2',
      accent: '#B07D3E',
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'center',
      decor: 'arc',
      frame: '#C9AE87',
      data: '#8A5A2B',
    },
    back: {
      bg: '#F6F1E9',
      ink: '#3A2E22',
      sub: '#8A7763',
      line: '#D8C2A2',
      accent: '#B07D3E',
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'split',
      decor: 'none',
      frame: '#C9AE87',
      data: '#8A5A2B',
    },
  },
  {
    key: 'editorial-min',
    name: '编辑排版 · 大字号极简',
    note: '白底大黑字 + 一栏分割，杂志编辑感。适合个人品牌、顾问与摄影。',
    front: {
      bg: '#FFFFFF',
      ink: '#111111',
      sub: '#6B6B6B',
      line: '#D8D8D8',
      accent: '#E4572E',
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'minimal',
      decor: 'none',
      frame: '#E8E8E8',
      data: '#333333',
    },
    back: {
      bg: '#FAFAFA',
      ink: '#111111',
      sub: '#6B6B6B',
      line: '#D8D8D8',
      accent: '#E4572E',
      qrPlate: 'transparent',
      logoWhite: false,
      layout: 'minimal',
      decor: 'none',
      frame: '#E8E8E8',
      data: '#333333',
    },
  },
]

/** 头衔快捷选项（页面上可一键点选，也可以手填） */
export const CARD_TITLE_PRESETS = ['主理人', '空间智能设计顾问', '全屋智能方案设计', '创始人']

export const cardFileName = (variant: CardVariant, side: CardSide) =>
  `繁梦空间-名片-${variant.name.split(' · ')[0]}-${side === 'front' ? '正面' : '背面'}.png`

/**
 * 从公司资料拼出名片默认值（在服务端调用，站点域名由调用方传进来）。
 *
 * 电话去掉分隔符后再按 3-4-4 重排：名片背面用等宽字体排，
 * 用户可能在设置里填 `188-7423-2381` 或 `+86 188 7423 2381`，
 * 原样印上去宽度不可控，会挤掉右边的品牌区。
 */
export function cardInfoFromCompany(
  company: { name?: string | null; phone?: string | null; qrCode?: { url: string } | null },
  siteUrl: string,
): CardInfo {
  const digits = (company.phone ?? '').replace(/\D/g, '')
  const local = digits.length > 11 ? digits.slice(-11) : digits
  return {
    company: company.name?.trim() || '繁梦智能空间设计',
    name: '',
    title: CARD_TITLE_PRESETS[0],
    phone: local.length === 11 ? local.replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3') : local,
    site: cardSiteHost(siteUrl),
    wechatQr: cardQrUrl(company.qrCode?.url),
  }
}

/**
 * 名片上的网址：去掉协议和尾部斜杠，**本机地址一律换成正式域名**。
 *
 * 公司资料的二维码默认是整张「加我为朋友」的名片图（888×1131，上面有头像和
 * 一句提示语），塞进名片 218×218 的方框会被压变形 —— 打印出来是糊的。
 * 所以这里只认「专门裁好的纯二维码」：src/lib/business-card 的 /brand/wechat-qr.png。
 * 成员在设置里传了自己的二维码图就照用，只是那张默认名片图要替换掉。
 */
function cardQrUrl(configured: string | undefined): string {
  if (!configured) return CARD_ASSETS.qr
  if (configured.includes('wechat-contact-qr')) return CARD_ASSETS.qr
  return configured
}

/**
 * 名片上的网址。开发环境的 PUBLIC_URL 是 `127.0.0.1:13001` 这种，
 * 印在名片上等于印废 —— 一律换回正式域名。
 */
function cardSiteHost(siteUrl: string): string {
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(host) ? 'fmkj.top' : host
}

/**
 * 把 PNG 的 pHYs 块写成指定 dpi（没有就插在 IHDR 之后）。
 *
 * html-to-image 导出的 PNG 不带物理尺寸，印厂软件会按 72dpi 打开，
 * 3240px 就变成 114cm 宽 —— 这张卡的「90×54mm」全靠这一步。
 */
export function pngWithDpi(bytes: Uint8Array, dpi = CARD_DPI): Uint8Array {
  const ppm = Math.round(dpi / 0.0254)
  const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) return bytes

  // 先找已有的 pHYs：有就原地改，别插出第二个（PNG 规范只允许一个）
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (type === 'pHYs') {
      const out = bytes.slice()
      const view = new DataView(out.buffer, out.byteOffset)
      view.setUint32(offset + 8, ppm)
      view.setUint32(offset + 12, ppm)
      out[offset + 16] = 1 // unit = metre
      return out
    }
    offset += 12 + length
  }

  // 没有就新建一个，插在 IHDR（固定 8..32）之后
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9) // 数据长度
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // 'pHYs'
  view.setUint32(8, ppm)
  view.setUint32(12, ppm)
  chunk[16] = 1
  view.setUint32(17, pngChunkCrc(chunk.subarray(4, 17)))

  const at = 33 // 8 字节签名 + IHDR 的 4 长度 + 4 类型 + 13 数据 + 4 校验
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, at), 0)
  out.set(chunk, at)
  out.set(bytes.subarray(at), at + chunk.length)
  return out
}

/** PNG 分块 CRC32（多项式 0xEDB88320，初值/结果异或 0xFFFFFFFF） */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function pngChunkCrc(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
