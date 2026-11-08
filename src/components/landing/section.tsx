import { cn } from '@/lib/utils'

/** 金额：首页展示到元，不带小数 */
export const money = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`

/** 首页分区：统一的左右边距、上下留白和内容宽度 */
export function Section({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string
  labelledBy: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('px-4 py-20 sm:px-6 sm:py-28 lg:px-8', className)}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  )
}

/** 分区标题：一句大标题 + 一段说明，左对齐 */
export function SectionHeader({
  id,
  title,
  children,
  className,
}: {
  id: string
  title: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <h2 id={id} className="text-headline font-medium">
        {title}
      </h2>
      {children ? <p className="mt-5 text-lead text-muted-foreground">{children}</p> : null}
    </div>
  )
}
