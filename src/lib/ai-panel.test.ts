import { describe, expect, it } from 'vitest'

import {
  AI_PANEL_BREAKPOINT,
  AI_PANEL_COMPACT_POINTMAP_WIDTH,
  AI_PANEL_COMPACT_WIDTH,
  aiPanelMinWidth,
  aiPanelMode,
  clampAiPanelToViewport,
  shouldShowAiPanel,
} from './ai-panel'

describe('aiPanelMode（#190：右栏常驻，不再抽屉）', () => {
  it('视口放不下主内容（<1024）时隐藏，用 /ai 整页承接', () => {
    expect(aiPanelMode(320)).toBe('hidden')
    expect(aiPanelMode(768)).toBe('hidden')
    expect(aiPanelMode(AI_PANEL_COMPACT_WIDTH - 1)).toBe('hidden')
  })

  it('1024 及以上右栏常驻参与布局（1280 也不再是抽屉）', () => {
    expect(aiPanelMode(AI_PANEL_COMPACT_WIDTH)).toBe('inline')
    expect(aiPanelMode(1280)).toBe('inline')
    expect(aiPanelMode(AI_PANEL_BREAKPOINT)).toBe('inline')
    expect(aiPanelMode(1920)).toBe('inline')
  })
})

describe('aiPanelMinWidth', () => {
  it('点位图给设备/属性列与画布留更多空间', () => {
    expect(aiPanelMinWidth('/projects/abc/point-map')).toBe(280)
    expect(aiPanelMinWidth('/projects')).toBe(240)
    expect(aiPanelMinWidth(null)).toBe(240)
  })
})

describe('clampAiPanelToViewport（临时夹紧，不写存储）', () => {
  it('视口足够时返回保存宽度原值', () => {
    expect(clampAiPanelToViewport(320, 1920, '/projects')).toBe(320)
    expect(clampAiPanelToViewport(480, 1920, '/projects')).toBe(480)
  })

  it('普通页 1280：夹到可用宽度但不低于 240', () => {
    // 1280 - 256(sidebar) - 240(min) - 64(边距) = 720 可用 → 480 保存值放得下
    expect(clampAiPanelToViewport(480, 1280, '/projects')).toBe(480)
    // 保存值超可用时夹紧：1100 可用 540 → 仍 480；900 → 540 不可能，用 480 上限内
    expect(clampAiPanelToViewport(480, 1024, '/projects')).toBeLessThanOrEqual(480)
    expect(clampAiPanelToViewport(480, 1024, '/projects')).toBeGreaterThanOrEqual(240)
  })

  it('点位图 1280：下限更高（280），更早压缩右栏', () => {
    const w = clampAiPanelToViewport(480, 1280, '/projects/abc/point-map')
    expect(w).toBeLessThanOrEqual(480)
    expect(w).toBeGreaterThanOrEqual(280)
  })
})

describe('shouldShowAiPanel', () => {
  // /ai 整页自己有一个 AiSidebarDock；右栏再渲染会变成两个会话实例
  it('/ai 页隐藏右栏', () => {
    expect(shouldShowAiPanel('/ai')).toBe(false)
    expect(shouldShowAiPanel('/ai/')).toBe(false)
  })

  it('其他页面显示右栏（含没有 dock 的 /ai/image 子页）', () => {
    expect(shouldShowAiPanel('/projects')).toBe(true)
    expect(shouldShowAiPanel('/projects/abc/point-map')).toBe(true)
    expect(shouldShowAiPanel('/ai/image')).toBe(true)
    expect(shouldShowAiPanel('/ai/image/style')).toBe(true)
  })
})
