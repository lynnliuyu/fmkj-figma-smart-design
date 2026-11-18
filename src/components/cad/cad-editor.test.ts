import { describe, expect, it } from 'vitest'

import { CAD_BLOCKED_INPUTS, CAD_SUPPORTED_INPUTS, isSupportedCadFile } from '@/lib/cad-formats'

/**
 * CAD 预览的格式门禁（issue #178）：
 * 只有 DXF 是 MIT 链路可编辑+可保存的格式；DWG 解析器是 GPL-3.0 或商业授权，
 * 不能悄悄放进来。这个测试防的是「以后顺手把 DWG 也放开」。
 */
describe('CAD 输入格式', () => {
  it('DXF 大小写都接受', () => {
    expect(isSupportedCadFile('plan.dxf')).toBe(true)
    expect(isSupportedCadFile('PLAN.DXF')).toBe(true)
  })

  it('DWG 明确拒绝（许可证边界）', () => {
    expect(isSupportedCadFile('plan.dwg')).toBe(false)
    expect(CAD_BLOCKED_INPUTS).toContain('.dwg')
  })

  it('其他扩展名拒绝', () => {
    expect(isSupportedCadFile('plan.pdf')).toBe(false)
    expect(isSupportedCadFile('dxf')).toBe(false)
  })

  it('契约：可编辑输入只列 DXF', () => {
    expect([...CAD_SUPPORTED_INPUTS]).toEqual(['.dxf'])
  })
})
