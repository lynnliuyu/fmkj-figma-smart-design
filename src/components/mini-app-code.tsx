import { useId } from 'react'

import { miniAppCodeForCompany } from '@/lib/mini-app-code'
import { cn } from '@/lib/utils'

/** 直接显示原图，用 SVG 显示滤镜去掉白底；深色页用同一透明轮廓显示浅色码。 */
export function CodeImage({
  src,
  size = 28,
  dark = false,
  className,
}: {
  src: string
  size?: number
  dark?: boolean
  className?: string
}) {
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const filterId = `mini-app-white-${instance}`
  const maskId = `mini-app-shape-${instance}`
  return (
    <svg
      data-mini-app-code
      data-code-src={src}
      role="img"
      aria-label="小程序码"
      width={size}
      height={size}
      viewBox="0 0 430 430"
      className={cn('block shrink-0 overflow-visible', className)}
    >
      <defs>
        <filter
          id={filterId}
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 3 0" />
        </filter>
        {dark ? (
          <mask
            id={maskId}
            x="0"
            y="0"
            width="430"
            height="430"
            maskUnits="userSpaceOnUse"
            style={{ maskType: 'alpha' }}
          >
            <image href={src} width="430" height="430" filter={`url(#${filterId})`} />
          </mask>
        ) : null}
      </defs>
      {dark ? (
        <rect width="430" height="430" fill="currentColor" mask={`url(#${maskId})`} />
      ) : (
        <image href={src} width="430" height="430" filter={`url(#${filterId})`} />
      )}
    </svg>
  )
}

export function MiniAppCode({
  companyName,
  size = 28,
  dark = false,
  className,
}: {
  companyName: string
  size?: number
  dark?: boolean
  className?: string
}) {
  const url = miniAppCodeForCompany(companyName)
  if (!url) return null
  return <CodeImage src={url} size={size} dark={dark} className={className} />
}
