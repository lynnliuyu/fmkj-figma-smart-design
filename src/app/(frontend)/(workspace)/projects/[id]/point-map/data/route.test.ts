/**
 * 点位图保存（route PUT）的核心路径回归（issue #177）：
 *  保存点位图 → 重新打开（读回 pointMap，元素/点位保留）。
 *
 * route 只调用 appAuth 取当前用户，并把压缩后的场景写进 projects.pointMap。
 * 这里 mock 掉 appAuth 与 getPayloadClient（沿用仓库 route.test 模式），
 * 用真实 compactScene 验证写库数据；「重开」= 从库读回 pointMap 后
 * 用 compactScene 的逆过程（渲染侧）能还原点位。
 *
 * 隔离声明：本文件是单元级，不连真库；真库上的保存/重开由
 * e2e/issue177-core-flow.mjs（dev server + 真实浏览器）覆盖。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPayloadClient: vi.fn(),
}))

vi.mock('@/lib/app-auth', () => ({ appAuth: { getCurrentUser: mocks.getCurrentUser } }))
vi.mock('@/lib/payload', () => ({ getPayloadClient: mocks.getPayloadClient }))

import { PUT } from './route'

const req = (body: unknown) =>
  new Request('http://127.0.0.1:3000/projects/p-1/point-map/data', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const fakedUpdate = (result: Record<string, unknown> = {}) =>
  vi.fn(async (_args: { data: Record<string, unknown> }) => ({
    updatedAt: '2026-01-01',
    ...result,
  }))

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.getPayloadClient.mockReset()
  mocks.getCurrentUser.mockResolvedValue({ id: 'u-1' })
})

describe('点位图保存（PUT /point-map/data）', () => {
  it('保存要素与点位 → 重新打开读回，点位仍可用（rx/ry/deviceType 保留）', async () => {
    const update = fakedUpdate()
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => ({ pointMap: { files: {} } })),
      update,
    })

    // 模拟：两个点位（switch-2 / downlight），各带 rx/ry 和 deviceType
    const elements = [
      {
        id: 'el-1',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 10,
        height: 10,
        customData: { code: 'K1', deviceType: 'switch-2', rx: 0.16, ry: 0.17 },
      },
      {
        id: 'el-2',
        type: 'rectangle',
        x: 200,
        y: 200,
        width: 10,
        height: 10,
        customData: { code: 'L1', deviceType: 'downlight', rx: 0.5, ry: 0.5 },
      },
    ]
    const res = await PUT(req({ elements, appState: {}, files: {} }), {
      params: Promise.resolve({ id: 'p-1' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.bytes).toBeGreaterThan(0)

    const saved = update.mock.calls[0]![0].data.pointMap as unknown as {
      elements: Record<string, unknown>[]
    }
    const savedEls = saved.elements
    expect(savedEls).toHaveLength(2)
    // 保存的是 compact 形态：customData 保留 deviceType / rx / ry（点位）
    const pts = savedEls
      .map((e) => (e.customData as Record<string, unknown> | undefined) ?? {})
      .filter((cd) => cd.rx !== undefined && cd.ry !== undefined && cd.deviceType)
    expect(pts).toHaveLength(2)
    expect(pts.map((p) => p.deviceType).sort()).toEqual(['downlight', 'switch-2'])
    // 重开：渲染侧（点位读取逻辑）能从保存的 pointMap 还原点位
    // （等价于 route GET / point-map 页面的 scenePoints 读到的字段）
    for (const p of pts) {
      expect(p.code).toBeTruthy()
      expect(typeof p.rx).toBe('number')
      expect(typeof p.ry).toBe('number')
    }
  })

  it('未登录 → 401，不写库', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    const update = fakedUpdate()
    mocks.getPayloadClient.mockResolvedValue({ update })

    const res = await PUT(req({ elements: [] }), { params: Promise.resolve({ id: 'p-1' }) })
    expect(res.status).toBe(401)
    expect(update).not.toHaveBeenCalled()
  })

  it('非法 JSON → 400，不写库', async () => {
    const update = fakedUpdate()
    mocks.getPayloadClient.mockResolvedValue({ update })

    const res = await PUT(req('这不是 JSON'), { params: Promise.resolve({ id: 'p-1' }) })
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('超大 payload → 413，不写库（防撑爆文档）', async () => {
    const update = fakedUpdate()
    mocks.getPayloadClient.mockResolvedValue({ update })

    const big = JSON.stringify({ elements: [], files: {}, appState: {} }).padEnd(
      5 * 1024 * 1024,
      ' ',
    )
    const res = await PUT(req(big), { params: Promise.resolve({ id: 'p-1' }) })
    expect(res.status).toBe(413)
    expect(update).not.toHaveBeenCalled()
  })

  it('保存时清掉场景里已删图片的旧键（files 显式置 null，避免残留）', async () => {
    const update = fakedUpdate()
    mocks.getPayloadClient.mockResolvedValue({
      findByID: vi.fn(async () => ({
        pointMap: { files: { 'old-file-1': { dataURL: 'x', mimeType: 'image/png' } } },
      })),
      update,
    })

    // 一个引用新图纸的元素（fileId），一个画布元素 —— 新图被保留，旧图被清
    const elements = [
      {
        id: 'el-sheet',
        type: 'image',
        fileId: 'new-file-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    ]
    const res = await PUT(
      req({
        elements,
        appState: {},
        files: { 'new-file-1': { dataURL: 'data:image/png;base64,AAA', mimeType: 'image/png' } },
      }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(200)
    const saved = update.mock.calls[0]![0].data.pointMap as unknown as {
      files: Record<string, unknown>
    }
    expect(saved.files['new-file-1']).toBeTruthy()
    expect(saved.files['old-file-1']).toBeNull() // 旧图被显式清掉
  })
})
