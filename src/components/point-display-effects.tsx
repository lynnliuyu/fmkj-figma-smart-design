import { useId } from 'react'

import { renderPointDisplayEffectsSvg, type PointDisplayEffect } from '@/lib/point-display-effects'

/** 放在父级 SVG 的底图之后、设备图标之前；不参与鼠标命中或业务数据存储。 */
export function PointDisplayEffects({
  effects,
  idPrefix = 'display',
}: {
  effects: PointDisplayEffect[]
  idPrefix?: string
}) {
  const instanceId = useId()
  return (
    <g
      aria-hidden="true"
      pointerEvents="none"
      data-point-display-effects="true"
      dangerouslySetInnerHTML={{
        __html: renderPointDisplayEffectsSvg(effects, `${idPrefix}-${instanceId}`),
      }}
    />
  )
}
