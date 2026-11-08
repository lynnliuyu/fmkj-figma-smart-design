/**
 * 首页「品牌与协议」滚动条使用的品牌 Logo（public/brands，统一 96px 高）。
 * <slug>.webp 为原色版（悬停时显示），<slug>-mono.webp 为白色单色版（深色背景默认显示）。
 * 品牌标识归各自权利人所有，仅用于说明产品兼容的品牌范围。
 */
export type LandingBrand = { slug: string; name: string; width: number; height: number }

export const LANDING_BRANDS: LandingBrand[] = [
  { slug: 'xiaomi', name: '小米', width: 96, height: 96 },
  { slug: 'aqara', name: 'Aqara 绿米', width: 339, height: 96 },
  { slug: 'huawei', name: '华为', width: 127, height: 96 },
  { slug: 'yeelight', name: '易来 Yeelight', width: 453, height: 96 },
  { slug: 'apple', name: 'Apple', width: 78, height: 96 },
  { slug: 'legrand', name: '罗格朗 Legrand', width: 388, height: 96 },
  { slug: 'schneider', name: '施耐德电气', width: 99, height: 96 },
  { slug: 'orvibo', name: '欧瑞博 ORVIBO', width: 727, height: 96 },
  { slug: 'tuya', name: '涂鸦智能', width: 192, height: 96 },
  { slug: 'panasonic', name: '松下 Panasonic', width: 623, height: 96 },
  { slug: 'hikvision', name: '海康威视', width: 127, height: 96 },
  { slug: 'linptech', name: '领普 Linptech', width: 330, height: 96 },
  { slug: 'sumi', name: '苏米智能', width: 251, height: 96 },
  { slug: 'dahua', name: '大华', width: 638, height: 96 },
  { slug: 'gree', name: '格力', width: 114, height: 96 },
  { slug: 'ezviz', name: '萤石 EZVIZ', width: 503, height: 96 },
  { slug: 'h3c', name: '新华三 H3C', width: 379, height: 96 },
  { slug: 'ruijie', name: '锐捷', width: 577, height: 96 },
  { slug: 'tplink', name: 'TP-LINK', width: 95, height: 96 },
  { slug: 'somfy', name: '尚飞 Somfy', width: 461, height: 96 },
  { slug: 'dooya', name: '杜亚 DOOYA', width: 434, height: 96 },
  { slug: 'hdl', name: 'HDL', width: 96, height: 96 },
  { slug: 'loock', name: '鹿客 LOCKIN', width: 595, height: 96 },
  { slug: 'ptx', name: '平头熊', width: 96, height: 96 },
  { slug: 'zhonghong', name: '中弘', width: 219, height: 96 },
  { slug: 'jinshan', name: '今闪', width: 225, height: 96 },
]

export const brandSrc = (slug: string, variant: 'color' | 'mono') =>
  `/brands/${slug}${variant === 'mono' ? '-mono' : ''}.webp`

export const brandBySlug = (slug: string) => LANDING_BRANDS.find((b) => b.slug === slug)
