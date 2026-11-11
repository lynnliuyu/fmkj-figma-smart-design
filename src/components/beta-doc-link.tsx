'use client'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Tooltip } from '@astryxdesign/core/Tooltip'

/** 悬停提示文案（产品已定，别改） */
export const BETA_DOC_HINT = '功能未开发完整，仅测试，正在开发中'

/**
 * Beta 文档入口：显示「功能名 + Beta」小徽章，悬停说明功能还没开发完整，点击在新标签页打开对应的打印页。
 * 现场勘测 / 强弱电布线 / 采购备货 / 场景移交目前只有一份打印单据，不占插件位、不做启停，
 * 所以入口直接放在各自对应的项目页面里，见 PROJECT-ARCHITECTURE §3.2.3。
 */
export function BetaDocLink({
  label,
  href,
  className,
}: {
  /** 功能名，例如「现场勘测」 */
  label: string
  /** 打印页地址，例如 /print/projects/{id}/survey */
  href: string
  className?: string
}) {
  return (
    <Tooltip content={BETA_DOC_HINT} placement="below">
      <Button
        label={label}
        variant="secondary"
        size="sm"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        endContent={<Badge variant="warning" label={'Beta'} />}
      />
    </Tooltip>
  )
}
