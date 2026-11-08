import { describe, expect, it } from 'vitest'

import { isSwitchFamily, normalizeVerdictKind } from './cad-point-fusion'

describe('isSwitchFamily', () => {
  it('把四档开关和智能屏算作同一族（复核时它们是同一种「开关面板」）', () => {
    expect(isSwitchFamily('switch-1')).toBe(true)
    expect(isSwitchFamily('switch-2')).toBe(true)
    expect(isSwitchFamily('switch-3')).toBe(true)
    expect(isSwitchFamily('switch-4')).toBe(true)
    expect(isSwitchFamily('touch-panel')).toBe(true)
  })

  it('灯具、插座、传感器不属于开关族', () => {
    expect(isSwitchFamily('downlight')).toBe(false)
    expect(isSwitchFamily('socket')).toBe(false)
    expect(isSwitchFamily('motion-sensor')).toBe(false)
  })

  it('空串返回 false', () => {
    expect(isSwitchFamily('')).toBe(false)
  })

  it('前缀判断放行了字典里不存在的极数（switch-12 也会被当成开关族）', () => {
    // 真实行为：调用方（fuseDetections）只传经 normalizeVerdictKind / 视觉校验后的值，
    // 这条测试把「前缀宽松」这个前提显式记录成契约。
    expect(isSwitchFamily('switch-12')).toBe(true)
    expect(isSwitchFamily('switch-')).toBe(true)
  })
})

describe('normalizeVerdictKind', () => {
  it('已经归一的值原样通过', () => {
    for (const k of [
      'switch-1',
      'switch-2',
      'switch-3',
      'switch-4',
      'touch-panel',
      'light',
      'socket',
      'sensor',
      'curtain',
      'other-device',
      'none',
    ] as const) {
      expect(normalizeVerdictKind(k)).toBe(k)
    }
  })

  it('大小写与首尾空白会被归一', () => {
    expect(normalizeVerdictKind('SWITCH_2')).toBe('switch-2')
    expect(normalizeVerdictKind('Switch-3')).toBe('switch-3')
    expect(normalizeVerdictKind('  switch-4  ')).toBe('switch-4')
  })

  it('中文表述映射到对应型号', () => {
    expect(normalizeVerdictKind('双键')).toBe('switch-2')
    expect(normalizeVerdictKind('单开')).toBe('switch-1')
    expect(normalizeVerdictKind('智能屏')).toBe('touch-panel')
    expect(normalizeVerdictKind('五孔插座')).toBe('socket')
    expect(normalizeVerdictKind('窗帘')).toBe('curtain')
    expect(normalizeVerdictKind('传感器')).toBe('sensor')
    expect(normalizeVerdictKind('灯带')).toBe('light')
  })

  it('英文同义词映射到对应类别', () => {
    expect(normalizeVerdictKind('outlet')).toBe('socket')
    expect(normalizeVerdictKind('downlight')).toBe('light')
  })

  it('非字符串一律返回 null（调用方按「没有复核结论」处理，原样保留点位）', () => {
    expect(normalizeVerdictKind(42)).toBeNull()
    expect(normalizeVerdictKind(null)).toBeNull()
    expect(normalizeVerdictKind(undefined)).toBeNull()
    expect(normalizeVerdictKind({ kind: 'switch-1' })).toBeNull()
  })

  it('认不出的字符串兜底成 other-device，而不是 null', () => {
    expect(normalizeVerdictKind('')).toBe('other-device')
    expect(normalizeVerdictKind('unknown-word')).toBe('other-device')
    expect(normalizeVerdictKind('不适用')).toBe('other-device')
    // 原型链上的键（'toString' / 'constructor'）不能被 Set.has 误判
    expect(normalizeVerdictKind('toString')).toBe('other-device')
    expect(normalizeVerdictKind('__proto__')).toBe('other-device')
  })

  it('开关模式匹配的是前缀：switch-12 落到 switch-1', () => {
    expect(normalizeVerdictKind('switch-5')).toBe('other-device')
    expect(normalizeVerdictKind('switch-12')).toBe('switch-1')
  })

  it('否定式表述会先命中它提到的名词（已知缺口：否定词不生效）', () => {
    // 真实行为——`/socket|outlet|插座/` 在 `/none|not|无|非/` 之前，
    // 所以「不是插座 / 非灯 / 没有插座」都被读成了肯定的设备名。
    expect(normalizeVerdictKind('不是插座')).toBe('socket')
    expect(normalizeVerdictKind('非灯')).toBe('light')
    expect(normalizeVerdictKind('无灯')).toBe('light')
    // 只有完全不含设备名词的否定词才落到 none
    expect(normalizeVerdictKind('非设备')).toBe('none')
    expect(normalizeVerdictKind('not a device')).toBe('none')
    expect(normalizeVerdictKind('none')).toBe('none')
  })
})
