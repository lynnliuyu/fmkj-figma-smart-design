import { cn } from '@/lib/utils'

/** 品牌标识：有 Logo 用图片，没有时显示品牌首字。 */
export function BrandLogo({
  name,
  logo,
  className,
}: {
  name: string
  logo: string | null | undefined
  className?: string
}) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logo}
        alt={name}
        className={cn('h-4 w-auto max-w-16 object-contain', className)}
        loading="lazy"
      />
    )
  }
  return (
    <span
      className={cn(
        'flex h-4 min-w-4 items-center justify-center rounded bg-muted px-1 text-xs font-semibold text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  )
}
