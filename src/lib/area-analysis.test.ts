import { describe, expect, it } from 'vitest'

import type { AreaType } from './area-types'
import { analyzeArea, analyzeAreas, floorTagFromSheetName, groupRooms, roomKey } from './area-analysis'

type TestArea = { id: string; name: string; areaType: AreaType; sheetId: string | null }

const area = (
  id: string,
  name: string,
  areaType: AreaType = 'living',
  sheetId: string | null = null,
): TestArea => ({
  id,
  name,
  areaType,
  sheetId,
})

const point = (deviceType: string, areaId: string | null, sheetId: string | null = null) => ({ deviceType, areaId, sheetId })

describe('roomKey', () => {
  it('去除所有空白（空格、全角空格、Tab、换行）', () => {
    expect(roomKey('主  卧')).toBe('主卧')
    expect(roomKey('主\u3000卧')).toBe('主卧') // 全角空格
    expect(roomKey('客\n厅\t')).toBe('客厅')
    expect(roomKey('A B')).toBe('AB')
  })

  it('无空白时原样返回；只含空白时得到空串', () => {
    expect(roomKey('主卧')).toBe('主卧')
    expect(roomKey('')).toBe('')
    expect(roomKey('\t\t')).toBe('')
  })
})

describe('floorTagFromSheetName', () => {
  it('提取楼层标识', () => {
    expect(floorTagFromSheetName('一层')).toBe('一层')
    expect(floorTagFromSheetName('二层灯光图')).toBe('二层')
    expect(floorTagFromSheetName('27层')).toBe('27层')
    expect(floorTagFromSheetName('1F灯光图')).toBe('1F')
    expect(floorTagFromSheetName('3F插座图')).toBe('3F')
    expect(floorTagFromSheetName('地下一层')).toBe('地下一层')
    expect(floorTagFromSheetName('地下2层')).toBe('地下2层')
    expect(floorTagFromSheetName('负一层')).toBe('负一层')
  })

  it('字母楼层号统一大写', () => {
    expect(floorTagFromSheetName('b2f')).toBe('2F')
    expect(floorTagFromSheetName('B1F')).toBe('1F')
  })

  it('没有楼层标记时返回去空白的原名；空值返回空串', () => {
    expect(floorTagFromSheetName('灯光图')).toBe('灯光图')
    expect(floorTagFromSheetName('首层')).toBe('首层')
    expect(floorTagFromSheetName(null)).toBe('')
    expect(floorTagFromSheetName(undefined)).toBe('')
    expect(floorTagFromSheetName('')).toBe('')
    expect(floorTagFromSheetName('   ')).toBe('')
  })

  it('只取第一个匹配（多层合一的图纸名以先出现的楼层为准）', () => {
    expect(floorTagFromSheetName('一层、二层平面图')).toBe('一层')
  })

  it('已知缺口：地下室编号丢失 B 前缀，B1F 与 1F 得到同一个标签', () => {
    // `/…|[B1-9]F/` 只捕获 [B1-9] 而丢掉 F/B，于是地下层与地上层无法区分。
    // 断言真实行为，等修复时这条会红。
    expect(floorTagFromSheetName('B1F')).toBe(floorTagFromSheetName('1F'))
    expect(floorTagFromSheetName('B2F')).toBe(floorTagFromSheetName('2F'))
  })

  it('已知缺口：中文数字地下室与阿拉伯数字写法不一致', () => {
    // `地下[一二三123]层` 捕获整段，而 `地下一层` 与 `地下1层` 因此拿到不同标签
    expect(floorTagFromSheetName('地下一层')).toBe('地下一层')
    expect(floorTagFromSheetName('地下1层')).toBe('地下1层')
    // 同上：[B1-9]F 分支对 2 位以上编号不生效，直接回落到原名
    expect(floorTagFromSheetName('B10F')).toBe('B10F')
  })
})

describe('groupRooms', () => {
  it('同一楼层的同名区域合并成一组', () => {
    const groups = groupRooms([area('a', '客厅'), area('b', '客厅'), area('c', '主卧')])
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([['a', 'b'], ['c']])
  })

  it('名称空白差异视为同一房间', () => {
    const groups = groupRooms([area('a', '客厅'), area('b', '客  厅')])
    expect(groups).toHaveLength(1)
  })

  it('不同楼层的同名区域保持独立（一层楼梯 / 二层楼梯）', () => {
    const floorById = new Map([
      ['q1', '一层'],
      ['q2', '二层'],
    ])
    const groups = groupRooms([area('a', '楼梯', 'living', 'q1'), area('b', '楼梯', 'living', 'q2')], floorById)
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([['a'], ['b']])
  })

  it('没有楼层映射时退回 sheetId 本身做分组键', () => {
    const groups = groupRooms([area('a', '客厅', 'living', 'q1'), area('b', '客厅', 'living', 'q2')])
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([['a'], ['b']])
  })

  it('无 sheetId 的区域按名称合并（没有楼层信息）', () => {
    const groups = groupRooms([area('a', '客厅', 'living', null), area('b', '客厅', 'living', null)])
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([['a', 'b']])
  })

  it('已知缺口：楼层标签碰撞会把不同楼层合并 —— B1F 与 1F 的楼梯被当成同一间', () => {
    const floorById = new Map([
      ['sB1', floorTagFromSheetName('B1F')],
      ['sF1', floorTagFromSheetName('1F')],
    ])
    const groups = groupRooms([area('b1', '楼梯', 'stairs', 'sB1'), area('f1', '楼梯', 'stairs', 'sF1')], floorById)
    // 两个楼层拿到同一个标签「1F」，于是被错误合并
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([['b1', 'f1']])
  })
})

describe('analyzeArea', () => {
  it('统计点位并区分已满足 / 缺失项', () => {
    const r = analyzeArea(area('a1', '客厅'), [point('downlight', 'a1'), point('switch-1', 'a1')], [area('a1', '客厅')])
    expect(r.total).toBe(1 + 1)
    expect(r.met.map((m) => m.label)).toEqual(['照明', '智能开关 / 面板'])
    expect(r.missing.map((m) => m.label)).toEqual(['电动窗帘', '中控屏 / 智能音箱', '温湿度 / 空调控制'])
    // 必配 2 项（照明 / 控制）已满足，加权基准 4 项 → 50
    expect(r.score).toBe(50)
    expect(r.warnings).toEqual([])
    expect(r.devices).toEqual([
      { deviceType: 'switch-1', count: 1 },
      { deviceType: 'downlight', count: 1 },
    ])
  })

  it('智能屏同时算作控制项（客厅再加一块面板，得分升到 75）', () => {
    const r = analyzeArea(
      area('a1', '客厅'),
      [point('downlight', 'a1'), point('switch-1', 'a1'), point('touch-panel', 'a1')],
      [area('a1', '客厅')],
    )
    expect(r.total).toBe(3)
    expect(r.score).toBe(75)
  })

  it('空区域：全部必配缺失、得分 0，并给出「还没放置设备」提醒', () => {
    const r = analyzeArea(area('a1', '客厅'), [], [area('a1', '客厅')])
    expect(r.total).toBe(0)
    expect(r.met).toEqual([])
    expect(r.warnings).toEqual(['这个区域还没有放置设备'])
    expect(r.score).toBe(0)
  })

  it('灯具没有控制方式时告警；补上面板后告警消失', () => {
    const lonely = analyzeArea(area('a1', '客厅'), [point('downlight', 'a1')], [area('a1', '客厅')])
    expect(lonely.warnings).toEqual(['有 1 个灯具但没有开关、面板或传感器，无法单独控制'])

    const controlled = analyzeArea(
      area('a1', '客厅'),
      [point('downlight', 'a1'), point('touch-panel', 'a1')],
      [area('a1', '客厅')],
    )
    expect(controlled.warnings).toEqual([])
  })

  it('灯多而键位少时建议增键或改场景面板', () => {
    const points = [...Array.from({ length: 10 }, () => point('downlight', 'a1')), point('switch-1', 'a1')]
    const r = analyzeArea(area('a1', '客厅'), points, [area('a1', '客厅')])
    expect(r.warnings).toEqual(['10 个灯具只有 1 个开关键位，建议增加键位或改用场景面板分组控制'])
  })

  it('其他区域（不在 siblings 里）的点位不计入', () => {
    const r = analyzeArea(area('a1', '客厅'), [point('downlight', 'other-area')], [area('a1', '客厅')])
    expect(r.total).toBe(0)
  })

  it('未知区域类型回落到 other 规则：只有照明一项，得 0 分', () => {
    // 存量/脏数据可能带字典外的 areaType，这里刻意绕过类型做运行时兜底验证
    const dirty = area('x', 'X', 'bogus-type' as AreaType)
    const r = analyzeArea(dirty, [], [dirty])
    expect(r.score).toBe(0)
    expect(r.missing.map((m) => m.label)).toEqual(['照明'])
  })
})

describe('analyzeAreas', () => {
  it('合并后的区域共用同一个分析结果（按区域 id 都能取到）', () => {
    const areas = [area('a', '客厅', 'living', 'q1'), area('b', '客厅', 'living', 'q1')]
    const result = analyzeAreas(areas, [point('downlight', 'a', 'q1')], [{ id: 'q1', name: '一层灯光图' }])
    expect([...result.keys()]).toEqual(['a', 'b'])
    expect(result.get('a')).toBe(result.get('b'))
    expect(result.get('a')?.areaIds).toEqual(['a', 'b'])
  })
})
