import { cn } from '@/lib/utils'
import { categoryOfType, symbolOfType, symbolUrl, type SymbolKey } from '@/lib/device-types'

/** 设备符号：用 CSS mask 按类别颜色着色，和点位图画布上的符号一致。 */
export function DeviceSymbol({
  type,
  symbol,
  color,
  className,
  framed = false,
}: {
  type?: string | null
  symbol?: SymbolKey
  color?: string
  className?: string
  /** 带浅色底框，用于列表左侧 */
  framed?: boolean
}) {
  const key = symbol ?? symbolOfType(type)
  const tint = color ?? categoryOfType(type)?.color ?? '#525252'
  const mask = `url(${symbolUrl(key)}) center / contain no-repeat`
  const glyph = <span aria-hidden className={cn('block size-full', !framed && className)} style={{ backgroundColor: tint, mask, WebkitMask: mask }} />
  if (!framed) return glyph
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-md border p-1', className)} style={{ backgroundColor: `${tint}0f`, borderColor: `${tint}33` }}>
      {glyph}
    </span>
  )
}
