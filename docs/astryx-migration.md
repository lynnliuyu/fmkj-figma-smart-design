# Astryx 迁移清单与第一批执行记录（issue #180）

> 基线：`main @ 355ae9a`。锁定版本：`@astryxdesign/core` / `@astryxdesign/cli` 均为 **0.7.11**
> （`node_modules/@astryxdesign/core/package.json`、`pnpm exec astryx --version`）。
> 官方文档已实读：CLI `--full` 与 <https://astryx.atmeta.com/docs/{getting-started,migration,is-my-code-good}>
> 对照（本地 CLI 是锁定版本，站点的 migration-setup / foundation / AppShell 段落与本地一致）。

## 1. 现状（迁移前）

| 项            | 事实                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| 主题          | 6 套官方主题 + 本地 `fanmeng` 品牌主题；**默认 `stone`**（`src/astryx-themes.ts`）。本次保留。                        |
| 层序          | `src/app/(frontend)/layers.css` 最先 import：`reset, theme, base, astryx-base, astryx-theme, components, utilities`。 |
| 全局 CSS      | `styles.css` 手工引入 `astryx.css` + 各主题 CSS；**刻意未引入 `core/reset.css`**。                                    |
| 旧适配层      | `src/components/ui/` 6 个组件（card / dropdown-menu / input / sheet / sidebar / tooltip），被 **11 个文件**引用。     |
| Astryx 使用面 | 109 个 `src` 文件已 import `@astryxdesign/core`。                                                                     |

### reset.css 的隔离验证（本次）

问题：`styles.css` 注释称「不引入 core/reset.css，避免重置既有页面」——需要证据。

1. 隔离环境：本机 dev server（:3001，`PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts` + 本地 :55432 开发库），临时 `/astryx-foundation-check` 页（未提交，验后删除）。
2. 不引入 reset：Astryx `Button` padding 12px/8px、有填充背景；`Card` padding 11px + 1px 边框；`TextInput` 内层 padding 由包裹层提供（0px 是该实现的结构）。官方 foundation 断言通过。
3. 临时引入 `core/reset.css`：同一页三项计算样式完全不变；`/projects`、`/settings`、`/` 的 `h1/h2` 外边距、`ul` padding/list-style、`body` box-sizing 也全部不变（Tailwind preflight 已在 `base` 层做了等价重置；reset 在最低 `reset` 层，层序最先声明）。
4. 结论：旧注释的担心在当前层序下不成立；**本批按官方 getting-started 引入 `core/reset.css`**，并更新注释。证据见 `.export-artifacts/issue180/foundation-*.png`、`legacy-styles` 输出。

## 2. 第一批：工作区外壳（AppShell / TopNav / SideNav）

官方要求先迁移应用框架，再按路由迁移可见控件。本批达成：

- 新增 `src/components/workspace-shell.tsx`：`AppShell(height="fill")` + `TopNav`（品牌 / 当前位置 / AI 开关 / 外观菜单）+ `SideNav`。
- `src/components/app-sidebar.tsx` 重写为原生 `SideNav` + `SideNavSection` + `SideNavItem`：
  - `as={GuardedLink}` 保留未保存修改守卫；Beta / 客户端可用标记分别用 `endContent`（纯展示）与 `actions`（独立下载链接）。
  - 折叠态下「新建项目」用 `IconButton`（原 Button 在 3rem rail 里会被裁字）。
  - 账户 / 设置菜单改用官方 `DropdownMenu`（替换 Radix 适配层）；设置菜单保留 leave-guard 跳转。
- 新增 `workspace-chrome.tsx`：侧栏折叠态共享（localStorage 持久化），点位图画布仍可「进入时收起、离开时恢复」。
- AI 右栏抽屉：Radix `Sheet` → 官方 `Drawer`（`side="end"`，`purpose="form"`）；会话列表的模板卡改用 `ListItem`。
- `AppShell` 自带 skip link / `role=main` / 窄屏导航抽屉；`project-header` 移除自绘 SidebarTrigger。
- 删除 5 个旧适配层：`ui/sidebar`（775 行）、`ui/dropdown-menu`、`ui/sheet`、`ui/input`、`ui/tooltip`。`button-label.test.ts` 迁出 `ui/__tests__`。
- 旧适配层引用：**11 文件 → 1 文件**（仅 `design-pilot` 对照页，见 §4）。

### 改前 / 改后（同一状态，见 `.export-artifacts/issue180/shots-{before,after}/`）

| 状态                   | 文件                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| 桌面浅色               | `desktop-light.png`                                                                                |
| 桌面深色               | `desktop-dark.png`                                                                                 |
| 窄屏 390px             | `narrow-390.png`                                                                                   |
| 键盘焦点（Tab）        | `desktop-focus.png`；新增 `focus-skip-link.png`（首个 Tab = 「跳至内容」，Enter 聚焦 `role=main`） |
| 菜单                   | `menu-account.png` / `menu-settings.png`                                                           |
| 折叠                   | `sidebar-collapsed.png` / `sidebar-expanded.png`                                                   |
| 点位图（自动收起侧栏） | `point-map.png`                                                                                    |

## 3. 路由优先级清单（按价值排序）

| 优先级 | 范围                                                       | 当前状态 / 本批动作                                                                   | 下一步                                                     |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| P0     | 工作区外壳（25 个 workspace 页面共用）                     | ✅ 本批：AppShell / TopNav / SideNav / DropdownMenu / Drawer                          | 观察一轮真实使用后再清 `design-pilot`                      |
| P1     | 设置（`/settings`、外观、公司抬头、成本）                  | 页面 1 个 raw button / 4 个 input / 3 个 table（reports 运营页；含合法 hidden input） | 把设置分组换成 `TabList`/`Section`，reports 表格换 `Table` |
| P2     | 报价（`/quotes`、报价编辑器、打印预览）                    | 页面自身已基本 Astryx（0 raw button/input）；编辑器逻辑复杂                           | 迁移报价列表/编辑器的工具栏与表格壳；保留打印文档渲染      |
| P3     | 项目（`/projects`、点位图、合同、归档）                    | 23 raw button / 14 input，集中在点位图工具条与编辑器                                  | 工具条换 `IconButton`/`Toolbar`；画布本体保留              |
| P4     | 能力中心 / 插件入口                                        | 2 raw button / 1 input；多为卡片与文档                                                | 迁移入口卡片与空态；插件内 canvas 保留                     |
| P5     | 公开站（首页、模板、目录、文档、下载）                     | 已大量 Astryx；含营销版式与动效                                                       | 按区块替换，保留营销视觉                                   |
| P6     | 打印 / 文档（`src/app/(frontend)/print`、`src/documents`） | 19 + 4 个 raw table，版式即产品                                                       | 只统一外围工具栏/按钮，正文保持专用渲染                    |
| P7     | 画布 / 图纸（`src/board`）                                 | 7 raw svg、自有几何与历史栈                                                           | **保留专用实现**，仅统一外围可见交互                       |

## 4. 保留的专用渲染（不迁）

| 区域                                     | 依据                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `src/board/` 点位图 canvas、几何、符号包 | 自绘画布 + 拖拽/缩放/历史栈，无 Astryx 等价物。                                  |
| `src/app/(frontend)/print/` 打印文档     | 版式即交付物，用 DOM/CSS 精确控制分页。                                          |
| `src/documents/` 文档模板                | 同上，且被打印/PDF 复用。                                                        |
| `scaled-frame` / 报价单导出 / 名片画布   | 像素级渲染与导出，不适用交互组件。                                               |
| `design-pilot` 对照页                    | 最后 1 个 `ui/card` 引用；历史定案为「旧 vs Astryx 对照页」，去留需 owner 决定。 |

## 5. 验证矩阵（本批）

| 项            | 命令 / 方式                                                        | 结果                                                                                |
| ------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 单元/集成测试 | `pnpm test`                                                        | **834 passed / 71 files**                                                           |
| 类型          | `pnpm exec tsc --noEmit`                                           | 通过                                                                                |
| 格式 / ESLint | `pnpm exec oxfmt --check`、`pnpm exec eslint src --max-warnings 0` | 通过                                                                                |
| 真浏览器外壳  | `node e2e/issue180-shell-evidence.mjs before                       | after`                                                                              | 6 状态截图；console 0 错误 |
| 交互          | `.export-artifacts/issue180/shell-interactions.mjs`                | 账户菜单 / 设置菜单 / 折叠 / 设置页 / 点位图自动收起 / 窄屏抽屉 全通过              |
| 主流程        | `node e2e/issue177-core-flow.mjs`（BASE=:3001）                    | 新建→保存→重开→生成报价→保存→重开 全通过                                            |
| 页面冒烟      | `node e2e/smoke.mjs`（29 页）                                      | 27 通过；2 条 404 在 **基线 checkout（:3000）复现相同**，属本地库缺素材，非本批回归 |

## 6. 后续批次（建议）

1. **P1 设置**：`TabList` 分组 + `Table` 报表 + `FormLayout`；同一状态截图与键盘复跑。
2. **P3 项目**：点位图工具条 `IconButton` 化；合同/归档按钮统一 `Button`/`AlertDialog`。
3. **P2 报价**：编辑器工具栏与列表壳，保留打印渲染。
4. **P4/P5**：能力中心入口卡、公开站区块（保留营销视觉）。
5. 处理 `design-pilot` 与 `ui/card`（需 owner 决策）。
6. 依赖升级（若做）按官方 `astryx upgrade --from 0.7.11 --apply` 成套验证，单开 PR。

> 迁移未全部落地前 issue #180 保持打开。
