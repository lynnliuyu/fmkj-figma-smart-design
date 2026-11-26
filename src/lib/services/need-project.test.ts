import { describe, expect, it, vi } from 'vitest'

import { syncNeedProject } from './need-project'
import type { NeedBuildResult } from './need-service'

const PREFIX = '【来自业主需求单 · 待销售接管】'
const END = '—— 需求摘要结束 ——'

const built = (total: number) =>
  ({
    structured: { house: { bedrooms: 3 } },
    pricing: { totals: { total } },
  }) as unknown as NeedBuildResult

/** Minimal Payload double that records every write. */
function payload(existing: { id: string; notes: string } | null) {
  return {
    findByID: vi.fn(async () => existing),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new-project',
      ...data,
    })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
  }
}

describe('需求单提交后的项目同步', () => {
  it('首次提交创建项目', async () => {
    const p = payload(null)
    const id = await syncNeedProject(p as never, { project: null, phone: null }, built(100), 'A')
    expect(id).toBe('new-project')
    expect(p.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ budget: 100, notes: `A\n${END}` }),
      }),
    )
    expect(p.update).not.toHaveBeenCalled()
  })

  it('再次提交更新同一项目，不新建', async () => {
    const p = payload({ id: 'project-1', notes: 'A' })
    const id = await syncNeedProject(
      p as never,
      { project: 'project-1', phone: null },
      built(100),
      'A',
    )
    expect(id).toBe('project-1')
    expect(p.create).not.toHaveBeenCalled()
    expect(p.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1', data: expect.objectContaining({ budget: 100 }) }),
    )
  })

  it('原地替换上一次摘要，保留销售追加的文字', async () => {
    const p = payload({
      id: 'project-1',
      notes: `${PREFIX}\n\nOLD\n${END}\n\n销售：客户下周三上门`,
    })
    await syncNeedProject(
      p as never,
      { project: 'project-1', phone: null },
      built(200),
      `${PREFIX}\n\nNEW`,
    )
    const notes = (p.update.mock.calls[0]![0] as { data: { notes: string } }).data.notes
    expect(notes).toBe(`${PREFIX}\n\nNEW\n${END}\n\n销售：客户下周三上门`)
    expect(notes).not.toContain('OLD')
  })

  it('销售已改写备注开头时，保留整段旧内容并把最新摘要放前面', async () => {
    const p = payload({ id: 'project-1', notes: '销售手写：已建报价 QT-1' })
    await syncNeedProject(p as never, { project: 'project-1', phone: null }, built(300), 'NEW')
    const notes = (p.update.mock.calls[0]![0] as { data: { notes: string } }).data.notes
    expect(notes).toContain('NEW')
    expect(notes).toContain('已建报价 QT-1')
    expect(notes.indexOf('NEW')).toBeLessThan(notes.indexOf('已建报价'))
  })

  it('项目已被删除时重建一个并回写需求单关联', async () => {
    const p = payload(null)
    const id = await syncNeedProject(p as never, { project: 'gone', phone: null }, built(50), 'NEW')
    expect(id).toBe('new-project')
    expect(p.update).not.toHaveBeenCalled()
  })
})
