# HEARTBEAT.md — 繁梦空间 巡检清单

每次心跳按顺序检查下面各项。**全部正常**就直接回 `HEARTBEAT_OK`（会被抑制，不打扰 noone）。
只有发现**需要处理的事**才发消息；发消息时说清：哪一项有问题、证据（命令输出/链接）、建议动作，并等批准再动手。

红线：巡检**只读**。不改代码、不推 main、不碰生产密钥、不直连生产数据库。

> 主仓库 `fmkj-latest` 是工作区根目录的**子目录**；所有 `git` / `pnpm` 命令都要先
> `cd fmkj-latest`。工作区根目录本身不是 git 仓库。

---

## 1. 仓库状态

```bash
git status --porcelain        # 意外改动？
git log --oneline -5          # 最近提交是否符合预期
git fetch --prune && git status -sb   # 落后 / 领先远端？
```

- 工作区有**我预期外**的未提交改动 → 报告
- main 落后远端 → 报告（先不自动 pull）

## 2. Issue 与 PR 交接

```bash
# 平台未接 GitHub MCP 时，跳过并在报告里注明"未检查"
```

- 有没有带 `needs-local` 标签的 Issue？（本地接手的信号）
- 有没有**卡住超 24 小时**的开放 PR？
- 有没有 CI 失败的 PR？

## 3. CI 健康

- 最近一次 main 的 CI 是不是绿的？
- 有失败的 workflow run → 抓失败步骤的日志摘要，报告

## 4. 待办与计划

- `.alma/plan/` 里有没有待 claim 的任务块？
- `alma tasks list` 有没有今天到期未完成的？

## 5. 文档同步

- `AGENTS.md` / `PROJECT-ARCHITECTURE.md` / `AUTOMATION-TEAM.md` 最近有没有被改但没同步记录？
- 本轮改的代码是否需要在 `PROJECT-ARCHITECTURE.md` 的「架构变更记录」补一条？（架构变更必须走提案）

## 6. 生产环境（只读健康检查）

只查健康，不查客户数据：

- 站点 / 接口健康检查是否 200？
- 磁盘、证书有效期、备份是否正常？

> 平台未接监控前，这一项标注「未检查」，别猜。

---

## 触发心跳之外的自动化（cron）

> 心跳**不做**重活。下面这些是定时任务，确认后再装：

- 每日巡检（走本清单）
- 每周依赖 / 安全报告
- 每周测试与清理报告

（用 `alma cron add "<名称>" every "<间隔>" --mode isolated --prompt "<要做的事>" --deliver-to <chatId>`）

---

## 记录

发现的问题写进 `memory/learnings.jsonl`（append-only），一行一条：

```json
{"date":"YYYY-MM-DD","area":"ci|repo|issue|docs|prod","finding":"...","action":"...","status":"open|fixed"}
```

踩过的坑也写这里，下一个接手的人（或 agent）就不用重踩。
