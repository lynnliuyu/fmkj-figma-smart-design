import { cn } from '@/lib/utils'

/** 分区标题（品牌页、下载页）：大标题 + 说明（eyebrow 参数保留兼容，不再显示） */
export function SectionHeading({
  id,
  title,
  description,
  align = 'center',
  className,
}: {
  id?: string
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'center' | 'left'
  className?: string
}) {
  return (
    <div className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center', className)}>
      <h2 id={id} className="text-headline font-medium">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 text-lead text-balance text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
