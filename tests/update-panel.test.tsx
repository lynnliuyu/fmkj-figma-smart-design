import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { UpdatePanel } from "../app/admin/_components/update-panel"
import type { UpdateStatus } from "../lib/deploy-update"

const state: UpdateStatus = {
  agent: null, check: null, currentVersion: "v0.3.8", request: null, update: null,
  progress: { busy: false, message: "还没有检查过版本。", tone: "info" },
}

describe("更新页面如实显示检查结果", () => {
  it("没有检查记录时不把设备说成已经最新", () => {
    const html = renderToStaticMarkup(createElement<{ initial?: UpdateStatus | null }>(UpdatePanel, { initial: state }))
    expect(html).not.toContain("已经是最新版本")
    expect(html).toContain("请先检查新版本")
  })

  it("检查失败时给出重试提示，不显示已经最新", () => {
    const html = renderToStaticMarkup(createElement<{ initial?: UpdateStatus | null }>(UpdatePanel, { initial: {
      ...state,
      check: { checkedAt: "2026-10-24T00:00:00Z", currentVersion: "v0.3.8", error: "连接失败", latestVersion: null, signature: "unsigned", source: "index", updateAvailable: false },
    } }))
    expect(html).not.toContain("已经是最新版本")
    expect(html).toContain("检查失败，请重试")
  })
})
