# 流程图 ↔ Agent 协作

流程图不是给 Agent 看的图片，而是**结构化输入**：你在 Docker 编辑器里改图，Agent 读回最新意图，
再按任务授权改代码、改文档，或按你的意见改图。

## 1. 闭环

```text
Agent 生成/修改流程图  →  docker 编辑器（http://127.0.0.1:8767/）人工改字/改连线
        ↑                                      │ 点“保存到项目”
        │                                      ▼
   docs/architecture/system-map.drawio  ←  数据目录主文件 + backups/ 备份 + registry.json
        │
        └─ Agent 用 node scripts/architecture-graph.mjs 读取
```

## 2. 文件在哪

| 文件 | 用途 | 谁写 |
| --- | --- | --- |
| `docs/architecture-data/projects/繁梦空间设计站/system-map.drawio` | 编辑主文件（唯一权威） | 你在 Docker 里保存 |
| `docs/architecture-data/projects/繁梦空间设计站/system-map.editable.registry.json` | 保存时自动生成：每页节点、`moduleId`、`title`、`description`、`status`、`code`、`rules`、`evidenceAsOf`、`notes`、连线 | 服务自动 |
| `docs/architecture-data/backups/繁梦空间设计站/<时间戳>.drawio` | 每次保存前的上一版 | 服务自动 |
| `docs/architecture/system-map.drawio` | 仓库里的 Git 版本，**保存后自动同步**（compose 里 `ARCH_EDITOR_MIRROR`）；含 15 页 | 服务自动 / `pnpm arch:overview` |
| `docs/architecture/system-map.editable.registry.json` | 仓库里的清单（原脚本生成的结构，同样可用 `--registry` 读） | 原脚本 / 手工 |

> 同步是“保存成功后复制一份”，不是实时双向同步。Agent 读 `docs/architecture/` 即可；需要区分“仓库版本是否落后”时看文件修改时间。

## 3. Agent 怎么读

先读**总关系图**（第 1 页）定位，再按页展开细节：它给出主业务线、支撑线与保障线，每个方框的 `notes` 写明对应分图页。

```bash
# 摘要（人也能看懂）：15 页、每页节点与连线、规则与备注；规划节点标【规划，尚未实现】
pnpm arch:read                                  # = node scripts/architecture-graph.mjs

# 先看总览，再进细节
pnpm arch:read -- --page 总关系图
pnpm arch:read -- --json --page 报价保存与固定交付

# 给 Agent 当上下文的完整 JSON（约 120 KB；建议按页取）
pnpm arch:read -- --json

# 按关键词找节点（标题/描述/规则/代码路径）
pnpm arch:read -- --find 报价

# 看你这次改了什么（对比某次保存前的备份）
pnpm arch:read -- --diff docs/architecture-data/backups/繁梦空间设计站/20261021-143122-141582.drawio

# 其他项目（同一镜像服务多份数据）
pnpm arch:read -- --project 其他项目名

# 用分图重建总关系图（只替换第 1 页，其余页保留；写前自动备份）
pnpm arch:overview
```

读取规则（工具已内置，知道即可）：

- **装饰不算节点**：页标题、阶段名、图例、纯说明文字按 `decorative` 处理，不计入业务节点；JSON 里仍保留，需要时自己判断。
- **自动选较新的文件**：注册表由编辑器保存时刷新；若 `.drawio` 更新（例如刚跑了 `arch:overview`），工具改读 `.drawio` 并在 stderr 提示，避免读到过期结构。
- **页面计数以业务节点为准**：摘要表的“节点”列不包含装饰单元格。

输出里每个节点长这样：

```json
{
  "moduleId": "BIZ-QUOTE-SAVE",
  "title": "独立保存报价",
  "description": "服务端校验并保存；来源行删除同步联动点位与场景",
  "status": "current-workflow",
  "code": ["lib/quote-save.ts"],
  "rules": ["ADR 0006 / 0007"],
  "notes": [],
  "evidenceAsOf": "2026-10-21"
}
```

Agent 的使用规则：

- `code` 是**人工声明的实现位置**，不是审计结论；读图后要**再打开这些文件核对**，报告差异，经任务授权后才改代码。
- `status` 区分“现有代码（`current-workflow`）”与“规划（`planned`）”；规划页不能当作已实现或已验收。
- 改图本身不改业务代码；`registry.json` 是派生物，永远以 `.drawio` 为准。
- 领域规则以 `CONTEXT.md` 和 `docs/adr/` 为准；图与文档冲突时先指出，不自行推翻。

## 4. 直接对 Agent 说的提示

```text
读 docs/architecture/system-map.drawio（先跑 node scripts/architecture-graph.mjs --json 拿结构），
再跑 --diff 看最近一次保存改了什么。按改动涉及的节点读取 code 里列出的文件，
报告“图上的流程/规则”与“代码实现”的差异；不要直接改代码，先给差异清单。
```

## 5. 让 Agent 改图

Agent 不应手写 `.drawio` XML 覆盖你的手工修改。推荐：

0. 在编辑器里：双击改文字、拖动改位置、拖动箭头改关系、**Alt+滚轮缩放**、**Alt+左键拖动画布**；
1. Agent 给出**逐节点修改建议**（改哪页、哪个 `moduleId`、原文与建议文字、连线增删）；
2. 你在 Docker 编辑器里改（或授权 Agent 用脚本按 `moduleId` 精确改属性，改前先备份、改后跑 `--diff` 复核）；
3. 保存后 Agent 读回结构再核对。

## 6. 常见问题

- **页面里看不到保存按钮的编辑效果**：以“保存到项目”状态栏文字为准；保存成功会提示“已保留上一版备份”。
- **保存报 409**：文件被其他窗口或 Agent 改过。先“下载副本”保留编辑，再刷新页面重新打开。
- **保存时浏览器只显示 `Failed to fetch`**：编辑凭证过期了（服务重启过、页面开得太久，或用了不带 `t=` 的旧书签）。画布内容还在：先点“下载副本”保留，再回到项目列表（`http://<地址>:8767/`）重新点“编辑”进入即可。凭证有效期 7 天，并写在数据目录的 `.editor-handoff.json`，容器重启或重建都不会作废。
- **`--diff` 显示“没有差异”**：对比的是 `.drawio`，如果只改了节点坐标，结构看起来一样是正常的。
- **容器里看不到仓库路径**：compose 把仓库挂到 `/repo`；用 `docker compose -f docker/architecture-editor/docker-compose.yml up -d --force-recreate` 重建后生效。
