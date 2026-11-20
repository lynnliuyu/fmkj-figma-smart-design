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

| 优先级 | 范围                                                       | 当前状态 / 本批动作                                                                                    | 下一步                                                                     |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| P0     | 工作区外壳（25 个 workspace 页面共用）                     | ✅ 本批：AppShell / TopNav / SideNav / DropdownMenu / Drawer                                           | 观察一轮真实使用后再清 `design-pilot`                                      |
| P1     | 设置（`/settings`、外观、公司抬头、成本）                  | 页面 1 个 raw button / 4 个 input / 3 个 table（reports 运营页；含合法 hidden input）                  | 把设置分组换成 `TabList`/`Section`，reports 表格换 `Table`                 |
| P2     | 报价（`/quotes`、报价编辑器、打印预览）                    | 页面自身已基本 Astryx（0 raw button/input）；编辑器逻辑复杂                                            | 迁移报价列表/编辑器的工具栏与表格壳；保留打印文档渲染                      |
| P3     | 项目（`/projects`、点位图、合同、归档）                    | 23 raw button / 14 input，集中在点位图工具条与编辑器                                                   | 工具条换 `IconButton`/`Toolbar`；画布本体保留                              |
| P4     | 能力中心 / 插件入口                                        | 阶段筛选是自绘链接条；空态用本地包装；入口卡已是 AstryxCard；插件内 canvas 仍有 2 raw button / 1 input | ✅ 本批：阶段筛选 → `TabList`/`Tab`；空态 → 官方 `EmptyState`；canvas 保留 |
| P5     | 公开站（首页、模板、目录、文档、下载）                     | docs 外壳 9 个裸 button（面包屑/搜索/目录/翻页/闭环卡/内联）；下载页与 catalog/templates 已是 Astryx   | ✅ 本批：docs 外壳全部原生化；营销版式/动效保留                            |
| P6     | 打印 / 文档（`src/app/(frontend)/print`、`src/documents`） | 19 + 4 个 raw table，版式即产品                                                                        | 只统一外围工具栏/按钮，正文保持专用渲染                                    |
| P7     | 画布 / 图纸（`src/board`）                                 | 7 raw svg、自有几何与历史栈                                                                            | **保留专用实现**，仅统一外围可见交互                                       |

## 3.5 第二批（设置 / 项目工具栏）

- **设置**：分区导航从原生 `<a>` 换成 Astryx `Button href`；`sticky top-12` 改为 `top-0`（AppShell 的 TopNav 在 main 之外，main 内部滚动容器从 0 起算）。
- **项目工具栏**：
  - 「全部显示」→ `Button variant=ghost`；
  - 「底图浓度」两处 range → `Slider`（`valueDisplay="text"`、`formatValue`）；
  - 「显示范围」4 项原生 radio → `SegmentedControl`/`SegmentedControlItem`；
  - 缩放百分比原生按钮 → `Button variant=ghost`。
- **未动**：画布工具组（Tooltip + 快捷键 + `aria-pressed` 的专用图标条）、图层开关行（自定义 role=switch 行）、画布右键菜单；这些与画布坐标/快捷键绑定，迁移会改变密度与键位提示。
- **阻塞**：`/settings/reports` 是 operator 专属页；演示账号非 operator，且本机 PostgreSQL 曾出现长查询（调度台已终止），不再用数据库权限变更去复现。该页的 3 个原生 table 与缩略图按钮未迁移，保留功能基线。
- **design-pilot 论证**：`src/app/(frontend)/design-pilot/page.tsx` 是**旧组件 vs Astryx 的对照页**（历史定案，见 `docs/archive/2026-11-13-night-p5.md`），唯一引用 `src/components/ui/card.tsx`。它不是生产功能页，删页/迁卡都会让对照失去意义；本批**保留页面与 `ui/card`**，不删用户资产。旧适配层其余 5 个已在 PR #182 移除。

## 3.6 第三批（能力中心 / 公开站外壳控件）

> 基线 `main @ 13795cc`（含 #205 报价编辑器外壳）。只动可见外壳交互，不动营销版式/动效/画布/打印。

### 能力中心

| 位置                                                                     | 旧控件                                                          | 官方组件                                                                                                             | 功能保持                                                                                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `capabilities/page.tsx` 阶段筛选                                         | 自绘 `FilterTabs`（`role=tablist` 链接条）                      | `TabList`/`Tab`（新增客户端包装 `stage-filter-tabs.tsx`，`router.push(href, { scroll: false })` 保持软跳转与不滚顶） | 6 项阶段、URL `?stage=`、选中态不变；`/plugins?stage=` 旧地址直连改为 `/capabilities?stage=`（同一目标，少一跳 308） |
| `capabilities/tools`、`capabilities/templates`、`capabilities/[id]` 空态 | 本地 `@/components/empty-state`                                 | `@astryxdesign/core/EmptyState`（`action`→`actions`）                                                                | 文案/图标/操作按钮不变                                                                                               |
| `capabilities/plugin-list.tsx` 入口卡                                    | —（已是 `AstryxCard`/`Badge`/`Button`，第二批 #138 零漂移迁移） | 不动                                                                                                                 | 点击「详情」/标题进详情页不变                                                                                        |
| `capabilities/[id]` 详情外壳                                             | —（已是 `Card`/`Layout`/`Button`/`Badge`）                      | 不动                                                                                                                 | 返回能力中心、项目入口不变                                                                                           |
| `capabilities/business-card/card-studio.tsx`                             | 2 raw button + 1 input（头衔快捷、版式缩略图、信息输入）        | **保留**                                                                                                             | 名片画布与导出一致性优先；见 §4                                                                                      |
| `capabilities/tools` 入口卡（封面动效）                                  | `HoverPrefetchLink` 手绘卡                                      | **保留**                                                                                                             | 悬停位移/封面缩放是设计动效；`ClickableCard` 不支持 `className`/`group`，替换会丢动效                                |

### 公开站（docs 外壳）

`docs/docs-client.tsx` 裸 button 9 → 0：

| 位置                                | 旧控件                                | 官方组件                                                        | 可访问名称                                             |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| 面包屑「Docs」                      | 裸 button                             | `Button variant=ghost`                                          | `Docs`（不变）                                         |
| 搜索触发器                          | 裸 button（假输入框）                 | `Button variant=ghost` + `children` 覆盖可见内容                | `搜索文档（⌘K）`（不变，label 走 aria-label）          |
| 左侧目录 4 组 × N 项                | `<ul>` + 裸 button（border-l 指示条） | `List`/`ListItem`（`isSelected`、`endContent` 徽标、`onClick`） | 章节标题（不变）；选中态 `aria-current`                |
| 上一章 / 下一章                     | 裸 button 卡片                        | `ClickableCard`（`label` = 原拼合文本）                         | 与原计算名一致（如「上一章 · 开始使用 使用手册总览」） |
| 搜索弹窗结果项                      | 裸 button                             | `ListItem`（`onClick`）                                         | 标题 + 分组（不变）                                    |
| 总览「五步闭环」6 张卡              | 裸 button 卡                          | `ClickableCard`（`label` = step+title+desc）                    | 与原计算名一致                                         |
| Callout 内联「03. 智能生成点位…」×2 | 裸 button（下划线文字）               | `Button variant=ghost`                                          | 文本（不变）                                           |

### 公开站（下载 / catalog / templates）

- **下载页**：已是 `Button`/`Badge`/`Kbd`/`Skeleton`；安装包直链刻意保留原生 `<a>`（`Button` 不传 `as`，避免 next/link 预取整包）。本批只核对未发布空态（`即将上线` 禁用按钮 + 「使用网页版」回退）。
- **catalog / templates**：两页无客户端筛选控件（服务端全量渲染）；catalog 无产品时走「图例与施工规范」空态文案分支，templates 用内置模板恒非空。本批核对两页分支与对比表，不改营销版式。

## 4. 保留的专用渲染（不迁）

| 区域                                     | 依据                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/board/` 点位图 canvas、几何、符号包 | 自绘画布 + 拖拽/缩放/历史栈，无 Astryx 等价物。                                                        |
| `src/app/(frontend)/print/` 打印文档     | 版式即交付物，用 DOM/CSS 精确控制分页。                                                                |
| `src/documents/` 文档模板                | 同上，且被打印/PDF 复用。                                                                              |
| `scaled-frame` / 报价单导出 / 名片画布   | 像素级渲染与导出，不适用交互组件；名片工坊的 2 按钮 + 1 输入（头衔快捷/版式切换/信息输入）随画布保留。 |
| `design-pilot` 对照页                    | 最后 1 个 `ui/card` 引用；历史定案为「旧 vs Astryx 对照页」，去留需 owner 决定。                       |

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

1. **P1 设置收尾**：`/settings/reports` 的 3 个 table → `Table`（需 operator 验收环境）；company-form 的文件选择保留原生（表单需要 `name=logo` 提交，FileInput 是受控组件，替换会破坏 FormData）。
2. **P3 项目收尾**：合同/归档的确认与操作按钮统一 `Button`/`AlertDialog`；画布工具组维持专用实现。
3. **P2 报价**：编辑器工具栏与列表壳，保留打印渲染。
4. **P4/P5 收尾**：`capabilities/tools` 入口卡（封面动效需 `ClickableCard` 支持 `className`/`group` 后再迁）、`FilterTabs` 仍被 `/products`、`/projects` 使用（随各自批次迁 `TabList`）、`business-card` 工坊随画布保留。
5. `design-pilot` / `ui/card`：保留（见 §3.5 论证），除非 owner 决定删除对照页。
6. 依赖升级（若做）按官方 `astryx upgrade --from 0.7.11 --apply` 成套验证，单开 PR。

## 7. 第二批验证（叠加在 b95ec3f）

| 项             | 命令                                                                     | 结果                                                                                                   |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 单测           | `pnpm test`                                                              | 810 passed / 69 files                                                                                  |
| 类型/格式/Lint | `pnpm exec tsc --noEmit`、`oxfmt --check`、`eslint src --max-warnings 0` | 通过                                                                                                   |
| 设置页         | `.export-artifacts/issue180-batch2/probe.mjs`                            | 分区导航 3 个 Astryx Button；吸顶 navY=mainY=61；锚点 `#settings-cost` 跳转；深色/390 窄屏/焦点截图    |
| 点位图         | 同上                                                                     | Slider 72→65；显示范围分段「仅开关」选中；图层隐藏→「全部显示」出现并生效；缩放按钮存在；深色/窄屏截图 |
| 控制台         | 同上                                                                     | 0 错误                                                                                                 |

> 证据：`.export-artifacts/issue180-batch2/shots/`（settings-{light,dark,narrow,focus,sticky-scrolled}.png、point-map-{light,dark,narrow,popover,interacted}.png）。
> 复跑：`node .export-artifacts/issue180-batch2/probe.mjs`（本机 :3001 + demo 账号）。

## 8. 第三批验证（能力中心 / 公开站，叠加在 13795cc）

隔离环境：新建合成库 `fmkj_astryx_p4p5`（`payload migrate` + `seed-smoke`，验后 drop）；
改前 = `origin/main` 代码 :3184，改后 = 本分支 :3185。脚本：`e2e/issue180-p4p5-evidence.mjs <before|after>`。

| 项             | 命令                                                                                                           | 结果                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 单测           | `pnpm test`                                                                                                    | **875 passed / 75 files**                                                                                 |
| 类型/格式/Lint | `pnpm exec tsc --noEmit`、`oxfmt --check`、`eslint . --ignore-pattern '.export-artifacts/**' --max-warnings 0` | 通过                                                                                                      |
| 知识库         | `pnpm run knowledge:check`                                                                                     | 16/16 通过                                                                                                |
| 生产构建       | 占位 env + `payload generate:importmap` + `pnpm build`                                                         | 通过；`/capabilities`、`/docs`、`/catalog`、`/templates` 的 static/dynamic 与基线一致（本批未改缓存配置） |
| 真浏览器       | `BASE=:3184 node e2e/issue180-p4p5-evidence.mjs before`                                                        | 37/37；18 张整页截图（6 页 × 浅色/深色/390）                                                              |
| 真浏览器       | `BASE=:3185 node e2e/issue180-p4p5-evidence.mjs after`                                                         | **38/38**；18 张整页截图；console 0 错误；390 无横向溢出                                                  |

交互实测（after 全通过）：能力中心入口卡「详情」→ 详情页 → 返回；阶段筛选（报价与方案 / 全部阶段）；
docs 目录跳转 + `#hash`、⌘K 搜索（键盘 Enter 打开、结果跳章）、上一章/下一章（键盘 + 指针）、总览闭环卡点击；
下载页安装包直链（拦截 manifest 造发布清单）+ 未发布空态回退；catalog 图例/在售分支；templates 对比表 20 行。

> 证据：`.export-artifacts/astryx-p4p5/shots-{before,after}/01–18-*.png`（整页截图，非元素裁剪）。

> 迁移未全部落地前 issue #180 保持打开。
