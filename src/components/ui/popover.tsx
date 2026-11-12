'use client'

import * as React from 'react'
import { Popover as AstryxPopover } from '@astryxdesign/core/Popover'

/**
 * 浮层：内部换成 Astryx 官方 Popover，对外保留本仓的复合 API。
 *
 * ## 难点：触发物与内容在 JSX 里是**兄弟节点**
 *
 * ```
 * radix:  <Popover><PopoverTrigger>触发</PopoverTrigger><PopoverContent>内容</PopoverContent></Popover>
 * 官方:   <Popover content={内容}>触发</Popover>
 * ```
 *
 * ## 解法：内容配置经 context 上浮，由 `PopoverTrigger` 组装官方组件
 *
 * `PopoverContent` 把自己的「内容配置」注册到 context（本身不产出 DOM）；
 * `PopoverTrigger` 渲染时把配置取出来，组装成官方 `<Popover content={…}>{触发物}</Popover>`
 * —— **触发物天然就是官方的 children**，不依赖 ref 转发。
 *
 * 为什么不用官方的 `anchorRef`：Astryx 的 `Button` 不转发 ref，
 * 而调用点普遍是 `<PopoverTrigger asChild><Button/></PopoverTrigger>`，
 * 走 anchorRef 会拿不到节点（实测浮层完全不渲染）。children 模式没有这个前提。
 *
 * ## ⚠️ 调用点的 className 挂内层
 *
 * 与 Dialog 同一个坑：官方靠 `display:none` 隐藏未打开的内容，
 * 若把 `w-72` 这类布局类直接挂在官方根元素上会把隐藏机制顶掉 → 未打开时仍占位、整页横向滚动。
 */

type ContentConfig = {
  className?: string
  children?: React.ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

type PopoverCtx = {
  open: boolean
  setOpen: (v: boolean) => void
  /**
   * 调用点是否自己托管开关状态。
   *
   * 只有调用点**同时**给了 `open` 和 `onOpenChange` 时才算受控；否则必须让官方
   * 自己管状态（官方 `isControlled = isOpen !== undefined`）。
   *
   * ⚠️ 历史 bug（2026-11-12 修）：从前这里无条件给官方传 `isOpen`，
   * 于是「非受控」调用点（如毛利胶囊 `<Popover>` 裸用）被强行当成受控，
   * 而 `setOpen` 落到一个空实现上 → 状态永远 false → **真实点击永远打不开**。
   */
  controlled: boolean
  /** 内容的当前配置。放 ref 里而不是 state —— 见 PopoverContent 的说明。 */
  contentRef: React.RefObject<ContentConfig | null>
}

const Ctx = React.createContext<PopoverCtx | null>(null)
const usePopover = () => React.useContext(Ctx)

export function Popover({
  open,
  onOpenChange,
  modal: _modal,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  modal?: boolean
  children?: React.ReactNode
}) {
  const contentRef = React.useRef<ContentConfig | null>(null)
  const controlled = open !== undefined && typeof onOpenChange === 'function'
  const ctx = React.useMemo<PopoverCtx>(
    () => ({
      open: Boolean(open),
      setOpen: (v) => onOpenChange?.(v),
      controlled,
      contentRef,
    }),
    [open, onOpenChange, controlled],
  )
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
}

const PLACEMENT: Record<string, 'above' | 'below' | 'start' | 'end'> = {
  top: 'above',
  bottom: 'below',
  left: 'start',
  right: 'end',
}

/**
 * 触发物：组装官方 Popover —— 自己作 children，内容从 context 取。
 * 内容还没注册时（首帧）只渲染触发物，避免官方组件拿到空内容。
 *
 * ## ⚠️ 不要在这里自己 toggle（2026-11-12 修掉的真 bug）
 *
 * 官方 Popover 对 children 触发物是**主动接管**的：它给按钮挂了原生
 * `click` 监听（`Popover.js` → `button.addEventListener('click', handleTriggerClick)`
 * → `popover.toggle()`），并通过 `onOpenChange` 回传下一次状态。
 *
 * 早先这个适配层又额外给按钮注入了 React `onClick` 去 `setOpen(!open)`，
 * 于是**一次真实点击切换两次**（React onClick 一次 + 官方原生监听一次），
 * 净结果 = 关 → 浮层永远打不开。
 *
 * 阴险之处：`element.click()`（合成事件）只走官方监听那一条路，所以自动化
 * 测试里「看起来是好的」，真实鼠标点才暴露。实测：「添加产品」真实鼠标点击
 * 三次采样均 `aria-expanded=false` / 内容 `0×0`；合成 `.click()` 则
 * `aria-expanded=true` / `384×112`。
 *
 * → 正确做法：**触发语义完全交给官方**，这里只保留调用点自己的 onClick。
 */
export function PopoverTrigger({
  asChild,
  children,
  onClick,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
  const ctx = usePopover()

  const child = children as React.ReactElement<{ onClick?: (e: unknown) => void }>
  const triggerNode =
    asChild && React.isValidElement(child) ? (
      React.cloneElement(child, {
        onClick: (e: unknown) => {
          child.props.onClick?.(e)
          ;(onClick as ((e: unknown) => void) | undefined)?.(e)
        },
      } as object)
    ) : (
      <button type="button" data-slot="popover-trigger" onClick={onClick} {...props}>
        {children}
      </button>
    )

  const content = ctx?.contentRef.current
  if (!content) return <>{triggerNode}</>

  return (
    <AstryxPopover
      // 非受控调用点必须**不传** isOpen，否则官方判定为受控、由我们托管，
      // 而我们的 setOpen 在非受控时是空实现 → 打不开（见 PopoverCtx.controlled 注释）。
      {...(ctx?.controlled ? { isOpen: ctx.open } : {})}
      onOpenChange={(next) => ctx?.setOpen(next)}
      placement={PLACEMENT[content.side ?? 'bottom'] ?? 'below'}
      alignment={content.align ?? 'start'}
      hasLightDismiss
      hasEscapeDismiss
      label="浮层"
      padding={0}
      content={
        <div className={content.className} data-slot="popover-content">
          {content.children}
        </div>
      }
    >
      {triggerNode}
    </AstryxPopover>
  )
}

/** 内容：只把配置登记到 context，DOM 由 `PopoverTrigger` 里的官方组件产出。 */
export function PopoverContent({
  className,
  align,
  side,
  sideOffset: _sideOffset,
  children,
}: React.ComponentProps<'div'> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
}) {
  const ctx = usePopover()

  // 把配置写进 ref —— **不能放 state**：children 每次渲染都是新节点，
  // 用 state 会导致「setState → 重渲染 → 再 setState」的无限循环。
  // 写 ref 不触发渲染，而 PopoverTrigger 每次都从 ref 读最新值，
  // 内容随调用点的重渲染自然更新。
  if (ctx) ctx.contentRef.current = { className, children, align, side }

  return null
}
