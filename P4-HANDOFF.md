# P4 浮层原生化 —— 交接文档

> 2026-11-12 13:55 由 Alma 更新（P4 第 8/9 批 · quote-editor + editor-panels）。
> **新会话读这一份就能接手，不用翻聊天记录。**
> 配套：`ASTRYX-P4-NOTES.md`（API 对照 + 硬约束）、`proposals/2026-11-10-Astryx全量原生化.md`（总提案）

## 一、当前状态（截至 2026-11-12 15:47）

```
main 分支   干净（89d3b7d = PR #120 的 squash 合并提交）
线上        fmkj.top/login 返回 200；端口 13028 来自记忆未复核
PR #107     已合并（P4 第 4 批）
PR #108     已合并（P4 第 5 批）
PR #109     已合并（纯文档）
PR #110     已合并（P4 第 6 批：template-picker / share-export-button）
PR #111     已合并（纯文档）
PR #112     已合并（P4 第 7 批：swap-product-dialog / contract-preview）
PR #113     已合并（fix：Popover 适配层「真实鼠标点不开」双重 toggle —— 见 §十）
PR #114     已合并（P4 第 8 批：quote-editor）
PR #115     已合并（P4 第 9 批：editor-panels）
PR #116     已合并（纯文档）
PR #117     已合并（P4 第 10 批：point-map-editor）
PR #118     已合并（纯文档收官）
PR #119     已合并（P4 最后一块：contract-preview 签约 Popover）
PR #120     已合并（tabs 档收官：登录页 TabList/Tab + 冒烟脚本契约修正）
```

**P4 进度：26 / 34 文件 —— 浮层档位（dialog/popover/tabs）业务代码已全部清零**

| PR   | 文件                                                                                   |
| ---- | -------------------------------------------------------------------------------------- |
| #99  | board-toolbar · lighting-panel                                                         |
| #102 | beta-doc-link · workspace-dialogs · plan-demo                                          |
| #104 | app-sidebar · reports-client · after-sales-board                                       |
| #105 | delivery-package · social-poster-dialog · print-toolbar                                |
| #107 | delete-project · square-crop-dialog · project-share-dialog                             |
| #108 | proposal-showcase · quote-showcase · docs-client                                       |
| #110 | template-picker · share-export-button（+ `design-pilot/detail/page.tsx` 核实无需改动） |
| #112 | swap-product-dialog · contract-preview                                                 |
| #114 | quote-editor                                                                           |
| #115 | editor-panels                                                                          |
| #117 | point-map-editor                                                                       |

> 注：仓库实际核对结果 —— `docs-client.tsx` 只有 **1 个 Dialog**（旧文档写「Dialog 4」是错的）；
> `proposal-showcase` 3 组 Tabs、`quote-showcase` 4 组 Tabs 均与旧文档一致。
> 本批完成后这 3 个文件已不在「还没做」清单里。
>
> 本批（#110）核对结果 —— 剩余清单里这 3 个文件的 Dialog 数旧文档全部写错：
> `design-pilot/detail/page.tsx`、`template-picker.tsx`、`share-export-button.tsx`
> **实际各只有 1 个 `<Dialog>`**（旧文档分别写 2 / 5 / 5）。已 grep 核对 `<Dialog\b` 与 `</Dialog>` 均成对为 1。
>
> 其中 `design-pilot/detail/page.tsx` 进一步核实为**纯官方写法、无需改动**（已 `import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'`，
> 用的就是官方 `isOpen` / `onOpenChange` / `header={<DialogHeader …/>}` 三槽模型），
> 已从剩余清单移除。故本批净推进 **3 个文件**（2 个改动 + 1 个核实无需改）。

## 二、还没做的（按风险排序）

### 低风险（Dialog 为主，模式已成熟）

```
（本批已清空 —— 原 3 项中 2 项已在 #110 改造、1 项核实无需改动，见 §一 注）
```

### 中风险

```
src/components/workspace-dialogs.tsx            已完成（勿重做）
src/components/info-tip.tsx                     已删（死代码）

（quote-editor 已在 #114 完成：Popover ×2 / Select / Textarea 全部迁移，无跳过项）

（已在 #112 完成 —— 旧文档计数又是错的，实测：
 swap-product-dialog.tsx  Dialog 1（文档写 1 ✓）+ ScrollArea 1 ✓
 contract-preview.tsx     Dialog **2**（文档写 1 ✗，实际是「区块编辑」+「删除确认」两个）
```

### 高风险（最后做）

```
（**本档已清空** —— editor-panels 在 #115 完成、point-map-editor 在 #117 完成）

editor-panels（#115）纠正：旧文档写「ScrollArea 3」是错的，实测 **2**；Select 3 全迁，
第 3 处设备类型富内容改用 SelectorSection.title + renderOption，色点挪到 option 的 icon。

point-map-editor（#117）：Dialog ×4（384/384/384/448）+ ScrollArea + Select + Tabs 全迁。
**唯一未验项**：灯具「尺寸」Selector 的真机展开选值 —— demo 项目 41 个点位无灯具点位
（无 lt- 前缀），本地库无 point_maps 表无法造数，仅有静态证据（tsc + 官方 API 签名核对）。
线上或补数据后应点一次确认。
```

### P3 剩余（表单型）

> ⚠️ **2026-11-12 实测纠正**：旧文档写的「官方无独立 Label，只有复合 Field → 需重写表单结构」
> **两处都错**。官方有 `Field` / `FieldLabel`，且**不需要重写结构**——
> `<div><Label htmlFor><Input/></div>` 直接换 `<Field label inputID><Input/></Field>` 即可，
> #122/#123/#124 共 17 处一次通过。

```
Label          已完成 #122/#123/#124（17 处转换 + 11 处按规则跳过）
               剩 5 个文件含 Switch 风格行，需逐个判断（见下方规则）
Select 14 处   数据带 hint / 动态 filter 的要跳过
Textarea 8 处
Input 20 处    已判定的保留项（type=number/date、defaultValue 非受控）
Card 40 处     官方只有单 Card，本仓 6 个复合组件 → 需重写结构
```

#### Label 迁移的四条跳过规则（实测固化，别每次重新盘点）

1. **`flex justify-between` 的 Switch 行不转** —— `Field` 垂直布局会把 label 撑宽并与控件上下堆叠
   （实测：label 442px、行高 24px → 两行、Switch 从右对齐变整行摊开）
2. **无 `htmlFor` 的 Label 不转** —— `Field.inputID` 必填，硬转造假关联
3. **label 内容非纯 string 跳过** —— 含 Icon / 多 span / 预览组件时 `Field.label` 收不下
4. **水平排的 Switch/Checkbox 不转** —— 同上，垂直布局破坏内联排版

#### 三项永久保留（不要再进 P3 待办）

| 位置                                | 理由                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `project-share-dialog` 开启协作开关 | 规则 1                                                                                                               |
| `client-decision-panel` 手写签名    | **它包的是 `<canvas>`，canvas 不可被 label 关联**（`'labels' in canvas === false`）——不是「有图标」的问题            |
| `document-plugin-settings` 文档样式 | **一个 label 盖着两个 Select，而它们连 `id` 都没有**。真要转，前置是拆成两个带 id 的独立字段 = 改结构，需 owner 点头 |

#### 已核实为死代码 / 适配层本体，不进 P3

- `src/plugins/ai-import/ai-panel.tsx` —— 全仓无引用，仓库 `proposals/2026-11-08` 已标死代码 → 归 P5 清理
- `src/components/ui/field.tsx` —— 适配层本体 → 归 P5 删除
- `src/app/(frontend)/(workspace)/projects/[id]/after-sales/after-sales-board.tsx` ——
  它用的 `Field` 是**文件内自定义的 Label 薄包装**（第 870 行），不是官方组件，不该动

### P5

```
删适配层 31 个文件（src/components/ui/*.tsx）
```

## 三、操作手册（照做即可）

### 3.1 开分支（**先确认分支名再动手**）

```sh
cd /Users/noonebook/Downloads/DreamStars/fmkj-latest
git checkout main && git pull --ff-only
git checkout -b feat/astryx-native-p4f
git branch --show-current      # ⚠️ 必须确认！我曾误在别的分支上开工
```

### 3.2 改一个 Dialog 的标准动作

```jsx
// 前
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button …/></DialogTrigger>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>标题</DialogTitle>
      <DialogDescription>副标题</DialogDescription>
    </DialogHeader>
    …内容…
    <DialogFooter>
      <DialogClose asChild><Button label="取消" /></DialogClose>
      <Button label="保存" />
    </DialogFooter>
  </DialogContent>
</Dialog>

// 后
<>
  <Button … onClick={() => setOpen(true)} />           {/* Trigger 外移 */}
  <Dialog isOpen={open} onOpenChange={setOpen} width={512}>
    <Layout
      header={<DialogHeader title="标题" subtitle="副标题" onOpenChange={setOpen} />}
      content={<LayoutContent padding={5}>…内容…</LayoutContent>}
      footer={<LayoutFooter hasDivider>
        <Button label="取消" onClick={() => setOpen(false)} />   {/* Close 改 onClick */}
        <Button label="保存" />
      </LayoutFooter>}
    />
  </Dialog>
</>
```

**import**：

```js
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
```

**三个必守**：

1. `padding={5}` 必须给（否则标题贴边框）
2. `width` 显式给（原 `sm:max-w-lg` → 512、`sm:max-w-xl` → 576）
3. 删完旧块后**必须 grep 检查 `<Dialog>` / `</Dialog>` / 残留 `DialogHeader`**

### 3.3 改完必跑

> **⚠️ 修正（2026-11-12，第 6 批实测）：** 本节旧文写的「`cp` 备份 → 覆盖成自托管垫片 → 跑完
> `git checkout -- src/payload.config.ts` 还原成 `buildFigmaConfig`」**在本仓已失效**。
> `main` 上的 `src/payload.config.ts` **本身就是自托管垫片**，内容就是
> `export { default } from './payload.selfhost.config'`（第 6 批 `head -1` 实测确认）。
> 所以既**不需要**先覆盖，也**不能**在跑完后 `git checkout` 还原 —— 还原会把垫片换回来（no-op），
> 而若有人误把它还原成 Figma 版，反而会被 `git status` 抓到脏改动。
> 正确做法：**直接设环境变量跑门禁，不要动 `src/payload.config.ts`**（`scripts/dev-local.sh` 内部
> 那套 `mktemp` 备份 + `trap restore` 的逻辑就是防这个，它也是把垫片写进去，跑完还原成垫片）。

```sh
cd /Users/noonebook/Downloads/DreamStars/fmkj-latest
# 先确认当前配置就是自托管垫片（必须打印出 export { default } from './payload.selfhost.config'）
head -1 src/payload.config.ts

export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts
export PAYLOAD_SECRET=ci-build-placeholder-not-for-runtime
export DATABASE_URI="postgres://fmkj:build-only@127.0.0.1:5432/fmkj"   # 静态门禁不连库，占位即可
export PUBLIC_URL=http://localhost:3000 NEXT_TELEMETRY_DISABLED=1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

pnpm exec oxfmt                    # 先格式化（否则 --check 会挂）
pnpm exec oxfmt --check
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings 0
pnpm run knowledge:check
pnpm test
pnpm build                         # ⚠️ 会重写 src/payload-types.ts 与 importMap.js，跑完必须还原
git checkout -- src/payload-types.ts "src/app/(payload)/admin/importMap.js"
```

**真机验证**用 `bash scripts/dev-up.sh 3000`（需要真实库 `:55432`）。

### 3.4 结构自检（**tsc 查不出的坑**）

```sh
# 每个改过的文件都要过这一关
for f in <文件>; do
  echo "$f: <Dialog>=$(grep -c '<Dialog\b' $f)  </Dialog>=$(grep -c '</Dialog>' $f)  残留DialogHeader=$(grep -c '<DialogHeader>' $f)"
done
```

- `<Dialog>` 与 `</Dialog>` 必须**成对**
- `<DialogHeader>` 数量必须等于 Dialog 数量（残留说明旧块没删干净）

### 3.5 真机验证（**必须点开，分时采样**）

```js
await btn.click()
for (const ms of [600, 1500, 3000]) {
  // ⚠️ 不要单点断言
  await wait(600)
  const n = await page.$$eval('dialog[open]', (ds) => ds.length)
  if (n > 0) break
}
```

本地起服务（验报表页需要运营权限）：

```sh
export PLATFORM_ADMIN_EMAILS="demo@fmkj.local"
nohup bash scripts/dev-up.sh 3000 > /tmp/dev.log 2>&1 &
```

本地账号：`demo@fmkj.local` / `demo12345`（**只在本地库有**）

### 3.6 合并 + 上线

```sh
# PR 用 GitHub API（本机没装 gh）
TOK=$(git credential fill <<< $'protocol=https\nhost=github.com' 2>/dev/null | grep password | cut -d= -f2)
# 或从 compaction-archive 里取 github_pat_

# squash 合并 → 确认 merged=True → 才删分支
git checkout main && git pull --ff-only
git branch -D <分支> && git push origin --delete <分支>
```

**部署**（影子发布）：

```sh
KEY=~/.ssh/fmkj_deploy_20261109
HOST=ubuntu@124.222.225.26
# 打包 → scp → 远端 docker compose build（~9 分钟）→ 切 Caddy 端口 → 验线上
```

远端 Caddy 配置：`/opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile`
端口递增规则：`130XX → 130XX+1`

## 四、踩过的坑（血泪清单，别再踩）

### 结构类（tsc 查不出）

1. **外层 `<Dialog>` 标签被吃掉** → tsc 全绿但弹窗完全不出现。**必须真机点一次**
2. **旧 `DialogHeader` 块残留在 LayoutContent 里** → 这个 tsc 能抓到（title 必填）
3. **Fragment `</>` 漏补** → 语法错，tsc 能抓到

### 验证方式类（今天栽了 3 次）

4. **查错属性**：官方 `Tab` 用 `data-selected` / `aria-current`，**不是** `aria-selected`
   → 查不到先怀疑查询方式
5. **等太短**：弹窗 500ms 就开了，我等 3 秒才断言
   → 用分时采样
6. **grep 模式骗人**：`<Dialog$` 误报，要 `<Dialog\b`

### Git 类

7. **开分支前没确认分支名** → 改动被 stash 带走（`git stash list` 能救）
8. **删分支把未合并的 PR 一起关了** → 合并和删分支分两步

### 进程类

9. **Next 启动后进程名变 `next-server`** → `pkill -f server.js` 匹配不到，要按端口杀
10. **自托管 runner 工作区持久化** → 上一轮服务占端口

### 官方 API 类

11. `ToggleButton` 没有 `variant` / `endContent`
12. `Selector` 的 `value: string | null` 强制要 `hasClear: true`
13. 官方**没有**：`TabsContent` / `DialogTrigger` / `DialogClose` / `DialogFooter` / 独立 `Label` / `Separator` / `Progress`
14. `Tab.label` 只收 string（徽章走 `endContent`）
15. `BaseProps` 的 Omit 含 `rel`，但 Button 单独解构了它（安全属性没丢）

## 五、验收标准

- `oxfmt --check` / `tsc` / `eslint --max-warnings 0` / `pnpm test` 全绿
- CI 双 success（verify + smoke）
- **真机点开验证**（截图确认视觉）
- 线上 200

## 六、分工提醒

- **P4 不适合并行**（结构性重写，前置成本分摊到每个 agent 要重付一遍）
- 4 个 agent 并行那轮只落地 2 个文件；自己顺序做那轮落地 3 个
- 如果要用 agent：**按文件组拆**（同一文件只会用一种组件的情况很少，按组件拆必冲突）

## 七、本批交付记录（P4 第 5 批）

- **PR**：[#108](https://github.com/lynnliuyu/fmkj-figma-smart-design/pull/108)，
  分支 `feat/astryx-native-p4f` → `main`，状态：**已合并**（squash，
  `ba5301b`，2026-11-11 17:20 UTC），本地与远端分支均已删除。
- **3 个代码文件**：`proposal-showcase.tsx` / `quote-showcase.tsx` / `docs-client.tsx`，
  改动摘要见 §一 表格与本 PR 描述。
- **验证**：
  - `pnpm exec oxfmt` + `pnpm exec oxfmt --check`：全仓 580 文件通过（两次提交前都跑过）。
  - 本地 `tsc --noEmit` / `knowledge:check` / `pnpm build` 与真机点开验证：上一轮已完成。
  - `https://fmkj.top/login` 本轮 curl 复核返回 200；端口 `13028` 未复核。
  - CI verify / smoke：双 success（run `43066047832`，head `1b9ef71`；verify 含代码格式检查）。
- **边界**：不含生产部署 / 影子发布 / Caddy 端口切换，留给 owner。

## 八、本批交付记录（P4 第 6 批）

- **PR**：[#110](https://github.com/lynnliuyu/fmkj-figma-smart-design/pull/110)，
  分支 `feat/astryx-native-p4g` → `main`（squash 合并）。
- **3 个文件**（2 改动 + 1 核实无需改动）：
  - `src/plugins/proposal/template-picker.tsx` —— `Dialog` 1 处转官方。
  - `src/app/(frontend)/share/[token]/share-export-button.tsx` —— `Dialog` 1 处转官方。
  - `src/app/(frontend)/design-pilot/detail/page.tsx` —— **核实已是纯官方写法，无需改动**
    （已 `import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'`），从剩余清单移除。
- **template-picker 的三个结构点**：
  1. 宽的用途 TabList **不进** `DialogHeader.endContent`（会挤竖标题），移进内容区顶部；
     `endContent` 只留窄按钮「对比模板」。
  2. `padding={0}` + 内联 `style={{ height: 'min(880px,94vh)' }}` 补回原 `h-[…]` 定高 ——
     预览视图的 iframe 靠容器高度算缩放比例，fit-content 会算成 0。
  3. 官方无 `DialogTrigger`，用 `cloneElement` 把 `reset(true)` 合成到调用点传入的 `trigger` 上。
- **share-export-button：与 twin 对齐（可验证的理由）**：
  上一轮擅自加了 2 处 `mt-4`，与同型已合并文件 `print-toolbar.tsx` 不一致。本批删除。
  旧适配层 `DialogContent` 的内层是 `<div className={cn('relative', className)}>` ——
  **纯 block、不是 flex/grid**，故旧的 `gap-4` 从未生效、子元素本就紧贴；`print-toolbar.tsx`
  转官方后亦无 `mt-4`，即**忠实迁移**。以 twin 写法为准，不另创一套。
- **真机验证**（Playwright，本地 dev `:3000`，分时采样 600 / 1500 / 3000ms，不单点断言）：
  - `template-picker`（`/projects/431ffb2c-…/archive` → 「交付方案模板」入口）：
    首次命中 **607ms**；弹窗 **1220×846**；标题 `1070×32` **横排未被挤竖**；
    内容区 `scrollHeight 1449 / clientHeight 772` 确实可滚（`scrollTop 0 → 300` 生效）；
    `endContent` 窄按钮「对比模板」106px；预览视图 iframe `1220×769`（定高生效）；
    console error **0**。
  - `share-export-button`（本地库 `proj 431ffb2c-…` 的 `share_config.token`，`enabled:true`、
    无过期、无密码；真实点「下载方案与报价 PDF」导出 3 页 PDF）：
    首次命中 **1504ms**；弹窗 **512×566**；console error **0**。
  - `mt-4` 视觉对比（同一指标 = 说明框 bottom → 按钮行 top 的间距）：
    删前 `gapPx=16` / twin `gapPx=0` / 删后 `gapPx=0` → **已与 twin 一致**。
- **静态门禁**（本地自托管垫片下实测，退出码）：`oxfmt --check` **0**（580 文件）、
  `tsc --noEmit` **0**、`eslint . --max-warnings 0` **0**、`knowledge:check` **16/16 通过**、
  `pnpm test` **113/113 通过**、`pnpm build` **0**（`.next/BUILD_ID` 已生成）。
- **CI**（合并前的最终 head `235de9c`）：push run `43149200059` 与 PR run `43149206739`
  双双 `verify` **success** / `smoke` **success**（4 个 job 全绿）。首轮 head `c769a1e` 的
  run `43148576258` 亦为双绿，但那只覆盖代码改动，文档回填后的最终 head 才是上表这两个 run。
- **合并**：PR #110 squash 合并，`merged=true`，merge commit `b209d72`
  （2026-11-12 03:49:43 UTC）；本地与远端分支均已删除；`main` 已 `pull --ff-only`，
  `HEAD == origin/main == b209d72`，工作区干净。
- **边界**：不含生产部署 / 影子发布 / Caddy 端口切换，留给 owner。

---

## 九、本批交付记录（P4 第 7 批 · 中风险）

- **PR**：[#112](https://github.com/lynnliuyu/fmkj-figma-smart-design/pull/112)，
  分支 `feat/astryx-native-p4h` → `main`。

### 改了什么（2 文件，均为 Dialog 迁移）

- `src/app/(frontend)/(workspace)/projects/[id]/quotes/[quoteId]/swap-product-dialog.tsx`
  - Dialog 1 处转官方：`open` → `isOpen`、`sm:max-w-2xl` → `width={672}`、`max-h-[85svh]` → `maxHeight="85svh"`。
  - 标题保留 `DeviceSymbol` 图标（`<span className="flex items-center gap-2">`）；内容进
    `LayoutContent padding={5} className="flex min-h-0 flex-col gap-4"`（保留原 `gap-4` 与 flex 骨架）；操作行进 `LayoutFooter hasDivider`。
  - **ScrollArea 适配层按批次范围原样保留**（未转）。
- `src/app/(frontend)/(workspace)/projects/[id]/contract/contract-preview.tsx`
  - **2 个** Dialog 转官方：区块编辑 `576`、`448`；删除确认 `384` + `purpose="form"`（防误点背板）。
  - 「保存」按钮外移到 `LayoutFooter` 后用 **`form={formId}`** 关联同一个 `<form id="contract-edit-…">`，
    保证回车提交与点按钮同路径。
  - **Popover / 富内容 Select / Textarea 适配层按批次范围原样保留**，包裹结构未破坏。

### 结构自检（grep，改后）

- swap：`<Dialog`=1 `</Dialog>`=1、`DialogHeader`=1、旧 `DialogContent/Trigger/Close/Footer/Title/Description`=**0**、`@/components/ui/dialog`=**0**。
- contract：`<Dialog`=2 `</Dialog>`=2、`DialogHeader`=2、其余旧件全 **0**。

### 静态门禁（本地自托管垫片下实测，退出码）

`oxfmt --check` **0**（580 文件）· `tsc --noEmit` **0** · `eslint . --max-warnings 0` **0** ·
`knowledge:check` **16/16** · `pnpm test` **113/113** · `pnpm build` **0**（`.next/BUILD_ID=Z0xT1vk0BYQxi6PdZiejk`；`payload-types.ts`/`importMap.js` md5 无漂移）。

### 真机验证（Playwright，本地 dev `:3000`，分时采样 600 / 1500 / 3000ms）

- `swap-product-dialog`（报价 `1c5f2333…` →「更换型号」）：三档均命中（600ms 即中）；**672×590**；标题横排未挤竖；Esc 后关闭。
- `contract-preview` 区块编辑（「恢复默认条款」外观按钮）：三档均命中；**448×223**；页脚「取消 / 保存」；Esc 后关闭。
- `contract-preview` 删除确认：三档均命中；**384×136**。
- **富内容 Select**：弹窗内 `combobox` 展开后选项完整渲染（「湖山赋 全屋智能报价（不含灯具）¥7,562.00 / 整装报价（含灯具）¥29,063.00」），键盘选中后值更新 ✓。
- **内容可滚**：默认 1440×900 下三个弹窗内容未溢出（fit-content），故改**压缩视口**验证 —— `vh=360` 时 ScrollArea `clientHeight 36 / scrollHeight 94`、`overflowY:auto`、`scrollTop` 移动 58px；全程无横向滚动条。
- **console error = 0**；仓库自带冒烟 `e2e/smoke.mjs` **22 页通过 / 0 有问题**（无回归）。
- 截图目录：`/tmp/p4h-shots/`（临时产物，交付后清理）。

### 顺带发现的既有缺陷（**未改，避免越界**）

`contract-preview.tsx` 中 `ContractSectionEdit` 的触发按钮文案写错：`icon={<Pencil/>} label={'恢复默认条款'}`，
应为「编辑」。这是**既有 bug、与本批 Dialog 迁移无关**，已回退未纳入本批，留待单独修复。

### 边界

不含生产部署 / 影子发布 / Caddy 端口切换，留给 owner。

---

## 十、P4 第 8/9 批（#114 / #115）+ 顺带修掉的真 bug（#113）

### #113 —— Popover 适配层「真实鼠标点不开」（既有缺陷，线上同样存在）

**两层根因**：

1. `PopoverTrigger` 额外注入 React `onClick` 去 `setOpen(!open)`，而官方 Popover 对 children
   触发物已挂原生 `click` 监听 → `popover.toggle()`。一次真实点击**切换两次** → 净结果关闭。
2. 适配层**无条件**给官方传 `isOpen`，把非受控调用点也当成受控，`setOpen` 落到空实现 → 状态永远 false。

**为什么藏了很久**：合成 `element.click()` 只走官方那条路，自动化测试「看起来是好的」。

实测（真实鼠标）：修复前「添加产品」「毛利」点三次均 `aria-expanded=false` / 内容 `0×0`；
修复后均 **600ms 内可见**（384×112 / 320×250），Esc 可关、可反复开关、console error 0。

> **验证纪律**：交互验证必须用 `page.mouse.click(x,y)`，不要用 `element.click()`。
> 视口外元素（`y > 900`）必须先 `scrollIntoViewIfNeeded()`，否则点击落空会被误判成"打不开"。

### #114 —— quote-editor（第 8 批）

- Popover ×2（「添加产品」内含 cmdk、受控；「毛利」非受控）→ 官方单体 `Popover`
- Select（报价状态）→ `Selector`
- Textarea（报价备注）→ `TextArea`
- **无跳过项**，旧适配层 import 全部归零
- 真机：Selector 600ms 可见 176×92（选值后文案 草稿→已发送）；添加产品 384×112；
  毛利 320×274 且 `above=true`；备注 TextArea 真实输入生效；console error 0

### #115 —— editor-panels（第 9 批）

- ScrollArea ×2 → `ScrollableArea`（`label` 必填、`axis="block"`、保留 `min-h-0 flex-1`
  与 `data-slot="scroll-area"`，与既有 `lighting-panel.tsx` 惯例一致）
- Select #1/#2（区域类型）→ `Selector`
- Select #3（设备类型，富内容）→ `SelectorSection.title` + `renderOption`；
  色点挪到每项 option 的 `icon`（`SelectorSection.title` 只收 string 的硬约束）
- 真机：设备页 ScrollArea 287×695 / 内容 1375 / `scrollTop 0→200` 真滚动 / 无横向溢出(287=287)；
  区域页 1295/690 可滚、无横向溢出；区域 Selector 600ms 可见 153×300 / 17 选项；
  设备类型富内容 Selector 600ms 可见 259×300 / **34 选项且 34/34 带图标**；console error 0

### 剩下什么

```
point-map-editor.tsx        高风险，五组件全有，4000+ 行 —— P4 最后 1 个文件（25/34 → 26/34）
P3 表单剩余                 Label 53 / Select 14 / Textarea 8 / Input 20 / Card 40
P5                          删适配层 30 个文件（先 grep 确认零引用）
```

---

## 十一、P4 收官（2026-11-12 14:35）

### 浮层档位（Dialog / Popover / Drawer 系）已全部迁完：26 / 34

`#99 #102 #104 #105 #107 #108 #110 #112 #114 #115 #117` 共 **11 个批次 PR**，
另加 4 个纯文档/修复 PR（`#109 #111 #113 #116`）。

**`#113` 是这轮最有价值的一笔**：它修的不是迁移，而是一个**线上用户真实遇到的 bug** ——
Popover 适配层的双重 toggle + 非受控判定错误，导致「添加产品」「毛利」两个浮层
**用真实鼠标点不开**。而这个 bug 之所以能藏很久，是因为自动化测试用 `element.click()`
只走官方那条监听路径，**合成事件测不出真实缺陷**。

### 剩下 21 个文件的真实构成（不是浮层）

grep `@/components/ui/(dialog|tabs|popover|select|scroll-area|dropdown-menu|sheet|tooltip)`
仍命中的文件，主要是 **dropdown-menu / tooltip / sheet / command / sidebar** 这几类，
**不在 P4 的 Dialog/Popover 档位里**，属于：

```
P3 表单剩余     Label 53 / Select 14 / Textarea 8 / Input 20 / Card 40
P5 适配层清理   删 src/components/ui/*.tsx（先 grep 确认零引用）
其他浮层类      dropdown-menu / tooltip / sheet / command / sidebar（需单独评估档位）
```

### 本轮沉淀的验证纪律（写进肌肉记忆）

1. **交互验证必须用真实鼠标 `page.mouse.click(x,y)`**，不要 `element.click()`。
2. **视口外元素先 `scrollIntoViewIfNeeded()`** 再取 boundingBox，否则点击落空会被误判成"打不开"。
3. **分时采样 600 / 1500 / 3000ms**，不要单点断言。
4. **Tab 选中态只信 `data-selected`** —— 实测本仓 `aria-current` 全为 `null`，`aria-selected` 也不可靠。
5. **旧文档的组件计数不可信**，每批开工先 grep 定界。

---

## 十二、浮层档位真正收官（2026-11-12 15:47）

### 最终状态

| 适配层组件 | 业务代码引用 | 说明                                                                       |
| ---------- | ------------ | -------------------------------------------------------------------------- |
| `popover`  | **✅ 0**     | #119 收掉最后一处（contract-preview 签约浮层）                             |
| `tabs`     | **✅ 0**     | #120 收掉最后一处（登录页）                                                |
| `dialog`   | 1 个         | 只剩 `src/components/ui/command.tsx` —— **适配层文件本体**，属 P5 删除清单 |
| `sheet`    | 1 个         | 只剩 `src/components/ui/sidebar.tsx` —— 上游 shadcn 内部，属 P5            |

### 🔴 #120 暴露的一类新坑：改 DOM 契约会让 e2e 选择器失效

登录页 `Tabs` → 官方 `TabList`/`Tab` 后，CI 的 smoke **失败**：`❌ 登录页无法完成登录：停在 /login`。
本地手测却是好的 —— 因为**冒烟脚本用了 `getByRole('tab', { name: /邮箱/ })`**，
而官方 `Tab` 渲染成 `button.astryx-tab`、**没有 `role="tab"`** → 点不中 → `#email` 不出现 → 超时。

**教训（比 tsc 更隐蔽的一层）**：

> 组件替换不只是「让页面能渲染」，还会**改变 DOM 契约**。
> 任何依赖旧契约的**测试、e2e、埋点、CSS 选择器**都会静默失效 —— `tsc` 完全查不出。
> **替换带交互语义的组件后，必须 grep 一遍 `e2e/` 和相关选择器**，并本地跑一遍冒烟。

已修：`e2e/smoke.mjs` 改用 `page.locator('button.astryx-tab').filter({ hasText: /邮箱/ })`，
本地冒烟 **16/16 全过**。

### 官方 Tab 的实测 DOM 契约（后续批次的验证基准）

```
渲染：<button class="astryx-tab ...">
无 role="tab"、无 aria-selected
选中态：data-selected="selected"
API：<TabList value={x} onChange={(v) => …} layout="fill">
     <Tab value="a" label="文本" icon={<Icon/>} />
```

**不要用 `getByRole('tab')` 找官方 Tab —— 会得 0 个元素。**
（我这次就先误判成「tab 没渲染」，实际是选择器错了。）

### 下一步（P3 / 其他档位）

```
P3 表单     Label 53 处 / 18 个文件（最大单文件 11 处）
            官方有 Field / FieldLabel —— 不是"无 Label"，旧文档判断有误
            本仓已有范式可抄：after-sales-board.tsx 的 <Field label htmlFor><Input/></Field>
Select 14 / Textarea 8 / Input 20 / Card 40
其他档位    dropdown-menu 11 文件 / tooltip 4 / command 1
P5          删适配层 30 个文件（先 grep 确认零引用）
```
