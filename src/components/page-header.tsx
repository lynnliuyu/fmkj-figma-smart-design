import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'

import { cn } from '@/lib/utils'

/**
 * 页面标题区：标题 + 一句说明 + 右侧操作。各列表页、设置页统一使用。
 *
 * 视觉上改用 Astryx 的 Heading / Text 排版（语义层级、字号、行高都走设计系统 token），
 * 但 **对外 props 签名保持不变**，调用方（10 个页面）无需改动。
 * 分隔线仍用本仓 Tailwind 工具类，保持与既有页面间距一致。
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-4',
        className,
      )}
    >
      <VStack gap={1} className="min-w-0">
        <Heading level={1} maxLines={2}>
          {title}
        </Heading>
        {description ? (
          <Text type="supporting" maxLines={3} className="max-w-2xl text-pretty text-sm">
            {description}
          </Text>
        ) : null}
      </VStack>
      {actions ? (
        <HStack gap={2} wrap="wrap" vAlign="center">
          {actions}
        </HStack>
      ) : null}
    </header>
  )
}
