import Image from 'next/image'

import { cn } from '@/lib/utils'

/**
 * 产品图统一规格：正方形白底、细描边、四周留白 8%、图片等比完整显示。
 * 不论原图尺寸和比例，在报价单、方案、点位图里看起来都一样大小。
 * 上传规范：800×800 白底方图，产品主体约占 80%。
 * 用 next/image（站点的图片加载器按显示尺寸取缩略图，不再下载原图）；
 * 打印和导出图片需要图片立即加载，这里不使用懒加载。
 */
export function ProductThumb({
  src,
  alt,
  className,
  size = 120,
  loading = 'eager',
}: {
  src: string | null | undefined
  alt: string
  className?: string
  size?: number
  loading?: 'eager' | 'lazy'
}) {
  return (
    <span
      className={cn(
        'flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-white',
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading={loading}
          className="h-[84%] w-[84%] object-contain"
        />
      ) : null}
    </span>
  )
}
