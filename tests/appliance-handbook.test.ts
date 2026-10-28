import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

import { buildHandbook, extractOverview, inline, renderMarkdown, slugify } from "../scripts/build-appliance-handbook.mjs"

describe("Markdown 转网页", () => {
  it("标题带锚点，锚点跟文档里的目录链接对得上", () => {
    const { html, toc } = renderMarkdown("## 2.4 母盘（批量出货）\n")
    expect(html).toContain('id="24-母盘批量出货"')
    expect(toc).toEqual([{ id: "24-母盘批量出货", level: 2, text: "2.4 母盘（批量出货）" }])
    // 手册里那张索引表用的就是这种锚点
    expect(slugify("5.2 发货前自检（一条命令）")).toBe("52-发货前自检一条命令")
    expect(slugify("4.1 在线更新（客户在页面上点按钮）")).toBe("41-在线更新客户在页面上点按钮")
  })

  it("表格、代码块、列表、引用都能出来", () => {
    const { html } = renderMarkdown([
      "| 我要做什么 | 看哪一节 |",
      "| --- | --- |",
      "| 装新设备 | 2.1 |",
      "",
      "```bash",
      "docker compose up -d",
      "```",
      "",
      "- 第一条",
      "- 第二条",
      "",
      "> 注意：不要断电。",
    ].join("\n"))

    expect(html).toContain("<th>我要做什么</th>")
    expect(html).toContain("<td>装新设备</td>")
    expect(html).toContain('class="code"')
    expect(html).toContain("docker compose up -d")
    expect(html).toContain("<li>第一条</li>")
    expect(html).toContain("<blockquote>")
  })

  it("行内标记不会把 HTML 注入进去", () => {
    expect(inline("用 `a < b` 比较")).toBe("用 <code>a &lt; b</code> 比较")
    expect(inline("**粗** 和 [链接](https://example.com)")).toContain('target="_blank"')
    expect(inline("<script>alert(1)</script>")).not.toContain("<script>")
  })
})

describe("生成的手册页面", () => {
  it("文档里每个内部链接都有对应的锚点（防止改标题后目录断链）", async () => {
    const guide = await readFile("docs/local-appliance-deployment.md", "utf8")
    const html = buildHandbook({ guide, plan: "", generatedAt: "2026-10-22 00:00", registry: "v0.3.8", device: "v0.3.8" })

    const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]))
    const links = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])
    const broken = [...new Set(links)].filter((link) => link && !ids.has(link))

    expect(broken).toEqual([])
    expect(links.length).toBeGreaterThan(5)
  })

  it("只把执行记录的「现状速览」摘进附录，不带整份计划", () => {
    const plan = "# 033\n\n## 现状速览（2026-10-22 收尾）\n\n| 能力 | 版本 |\n| --- | --- |\n| 装机 | v0.3.5 |\n\n## 目标\n\n很长很长的正文"
    const overview = extractOverview(plan)
    expect(overview).toContain("装机")
    expect(overview).not.toContain("很长很长的正文")
  })
})
