import { cn } from '@/lib/utils'

/**
 * 指标块：小标签 + 大数字 + 可选提示。
 *
 * 全站原来有 4+ 处手写同构结构（`text-xs font-medium text-muted-foreground`
 * 标题 + `text-2xl font-semibold tabular-nums` 数字 + 单位），字号、间距、圆角各处不一。
 * 收敛成一处，卡片容器统一用 `--radius-container`，数字统一 `tabular-nums`（等宽对齐）。
 *
 * 用法：
 *   <StatTile label="进行中项目" value="1" unit="个项目" />
 *   <StatTile label="检修次数" value={12} tone="warning" hint="近 30 天" />
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone,
  size = 'default',
  className,
}: {
  /** 指标名，例如「累计设计点位」 */
  label: React.ReactNode
  /** 主数值，可直接传数字或已格式化字符串 */
  value: React.ReactNode
  /** 单位后缀，例如「个智能点位」 */
  unit?: React.ReactNode
  /** 补充说明（小字，位于数值下方） */
  hint?: React.ReactNode
  /** 强调色；warning 用于待处理数据 */
  tone?: 'warning'
  /** default 用于页面级指标；sm 用于卡片内嵌 */
  size?: 'default' | 'sm'
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-container)] bg-card shadow-xs ring-1 ring-border',
        size === 'sm' ? 'px-3 py-2.5' : 'px-4 py-3',
        className,
      )}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            'font-semibold tracking-tight tabular-nums',
            size === 'sm' ? 'text-lg' : 'text-2xl',
            tone === 'warning' ? 'text-warning' : 'text-foreground',
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}
