import { VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'

import { cn } from '@/lib/utils'

/**
 * 统一的空状态：图标 + 标题 + 一句说明 + 可选操作。
 *
 * 之前全站有 30 多处各写各的空状态（`py-10 text-center text-xs`、带标题的、带图标的各不相同），
 * 观感散乱。这里收敛成一处，排版走 Astryx 的 Heading / Text，间距与颜色走设计系统 token。
 *
 * 用法：
 *   <EmptyState title="还没有项目" description="创建第一个项目开始设计" action={<Button>新建</Button>} />
 *   <EmptyState compact title="暂无记录" />   // 表格/卡片内的紧凑空状态
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
  className,
}: {
  /** 主文案，例如「还没有项目」 */
  title: React.ReactNode
  /** 补充说明，例如「请尝试其他关键词」 */
  description?: React.ReactNode
  /** 可选操作区（按钮/链接） */
  action?: React.ReactNode
  /** 可选图标（一般传一个 lucide 图标元素） */
  icon?: React.ReactNode
  /** 紧凑模式：表格、卡片内部等空间有限处使用 */
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center rounded-[var(--radius-container)] border border-dashed border-border text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <VStack gap={compact ? 1 : 2} hAlign="center">
        {icon ? (
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {icon}
          </div>
        ) : null}
        <Heading level={compact ? 4 : 3}>{title}</Heading>
        {description ? (
          <Text type="supporting" className="max-w-sm text-pretty text-sm">
            {description}
          </Text>
        ) : null}
        {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
      </VStack>
    </div>
  )
}
