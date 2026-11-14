import { describe, expect, it } from 'vitest'

import {
  CARD_ASSETS,
  CARD_H,
  CARD_MM,
  CARD_VARIANTS,
  CARD_W,
  cardFileName,
  cardInfoFromCompany,
  pngWithDpi,
} from './business-card'

/** 造一个最小的 PNG：签名 + IHDR（13 字节数据）+ IEND */
function tinyPng(): Uint8Array {
  const ihdr = new Uint8Array(25)
  ihdr.set([137, 80, 78, 71, 13, 10, 26, 10]) // 签名
  new DataView(ihdr.buffer).setUint32(8, 13) // IHDR 长度
  ihdr.set([0x49, 0x48, 0x44, 0x52], 12) // 'IHDR'
  const iend = new Uint8Array(12)
  new DataView(iend.buffer).setUint32(0, 0)
  iend.set([0x49, 0x45, 0x4e, 0x44], 4) // 'IEND'
  return new Uint8Array([...ihdr, ...iend])
}

function readPhys(bytes: Uint8Array) {
  let i = 8
  while (i + 8 <= bytes.length) {
    const len = new DataView(bytes.buffer, bytes.byteOffset + i, 4).getUint32(0)
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8))
    if (type === 'pHYs') {
      const v = new DataView(bytes.buffer, bytes.byteOffset + i + 8)
      return { ppmX: v.getUint32(0), ppmY: v.getUint32(4), unit: bytes[i + 16] }
    }
    if (type === 'IEND') break
    i += 12 + len
  }
  return null
}

describe('名片尺寸', () => {
  it('画布是 90×54mm 的印刷比例', () => {
    expect(CARD_MM).toEqual({ w: 90, h: 54 })
    expect(CARD_W / CARD_H).toBeCloseTo(90 / 54, 6)
  })

  it('1080 宽已经超过 300dpi 需要的 1063px', () => {
    // 90mm @300dpi = 1063px；小于它印出来就是插值放大的糊图
    expect(CARD_W).toBeGreaterThanOrEqual(Math.ceil((CARD_MM.w / 25.4) * 300))
    expect(CARD_H).toBeGreaterThanOrEqual(Math.ceil((CARD_MM.h / 25.4) * 300))
  })

  it('四套版式都有正反面，文件名带版式和面', () => {
    expect(CARD_VARIANTS).toHaveLength(4)
    for (const v of CARD_VARIANTS) {
      expect(v.front.layout).toBeTruthy()
      expect(v.back.layout).toBeTruthy()
      expect(cardFileName(v, 'front')).toContain('正面')
      expect(cardFileName(v, 'back')).toContain('背面')
    }
    // 文件名不能带「 · 」，印厂和压缩包都不爱这种字符
    expect(cardFileName(CARD_VARIANTS[0]!, 'front')).not.toContain('·')
  })
})

describe('pngWithDpi', () => {
  it('没有 pHYs 时插在 IHDR 之后，dpi 换算正确', () => {
    const out = pngWithDpi(tinyPng(), 300)
    const phys = readPhys(out)
    // 300dpi = 300/0.0254 = 11811 像素/米
    expect(phys).toEqual({ ppmX: 11811, ppmY: 11811, unit: 1 })
    // 签名和 IHDR 不能被挪动
    expect([...out.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(String.fromCharCode(...out.subarray(12, 16))).toBe('IHDR')
  })

  it('已经有 pHYs 时原地改，不会插出第二个', () => {
    const once = pngWithDpi(tinyPng(), 72)
    const twice = pngWithDpi(once, 300)
    expect(twice.length).toBe(once.length)
    const count = [...twice].filter(
      (_, i) => String.fromCharCode(...twice.subarray(i, i + 4)) === 'pHYs',
    ).length
    expect(count).toBe(1)
    expect(readPhys(twice)?.ppmX).toBe(11811)
  })

  it('不是 PNG 就原样返回（别把 JPEG 搞坏）', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1, 2, 3])
    expect(pngWithDpi(jpeg)).toEqual(jpeg)
  })
})

describe('cardInfoFromCompany', () => {
  const base = { name: '繁梦智能空间设计', phone: null, qrCode: null }

  // 2026-11-14 实拍：本地 dev 的 PUBLIC_URL 是 127.0.0.1:13001，直接印到了名片背面
  it('本机地址换成正式域名', () => {
    expect(cardInfoFromCompany(base, 'http://127.0.0.1:13001').site).toBe('fmkj.top')
    expect(cardInfoFromCompany(base, 'http://localhost:3000').site).toBe('fmkj.top')
    expect(cardInfoFromCompany(base, 'https://fmkj.top/').site).toBe('fmkj.top')
  })

  // 同一个事故：公司资料的二维码是 888×1131 的「加我为朋友」整图，
  // 塞进 218×218 方框会压扁 —— 默认必须用裁好的纯二维码
  it('默认二维码是裁好的纯二维码，不是整张名片图', () => {
    expect(cardInfoFromCompany(base, 'https://fmkj.top').wechatQr).toBe(CARD_ASSETS.qr)
    expect(
      cardInfoFromCompany(
        { ...base, qrCode: { url: '/brand/wechat-contact-qr.jpg' } },
        'https://fmkj.top',
      ).wechatQr,
    ).toBe(CARD_ASSETS.qr)
  })

  it('成员自己传的二维码照用', () => {
    expect(
      cardInfoFromCompany(
        { ...base, qrCode: { url: '/api/media/file/mine.png' } },
        'https://fmkj.top',
      ).wechatQr,
    ).toBe('/api/media/file/mine.png')
  })

  it('电话按 3-4-4 重排，带 +86 也能认', () => {
    expect(cardInfoFromCompany({ ...base, phone: '18874232381' }, 'x').phone).toBe('188 7423 2381')
    expect(cardInfoFromCompany({ ...base, phone: '+86 188-7423-2381' }, 'x').phone).toBe(
      '188 7423 2381',
    )
    expect(cardInfoFromCompany({ ...base, phone: null }, 'x').phone).toBe('')
  })
})
