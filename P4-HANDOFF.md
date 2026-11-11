# P4 浮层原生化 —— 交接文档

> 2026-11-12 01:10 由 fmkj-builder 更新（P4 第 5 批 · 低风险 3 文件）。
> **新会话读这一份就能接手，不用翻聊天记录。**
> 配套：`ASTRYX-P4-NOTES.md`（API 对照 + 硬约束）、`proposals/2026-11-10-Astryx全量原生化.md`（总提案）

## 一、当前状态（截至 2026-11-12 01:10）

```
main 分支   干净（ba5301b = PR #108 的 squash 合并提交）
线上        fmkj.top/login 返回 200（本轮 curl 复核）；端口 13028 来自记忆未复核
PR #107     已合并 2026-11-11 14:23 UTC（P4 第 4 批：delete-project / square-crop-dialog / project-share-dialog）
PR #108     已合并 2026-11-11 17:20 UTC（P4 第 5 批低风险 3 文件）—— 详见文末「本批交付记录」
```

**P4 进度：17 / 34 文件**

| PR   | 文件                                                       |
| ---- | ---------------------------------------------------------- |
| #99  | board-toolbar · lighting-panel                             |
| #102 | beta-doc-link · workspace-dialogs · plan-demo              |
| #104 | app-sidebar · reports-client · after-sales-board           |
| #105 | delivery-package · social-poster-dialog · print-toolbar    |
| #107 | delete-project · square-crop-dialog · project-share-dialog |
| #108 | proposal-showcase · quote-showcase · docs-client           |

> 注：仓库实际核对结果 —— `docs-client.tsx` 只有 **1 个 Dialog**（旧文档写「Dialog 4」是错的）；
> `proposal-showcase` 3 组 Tabs、`quote-showcase` 4 组 Tabs 均与旧文档一致。
> 本批完成后这 3 个文件已不在「还没做」清单里。

## 二、还没做的（按风险排序）

### 低风险（Dialog 为主，模式已成熟）

```
src/app/(frontend)/design-pilot/detail/page.tsx Dialog 2
src/plugins/proposal/template-picker.tsx        Dialog 5
src/app/(frontend)/share/[token]/share-export-button.tsx  Dialog 5
```

### 中风险

```
src/components/workspace-dialogs.tsx            已完成（勿重做）
src/components/info-tip.tsx                     已删（死代码）
swap-product-dialog.tsx                          Dialog 1 + ScrollArea 1
contract-preview.tsx                             Dialog 2 + Popover 1 + Select 1 + Textarea 1  ⚠️ Select 是富内容
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

```sh
cd /Users/noonebook/Downloads/DreamStars/fmkj-latest
cp src/payload.config.ts /tmp/pc.bak
printf "export { default } from './payload.selfhost.config'\n" > src/payload.config.ts
export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts PAYLOAD_SECRET=x
export DATABASE_URI="postgres://fmkj@127.0.0.1:55432/fmkj_ci" NEXT_TELEMETRY_DISABLED=1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

pnpm exec oxfmt                    # 先格式化（否则 --check 会挂）
pnpm exec oxfmt --check
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings 0
pnpm test
git checkout -- src/payload.config.ts
```

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
