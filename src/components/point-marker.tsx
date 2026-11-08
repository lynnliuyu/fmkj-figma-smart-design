import Image from 'next/image'

import { deviceLook } from '@/board/packs/smart-home/look'
import { deviceTypeLabel, isDeviceType } from '@/lib/device-types'
import { markerUrl } from '@/lib/point-markers'
import { cn } from '@/lib/utils'

/**
 * 点位标记图标：与点位图画布上放置后的图形完全一致（同一张设备图，见 board/packs/smart-home/look）。
 * 没有设备图的类型才回退到圆形标记。
 */
export function PointMarker({
  type,
  className,
  title,
}: {
  type: string | null | undefined
  className?: string
  title?: boolean
}) {
  const t = isDeviceType(type) ? type : 'other'
  const art = deviceLook(t).art
  return (
    <Image
      src={art ? art.srcSm : markerUrl(t)}
      alt={title ? deviceTypeLabel(t) : ''}
      width={64}
      height={64}
      unoptimized
      draggable={false}
      className={cn('size-6 shrink-0 object-contain select-none', className)}
    />
  )
}
