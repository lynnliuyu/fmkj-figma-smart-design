# Astryx 组件迁移进度

> owner 决策（2026-11-10）：**全换 Astryx 组件**，主题用 `stone`、配色用官方原值。给了 9 小时自主完成。
> 分支：`feat/stone-theme-astryx-components`

## 主题

- 默认主题 `fanmeng` → **`stone`**（官方），保留 fanmeng 可随时切回（`astryx theme use fanmeng`）
- 强调色：`--color-accent: #25252a`（官方 Stone 近黑）
- ⚠️ `astryx theme use` 会把 **5 个 Google Fonts 外链**塞回 `astryx-themes.ts`，每次跑完必须手工剔除（本仓禁止第三方 CDN 字体）

## 适配层的核心原则

**对外 API 一个字不改，内部转译到官方组件。**

原因：全站有 327 处 `<Button>`、105 处 `variant=`、88 处 `size=`、59 处 `asChild`……
逐个改调用点既有机械改动，也要在每处重新判断映射 —— **批量重写风险远大于收益**。
适配层只做「旧名 → 官方名」的翻译。

两条渲染路径：

1. **能对应的**：渲染官方组件（拿到官方交互、a11y、配色）
2. **对不上的**（如 `asChild`：官方 Button 是 `<button>`，塞进 `<Link>` 会得到 `<a><button>` 非法嵌套）：
   继续用 token 驱动的 className，由 `slot` 把样式交给子元素，DOM 保持合法

## 已完成（18 个）

| 组件        | 官方对应       | 备注                                                                            |
| ----------- | -------------- | ------------------------------------------------------------------------------- |
| button      | Button         | `asChild` 走 fallback；**图标必须摘到官方 `icon` 插槽**，否则图标与文字上下堆叠 |
| badge       | Badge          | 语义色一一对应，强调层级归到 neutral/info                                       |
| card        | Card           | `padding={0}` 防双层缩进；**`border-0` + 恢复 `ring-1`**，否则高 2px            |
| separator   | Divider        | radix 的 orientation/decorative 翻译过去                                        |
| skeleton    | Skeleton       | ⚠️ **必须保留 `data-slot="skeleton"`** —— 冒烟测试靠它数骨架块                  |
| progress    | ProgressBar    | 官方要求 label，缺省兜底                                                        |
| avatar      | Avatar         | 三段式解析成官方 src/name                                                       |
| checkbox    | CheckboxInput  | checked/onCheckedChange → value/onChange                                        |
| switch      | Switch         | 同上                                                                            |
| textarea    | TextArea       | 兼顾受控与非受控（官方不支持 defaultValue）；官方不收 className                 |
| toggle      | ToggleButton   | ⚠️ **必须补回 `aria-pressed`**，否则调用点的 `aria-pressed:*` 类全失效          |
| scroll-area | ScrollableArea | 收窄 props 透传（官方 role 只收 group/region）                                  |
| tooltip     | Tooltip        | 三段式解析成官方单体；side 名映射 top→above 等                                  |

## 待办（调用面/复杂度从高到低）

| 组件                                             | 调用点  | 难点                                                                                    |
| ------------------------------------------------ | ------- | --------------------------------------------------------------------------------------- |
| dialog                                           | 16 文件 | 官方是单体（`isOpen`/`children`），本仓是 10 个子部件的复合模型；官方只有 DialogHeader  |
| dropdown-menu                                    | 11 文件 | 15 个子部件，官方是 MoreMenu/DropdownMenu 不同模型                                      |
| select                                           | 10 文件 | 官方 Selector 是受控 + options 数组；本仓是 SelectTrigger/SelectItem 复合               |
| input                                            | 24 文件 | 官方 TextInput 明确 `Omit<onChange, defaultValue>`，且不收 inputMode/maxLength/min/step |
| tabs                                             | 7 文件  | 官方 TabList 要 `value`+`onChange`+`Tab` 子项；本仓是 TabsTrigger/TabsContent           |
| label / field                                    | 18 文件 | 官方 Field 要 label+inputID 且包裹 input；本仓 Label 是独立元素                         |
| popover                                          | 4 文件  | 官方 Popover 模型不同                                                                   |
| table                                            | 3 文件  | 官方 Table 有自己的 columns 模型                                                        |
| radio-group                                      | 2 文件  | 官方 RadioList                                                                          |
| sheet                                            | 1 文件  | 官方 Drawer/BottomSheet                                                                 |
| command                                          | 1 文件  | 官方 CommandPalette                                                                     |
| input-group / input-otp / kbd / sidebar / sonner | 0-5     | 逐一评估                                                                                |

## 每批必须跑的验收

```bash
pnpm exec oxfmt --check                    # 格式
pnpm exec tsc --noEmit                     # 类型
pnpm exec eslint . --max-warnings 0        # lint
pnpm test                                  # 单测
SMOKE_PROJECT_ID=<id> pnpm smoke           # 22 页冒烟
```

外加 **Playwright 真浏览器验证**（不能只看 tsc —— 已经靠它抓出两个真实视觉回归）。
