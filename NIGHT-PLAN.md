# NIGHT-PLAN.md — 2026-11-13 夜间目标

> noone 的指令（00:27）：**做一个整晚的安排，一个目标任务，中途不要问我。**
> 本文件是夜间唯一事实来源。任何一轮开工先读这里，按游标往下做，做完立刻回写。

## 0. 边界（诚实声明）

我不是一个持续运行的进程。我按轮次响应，做完一轮就停。
所以这份计划的执行方式是：

- **每轮做一个完整批次（一个 PR），做完自己验收、自己合并、回写游标。**
- **中途不问你任何问题。** 决策全部记录在本文件「§6 决策日志」里，你早上可以复核。
- 如果中途被打断（Alma 重启 / 上下文耗尽），**下一轮读本文件的游标就能接着干**，不需要聊天记录。
- 收敛不了就停手，把原因写进 §6，不硬凑。

## 1. 唯一目标

**把 Astryx 原生化推到「适配层可以开始删除」的状态。**

不是「多提几个 PR」，是：让 `src/components/ui/*.tsx` 这 30 个兼容层文件里，
**尽可能多的文件变成零引用**，为 P5（删适配层）铺平道路。

## 2. 起点（2026-11-13 00:30 实测）

```
分支        feat/p3-select-controlled（领先 main 1 个提交，未合并）
未合并 PR   #132 refactor(P3): 受控 Select → 官方 Selector（4 处）
验收        tsc ✅  oxfmt ✅  knowledge:check 需本地 env（CI 内不受影响）
```

### 适配层 30 个文件的真实引用数（实测，不是文档抄的）

**已零引用 —— 可直接删（8 个）**

```
toggle · tabs · skeleton · sheet · popover · input-otp · input-group · field
```

**仍被引用 —— 需迁移（22 个）**

```
card 14        label 12       input 11      dropdown-menu 11
textarea 5     sidebar 5      select 5      tooltip 3     table 3
separator 2    scroll-area 2  radio-group 2 progress 2    kbd 2
button 2       switch 1       sonner 1      command 1     badge 1
```

> ⚠️ 文档里写的「P5 删 30 个文件」不准确。**只能先删 8 个**，其余要逐个迁移掉引用。

## 3. 夜间批次（按顺序，做完一批勾一批）

### 批次 A —— 收尾并合并 #132 ⬜

- 复核 tsc / oxfmt（已过）
- 合并 #132 到 main（squash）
- 验收：main 上 tsc 仍绿
- **产出**：main 干净、无悬挂 PR

### 批次 B —— 删 8 个零引用文件 ⬜

- 逐个 `grep -r` 二次确认零引用（含 `__tests__` 与动态 import）
- 删除：`toggle tabs skeleton popover input-otp field`（6 个）
- **不删**：`sheet`（sidebar 依赖）/ `input-group`（command 依赖）
- 验收：`tsc --noEmit` + `oxfmt --check` + `pnpm build` 全绿
- 分支 `chore/p5-drop-unused-adapters`，走 PR
- **产出**：适配层 30 → 22

### 批次 C —— `card`（14 处引用，最大单块）⬜

- ✅ **判断已纠正**：官方 `Card` + `Layout` 三槽可等价承接，不需要重写结构。配方见 P4-HANDOFF §P3
- 逐文件判断：能直接换的换，需要重写结构的单独记
- 验收：tsc + oxfmt + build
- **产出**：card 引用清零或显著下降 + 一份「哪些不能转」的清单

### 批次 D —— `label` 12 + `input` 11 ⬜

- label 已有四条跳过规则（见 P4-HANDOFF §P3），按规则执行
- input 的保留项：`type=number/date`、`defaultValue` 非受控
- **该跳就跳**：命中规则就报「0 处转换」，不硬凑
- **产出**：两个文件引用清零或记录保留理由

### 批次 E —— `dropdown-menu` 11 ⬜

- 独立档位，不与 C/D 交织
- **产出**：清零或记录保留项

### 批次 F —— 剩余低引用（textarea/sidebar/select/tooltip/table 等 14 个）⬜

- 按引用数从高到低
- 可拆成 2 个互不重叠的文件组并行
- **产出**：尽可能清零

### 批次 G —— 收尾报告 ⬜

- 回写本文件：每批结果、剩余引用数
- 更新 `WORKLOG.md` + `PLAN.md`
- **产出**：早上你打开就能看懂的结项报告

## 4. 每批的固定动作（不许省）

1. 开分支 → 改 → `pnpm exec tsc --noEmit` → `pnpm exec oxfmt --check`（必要时 `--write` 再 check）
2. 提交（**提交前必跑 oxfmt**，这是 11-11 踩过两次的坑）
3. 推 → 建 PR → 等 CI → 合并
4. **回写本文件**：勾掉批次、记下 PR 号、记下实测数字
5. 如果 CI 红且 10 分钟内修不好 → 停手，原因写进 §6

## 5. 禁止事项

- ❌ 不问 noone 任何问题（这是本次指令的核心）
- ❌ 不为了凑数字硬转（P3 的好样本：该跳就跳）
- ❌ 不改架构（模块边界 / 数据模型 / 权限 / 插件 / AI 模块 / 模板体系）
- ❌ 不动 `.env` / 密钥 / 生产数据
- ❌ 不归档或删除 noone 的会话数据
- ❌ 不做没有验收证据的「完成」声明

## 6. 决策日志（我自己拍的板，记下来供复核）

| 时间  | 决策                                          | 理由                             |
| ----- | --------------------------------------------- | -------------------------------- |
| 00:30 | 夜间目标是「推到可删适配层」，不是「多提 PR」 | 数字好看没用，P5 才是终点        |
| 00:30 | 先合并 #132 再开新活                          | 悬挂 PR 是最贵的债               |
| 00:30 | 批次 B（删 8 个）排在 card 之前               | 机械活先清，降低后续迁移的噪音   |
| 00:30 | card 不并行                                   | P4 的教训：结构性重写并行 = 白跑 |

## 7. 游标（每轮更新）

```
当前批次：C（card 剩余 T2/T3）
已完成：  A ✅  B ✅  C-1 ✅  C-2 ✅    C-3 ⏳ 待 CI
剩余引用总数：card 从 14 → 8 个文件
最后更新：2026-11-13 02:40
```

### 执行记录

| 批次 | 结果                                           | 证据                             |
| ---- | ---------------------------------------------- | -------------------------------- |
| A    | ✅ 合并 PR #132（受控 Select → 官方 Selector） | squash `6946748`                 |
| B    | ✅ 合并 PR #133（删 6 个零引用文件）           | squash `8d09e1a`；适配层 30 → 24 |

**批次 B 的实测偏差（重要，已修正计划）**：
文档说「P5 删 30 个文件」，实际逐文件扫引用后发现只能删 6 个，不是 8 个：

- `sheet.tsx` 被 `sidebar.tsx` 依赖（sidebar 自己还有 5 处引用）
- `input-group.tsx` 被 `command.tsx` 依赖（command 还有 1 处引用）
  → 这两个留到 sidebar / command 迁移完之后再删。

### 批次 C 的三个子批（实测拆分，不是原计划）

原计划把 card 当一个批次，实际拆成三个子批才推得动：

| 子批 | 范围                                | 结果                             |
| ---- | ----------------------------------- | -------------------------------- |
| C-1  | 4 个文件的标准卡                    | ✅ #134                          |
| C-2  | T1 档 8 张（plain / py-0 型）       | ✅ #135                          |
| C-3  | reports-client 11 张（T2 逐槽反推） | ⏳ #136（转了 7 张，4 张待下轮） |

**决策日志追加：**

| 时间  | 决策                                                        | 理由                                                                                    |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 01:30 | Card 分三档：T1 直接转 / T2 逐槽反推 / T3 保留              | 实测 31 个卡里只有 13 个是标准形，硬转 100% 会破坏布局。照 Label 迁移的先例「该跳就跳」 |
| 01:30 | `design-pilot/page.tsx` 整页跳过                            | 它是「旧组件 vs Astryx」对照页，转了就没意义                                            |
| 02:00 | 禁止 agent 起 dev server 做像素比对（除 reports 的 KPI 卡） | 第二个 agent 在这上面烧了半小时没产出                                                   |
| 02:30 | reports 保留 4 张不强推                                     | agent 步数用尽，但已转的 7 张验收全过。留着下轮比硬塞好                                 |
| C1    | ✅ 合并 PR #135（T1 档 8 张 / 4 文件）                      | squash `019a219`；真机验 4 页                                                           |
| C2    | ✅ 合并 PR #136（reports-client 11/11 张）                  | squash `6c2d336`；四 Tab 全验                                                           |

### C2 的关键发现（下次别再踩）

1. **`/settings/reports` 有平台运营权限门禁**（`isPlatformOperator`）。
   用 `demo@fmkj.local` 打开只会看到「当前账号没有平台运营权限」，**页面是空的**。
   本地验证要临时加 `PLATFORM_ADMIN_EMAILS="demo@fmkj.local"` 再重启 dev —— 验完撤掉。
   （第一次验了个空页面还以为改坏了。）
2. **插件详情页真实路由是 `/plugins/<id>`**，不是 `/capabilities/<id>`。
   列表页链接来自 `plugin-list.tsx` 的 `href={/plugins/${p.id}}`。
3. **登录页默认是扫码 Tab**，「邮箱密码登录」要先点；用 `getByText('邮箱密码登录')`
   比 `button.astryx-tab` 稳（后者偶尔匹配不到）。
4. **dev 服务反复被打断**（agent 改文件热重载 + 端口没人清）。重启姿势要带环境变量：
   ```
   DATABASE_URI="postgres://fmkj@127.0.0.1:55432/fmkj" PAYLOAD_SECRET=... \
     PAYLOAD_CONFIG_PATH="src/payload.selfhost.config.ts" pnpm dev
   ```
   先 `for pid in $(lsof -ti :3000); do kill -9 $pid; done` 再起。

### C3 剩余（7 个文件）

```
capabilities/plugin-list.tsx
projects/project-form.tsx
projects/[id]/after-sales/after-sales-board.tsx
projects/[id]/quotes/[quoteId]/quote-editor.tsx
membership/membership-client.tsx
join/[id]/page.tsx
design-pilot/page.tsx     ← 按三档策略 T3 永久保留（左右对照页），不动
```

### 🔴 夜间踩到的协作坑（必须记住）

**两个 agent 在同一个工作区并发写文件 → 互相踩。**

实测经过：我派了一个 agent 做 reports 剩余 4 张卡，同时上一个 agent 的 PR #136 被合并。
结果：

- 后一个 agent 开工时，前一个已经把同样 4 张卡改完了
- 它的 `git commit` 一度提交到 `main` 上（因为并发 agent 切了分支）
- 它自己把 main 强制还原，才没造成污染
- 分支基线也乱了（不是「最新 main」）

**规则（写死）：**

1. **同一时间只派一个改同一个文件的 agent。** 文件组必须互不重叠。
2. **合并 PR 和派新 agent 不要同时进行。** 先合并、先 pull，再派下一个。
3. **agent 完成后必须核对 `git branch --show-current` 和 `git status`**，不要假定它在对的分支上。
4. **派活时明确告诉 agent：如果发现文件已被改过，先停下报告，不要覆盖。**

这条是今晚最贵的一课：三个 agent 里有两个在并发上浪费了时间。
| C3 | ✅ 合并 PR #138（剩余 6 文件 / 13 张卡） | squash `00686b6`；真机验 6 页 |

### C3 收官记录

card 迁移完成，全仓只剩 `design-pilot/page.tsx` 一处引用——那是**官方批准的对照页**（§11.5），
左栏故意保留旧组件作为对照组，删掉它就消掉了这个页面的意义。**这条是永久保留，不是欠账。**

C3 真机验证（分时采样 800/1800/3200ms）：

| 页面             | 卡片 | 几何            | hScroll | console |
| ---------------- | ---- | --------------- | ------- | ------- |
| 能力中心         | 9    | 331×195 r=12px  | 0       | 0       |
| 会员页           | 4    | 1024×116 r=12px | 0       | 0       |
| 新建项目         | 1    | 768×608 r=12px  | 0       | 0       |
| 报价编辑         | 3    | 1120×960 r=12px | 0       | 0       |
| 售后看板         | 7    | 247×78 r=12px   | 0       | 0       |
| join（失效链接） | —    | 正常降级文案    | 0       | 0       |

### 又两个验证坑（这次记牢）

1. **项目详情页没有站内链接**：`/projects` 列表只给 `/projects/<id>`，进详情后页内
   **不再有** `/projects/<id>/quotes` 这类链接（Tab 是客户端切换）。
   → 验证子路由要**手拼 URL**，别指望点链接点进去。真实 ID 可从 `/projects` 抓。
2. **`/capabilities/<id>` 不存在**，插件详情是 `/plugins/<id>`（上批已记，这次又差点踩）。

### 适配层剩余（22 个文件）

零引用已清（avatar / checkbox）。剩余按引用数：

```
1x badge card command dialog input-group sheet sonner switch
2x button kbd progress radio-group scroll-area
3x separator table
4x tooltip   5x select sidebar
```

`card` 那 1 处就是 design-pilot，**不会归零**。
