# Astryx 组件迁移进度

> owner 决策（2026-11-10）：**全换 Astryx 组件**，主题用 `stone`、配色用官方原值。
> 分支：`feat/stone-theme-astryx-components`

## 主题

- 默认主题 `fanmeng` → **`stone`**（官方），保留 fanmeng 可随时切回（`astryx theme use fanmeng`）
- 强调色：`--color-accent: #25252a`（官方 Stone 近黑）
- ⚠️ `astryx theme use` 会把 **5 个 Google Fonts 外链**塞回 `astryx-themes.ts`，每次跑完必须手工剔除

## 适配层的两条铁律

**① 对外 API 一个字不改，内部转译到官方组件。**

全站 327 处 `<Button>`、105 处 `variant=`、88 处 `size=`、59 处 `asChild`……
逐个改既有机械改动，也要在每处重新判断映射 —— 批量重写风险远大于收益。

**② 调用点的 `className` 绝不能挂在官方根元素上。**

官方组件靠 `display:none` 隐藏关闭态，`w-72`/`max-h-[92vh]` 这类布局类会把隐藏机制顶掉
→ 未打开时仍占位 → **整页横向滚动条**（冒烟测试抓到过一次）。
一律挂内层包裹元素。

## 已完成（19 个组件）

| 组件        | 官方对应       | 关键点                                                                  |
| ----------- | -------------- | ----------------------------------------------------------------------- |
| button      | Button         | `asChild` 走 fallback；图标必须摘到官方 `icon` 插槽，否则与文字上下堆叠 |
| badge       | Badge          | 语义色一一对应，强调层级归到 neutral/info                               |
| card        | Card           | `padding={0}` 防双层缩进；`border-0` + `ring-1` 修 2px 高度差           |
| separator   | Divider        | radix 的 orientation/decorative 翻译过去                                |
| skeleton    | Skeleton       | ⚠️ **必须保留 `data-slot="skeleton"`** —— 冒烟测试靠它数骨架块          |
| progress    | ProgressBar    | 官方要求 label                                                          |
| avatar      | Avatar         | 三段式解析成官方 src/name                                               |
| checkbox    | CheckboxInput  | checked/onCheckedChange → value/onChange                                |
| switch      | Switch         | 同上                                                                    |
| textarea    | TextArea       | 兼顾受控与非受控；官方不收 className                                    |
| toggle      | ToggleButton   | ⚠️ **必须补回 `aria-pressed`**，否则调用点的 `aria-pressed:*` 类全失效  |
| scroll-area | ScrollableArea | 收窄 props 透传                                                         |
| tooltip     | Tooltip        | 三段式解析成官方单体；side 名映射 top→above                             |
| dialog      | Dialog         | context 隔离 trigger/content；官方只有 Dialog+DialogHeader              |
| **input**   | TextInput      | 见下「分流」说明                                                        |
| **tabs**    | TabList/Tab    | context 管状态；图标摘到 `icon`、`(12)` 计数拆到 `endContent`           |
| **popover** | Popover        | children 模式（anchorRef 拿不到节点）；配置存 ref 防无限循环            |

### Input 的一处刻意分流

官方 `TextInput` 的 `type` 只有 6 种。本仓有 22 处 `type="number"` 并依赖 `min`/`step`/`inputMode`
—— 这些**渲染原生 input**（保留原生行为与全部属性），样式仍走同一套 token，
而不是硬塞进官方组件再丢功能。

官方不收 `className`，但提供 **`controlClassName`** 专给输入框本体加类 —— 走的是官方正路。

### Tabs / Popover 踩到的两个真坑

- **Tabs**：第一版把 `TabsTrigger` 的 children 当文本抽走 → 侧边栏「导航/AI 对话」的图标**全没了**。
  修：首个子节点若是图标元素，摘到官方 `icon` 插槽。
  （另：官方 Tab 会渲染两个 `<span>导航</span>`，其中一个是 `aria-hidden` 的宽度度量副本，
  `textContent` 会把它算进去而 `innerText` 不会 —— 「导航导航」是检测方式的问题，不是 bug。）
- **Popover**：用官方 `anchorRef` 时**浮层完全不渲染** —— Astryx 的 `Button` 不转发 ref，
  而调用点是 `<PopoverTrigger asChild><Button/></PopoverTrigger>`。
  改用 children 模式（触发物天然同源）解决。

## 保留未换的（判断结论，非遗漏）

| 组件                               | 规模            | 不换的理由                                                                                                                                  |
| ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **dropdown-menu**                  | 11 文件 / 45 处 | 有 `Sub`/`SubTrigger`/`SubContent`（子菜单）、`RadioItem`、`CheckboxItem` —— 官方 `items` 数组模型只有 action/divider/section，**表达不了** |
| **select**                         | 10 文件 / 32 处 | 3 处依赖**表单 `name` 提交**（官方 Selector 是受控 options 数组，不支持）；2 处选项含富内容（`<Swatch>` + 文本）                            |
| **table**                          | 3 文件 / 10 处  | 官方 Table 有自己的 columns 数据模型，本仓是 8 个布局子部件                                                                                 |
| **sheet**                          | 1 文件 / 2 处   | 单一用途（移动端侧边栏），调用点依赖 `data-sidebar`/`data-mobile` 等属性契约                                                                |
| **command**                        | 1 文件 / 2 处   | 官方 CommandPalette 是 data 驱动                                                                                                            |
| **kbd**                            | 2 文件 / 2 处   | 官方是整串快捷键 `keys="mod+k"`，本仓是单个按键 → **语义不同**                                                                              |
| **label**                          | 18 文件 / 52 处 | 官方 `FieldLabel` 要 label+inputID 且**不收 className**（19 处调用靠它微调）。源码保留官方接口注释，官方支持 className 即可切换             |
| **radio-group**                    | 2 文件 / 3 处   | 官方 `RadioList` 是「整行=圆点+标签」；本仓的 `RadioGroupItem` 是卡片右上角的**纯视觉小圆点**，布局自由度是必需的                           |
| **sonner / sidebar / input-group** | 各 1-2 处       | toast 实现 / 容器语义 / 单处使用                                                                                                            |

**这八个的配色与圆角已全部读 Astryx token** —— 主题切换时外观与官方组件一致，
差别只在内部实现。

## 每批必跑的验收

```bash
pnpm exec oxfmt --check
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings 0
pnpm test
SMOKE_PROJECT_ID=<id> pnpm smoke      # 22 页
```

外加 **Playwright 真浏览器验证**。这不是可选项 —— 本轮靠它抓出了：
卡片 2px 高度差、侧边栏横向滚动条、Tabs 图标丢失、Popover 不渲染。
**tsc 全绿时这些问题一个都不会暴露。**

---

# 全量原生化（2026-11-10 起）

目标：删掉适配层，调用点直接使用官方组件。
提案见 `proposals/2026-11-10-Astryx全量原生化.md`。

## 转换规则（**全部经本地实测确认**，不是推测）

### Button

| 本仓写法                  | 官方写法                                  | 实测结论                                     |
| ------------------------- | ----------------------------------------- | -------------------------------------------- |
| `variant="default"`       | `variant="primary"`                       |                                              |
| `variant="outline"`       | `variant="secondary"`                     | 官方 secondary = 透明底 + 描边，语义吻合     |
| `variant="ghost"`         | `variant="ghost"`                         |                                              |
| `variant="destructive"`   | `variant="destructive"`                   |                                              |
| `size="default"`          | `size="md"`                               |                                              |
| `size="sm"` / `"xs"`      | `size="sm"`                               |                                              |
| `size="lg"`               | `size="lg"`                               |                                              |
| `disabled`                | `isDisabled`                              |                                              |
| children 里的文字         | `label="…"`                               | children 也可以，但 `label` 同时兼作无障碍名 |
| children 里的图标         | **`icon={<X />}` 插槽**                   | ⚠️ 见下                                      |
| `asChild` + `<Link href>` | `href="…"`（+ `as={Link}` 用自定义 Link） | 实测渲染成 `<A>`，样式正常                   |
| `size="icon*"`            | **改用 `IconButton`**（`label` + `icon`） | 图标按钮是独立组件                           |
| 尾部图标/徽标             | `endContent={<X />}`                      | 实测正常                                     |

### ⚠️ 两条硬规矩（都做了对照实验）

**1. icon 插槽要传「元素」，不是「组件本身」**

```jsx
<Button icon={Sparkles} />      // ❌ 报错 Objects are not valid as a React child
<Button icon={<Sparkles />} />  // ✅ 115x28、图标 16px、工整
```

**2. 图标绝不能混在 children 里**

```jsx
<Button><Sparkles />生成点位</Button>   // ❌ 图标溢出按钮上方、文字掉到下方
<Button icon={<Sparkles />} label="生成点位" />  // ✅ 图标与文字并排
```

（这条与适配层时代的结论一致，官方组件同样要求走 icon 插槽。）

### 不要写 `data-variant` / `data-size`

官方用 `themeDataAttributes()` 把 `variant`/`size` prop 反映成这些属性，
主题 CSS 就用它们选样式。**再写一遍会覆盖掉官方值**，导致样式整条失效
（2026-11-10 的 37 个描边按钮「隐形」就是这么来的）。

## 图标体系

lucide 图标**可以直接用**，不需要换成语义名：

```jsx
import { HeartIcon } from 'lucide-react'
<Icon icon={HeartIcon} size="lg" />        // 官方 Icon 自动处理尺寸与颜色
<Button icon={<HeartIcon />} label="…" />  // 传元素
```
