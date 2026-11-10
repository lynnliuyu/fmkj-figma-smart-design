'use client'

import * as React from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog as AstryxDialog } from '@astryxdesign/core/Dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 从调用点的 className 里读出「想要的宽度」，翻译成官方 Dialog 的 `width`。
 *
 * 本仓的弹窗宽度有两种写法：
 *   - `sm:max-w-[min(94vw,1360px)]` / `max-w-5xl` → 上限型
 *   - `w-[calc(100vw-1.5rem)]`                     → 固定型
 * 官方 Dialog 的 `width` 接受数字（px）或任意 CSS 长度字符串，默认 400。
 * 这里优先取 `max-w-[…]`（更明确），其次 `w-[…]`，都取不到就返回 undefined（沿用官方默认）。
 */
function widthFromClassName(className?: string): string | number | undefined {
  if (!className) return undefined
  // max-w-[calc(...)] / max-w-[min(...)] / max-w-[1200px]
  const maxW = className.match(/max-w-\[(.+?)\]/)
  if (maxW) return maxW[1].replace(/_/g, ' ')
  // w-[calc(...)] 等
  const w = className.match(/(?:^|\s)w-\[(.+?)\]/)
  if (w) return w[1].replace(/_/g, ' ')
  // 语义档位
  if (className.includes('max-w-5xl')) return 1024
  if (className.includes('max-w-4xl')) return 896
  if (className.includes('max-w-3xl')) return 768
  if (className.includes('max-w-2xl')) return 672
  if (className.includes('max-w-xl')) return 576
  if (className.includes('max-w-lg')) return 512
  if (className.includes('max-w-md')) return 448
  if (className.includes('max-w-sm')) return 384
  return undefined
}

/**
 * 对话框：内部换成 Astryx 官方 Dialog，对外保留本仓 10 个部件的复合 API。
 *
 * ## 模型差异与解法
 *
 * 官方是**单体**：`<Dialog isOpen onOpenChange>{内容}</Dialog>` —— 弹层、背板、焦点管理都在它内部。
 * 本仓是**复合式**（radix）：`<Dialog><DialogTrigger/><DialogContent>…</DialogContent></Dialog>`，
 * 其中 Trigger 要渲染在**原地**、Content 要渲染进**弹层**。
 *
 * 解法：`Dialog` 只做一个 **context 提供者**（存 `open` / `onOpenChange`）并原样渲染子元素；
 * `DialogTrigger` 从 context 取 `onOpenChange` 渲染触发按钮；`DialogContent` 从 context 取 `open`，
 * 交给官方 `<Dialog>` 承载真正的弹层。
 *
 * 这样 16 个文件的调用结构一个字不改，**弹层本身是官方组件**。
 *
 * ## 为什么要自己画头部
 *
 * 官方 `DialogHeader` 只收 `title`/`subtitle`（字符串或行内节点），而本仓的标题区
 * 常有图标、徽标、多行布局（`DialogHeader` 用量 17 处）。所以头部保留为布局容器，
 * 但配色与间距仍走 token —— 视觉上仍是官方的样子。
 */

type DialogCtx = {
  open: boolean
  setOpen: (open: boolean) => void
}

const Ctx = React.createContext<DialogCtx | null>(null)
const useDialog = () => React.useContext(Ctx)

function Dialog({
  open = false,
  onOpenChange,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
  modal?: boolean
  defaultOpen?: boolean
}) {
  const ctx = React.useMemo<DialogCtx>(
    () => ({ open, setOpen: (next) => onOpenChange?.(next) }),
    [open, onOpenChange],
  )

  // 只提供上下文；触发物与内容各自从 context 取值后决定渲染位置。
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
}

/** 触发物：渲染在原地，点击后打开弹层。 */
function DialogTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
  const ctx = useDialog()
  const open = () => ctx?.setOpen(true)
  const child = children as React.ReactElement<{ onClick?: (e: unknown) => void }>

  if (asChild && React.isValidElement(child)) {
    return React.cloneElement(child, {
      onClick: (e: unknown) => {
        child.props.onClick?.(e)
        open()
      },
    })
  }

  return (
    <button type="button" data-slot="dialog-trigger" onClick={open} {...props}>
      {children}
    </button>
  )
}

/** radix 的 Portal 在官方模型里由 Dialog 内部处理，这里保留为空壳导出。 */
function DialogPortal({ children }: { children?: React.ReactNode; forceMount?: boolean }) {
  return <>{children}</>
}

/** radix 的 Overlay 由官方 Dialog 自带，保留空壳避免既有 import 断掉。 */
function DialogOverlay(_props: { className?: string }) {
  return null
}

/** 关闭按钮：放进弹层内部的普通按钮，点击后关闭。 */
function DialogClose({
  asChild,
  children,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
  const ctx = useDialog()
  const close = () => ctx?.setOpen(false)
  const child = children as React.ReactElement<{ onClick?: (e: unknown) => void }>

  if (asChild && React.isValidElement(child)) {
    return React.cloneElement(child, {
      onClick: (e: unknown) => {
        child.props.onClick?.(e)
        close()
      },
    })
  }

  return (
    <button type="button" data-slot="dialog-close" onClick={close} {...props}>
      {children}
    </button>
  )
}

function DialogContent({
  className,
  children,
  overlayClassName: _overlayClassName,
  showCloseButton = true,
  ...props
}: React.ComponentProps<'div'> & {
  overlayClassName?: string
  showCloseButton?: boolean
}) {
  const ctx = useDialog()
  const isOpen = Boolean(ctx?.open)

  return (
    <AstryxDialog
      isOpen={isOpen}
      onOpenChange={(next) => ctx?.setOpen(next)}
      padding={0}
      /*
        ⚠️ 宽度必须显式传给官方 Dialog。
        官方默认 width=400px，而本仓调用点习惯用 `sm:max-w-[1360px]` / `w-[calc(100vw-1.5rem)]`
        这类 Tailwind 类表达宽度 —— 这些类挂在内层 div 上时，外层官方 dialog 仍是 400px，
        内层再宽也会被裁掉。
        实测后果：首页「放大查看方案」的弹窗只有 400×675，里面塞 5 页整套方案 → 全压成邮票大小。
        这里把 className 里的宽度意图翻译成官方的 width（官方接受任意 CSS 长度字符串）。
      */
      width={widthFromClassName(className)}
      data-slot="dialog-content"
      {...(props as object)}
    >
      {/*
        ⚠️ 调用点的 className **绝不能**直接挂在官方 <dialog> 上。
        本仓的调用点习惯用 `w-[calc(100vw-1.5rem)]` / `max-h-[92vh]` / `overflow-y-auto`
        这类布局类 —— 一旦落到官方 dialog 上，会把官方「关闭时 display:none」的机制冲掉：
        实测未打开的弹窗变成 `display:flex`、仍占 1220px 宽 → **整页出现横向滚动条**
        （冒烟测试抓到的回归）。
        所以把调用点的类放到**内层包裹元素**上：布局照旧生效，官方 dialog 的显隐不受干扰。
      */}
      <div className={cn(showCloseButton ? 'relative' : undefined, className)}>
        {showCloseButton ? (
          <Button
            label="关闭"
            isIconOnly
            variant="ghost"
            size="sm"
            // 右上角关闭：与标题区同排，视觉上是官方图标按钮
            data-slot="dialog-close-button"
            className="absolute top-0 right-0"
          >
            <XIcon />
          </Button>
        ) : null}
        {children}
      </div>
    </AstryxDialog>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn('font-heading text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
