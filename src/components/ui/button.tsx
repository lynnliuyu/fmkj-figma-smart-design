'use client'

import * as React from 'react'
import { Button as AstryxButton } from '@astryxdesign/core/Button'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * 按钮：对外 API 保持本仓原有形状（variant / size / asChild），内部实现走 Astryx 官方 Button。
 *
 * ## 为什么保留这层适配，而不是把 250 处调用点全改成 Astryx 的写法
 *
 * Astryx 的 Button 用 `label` 传文案、只有 4 个 variant、3 个 size、没有 `asChild`；
 * 而本仓全站有 327 处 `<Button>`、105 处显式 `variant`、88 处 `size`、59 处 `asChild`。
 * 逐个改既有 250+ 处机械改动，也要在每一处重新判断"该映射到哪个变体"——
 * **批量重写的风险远大于收益**。所以适配层只做一件事：把旧名字翻译成 Astryx 的名字。
 *
 * ## 两条渲染路径
 *
 * 1. **普通按钮** → 渲染 Astryx 官方 `<Button>`，享受官方交互（按压层、加载态、a11y）。
 * 2. **`asChild`（按钮当链接）** → Astryx 的 Button 是 `<button>`，塞进 `<Link>` 会得到
 *    `<a><button>` 这种非法嵌套；所以这条路径继续用 token 驱动的 className 实现，
 *    由 `slot` 把样式交给子元素（`<Link>`），DOM 仍然只是一个 `<a>`。
 *    样式同样读 Astryx 的设计 token，主题切换时颜色/圆角一致。
 */

/**
 * `asChild` 路径用的样式。仍由 token 驱动，因此跟随 Astryx 主题。
 * 导出供「按钮样式的链接」直接使用（见 components/beta-doc-link.tsx）。
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-element)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out-quart outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/35 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs inset-shadow-btn hover:bg-[color-mix(in_oklch,var(--primary),black_10%)] dark:hover:bg-[color-mix(in_oklch,var(--primary),white_12%)]',
        outline:
          'border-input bg-background text-fg-secondary shadow-xs inset-shadow-btn-neutral hover:bg-subtle hover:text-foreground aria-expanded:bg-subtle aria-expanded:text-foreground dark:bg-input/20 dark:hover:bg-input/40',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'text-fg-secondary hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/70',
        destructive:
          'bg-destructive/10 text-destructive-strong hover:bg-destructive/15 focus-visible:ring-destructive/25 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-2 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        xs: "h-6 gap-1 rounded-[var(--radius-inner)] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-7 gap-1.5 px-2.5 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        lg: 'h-9 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        icon: 'size-8 rounded-[var(--radius-element)]',
        'icon-xs': "size-6 rounded-[var(--radius-inner)] [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7 rounded-[var(--radius-element)]',
        'icon-lg': 'size-9 rounded-[var(--radius-element)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type Size = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'

/** 旧变体名 → Astryx 官方变体名。`outline` 最接近官方的 `secondary`（同为低强调实心/描边）。 */
const ASTRYX_VARIANT: Record<Variant, 'primary' | 'secondary' | 'ghost' | 'destructive'> = {
  default: 'primary',
  outline: 'secondary',
  secondary: 'secondary',
  ghost: 'ghost',
  destructive: 'destructive',
  link: 'ghost',
}

/** 旧尺寸名 → Astryx 官方尺寸。本仓的粒度更细，就近归并。 */
const ASTRYX_SIZE: Record<Size, 'sm' | 'md' | 'lg'> = {
  default: 'md',
  xs: 'sm',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
  'icon-xs': 'sm',
  'icon-sm': 'sm',
  'icon-lg': 'lg',
}

const ICON_ONLY_SIZES: ReadonlySet<Size> = new Set<Size>(['icon', 'icon-xs', 'icon-sm', 'icon-lg'])

/**
 * 把 children 的首个图标元素摘出来（图标 → Astryx 的 `icon` 插槽，其余 → 内容插槽）。
 *
 * 判断依据尽量保守，只认「没有可见文本的元素」：
 * 本仓的图标一律写成 `<Icon className="size-4" />`（lucide 组件，无子节点），
 * 而文案是字符串。所以「首个子节点是元素、且它自己不含文本」就当作图标；
 * 拿不准时宁可不摘，让内容保持原样（堆叠总好过把正文误当图标丢掉）。
 */
function splitLeadingIcon(children: React.ReactNode): {
  icon: React.ReactNode
  rest: React.ReactNode
} {
  const arr = Array.isArray(children) ? children : [children]
  const first = arr[0]
  const isElement = React.isValidElement(first)
  const hasText = Boolean(textOf(first))
  if (!isElement || hasText) return { icon: undefined, rest: children }
  return { icon: first, rest: arr.slice(1) }
}

/**
 * 从 children 里抽出纯文本，供 Astryx 的 `label`（无障碍名称）使用。
 * 图标等非文本节点会被忽略 —— Astryx 的 `children` 仍然负责实际显示。
 */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ref,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    ref?: React.Ref<HTMLButtonElement>
  }) {
  const v = (variant ?? 'default') as Variant
  const s = (size ?? 'default') as Size

  // ── 路径 1：按钮当链接。样式交给子元素，保证 DOM 里只有一个 <a> ──
  if (asChild) {
    return (
      <Slot.Root
        ref={ref as never}
        data-slot="button"
        data-variant={v}
        data-size={s}
        className={cn(buttonVariants({ variant: v, size: s, className }))}
        {...props}
      />
    )
  }

  // ── 路径 2：普通按钮 → Astryx 官方 Button ──
  const {
    children,
    'aria-label': ariaLabel,
    title,
    ...rest
  } = props as React.ComponentProps<'button'> & {
    children?: React.ReactNode
    'aria-label'?: string
    title?: string
  }

  // Astryx 的 Button 把 `icon` 与 `label` 分成两个插槽、并排渲染。
  // 若把图标混在 children 里当普通子节点，它会被当成块级内容 → 图标与文字**上下堆叠**。
  // 所以这里把首个图标元素摘出来，走官方的 `icon` 插槽。
  const { icon, rest: remainder } = splitLeadingIcon(children)

  const label = ariaLabel || textOf(remainder) || title || ''
  const isIconOnly = ICON_ONLY_SIZES.has(s)

  // ⚠️ `ref` 与其余 props 必须**原样转发**，不能挑着传。
  //
  // Radix 的 `*Trigger asChild` 会把 `ref` / `aria-haspopup` / `aria-expanded` /
  // `data-state` / 各种事件处理器注入到子元素上。这里原本只手写了 `onClick` 等
  // 少数几个 prop、且没接 `ref` —— 后果是**所有「<Button asChild> 当下拉触发器」
  // 的菜单全都点不开**（实测 9 处：报价编辑器 3、点位图编辑器 5、合同预览、
  // 售后看板、打印工具栏、docs 外观菜单）。
  // 按钮能渲染，但身上没有任何 trigger 属性，Radix 收不到点击、也不知道该展开谁。
  return (
    <AstryxButton
      ref={ref as never}
      variant={ASTRYX_VARIANT[v]}
      size={ASTRYX_SIZE[s]}
      label={label}
      icon={icon as never}
      isIconOnly={isIconOnly}
      isDisabled={Boolean(rest.disabled)}
      type={(rest.type as 'button' | 'submit' | 'reset') ?? 'button'}
      tooltip={isIconOnly ? title || ariaLabel : undefined}
      {...(rest as object)}
      data-slot="button"
      data-variant={v}
      data-size={s}
      className={className}
    >
      {remainder}
    </AstryxButton>
  )
}

export { buttonVariants }
