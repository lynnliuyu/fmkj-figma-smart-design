import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getPayloadClient: vi.fn() }))
vi.mock('@/lib/payload', () => ({ getPayloadClient: mocks.getPayloadClient }))

import { buildNeedResult, needSummary } from './need-service'

type Row = Record<string, unknown>

const product = (over: Row = {}): Row => ({
  id: 'p-1',
  name: '米家双键开关',
  sku: 'MJ-SW-2',
  status: 'active',
  deviceType: 'switch-2',
  brand: { id: 'b-1', name: '小米' },
  platforms: ['米家'],
  price: 99,
  stock: 100,
  image: { id: 'm-1', filename: 'switch.png' },
  marketPrice: null,
  priceSource: null,
  ...over,
})

function catalog(rows: Row[]) {
  mocks.getPayloadClient.mockResolvedValue({
    find: vi.fn(async () => ({ docs: rows })),
  })
}

beforeEach(() => {
  mocks.getPayloadClient.mockReset()
})

describe('需求清单的选型与待确认状态', () => {
  it('显示中文设备名称与数量，并推荐库存和平台都满足的真实品牌型号', async () => {
    catalog([
      product(),
      product({ id: 'g-1', name: '米家中枢网关', sku: 'MJ-GW', deviceType: 'gateway', stock: 10 }),
    ])
    const { structured } = await buildNeedResult({
      house: { type: 'flat', bedrooms: 2, livingRooms: 1, area: 80 },
      ecosystem: { primary: 'mijia' },
    })
    expect(structured.devices.map((d) => d.name)).toEqual(['智能网关', '双键开关'])
    expect(structured.devices.find((d) => d.deviceType === 'switch-2')).toMatchObject({
      qty: expect.any(Number),
      recommendation: { brand: '小米', name: '米家双键开关', sku: 'MJ-SW-2' },
    })
    expect(structured.devices.every((d) => d.qty > 0)).toBe(true)
  })

  it('库存不足、平台不符或缺少型号时不给推荐，但保留类别与数量', async () => {
    catalog([
      product({ stock: 1 }),
      product({ id: 'p-2', sku: '', deviceType: 'gateway', stock: 10 }),
      product({ id: 'p-3', platforms: ['Apple Home'], deviceType: 'gateway', stock: 10 }),
    ])
    const { structured } = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
      ecosystem: { primary: 'mijia' },
    })
    for (const d of structured.devices) {
      expect(d.recommendation).toBeNull()
      expect(d.name).toBeTruthy()
      expect(d.qty).toBeGreaterThan(0)
    }
  })

  it('安防场景未确认监控时明确待确认，且不擅自添加摄像头', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
      sceneCards: ['security', 'lighting'],
      security: { camera: 'door', cameraConfirmed: false },
    })
    expect(structured.devices.some((d) => d.deviceType === 'camera')).toBe(false)
    expect(structured.pendingScenes).toContainEqual(
      expect.objectContaining({ key: 'security', label: '安防' }),
    )
  })

  it('用户明确选了监控才添加摄像头；确认后不再挂起安防', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
      sceneCards: ['security'],
      security: { camera: 'door', cameraConfirmed: true },
    })
    expect(structured.devices.find((d) => d.deviceType === 'camera')?.name).toBe('摄像头')
    expect(structured.pendingScenes.some((s) => s.key === 'security')).toBe(false)
  })

  it('已勾选的安防传感器会进入清单，带中文名称', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
      sceneCards: ['security'],
      security: { camera: 'none', cameraConfirmed: true, sensors: ['water', 'smoke'] },
    })
    expect(structured.devices.find((d) => d.deviceType === 'water-sensor')?.name).toBe('水浸')
    expect(structured.devices.find((d) => d.deviceType === 'smoke-sensor')?.name).toBe('烟雾')
  })

  it('暖通、影音、门锁和未确认监控都给出明确待确认，不编造型号与价格', async () => {
    catalog([])
    const { structured, pricing } = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
      sceneCards: ['hvac', 'av', 'security'],
      panels: { lock: true },
    })
    expect(structured.pendingScenes.map((s) => s.key)).toEqual(['security', 'hvac', 'av', 'lock'])
    expect(structured.devices.some((d) => d.deviceType === 'smart-lock')).toBe(false)
    expect(pricing.totals.equipment).toBe(0)
  })

  it('销售备注用中文名称、推荐型号或待选型，不再出现内部 deviceType', async () => {
    catalog([product({ deviceType: 'gateway', id: 'g-1', sku: 'MJ-GW', stock: 10 })])
    const result = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
      ecosystem: { primary: 'mijia' },
      sceneCards: ['hvac'],
    })
    const notes = needSummary(result)
    expect(notes).toContain('智能网关×')
    expect(notes).toContain('推荐 小米 MJ-GW')
    expect(notes).toContain('双键开关×')
    expect(notes).toContain('（待选型）')
    expect(notes).toContain('暖通待确认')
    expect(notes).not.toMatch(/gateway×|switch-2×/)
  })

  it('未知或非白名单答案不会凭空产生设备', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
      sceneCards: ['made-up-scene'],
      security: { camera: 'made-up', sensors: ['made-up-sensor'] },
    })
    expect(structured.sceneCards).toEqual([])
    expect(structured.devices.map((d) => d.deviceType).sort()).toEqual(['gateway', 'switch-2'])
    expect(structured.pendingScenes).toEqual([])
  })
})
