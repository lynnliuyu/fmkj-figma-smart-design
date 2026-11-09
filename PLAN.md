# PLAN.md — 待办规划（noone 随时写，Alma 随时接）

> **怎么用**：noone 想到什么就往下面「待办」里加一行，格式随意，写完不用管。
> Alma 每次开工前读这个文件，挑「待你拍板」的问你、挑「可动手」的直接干。
> 完成的任务挪到 `WORKLOG.md`。
>
> **我的自主范围随阶段变**：开发阶段自主挑任务与范围，维护阶段等指令。
> 规则见 [`PHASES.md`](./PHASES.md)。

## 状态标记

- `[ ]` 待办（还没定归谁）
- `[?]` 等 noone 拍板（有歧义 / 涉及架构）
- `[~]` Alma 在做（会有分支/PR 编号）
- `[x]` 已完成（挪去 WORKLOG.md）

---

## 待办

### 1. [x] Beta 文档回落 + 清理死代码 —— 已合并进 main（PR #6）

把四个未开发完整的功能以 `功能名 Beta` 形式放回对应页面，悬停提示「功能未开发完整，仅测试，正在开发中」：

| 功能       | 放置位置                | 现成打印页                        |
| ---------- | ----------------------- | --------------------------------- |
| 现场勘测   | 项目信息页 / 基础资料区 | `print/projects/[id]/survey`      |
| 强弱电布线 | 点位图页 / 施工交底入口 | `print/projects/[id]/wiring`      |
| 采购备货   | 报价页 / 采购相关操作区 | `print/projects/[id]/procurement` |
| 场景移交   | 归档页 / 交付资料区     | `print/projects/[id]/handover`    |

规则：不做启停、不占能力中心/插件位、点击仍打开对应打印页、不新增工具箱页面。
顺带删除死代码 `src/app/(frontend)/(workspace)/projects/[id]/project-toolbox.tsx`（无引用）。

### 2. [x] 取消会员分级 —— 已实施并合并（PR #7）

涉及数据模型（清空 `membershipTier` / `membershipExpiresAt`，保留 `aiCredits` 与流水）。
Alma 先写提案（修改前/修改后/影响范围/迁移/回滚/谁批），noone 批了再动代码。

### 3. [x] Astryx 设计系统（owner 决策：最终全量覆盖）—— 已完成

**空状态收敛（PR #69）**：审了 37 个含空状态文案的文件，**只改职责真正重合的**。

| 类型                                      | 处理    | 理由                         |
| ----------------------------------------- | ------- | ---------------------------- |
| 整块空状态（虚线框 + 图标 + 标题 + 说明） | ✅ 收敛 | 与 `EmptyState` 职责完全重合 |
| 面板内一句话（`self-center text-sm`）     | ❌ 不改 | 换了破坏卡片内布局           |
| 弹窗内单行（`px-3.5 py-4 text-xs`）       | ❌ 不改 | 空间太小，大组件不适用       |
| toast / 内联标签 / 打印文档               | ❌ 不改 | 根本不是空状态               |

**指标块（`StatTile`）不收敛的判定**：`settings/reports` 的 4 张「运维指标卡」用的是
`Card` + `CardHeader/CardTitle/CardContent`，带图标 + 双数值 + 双单位，
与 `StatTile`（label + value + hint）**不同构**。硬套会丢失表达，**判定不收敛**。

**判断标准（比"改了多少处"更重要）**：收敛的前提是**职责真的重合**，
不是"见到没用的就换"。`EmptyState` 提供的是区块级结构（图标 + 标题 + 说明 + 操作），
套到面板内的一句话上，反而多出一圈虚线边框和 12px 内边距，比原来更差。

**已完成**：

- 接入 + `/design-pilot` 对照页（PR #15/#16）
- CSS 层序根因修复（PR #19）——`layers.css` 必须是 layout 的第一个 import
- 繁梦品牌主题 `fanmeng`（PR #20）：extends butter + 品牌紫，已设为默认主题
- 主题对比页 `/design-pilot/themes`（`?theme=` 切换 6 个主题）
- **登录页**换 Astryx 外壳（PR #21），认证逻辑零改动

**下一步**：按复杂度从低到高推进（quotes → docs → membership → ai → projects → 首页）

**已完成的设计系统统一（PR #21~#25）**：

- 登录页 Astryx 左右分栏（认证逻辑零改动）
- PageHeader 换 Astryx 排版（影响 9 页）
- Button / Input 圆角与间距（影响 75 + 23 文件）
- Card 圆角 → container token（影响 14 文件）
- Dialog / Select / DropdownMenu / Tabs / Textarea 圆角统一（5 文件）

**圆角体系（已全站统一）**：

```
--radius-inner     = 6px   小尺寸（xs 按钮、图标小按钮）
--radius-element   = 8px   按钮 / 输入框 / 菜单项
--radius-container = 12px  卡片 / 弹层
```

**刻意不跟 Astryx 的项（有意识决策，非遗漏）**：

- **字号**：本仓 12/14/16/18 阶梯保留。Astryx 是 9/11/14/18（Meta 企业后台风），
  照搬会让全站文字集体缩小，中文阅读吃力；全站已有 1126 处字号类。
- **间距**：3000+ 处 Tailwind 间距类，阶梯本身合理，动它风险大收益小。
- **导航结构**：项目板块导航（PROJECT_SECTIONS）功能完整，换 Astryx Stepper 属架构变更，需提案。

**踩过的坑（必看）**：

- `layers.css` 是 CSS 层序声明，**必须是 layout 第一个 import**，否则 Tailwind preflight 压死 Astryx 整层样式
- `astryx theme add/use` 会重写 `astryx-themes.ts` 并塞回 `fonts.css`（Google Fonts 外链）——**每次跑完必须手工剥离**
- Astryx 没有 `--color-primary`，强调色 token 是 `--color-accent`
- 改认证/支付类页面：`login-form.tsx` 这类组件**一个字都不能动**，只换外壳，且必须做基线对比

### 4. [x] 能力中心改造 —— 三步全部完成

- ✅ 第一二步（PR #8）：UI 改叫「能力中心」，分 AI 能力 / 模板 / 工具
- ✅ **模板中心页**（PR #8 后续）
- ✅ **URL 改名** `/plugins` → `/capabilities`（PR #67，旧地址 301）
- ✅ **点位图显示方案**（PR #66）：项目级 displayProfile，4 套预设
  （施工图 / 业主展示 / 技术交底 / 汇报演示），决定方案模板怎么渲染点位图

UI 不再叫「插件」，改叫「能力中心」，分 AI 能力 / 模板 / 工具；普通用户不启停。
涉及导航层级与插件归属 → 走提案。

### 5. [x] CI 补测试与格式化 —— 已完成（PR #12 / #13 / #14）

- ✅ vitest + 84 个纯函数单测，已接入 CI
- ✅ 全仓格式化 547 文件 + `oxfmt --check` 门禁
- ✅ 顺带修掉单测暴露的 4 个真实缺陷（PR #13）
- CI 现为五道门禁：格式 → 类型 → 知识库 → 单测 → 生产构建

**仍缺的（真实缺口，未做）**：

- ✅ ESLint 已接入 CI（`eslint . --max-warnings 0`，规则集中在 react-hooks / next 三项，其余关闭）
- ✅ **e2e 页面冒烟测试已接入 CI**（`e2e/smoke.mjs`）：起真 PostgreSQL + 真服务 +
  真浏览器（Playwright），逐页断言「无错误 / 不卡骨架屏 / 渲染出内容 / 无横向溢出 /
  无坏图 / 关键文案存在 / **客户可见处不出现内部枚举名**」。
  smoke job 里还会在**真库上跑一次生产构建**，暴露「只在真库下才出现」的问题
  （`/catalog` 构建卡死就是这么被找到的）。
- 无覆盖率统计

<!-- noone 往下继续加就行 -->

---

## 等我问的问题（Alma 攒着，一次问清，不刷屏）

- 核心基础操作是否也扣积分，还是只对插件 / AI 扣？（架构 §8.2）
- 仪表盘归功能插件还是归核心？（架构 §11.4）
- 插件公司化时，当前用户数据怎么迁移到公司？（架构 §11.5）
- 分享链接是否加有效期 / 密码？（架构 §1.7）
