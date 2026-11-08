import { describe, expect, it } from 'vitest'

import {
  categoryOf,
  DEVICE_CATEGORIES,
  DEVICE_TYPE_ORDER,
  DEVICE_TYPES,
  deviceTypeLabel,
  deviceTypeOf,
  inferDeviceType,
  isDeviceType,
  symbolOfType,
} from './device-types'

describe('isDeviceType', () => {
  it('接受字典里存在的设备类型（含开关与门锁）', () => {
    expect(isDeviceType('switch-1')).toBe(true)
    expect(isDeviceType('smart-lock')).toBe(true)
    expect(isDeviceType('ceiling-ap')).toBe(true)
    expect(isDeviceType('other')).toBe(true)
  })

  it('拒绝未知值、缺省值和大小写 / 空白变体', () => {
    expect(isDeviceType('switch-5')).toBe(false) // 只有 1–4 键
    expect(isDeviceType('')).toBe(false)
    expect(isDeviceType(null)).toBe(false)
    expect(isDeviceType(undefined)).toBe(false)
    expect(isDeviceType(42)).toBe(false)
    // 精确匹配，不做 trim / 大小写归一
    expect(isDeviceType(' switch-1')).toBe(false)
    expect(isDeviceType('SWITCH-1')).toBe(false)
  })

  it('每个字典项都能通过校验（值是唯一且自洽的）', () => {
    const values = DEVICE_TYPES.map((t) => t.value)
    expect(new Set(values).size).toBe(values.length)
    expect(values.every(isDeviceType)).toBe(true)
  })
})

describe('deviceTypeOf', () => {
  it('返回设备类型定义（名称、类别、符号、键数）', () => {
    expect(deviceTypeOf('switch-2')?.name).toBe('双开')
    expect(deviceTypeOf('switch-2')?.category).toBe('switch')
    expect(deviceTypeOf('switch-3')?.keys).toBe(3)
    expect(deviceTypeOf('touch-panel')?.symbol).toBe('touch-panel')
  })

  it('非开关类没有 keys 字段（用 keys 区分开关极数时不能假设它一定存在）', () => {
    expect(deviceTypeOf('touch-panel')?.keys).toBeUndefined()
    expect(deviceTypeOf('downlight')?.keys).toBeUndefined()
  })

  it('未知值、空串和 null/undefined 都返回 undefined', () => {
    expect(deviceTypeOf('bogus')).toBeUndefined()
    expect(deviceTypeOf('')).toBeUndefined()
    expect(deviceTypeOf(null)).toBeUndefined()
    expect(deviceTypeOf(undefined)).toBeUndefined()
  })
})

describe('categoryOf', () => {
  it('按 slug 返回类别定义（含代号与排序）', () => {
    expect(categoryOf('switch')).toMatchObject({ name: '开关', code: 'K' })
    expect(categoryOf('lighting')?.name).toBe('灯具')
    expect(categoryOf('vrf')?.code).toBe('AC')
  })

  it('未知 slug、空串和 null/undefined 都返回 undefined', () => {
    expect(categoryOf('bogus')).toBeUndefined()
    expect(categoryOf('')).toBeUndefined()
    expect(categoryOf(null)).toBeUndefined()
    expect(categoryOf(undefined)).toBeUndefined()
    expect(categoryOf('SWITCH')).toBeUndefined() // 大小写敏感
  })

  it('字典里的每个设备类型都指向一个存在的类别', () => {
    const slugs = new Set<string>(DEVICE_CATEGORIES.map((c) => c.slug))
    const orphans = DEVICE_TYPES.filter((t) => !slugs.has(t.category)).map((t) => t.value)
    expect(orphans).toEqual([])
  })
})

describe('deviceTypeLabel / symbolOfType', () => {
  it('标签带类别前缀，未知值回落「未分类」', () => {
    expect(deviceTypeLabel('switch-2')).toBe('开关 · 双开')
    expect(deviceTypeLabel('bogus')).toBe('未分类')
    expect(deviceTypeLabel('')).toBe('未分类')
    expect(deviceTypeLabel(null)).toBe('未分类')
  })

  it('未知类型回落到通用 other 符号，保证点位图永远有图可画', () => {
    expect(symbolOfType('downlight')).toBe('downlight')
    expect(symbolOfType('bogus')).toBe('other')
    expect(symbolOfType(null)).toBe('other')
  })
})

describe('DEVICE_TYPE_ORDER', () => {
  it('覆盖所有设备类型且不含重复', () => {
    const values = DEVICE_TYPES.map((t) => t.value)
    expect(DEVICE_TYPE_ORDER).toHaveLength(values.length)
    expect(new Set(DEVICE_TYPE_ORDER).size).toBe(DEVICE_TYPE_ORDER.length)
    expect(values.every((v) => DEVICE_TYPE_ORDER.includes(v))).toBe(true)
  })

  it('开关按极数从少到多排列（1 → 4），展示与统计都依赖这个顺序', () => {
    expect(DEVICE_TYPE_ORDER.slice(0, 4)).toEqual(['switch-1', 'switch-2', 'switch-3', 'switch-4'])
  })
})

describe('inferDeviceType', () => {
  it('按关键词推断，具体的名词优先于笼统的', () => {
    expect(inferDeviceType('五孔插座')).toBe('socket')
    expect(inferDeviceType('USB 插座 65W')).toBe('socket-usb')
    expect(inferDeviceType('主卧筒灯')).toBe('downlight')
    expect(inferDeviceType('智能门锁 K20')).toBe('smart-lock')
    expect(inferDeviceType('吸顶AP')).toBe('ceiling-ap')
  })

  it('完全无关的名称回落到 other', () => {
    expect(inferDeviceType('完全无关的东西')).toBe('other')
    expect(inferDeviceType('')).toBe('other')
  })

  it('没有「开关」字样且未传旧分类时，纯粹的键数词不猜成开关（避免误伤其他品类）', () => {
    // 这是刻意的保守策略：见 inferDeviceType 的注释
    expect(inferDeviceType('双键')).toBe('other')
    expect(inferDeviceType('客厅三开')).toBe('other')
  })

  it('名称带「开关」或显式传入旧分类为 switch 时才推断开关极数', () => {
    expect(inferDeviceType('主卧开关')).toBe('switch-1')
    expect(inferDeviceType('双键', 'switch')).toBe('switch-2')
    expect(inferDeviceType('客厅三开', 'switch')).toBe('switch-3')
  })
})
