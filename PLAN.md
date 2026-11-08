# PLAN.md — 待办规划（noone 随时写，Alma 随时接）

> **怎么用**：noone 想到什么就往下面「待办」里加一行，格式随意，写完不用管。
> Alma 每次开工前读这个文件，挑「待你拍板」的问你、挑「可动手」的直接干。
> 完成的任务挪到 `WORKLOG.md`。

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

### 3. [~] Astryx 设计系统（owner 决策：最终全量覆盖）—— 进行中

**已完成**：

- 接入 + `/design-pilot` 对照页（PR #15/#16）
- CSS 层序根因修复（PR #19）——`layers.css` 必须是 layout 的第一个 import
- 繁梦品牌主题 `fanmeng`（PR #20）：extends butter + 品牌紫，已设为默认主题
- 主题对比页 `/design-pilot/themes`（`?theme=` 切换 6 个主题）
- **登录页**换 Astryx 外壳（PR #21），认证逻辑零改动

**下一步**：按复杂度从低到高推进（quotes → docs → membership → ai → projects → 首页）

**踩过的坑（必看）**：

- `layers.css` 是 CSS 层序声明，**必须是 layout 第一个 import**，否则 Tailwind preflight 压死 Astryx 整层样式
- `astryx theme add/use` 会重写 `astryx-themes.ts` 并塞回 `fonts.css`（Google Fonts 外链）——**每次跑完必须手工剥离**
- Astryx 没有 `--color-primary`，强调色 token 是 `--color-accent`
- 改认证/支付类页面：`login-form.tsx` 这类组件**一个字都不能动**，只换外壳，且必须做基线对比

### 4. [~] 能力中心改造 —— 第一二步已合并（PR #8）；模板中心页 / URL 改名 / 点位图显示方案 留后续

UI 不再叫「插件」，改叫「能力中心」，分 AI 能力 / 模板 / 工具；普通用户不启停。
涉及导航层级与插件归属 → 走提案。

### 5. [ ] CI 补测试与格式化（不涉及架构，可直接做）

仓库现无单测框架、无 lint；全仓约 476 个文件未格式化。
建议：先加 lint（oxfmt 全量格式化一次）或引入 vitest 跑关键纯函数（如 `lib/area-analysis`）。

<!-- noone 往下继续加就行 -->

---

## 等我问的问题（Alma 攒着，一次问清，不刷屏）

- 核心基础操作是否也扣积分，还是只对插件 / AI 扣？（架构 §8.2）
- 仪表盘归功能插件还是归核心？（架构 §11.4）
- 插件公司化时，当前用户数据怎么迁移到公司？（架构 §11.5）
- 分享链接是否加有效期 / 密码？（架构 §1.7）
