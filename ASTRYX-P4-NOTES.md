# P4 浮层组件原生化 —— 实测结论

> 2026-11-11 由 4 个并行 agent 调研 + 主会话核实。
> **下一轮直接用这份，不用重读官方 API。**

## 官方组件名对照（全部实测确认）

| 本仓                                   | 官方                                     | 备注                                                                             |
| -------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `Select`                               | **`Selector`**                           | 受控 options 数组；另有 `ComplexSelector` / `MultiSelector`                      |
| `ScrollArea`                           | **`ScrollableArea`**                     | `label` 必填；`role` 只收 `group`/`region`                                       |
| `Tabs` + `TabsTrigger` + `TabsContent` | **`TabList` + `Tab`**                    | `Tab` 无 children，文案走 `label`，计数走 `endContent`；**官方没有 TabsContent** |
| `Textarea`                             | **`TextArea`**（大写 A）                 | props 完全不同，见下                                                             |
| `Dialog`（radix 复合）                 | **`Dialog` + `Layout` + `DialogHeader`** | 三槽模型，见下                                                                   |
| `Toggle`                               | **`ToggleButton`**                       | `isPressed` / `onPressedChange`；官方自带 `aria-pressed`                         |
| `Tooltip`（复合）                      | **`Tooltip`**（单体）                    | `content` prop + children 触发物                                                 |
| `Popover`（复合）                      | **`Popover`**（单体）                    | `content` prop + children 触发物                                                 |

官方**没有**：`Separator` / `Progress` / 独立 `Label` / `DialogFooter` / `DialogDescription`。

## 硬约束（每条都实测过，别猜）

### 1. Popover 必须用 children 模式

```jsx
// ❌ 不渲染 —— 官方 Button 不转发 ref，anchorRef 拿不到节点
<Popover anchorRef={ref} content={…} />

// ✅
<Popover content={…}>{触发物}</Popover>
```

`width` / `padding` 是**外框**属性；调用点的 `w-72` / `max-h-[…]` 要挂**内层 div**，
`className` 挂外框会顶掉官方 `display:none` 的隐藏机制。

### 2. 开合态是 `aria-expanded`，不是 `data-state`

官方把开合态写在触发器上。radix 的 `data-[state=open]:bg-muted` 要改成
`aria-expanded:bg-muted`（读 `Popover.js:519` 确认）。

### 3. Dialog 不配 `Layout` 就不滚动

官方要求 `Dialog` + `Layout` + `LayoutContent`（`overflow:auto` 的承担者）+
`LayoutFooter`。**`DialogFooter` 没有对应组件** —— 按钮要放 `LayoutFooter` 或保留现有 div。

`DialogHeader` 会自己画 heading 层级和关闭按钮，与原手画 header 不一一对应，
**每个调用点要单独比对视觉**。

### 4. ⚠️ 现有弹窗内边距是 0，迁移时必须显式给

实测 after-sales 新建弹窗：`padding: 0px`、标题离弹窗左边 `0px`。
适配层刻意关掉了官方内边距（`padding={0}`），由调用点 `gap-*`/`p-*` 控制。

**直转官方必须显式传 `padding`（3=12px / 4=16px）或补内容 padding，否则视觉会变。**

### 5. ⚠️ 宽度是硬约束（两处会被压成邮票）

`proposal-showcase.tsx` 用 `sm:max-w-[min(94vw,1360px)]`、
`quote-showcase.tsx` 用 `1080px` —— 适配层的 `widthFromClassName()` 正在做这层翻译。

直转官方**必须显式传 `width="min(94vw,1360px)"`**，否则退回官方默认 400px。
（`ASTRYX-MIGRATION.md` 记过这个坑：整页方案被压成邮票大小）

### 6. Selector 的三个真实卡点

1. `SelectLabel` 里的分类色点 → 官方 `SelectorSection.title` 只收字符串，
   色点要挪到每个 option 的 `icon`（`SelectorOptionData.icon` 支持 ReactNode）
2. `SelectItem` 里 `<PointMarker/> + 文本` 的富内容 → 官方 `renderOption` 可承接，
   但**受控 options 数组要求把 JSX 改写成数据，是结构性重写**
3. `SelectTrigger` 的 `className` → 官方只收 `controlClassName`，`flex-1` 需要 `width` 或容器处理

### 7. TextArea 的 props 完全不同

```diff
- <Textarea id="x" value={v} onChange={(e) => setV(e.target.value)} className="…" />
+ <TextArea label="…" isLabelHidden id="x" value={v}
+           onChange={(val) => setV(val)} controlClassName="…" />
```

- `value` **必填**（受控），`defaultValue` 被 Omit
- `onChange` 给的是 **值**不是事件
- `label` 必填
- `maxLength` **只显示计数器、不拦输入**

## 必须跳过的几类（硬转会丢功能）

| 场景                                            | 处数                                | 为什么                       |
| ----------------------------------------------- | ----------------------------------- | ---------------------------- |
| `Select` 非受控 + `name` 表单提交               | `document-plugin-settings.tsx` 2 处 | 官方 `Selector` 只有受控形态 |
| `Textarea` 非受控 `defaultValue`                | `company-form.tsx` 2 处             | 官方 `TextArea` 只接受控     |
| `DialogTrigger asChild` / `DialogClose asChild` | 多处                                | 官方无等价物，要重构结构     |

> `Selector` 的 `htmlName` 会渲染 hidden input（`Selector.js:1372`），
> 所以**「表单 name 提交」本身不是拦路虎，缺的是 `defaultValue` 初值**。

## 顺带发现的 3 个既有缺陷（与 P4 无关，但该修）

1. **`src/components/info-tip.tsx` 是死代码** —— 全仓零调用点（`grep -rn "info-tip\|InfoTip"`
   只命中自身定义）。官方有 `InfoTip` 组件但形态不同（「i」图标 vs 本仓的 `CircleHelp`）。
   **建议直接删掉，而不是迁一个没人用的封装。**

2. **`app-sidebar.tsx` 的 `hidden={!collapsed}` 从未生效** ——
   `<TooltipContent side="right" hidden={!collapsed}>` 里的 `hidden` 适配层声明了但**从不读取**。
   转官方时必须用 `isEnabled={collapsed}` 补回。

3. **`point-map/lighting-panel.tsx` 的 `styles.css:610` 契约存疑** ——
   `.point-map-aside [data-slot='scroll-area-viewport']` 依赖旧 radix 适配层的 viewport 子元素，
   官方 `ScrollableArea` 不产生该节点。**需要真浏览器确认侧栏长产品名不会撑宽面板。**

## 已完成

| 文件                 | 改了什么                               |
| -------------------- | -------------------------------------- |
| `board-toolbar.tsx`  | Popover 2 处 + Tooltip 1 处 → 官方单体 |
| `lighting-panel.tsx` | ScrollArea 1 处 → `ScrollableArea`     |

## 待做（32 个文件）

按风险从低到高排序：

```
低  beta-doc-link.tsx（Tooltip 1）
    workspace-dialogs.tsx（Dialog 1，结构最接近官方）
    plan-demo.tsx（Tabs 1 + Toggle 1）
中  app-sidebar.tsx（Tabs 1 + Tooltip 2）
    reports-client.tsx（Tabs 1 组，trigger 含富内容徽章）
    after-sales-board.tsx（Dialog 1 + Select 3 + Textarea 2）
    delivery-package.tsx（Select 1）
    social-poster-dialog.tsx（Dialog 1）
高  contract-preview.tsx（Dialog 2 + Popover 1 + Select 1 + Textarea 1，Select 是富内容）
    swap-product-dialog.tsx（Dialog 1 + ScrollArea 1，布局改动最大）
    quote-editor.tsx（Popover 2 其中 1 个塞 cmdk + Select 1 + Textarea 1）
    proposal-showcase.tsx / quote-showcase.tsx（Dialog 宽度是硬约束）
    print-toolbar.tsx（Popover 1 + Dialog 1）
    delete-project.tsx / project-share-dialog.tsx / square-crop-dialog.tsx（Dialog）
    editor-panels.tsx（ScrollArea 3 + Select 3）
    point-map-editor.tsx（五组件全有，4000+ 行，最重）
```

## 每批必跑

```sh
cd /Users/noonebook/Downloads/DreamStars/fmkj-latest
cp src/payload.config.ts /tmp/pc.bak
printf "export { default } from './payload.selfhost.config'\n" > src/payload.config.ts
export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts PAYLOAD_SECRET=x
export DATABASE_URI="postgres://fmkj@127.0.0.1:55432/fmkj_ci" NEXT_TELEMETRY_DISABLED=1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

pnpm exec oxfmt --check          # agent 常漏这条
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings 0
pnpm test
git checkout -- src/payload.config.ts
```

**外加真浏览器验证**（`ASTRYX-MIGRATION.md` 明确：tsc 全绿时浮层不渲染、横向滚动、
图标丢失这些问题一个都不会暴露）。
