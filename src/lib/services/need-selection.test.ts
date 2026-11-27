import { readFileSync } from 'node:fs'

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

describe('安防待确认的四种语义', () => {
  const base = {
    house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100 },
    sceneCards: ['security'],
  }

  it('页面初始值（未点过监控）→ 待确认，且不加摄像头', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      ...base,
      security: { camera: 'none', sensors: [] },
    })
    expect(structured.devices.some((d) => d.deviceType === 'camera')).toBe(false)
    expect(structured.pendingScenes.some((s) => s.key === 'security')).toBe(true)
  })

  it('明确选「不需要」（cameraConfirmed）→ 不提示待确认', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      ...base,
      security: { camera: 'none', cameraConfirmed: true, sensors: [] },
    })
    expect(structured.devices.some((d) => d.deviceType === 'camera')).toBe(false)
    expect(structured.pendingScenes.some((s) => s.key === 'security')).toBe(false)
  })

  it('仅勾传感器、未确认监控 → 传感器进清单，同时仍提示安防待确认', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      ...base,
      security: { camera: 'none', sensors: ['gas', 'contact', 'presence'] },
    })
    expect(structured.devices.some((d) => d.deviceType === 'camera')).toBe(false)
    expect(structured.devices.find((d) => d.deviceType === 'gas-sensor')?.name).toBe('燃气传感器')
    expect(structured.pendingScenes.some((s) => s.key === 'security')).toBe(true)
  })

  it('明确选仅门口 → 加摄像头，不提示待确认', async () => {
    catalog([])
    const { structured } = await buildNeedResult({
      ...base,
      security: { camera: 'door', cameraConfirmed: true, sensors: [] },
    })
    expect(structured.devices.find((d) => d.deviceType === 'camera')?.qty).toBeGreaterThan(0)
    expect(structured.pendingScenes.some((s) => s.key === 'security')).toBe(false)
  })

  it('销售备注不含内部代号（rough/main/light/场景键/deviceType）', async () => {
    catalog([])
    const result = await buildNeedResult({
      house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 100, stage: 'rough' },
      lighting: { design: 'main' },
      level: { tier: 'light' },
      sceneCards: ['lighting', 'security', 'curtain'],
      security: { camera: 'none', sensors: [] },
    })
    const notes = needSummary(result)
    expect(notes).toContain('装修阶段：毛坯')
    expect(notes).toContain('灯光：传统主灯')
    expect(notes).toContain('档次：轻智能')
    expect(notes).toContain('场景：照明、安防、窗帘')
    for (const code of [
      'rough',
      'main',
      'light',
      'switch-2',
      'curtain-track',
      'gateway',
      'lighting',
      'security',
      'curtain',
    ]) {
      expect(notes, `备注不应含 ${code}`).not.toMatch(
        new RegExp(`(^|[^a-zA-Z-])${code}([^a-zA-Z-]|$)`),
      )
    }
  })
})

describe('填写页模板与 WXML 表达式兼容性', () => {
  const wxml = readFileSync(
    new URL('../../../miniprogram/pages/need/index.wxml', import.meta.url),
    'utf8',
  )

  it('模板里不调用 indexOf —— WXML 表达式不支持方法调用，会永远得到 false', () => {
    // #229 首轮失败就栽在这：`answers.sceneCards.indexOf(item.value) >= 0` 编译后是函数调用，
    // 求值失败 → 勾了安防也永远不高亮、安防区永不渲染。
    const withoutSceneStep = wxml.replace(
      /<view wx:if="\{\{answers\.scenes\.indexOf[^"]*\}\}"[^>]*>✓<\/view>/g,
      '',
    )
    expect(withoutSceneStep).not.toContain('indexOf')
  })

  it('安防细项由预计算字段驱动（camerasView / sensorsView / securitySceneSelected）', () => {
    for (const field of [
      'securitySceneSelected',
      'camerasView',
      'sensorsView',
      'selectedSensors',
      'sceneCardsView',
    ]) {
      expect(wxml).toContain(field)
    }
    // 模板必须把这三个字段传进去，否则模板内部拿不到
    expect(wxml).toContain('camerasView: camerasView')
    expect(wxml).toContain('sensorsView: sensorsView')
  })
})
