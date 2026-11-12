# P4 浮层原生化 —— 交接文档

> 2026-11-12 11:35 由 fmkj-builder 更新（P4 第 6 批 · 低风险 2 文件 + 1 文件核实无需改动）。
> **新会话读这一份就能接手，不用翻聊天记录。**
> 配套：`ASTRYX-P4-NOTES.md`（API 对照 + 硬约束）、`proposals/2026-11-10-Astryx全量原生化.md`（总提案）

## 一、当前状态（截至 2026-11-12 11:35）

```
main 分支   干净（d025faf = PR #109 的 squash 合并提交）
线上        fmkj.top/login 返回 200；端口 13028 来自记忆未复核
PR #107     已合并 2026-11-11 14:23 UTC（P4 第 4 批：delete-project / square-crop-dialog / project-share-dialog）
PR #108     已合并 2026-11-11 17:20 UTC（P4 第 5 批低风险 3 文件）
PR #109     已合并 2026-11-11（纯文档 docs/p4-handoff-post-merge，回填 #108 状态）
PR #110     本批（P4 第 6 批：template-picker / share-export-button）—— 状态见文末「本批交付记录」
```

**P4 进度：20 / 34 文件**

| PR   | 文件                                                                                   |
| ---- | -------------------------------------------------------------------------------------- |
| #99  | board-toolbar · lighting-panel                                                         |
| #102 | beta-doc-link · workspace-dialogs · plan-demo                                          |
| #104 | app-sidebar · reports-client · after-sales-board                                       |
| #105 | delivery-package · social-poster-dialog · print-toolbar                                |
| #107 | delete-project · square-crop-dialog · project-share-dialog                             |
| #108 | proposal-showcase · quote-showcase · docs-client                                       |
| #110 | template-picker · share-export-button（+ `design-pilot/detail/page.tsx` 核实无需改动） |

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
swap-product-dialog.tsx                          Dialog 1 + ScrollArea 1
contract-preview.tsx                             Dialog 1 + Popover 1 + Select 1 + Textarea 1  ⚠️ Select 是富内容
quote-editor.tsx                                 Popover 2 + Select 1 + Textarea 1  ⚠️ 1 个 Popover 塞 cmdk
```

### 高风险（最后做）

```
editor-panels.tsx          ScrollArea 3 + Select 3
point-map-editor.tsx       五组件全有，4000+ 行，最重
```

### P3 剩余（表单型，需单独评估）

```
Label 53 处    官方无独立 Label，只有复合 Field → 需重写表单结构
Select 14 处   数据带 hint / 动态 filter 的要跳过
Textarea 8 处
Input 20 处    已判定的保留项（type=number/date、defaultValue 非受控）
Card 40 处     官方只有单 Card，本仓 6 个复合组件 → 需重写结构
```

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
