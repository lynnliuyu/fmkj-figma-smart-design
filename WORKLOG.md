# WORKLOG.md — 已完成记录

倒序，最新在上。每条：日期 / 做了什么 / 分支或 PR / 验证方式。

---

## 2026-11-08 · 自动化基建 Phase 0

- 分支 `chore/automation-phase0`
- 规划文档入库（PROJECT-ARCHITECTURE.md / AUTOMATION-TEAM.md）
- AGENTS.md 追加团队协作与自动化段；新增 HEARTBEAT.md、memory/（learnings.jsonl）
- CI 修复：knowledge:check 在无 Figma 环境时必红（改用自托管配置垫片）；新增生产构建门禁；触发改为所有分支
- 验证：本地 tsc / knowledge:check(16 项) / importmap / build 全绿；GitHub Actions run 42392504736 与后续 run 均 **success**

## 2026-11-08 · Beta 文档回落 + 摘除四个已封存插件

- 分支 `feat/beta-docs-cleanup`（基于 `chore/automation-phase0`）
- 新增 `src/components/beta-doc-link.tsx`，四处入口落位（项目信息 / 点位图 / 报价 / 归档）
- 摘除 site-survey / wiring-schedule / procurement / scene-handover 四个插件定义，
  打印页去掉插件 gate，归档页去重，删除 project-toolbox.tsx 死代码
- 验证：本地 tsc / knowledge:check(16) / importmap / build 全绿；GitHub Actions `eef7214` **success**
