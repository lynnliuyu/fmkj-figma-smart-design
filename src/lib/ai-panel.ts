/**
 * AI 对话右栏的布局常量与判定（纯函数，单测见 ai-panel.test.ts）。
 *
 * #190 起右栏不再是抽屉：与左侧导航一样**参与布局**。
 * - 右栏永远作为常驻列（inline），宽度用现有 ai-panel-width 的 Min/Max 夹紧 + localStorage 记忆。
 * - 窗口变窄时右栏按「主内容最小宽度」夹紧自己的宽度，保证中央编辑区可用；
 *   夹紧只是临时的（不写入存储），放宽后回到用户保存的宽度。
 * - 视口窄到连最小布局都放不下（< AI_PANEL_COMPACT_WIDTH）时，`/ai` 整页承接会话
 *   （同一个 dock、同一份草稿/流式订阅），右栏隐藏，主页面不被遮挡。
 * - 点位图（point-map）有 lg:w-72 的设备与属性栏，右栏的夹紧下限更保守（见 minFor）。
 */
export const AI_PANEL_BREAKPOINT = 1440
/** 主内容的最小可用宽度：低于它主内容已被挤得不可用，右栏让位（隐藏，用 /ai 整页）。 */
export const AI_PANEL_COMPACT_WIDTH = 1024
/** 点位图：左导航 + 设备/属性栏 + 画布，可用宽度更紧，右栏更早让位。 */
export const AI_PANEL_COMPACT_POINTMAP_WIDTH = 1280

export type AiPanelMode = 'inline' | 'hidden'

/** 右栏常驻；只在视口放不下主内容时隐藏（此时用 /ai 整页接续会话）。 */
export function aiPanelMode(viewportWidth: number): AiPanelMode {
  return viewportWidth >= AI_PANEL_COMPACT_WIDTH ? 'inline' : 'hidden'
}

/** 该路径下右栏的宽度下限：普通页 240；点位图要给设备/属性列和画布留空间。 */
export function aiPanelMinWidth(pathname: string | null | undefined): number {
  return /^\/projects\/[^/]+\/point-map/.test(pathname ?? '') ? 280 : 240
}

/**
 * 右栏实际渲染宽度：用户保存宽度与「主内容最小可用宽度」取较小者（临时夹紧）。
 * 视口足够时返回保存宽度原值；夹紧不写入存储，放宽后自动恢复。
 */
export function clampAiPanelToViewport(
  savedWidth: number,
  viewportWidth: number,
  pathname: string | null | undefined,
  sidebarWidth = 256,
): number {
  const reserved = sidebarWidth + aiPanelMinWidth(pathname) + 64 /* 页边距 */
  const available = viewportWidth - reserved
  if (available >= savedWidth) return savedWidth
  return Math.max(aiPanelMinWidth(pathname), Math.min(savedWidth, available))
}

/**
 * `/ai` 整页已经有自己的 AiSidebarDock 实例（ai/page.tsx）。
 * 右侧栏在 `(workspace)` 内常驻；若 `/ai` 上也渲染，同一页面会出现两个会话 view、
 * 两套流式订阅。所以只在**完全一致**的 `/ai` 路径隐藏右栏；
 * `/ai/image`、`/ai/image/style` 没有 dock 实例，照常显示右栏。
 */
export function shouldShowAiPanel(pathname: string): boolean {
  return !/^\/ai\/?$/.test(pathname)
}
