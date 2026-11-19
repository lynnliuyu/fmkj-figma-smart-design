import { describe, expect, it } from 'vitest'

import {
  buildRooms,
  computeDefaults,
  defaultSwitchCount,
  estimateArea,
  type NeedHouse,
} from './need-defaults'
import { computePricing, PRICE_EXCLUSIONS, PRICING_ITEMS_V2 } from './need-pricing'

const house = (over: Partial<NeedHouse> = {}): NeedHouse => ({
  type: 'flat',
  bedrooms: 3,
  livingRooms: 2,
  area: null,
  stage: 'rough',
  ...over,
})

describe('默认值规则（用户口径）', () => {
  it('卧室/书房开关默认 3，客厅 2–3 可改，餐厅玄关 2', () => {
    expect(defaultSwitchCount('bedroom', 'light')).toBe(3)
    expect(defaultSwitchCount('study', 'light')).toBe(3)
    expect(defaultSwitchCount('living', 'light')).toBe(2)
    expect(defaultSwitchCount('living', 'full')).toBe(3)
    expect(defaultSwitchCount('dining', 'light')).toBe(2)
    expect(defaultSwitchCount('entrance', 'light')).toBe(2)
  })

  it('中枢网关必需且不可编辑；>150㎡ 或别墅给 2 个', () => {
    const small = computeDefaults({
      house: house({ area: 90 }),
      lighting: 'main',
      tier: 'light',
      sensors: [],
      camera: 'none',
      wantsCurtain: false,
    })
    const gw = small.devices.find((d) => d.deviceType === 'gateway')!
    expect(gw.qty).toBe(1)
    expect(gw.editable).toBe(false)

    const villa = computeDefaults({
      house: house({ type: 'villa', area: 260 }),
      lighting: 'main',
      tier: 'full',
      sensors: [],
      camera: 'none',
      wantsCurtain: false,
    })
    expect(villa.devices.find((d) => d.deviceType === 'gateway')!.qty).toBe(2)
    expect(villa.hints.some((h) => h.includes('2 个网关'))).toBe(true)
  })

  it('面积未填时给可改估算（不是施工标准）', () => {
    const r = computeDefaults({
      house: house({ area: null }),
      lighting: 'main',
      tier: 'light',
      sensors: [],
      camera: 'none',
      wantsCurtain: false,
    })
    expect(estimateArea(house())).toBeGreaterThan(60)
    expect(r.hints.some((h) => h.includes('估算'))).toBe(true)
    // 估算数量可编辑
    expect(r.devices.every((d) => d.deviceType === 'gateway' || d.editable)).toBe(true)
  })

  it('传感器按用户选择：不勾就没有；勾了才给数量建议', () => {
    const none = computeDefaults({
      house: house(),
      lighting: 'main',
      tier: 'light',
      sensors: [],
      camera: 'none',
      wantsCurtain: false,
    })
    expect(none.devices.some((d) => d.deviceType.includes('sensor'))).toBe(false)

    const picked = computeDefaults({
      house: house(),
      lighting: 'main',
      tier: 'light',
      sensors: ['water', 'smoke'],
      camera: 'none',
      wantsCurtain: false,
    })
    expect(picked.devices.find((d) => d.deviceType === 'water-sensor')!.qty).toBeGreaterThan(0)
    expect(picked.devices.find((d) => d.deviceType === 'smoke-sensor')!.qty).toBeGreaterThan(0)
  })

  it('勾选窗帘时，有窗房间每间 1 套；走廊/玄关不算有窗', () => {
    const r = computeDefaults({
      house: house(),
      lighting: 'main',
      tier: 'light',
      sensors: [],
      camera: 'none',
      wantsCurtain: true,
    })
    const rooms = r.rooms.filter((x) => x.hasWindow).length
    expect(r.devices.find((d) => d.deviceType === 'curtain-track')!.qty).toBe(rooms)
  })

  it('房间数按几室几厅推算（可改）', () => {
    expect(buildRooms(house({ bedrooms: 3 }))).toContain('bedroom')
    expect(buildRooms(house({ bedrooms: 5 })).filter((r) => r === 'bedroom').length).toBeGreaterThan(1)
  })
})

describe('计价 v2（用户口径）', () => {
  const devices = [
    { deviceType: 'switch-2', qty: 12 },
    { deviceType: 'gateway', qty: 1 },
    { deviceType: 'curtain-track', qty: 3 },
  ]
  const market = {
    'switch-2': { price: 199, name: '智能开关（双键）', source: 'https://item.jd.com/1.html' },
    gateway: { price: 399, name: '多模网关', source: 'https://item.jd.com/2.html' },
    'curtain-track': { price: 899, name: '窗帘电机', source: null },
  }

  it('安装单价为 v1 减半后的 v2 值', () => {
    const price = (key: string) => PRICING_ITEMS_V2.find((i) => i.key === key)!.unitPrice
    expect(price('switch_panel')).toBe(20)
    expect(price('scene_panel')).toBe(30)
    expect(price('curtain_motor')).toBe(110)
    expect(price('curtain_track')).toBe(45)
    expect(price('light_strip')).toBe(22)
    expect(price('magnetic_track')).toBe(55)
    expect(price('downlight_install')).toBe(12)
    expect(price('sensor_install')).toBe(12)
    expect(price('gateway_install')).toBe(40)
    expect(price('camera_install')).toBe(60)
    expect(price('lock_install')).toBe(100)
  })

  it('不含弱电布线与回路改造（已从单价表删除）', () => {
    const keys = PRICING_ITEMS_V2.map((i) => i.key)
    expect(keys).not.toContain('weak_current_point')
    expect(keys).not.toContain('circuit_modify')
  })

  it('设备按京东日常价原样计入，安装费逐项', () => {
    const r = computePricing({ devices, marketPriceByType: market })
    // 设备：199*12 + 399*1 + 899*3 = 2388 + 399 + 2697 = 5484
    expect(r.totals.equipment).toBe(199 * 12 + 399 + 899 * 3)
    // 安装：开关 20*12=240，网关 40，窗帘电机 110*3=330
    expect(r.totals.install).toBe(240 + 40 + 330)
    expect(r.equipment.every((e) => e.priceSource !== undefined)).toBe(true)
  })

  it('缺京东日常价的设备单列待查，不并入小计，也不用内部售价回填', () => {
    const r = computePricing({
      devices: [...devices, { deviceType: 'smart-lock', qty: 1 }],
      marketPriceByType: market, // 没有 smart-lock
    })
    expect(r.pendingPrice.map((p) => p.deviceType)).toContain('smart-lock')
    // 合计不含待查设备
    expect(r.totals.total).toBe(r.totals.equipment + r.totals.install)
    const line = r.equipment.find((e) => e.deviceType === 'smart-lock')!
    expect(line.unitMarketPrice).toBeNull()
    expect(line.subtotal).toBeNull()
    expect(r.gaps.some((g) => g.includes('缺京东日常价'))).toBe(true)
  })

  it('调试费未确认：单独给出，不进对外合计', () => {
    const r = computePricing({ devices, marketPriceByType: market, area: 260 })
    expect(r.commissioning.confirmed).toBe(false)
    expect(r.commissioning.sets).toBe(2) // >200㎡
    expect(r.totals.total).toBe(r.totals.equipment + r.totals.install)
    // 调试费金额存在，但没有被加进对外合计
    expect(r.commissioning.subtotal).toBeGreaterThan(0)
    expect(r.totals.total).toBeLessThan(r.totals.total + r.commissioning.subtotal)
    expect(r.gaps.some((g) => g.includes('调试费'))).toBe(true)
  })

  it('报价单固定声明 5 条不含项', () => {
    const r = computePricing({ devices, marketPriceByType: market })
    expect(r.exclusions).toEqual(PRICE_EXCLUSIONS)
    expect([...r.exclusions]).toEqual([
      '水电改造',
      '开槽布线',
      '强电施工',
      '吊顶/墙面修复',
      '家电本体',
    ])
  })

  it('后台覆盖单价生效（市场价调整）', () => {
    const base = computePricing({ devices, marketPriceByType: market })
    const changed = computePricing({
      devices,
      marketPriceByType: market,
      priceOverrides: { switch_panel: 35 },
    })
    expect(changed.totals.install - base.totals.install).toBe((35 - 20) * 12)
  })

  it('型材按米计费（窗帘轨道/灯带/磁吸）', () => {
    const r = computePricing({
      devices: [],
      marketPriceByType: {},
      profile: { curtainTrackMeters: 14.4, lightStripMeters: 20, magneticTrackMeters: 12 },
    })
    const track = r.install.find((i) => i.key === 'curtain_track')!
    expect(track.qty).toBe(14.4)
    expect(track.subtotal).toBe(Math.round(45 * 14.4))
    expect(r.install.find((i) => i.key === 'light_strip')!.subtotal).toBe(Math.round(22 * 20))
    expect(r.install.find((i) => i.key === 'magnetic_track')!.subtotal).toBe(Math.round(55 * 12))
  })
})
