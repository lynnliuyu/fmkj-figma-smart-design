import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DISPLAY_PROFILE,
  DISPLAY_PROFILES,
  isDisplayProfileId,
  resolveDisplayProfile,
} from './display-profile'

describe('DISPLAY_PROFILES', () => {
  it('四套方案都有唯一 id 与非空文案', () => {
    expect(DISPLAY_PROFILES).toHaveLength(4)
    const ids = DISPLAY_PROFILES.map((p) => p.id)
    expect(new Set(ids).size).toBe(4)
    for (const p of DISPLAY_PROFILES) {
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
      expect(p.sheetOpacity).toBeGreaterThan(0)
      expect(p.sheetOpacity).toBeLessThanOrEqual(1)
    }
  })

  it('默认方案存在', () => {
    expect(DISPLAY_PROFILES.some((p) => p.id === DEFAULT_DISPLAY_PROFILE)).toBe(true)
  })

  it('施工图不带覆盖圈与光晕；业主展示两者都带', () => {
    const c = resolveDisplayProfile('construction')
    expect(c.grid).toBe(true)
    expect(c.coverage).toBe(false)
    expect(c.displayEffects).toBe(false)

    const o = resolveDisplayProfile('owner')
    expect(o.grid).toBe(false)
    expect(o.coverage).toBe(true)
    expect(o.displayEffects).toBe(true)
  })

  it('展示类方案底图比施工类更淡', () => {
    expect(resolveDisplayProfile('presentation').sheetOpacity).toBeLessThan(
      resolveDisplayProfile('construction').sheetOpacity,
    )
  })
})

describe('isDisplayProfileId', () => {
  it('只认四条已知 id', () => {
    for (const p of DISPLAY_PROFILES) expect(isDisplayProfileId(p.id)).toBe(true)
    expect(isDisplayProfileId('unknown')).toBe(false)
    expect(isDisplayProfileId('')).toBe(false)
    expect(isDisplayProfileId(null)).toBe(false)
    expect(isDisplayProfileId(123)).toBe(false)
  })
})

describe('resolveDisplayProfile', () => {
  it('已知 id 返回对应方案', () => {
    expect(resolveDisplayProfile('owner').id).toBe('owner')
  })

  it('未知值 / 空值 / 类型不对 都回落到默认方案，不抛错', () => {
    const def = resolveDisplayProfile(DEFAULT_DISPLAY_PROFILE)
    for (const bad of [undefined, null, '', 'nope', 0, {}, []]) {
      expect(resolveDisplayProfile(bad)).toEqual(def)
    }
  })
})
