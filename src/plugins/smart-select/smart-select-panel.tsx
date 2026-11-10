'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { cn } from '@/lib/utils'

import { SELECTION_TIERS, type SelectionTier } from './auto-select'

/** 智能选型插件的面板：按主平台和档次一键设置项目默认型号（接口见 point-map/auto-defaults）。 */
export function SmartSelect({
  platform,
  busy,
  onRun,
  disabled,
}: {
  platform: string | null
  busy: boolean
  onRun: (tier: SelectionTier, overwrite: boolean) => void
  disabled: boolean
}) {
  const [tier, setTier] = useState<SelectionTier>('standard')
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4" />
          智能选型
        </h3>
        <span className="text-[11px] text-muted-foreground">主平台：{platform ?? '未设置'}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        按主平台和档次为每类设备挑选默认型号，同类尽量统一品牌。之后在报价里仍可逐行更换。
      </p>
      <div
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5"
        role="radiogroup"
        aria-label="选型档次"
      >
        {SELECTION_TIERS.map((t) => (
          <Button
            key={t.value}
            type="button"
            size="sm"
            variant={tier === t.value ? 'secondary' : 'ghost'}
            role="radio"
            aria-checked={tier === t.value}
            className={cn('h-7 text-xs', tier === t.value && 'bg-background shadow-sm')}
            onClick={() => setTier(t.value)}
            label="操作"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          isDisabled={disabled || busy}
          onClick={() => onRun(tier, false)}
          icon={<Loader2 />}
          label="补全未选型"
        />
        <Button
          size="sm"
          variant="secondary"
          isDisabled={disabled || busy}
          onClick={() => onRun(tier, true)}
          label="全部重新选"
        />
      </div>
    </div>
  )
}
