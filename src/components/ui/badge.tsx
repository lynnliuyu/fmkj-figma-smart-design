import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/85',
        brand:
          'bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset dark:bg-primary/15 [a]:hover:bg-primary/15',
        secondary: 'bg-muted text-fg-secondary ring-1 ring-border ring-inset [a]:hover:bg-muted/70',
        destructive:
          // 浅红底上的红字必须用 -strong 那一档：直接用 --destructive 只有 4.0:1，达不到 4.5:1。
          'bg-destructive/10 text-destructive-strong ring-1 ring-destructive/20 ring-inset focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline:
          'bg-background text-fg-secondary ring-1 ring-border ring-inset dark:bg-transparent [a]:hover:bg-muted',
        // 业务状态用的语义色：成功（已确认）、待处理（已发送 / 需关注）。浅底配同色深字。
        success: 'bg-success/10 text-success ring-1 ring-success/20 ring-inset dark:bg-success/15',
        warning: 'bg-warning/10 text-warning ring-1 ring-warning/25 ring-inset dark:bg-warning/15',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
