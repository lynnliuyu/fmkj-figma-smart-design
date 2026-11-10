'use client'

import { useState } from 'react'

import { Button } from '@astryxdesign/core/Button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import type { SymbolTemplate } from '@/board/core/types'
import {
  artOf,
  defaultVariant,
  LIGHTING_GROUPS,
  type LightingFamily,
} from '@/board/packs/smart-home/look'
import { cn } from '@/lib/utils'

import { DRAG_TYPE } from './editor-panels'

export const variantTemplate = (
  fam: LightingFamily,
  variantId: string,
  real: boolean,
): SymbolTemplate => {
  const v = fam.variants.find((x) => x.id === variantId) ?? defaultVariant(fam)
  return {
    symbolId: v.id,
    sizeCm: v.sizeCm,
    real: real && !!v.sizeCm,
    data: { deviceType: fam.deviceType },
  }
}

function Art({ id, className }: { id: string; className?: string }) {
  const art = artOf(id)
  if (!art) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={art.srcSm} alt="" draggable={false} className={cn('object-contain', className)} />
  )
}

/** 灯光设计：按款式分组，每款几个尺寸档；可按真实尺寸落图（图纸需先标定） */
export function LightingPanel({
  armedId,
  onArm,
  disabled,
  calibrated,
}: {
  armedId: string | null
  onArm: (tpl: SymbolTemplate | null) => void
  disabled: boolean
  calibrated: boolean
}) {
  const [famId, setFamId] = useState<string>(LIGHTING_GROUPS[0].families[0].id)
  const [real, setReal] = useState(true)
  const fam = LIGHTING_GROUPS.flatMap((g) => g.families).find((f) => f.id === famId)!
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-3.5 pt-2.5 pb-4">
          {LIGHTING_GROUPS.map((g) => (
            <section key={g.name}>
              <div className="mb-1.5 text-xs font-semibold text-fg-secondary">{g.name}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {g.families.map((f) => (
                  <Button
                    key={f.id}
                    type="button"
                    variant="secondary"
                    isDisabled={disabled}
                    draggable={!disabled}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        DRAG_TYPE,
                        JSON.stringify(variantTemplate(f, defaultVariant(f).id, real)),
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => {
                      setFamId(f.id)
                      const inFam = f.variants.some((v) => v.id === armedId)
                      onArm(
                        inFam && f.id === famId
                          ? null
                          : variantTemplate(f, defaultVariant(f).id, real),
                      )
                    }}
                    aria-pressed={f.id === famId}
                    className={cn(
                      'h-auto flex-col gap-1 rounded-lg border-border bg-background px-1 py-2 text-[11px] font-normal text-fg-secondary shadow-none hover:border-border-strong hover:bg-subtle',
                      f.id === famId &&
                        'border-primary bg-primary/8 font-medium text-primary ring-2 ring-primary/20',
                    )}
                    icon={<Art id="lighting" />}
                    label="操作"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
      <div className="space-y-2 border-t border-border bg-subtle/50 p-3.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-foreground">{fam.name} · 尺寸档</span>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            按比例
            <Switch
              checked={real}
              onCheckedChange={(next) => {
                setReal(next)
                if (armedId && fam.variants.some((v) => v.id === armedId)) {
                  onArm(variantTemplate(fam, armedId, next))
                }
              }}
              aria-label="按真实尺寸落图"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {fam.variants.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={armedId === v.id ? 'primary' : 'secondary'}
              isDisabled={disabled}
              className={cn(
                'h-6.5 gap-1 px-2 text-[11px] shadow-none',
                armedId === v.id
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border bg-background text-fg-secondary hover:bg-subtle',
              )}
              onClick={() => onArm(armedId === v.id ? null : variantTemplate(fam, v.id, real))}
              icon={<Art id="lighting" />}
              label="操作"
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {real && !calibrated
            ? '当前图纸未标定，按比例的灯具先按固定大小示意；标定后自动换成真实尺寸。'
            : `计入报价：按设备类型统计（${fam.variants.length} 个尺寸档）。`}
        </p>
      </div>
    </div>
  )
}
