'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Copy,
  Hand,
  Layers,
  Maximize2,
  MousePointerClick,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { PointMarker } from '@/components/point-marker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LEVEL_LABEL, type AreaAnalysis } from '@/lib/area-analysis'
import { AREA_TYPES, areaTypeLabel } from '@/lib/area-types'
import {
  categoryOfType,
  DEVICE_GROUPS,
  DEVICE_TYPES,
  deviceTypeLabel,
  deviceTypeOf,
  type DeviceCategory,
  type DeviceType,
} from '@/lib/device-types'
import type { AreaInfo, SheetInfo } from '@/lib/point-scene'
import { cn } from '@/lib/utils'

export type PointProduct = {
  id: string
  name: string
  sku: string
  price: number
  unit: string
  status: string
  deviceType: string | null
  brand: string
  brandLogo: string | null
  image: string | null
}

export const DEFAULT_VALUE = '__default'
export const NONE_VALUE = '__none'
export const yuan = (n: number) => `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
export const DRAG_TYPE = 'application/x-fmkj-device'

export function ProductLine({ product, hint }: { product: PointProduct; hint?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <BrandLogo
        name={product.brand}
        logo={product.brandLogo}
        className="h-3.5 max-w-12 shrink-0"
      />
      <span className="min-w-0 truncate">{product.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {yuan(product.price)}
      </span>
      {hint ? <span className="shrink-0 text-xs text-muted-foreground">{hint}</span> : null}
    </span>
  )
}

/* ------------------------------ 放置设备 ------------------------------ */

export function PlacePanel({
  groups,
  query,
  onQuery,
  counts,
  armed,
  onArm,
  disabled,
}: {
  groups: { category: DeviceCategory; types: DeviceType[] }[]
  query: string
  onQuery: (q: string) => void
  counts: Map<string, number>
  armed: string | null
  onArm: (type: string | null) => void
  disabled: boolean
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 px-3.5 pt-3 pb-2">
        {armed ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-xs text-foreground">
            <PointMarker type={armed} className="size-5" />
            <span className="min-w-0 flex-1 font-medium">
              点击图纸放置「{deviceTypeOf(armed)?.name}」
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => onArm(null)}
              label="Esc 结束"
            />
          </div>
        ) : null}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜索设备（点击或拖拽放置）"
            aria-label="搜索设备"
            className="h-8 border-border bg-subtle/70 pl-8 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-3.5 pt-1.5 pb-4">
          {groups.map(({ category, types }) => {
            const placed = types.reduce((s, t) => s + (counts.get(t.value) ?? 0), 0)
            return (
              <section key={category.slug}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-fg-secondary">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </span>
                  {placed ? (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                      {placed}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {types.map((t) => {
                    const n = counts.get(t.value) ?? 0
                    const active = armed === t.value
                    return (
                      <Button
                        key={t.value}
                        type="button"
                        variant="secondary"
                        isDisabled={disabled}
                        draggable={!disabled}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DRAG_TYPE, t.value)
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => onArm(active ? null : t.value)}
                        aria-pressed={active}
                        tooltip={`放置${deviceTypeLabel(t.value)}`}
                        className={cn(
                          'relative h-auto min-w-0 flex-col gap-1 rounded-lg border-border bg-background px-1.5 py-2 text-center text-xs font-normal whitespace-normal text-fg-secondary shadow-none hover:border-border-strong hover:bg-subtle',
                          active &&
                            'border-primary bg-primary/8 font-medium text-primary ring-2 ring-primary/20',
                        )}
                        icon={<PointMarker type={null} />}
                        label="{n ? ( ) : null}"
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
          {groups.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">没有匹配的设备</p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/* ------------------------------ 区域 ------------------------------ */

export function ScoreBadge({ score }: { score: number }) {
  return (
    <Badge
      variant={score >= 100 ? 'success' : score >= 60 ? 'outline' : 'warning'}
      className="h-5 px-1.5 text-xs tabular-nums"
    >
      {score}%
    </Badge>
  )
}

export function AreasPanel({
  sheets,
  areas,
  analysis,
  unassigned,
  selectedAreaId,
  onAdd,
  onFocus,
  readOnly,
}: {
  sheets: SheetInfo[]
  areas: AreaInfo[]
  analysis: Map<string, AreaAnalysis>
  unassigned: number
  selectedAreaId: string | null
  onAdd: (areaType: string) => void
  onFocus: (areaId: string) => void
  readOnly: boolean
}) {
  const [type, setType] = useState('living')
  const groups = [
    ...sheets.map((s) => ({
      key: s.id,
      name: s.name,
      items: areas.filter((a) => a.sheetId === s.id),
    })),
    { key: 'none', name: '图纸外', items: areas.filter((a) => !a.sheetId) },
  ].filter((g) => g.items.length)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {readOnly ? null : (
        <div className="border-b border-border px-3.5 py-3">
          <div className="flex gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger size="sm" className="h-8 flex-1 border-border bg-subtle/70 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREA_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
              isDisabled={!sheets.length}
              onClick={() => onAdd(type)}
              icon={<Plus />}
              label="添加区域"
            />
          </div>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3.5 p-3.5">
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              添加区域并拖动顶点框选房间轮廓，点位将自动归类。
            </p>
          ) : null}
          {groups.map((g) => (
            <section key={g.key} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {g.name}
              </h3>
              {g.items.map((a) => {
                const r = analysis.get(a.id)
                const selected = selectedAreaId === a.id
                return (
                  <Button
                    key={a.id}
                    variant="secondary"
                    onClick={() => onFocus(a.id)}
                    className={cn(
                      'h-auto w-full justify-start gap-2 rounded-lg border-border bg-background px-2.5 py-2 text-left font-normal shadow-none hover:bg-subtle',
                      selected && 'border-primary bg-primary/8 ring-1 ring-primary/20',
                    )}
                    icon={<ScoreBadge score={r?.score ?? 0} />}
                    label="· 个点位 {r && r.missing.filter((m) => m.level !== 'optional').length ? ` · 建议补充 $ 项` : ''}"
                  />
                )
              })}
            </section>
          ))}
          {unassigned && areas.length ? (
            <p className="flex items-center gap-1 text-xs text-warning">
              <AlertTriangle className="size-3.5" />
              {unassigned} 个点位不在任何区域内
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

export function SelectedArea({
  area,
  analysis,
  onChange,
  onDelete,
  onClose,
  readOnly,
}: {
  area: AreaInfo
  analysis: AreaAnalysis | undefined
  onChange: (patch: { name?: string; areaType?: string }) => void
  onDelete: () => void
  onClose: () => void
  readOnly: boolean
}) {
  const [name, setName] = useState(area.name)
  const [key, setKey] = useState(area.id)
  if (key !== area.id) {
    setKey(area.id)
    setName(area.name)
  }
  const commit = () => {
    const v = name.trim()
    if (v && v !== area.name) onChange({ name: v })
    else setName(area.name)
  }
  return (
    <div className="space-y-2.5 border-b border-border bg-subtle/80 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <MousePointerClick className="size-3.5" />
          区域属性
        </div>
        <div className="flex items-center gap-1">
          {analysis ? <ScoreBadge score={analysis.score} /> : null}
          <IconButton
            variant="ghost"

            aria-label="取消选中区域"
            tooltip="取消选中"
            onClick={onClose}
            label="取消选中区域"
            icon={<X />}
            size="sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Input
          value={name}
          disabled={readOnly}
          maxLength={30}
          aria-label="区域名称"
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="h-8 border-border bg-background text-xs"
        />
        <Select
          value={area.areaType}
          disabled={readOnly}
          onValueChange={(v) => onChange({ areaType: v })}
        >
          <SelectTrigger className="h-8 w-full border-border bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AREA_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {readOnly ? null : (
        <p className="text-[11px] text-muted-foreground">
          拖动顶点改形状 · 拖动边中点加顶点 · 双击顶点删除
        </p>
      )}
      {analysis ? (
        <div className="space-y-1.5 text-xs">
          {analysis.devices.length ? (
            <div className="flex flex-wrap gap-1">
              {analysis.devices.map((d) => (
                <span
                  key={d.deviceType}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px]"
                >
                  <PointMarker type={d.deviceType} className="size-3.5" />
                  {deviceTypeOf(d.deviceType)?.name}{' '}
                  <span className="tabular-nums text-muted-foreground">×{d.count}</span>
                </span>
              ))}
            </div>
          ) : null}
          {analysis.warnings.map((w) => (
            <p key={w} className="flex gap-1 text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </p>
          ))}
          {analysis.missing
            .filter((m) => m.level !== 'optional')
            .map((m) => (
              <p key={m.label} className="flex gap-1 text-muted-foreground">
                <Plus className="mt-0.5 size-3.5 shrink-0" />
                建议补充{m.label}（{LEVEL_LABEL[m.level]}）：{m.reason}
              </p>
            ))}
        </div>
      ) : null}
      {readOnly ? null : (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={onDelete}
          icon={<Trash2 />}
          label="删除区域（保留点位）"
        />
      )}
    </div>
  )
}

/* ------------------------------ 点位统计 ------------------------------ */

export function TypeDefaultRow({
  type,
  count,
  readOnly,
  onArm,
}: {
  type: string
  count: number
  readOnly: boolean
  onArm?: (deviceType: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <PointMarker type={type} className="size-5.5" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {deviceTypeLabel(type)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">× {count}</span>
        {!readOnly && onArm ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-primary hover:bg-primary/8 hover:text-primary"
            onClick={() => onArm(type)}
            icon={<Plus />}
            label="继续放"
          />
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------ 选中的点位 ------------------------------ */

export function SelectedPoint({
  code,
  deviceType,
  areaName,
  readOnly,
  onChangeType,
  onDuplicate,
  onDelete,
}: {
  code: string
  deviceType: string
  areaName: string | null
  readOnly: boolean
  onChangeType: (deviceType: string) => void
  onDuplicate?: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-2.5 border-b border-border bg-subtle/80 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Hand className="size-3.5" />
          点位属性
        </div>
        {readOnly ? null : (
          <div className="-mr-1.5 flex items-center gap-1">
            {onDuplicate ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={onDuplicate}
                icon={<Copy />}
                label="复制"
              />
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              icon={<Trash2 />}
              label="删除"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <PointMarker type={deviceType} className="size-8" />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">
            {code} · {deviceTypeOf(deviceType)?.name ?? '其他设备'}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {deviceTypeLabel(deviceType)}
            {areaName ? ` · ${areaName}` : ''}
          </div>
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="text-[11px] font-medium text-muted-foreground">设备类型</div>
        <Select value={deviceType} disabled={readOnly} onValueChange={onChangeType}>
          <SelectTrigger className="h-8 w-full max-w-full min-w-0 overflow-hidden border-border bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEVICE_GROUPS.map(({ category, types }) => (
              <SelectGroup key={category.slug}>
                <SelectLabel className="flex items-center gap-1.5 text-xs">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                </SelectLabel>
                {types.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      <PointMarker type={t.value} className="size-4" />
                      <span>{deviceTypeLabel(t.value)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/* ------------------------------ 画布紧凑右键菜单 ------------------------------ */

export type CanvasContextMenuTarget =
  | {
      kind: 'point'
      pointId: string
      code: string
      deviceType: string
      areaName: string | null
      x: number
      y: number
      wrapW: number
      wrapH: number
    }
  | {
      kind: 'area'
      areaId: string
      name: string
      areaType: string
      x: number
      y: number
      wrapW: number
      wrapH: number
    }
  | {
      kind: 'canvas'
      sceneX: number
      sceneY: number
      x: number
      y: number
      wrapW: number
      wrapH: number
    }

export function PointMapContextMenu({
  target,
  onClose,
  onChangePointType,
  onDuplicatePoint,
  onArmType,
  onDeletePoint,
  onChangeAreaType,
  onDeleteArea,
  onAddAreaAt,
  onFitSheet,
}: {
  target: CanvasContextMenuTarget
  onClose: () => void
  onChangePointType: (pointId: string, deviceType: string) => void
  onDuplicatePoint: (pointId: string) => void
  onArmType: (deviceType: string) => void
  onDeletePoint: (pointId: string) => void
  onChangeAreaType: (areaId: string, areaType: string) => void
  onDeleteArea: (areaId: string) => void
  onAddAreaAt: (sceneX: number, sceneY: number) => void
  onFitSheet: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: target.x, top: target.y })

  // 自动避让底部显示范围栏（预留 64px）与画布四边，靠近下方时向上展开
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 10
    const bottomSafe = Math.max(120, target.wrapH - 64)
    let left = target.x + 4
    let top = target.y + 4
    if (left + rect.width > target.wrapW - margin) {
      left = Math.max(margin, target.wrapW - rect.width - margin)
    }
    if (top + rect.height > bottomSafe) {
      const flipped = target.y - rect.height - 6
      top = flipped >= margin ? flipped : Math.max(margin, bottomSafe - rect.height)
    }
    setPos({ left, top })
  }, [target])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const itemClass =
    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground'

  if (target.kind === 'point') {
    const cat = categoryOfType(target.deviceType)
    const siblings = DEVICE_TYPES.filter(
      (t) => t.category === cat?.slug && t.value !== target.deviceType,
    )
    return (
      <div
        ref={menuRef}
        role="menu"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute z-30 w-56 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
      >
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <PointMarker type={target.deviceType} className="size-5 shrink-0" />
          <span className="truncate text-xs font-semibold">
            {target.code} · {deviceTypeOf(target.deviceType)?.name ?? '设备'}
          </span>
          {target.areaName ? (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {target.areaName}
            </span>
          ) : null}
        </div>

        {siblings.length > 0 ? (
          <div className="border-b px-2 py-1.5">
            <div className="mb-1 text-xs text-muted-foreground">快速切换同组类型</div>
            <div className="flex flex-wrap gap-1">
              {siblings.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    onChangePointType(target.pointId, t.value)
                    onClose()
                  }}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <PointMarker type={t.value} className="size-3.5" />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="py-1">
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              onDuplicatePoint(target.pointId)
              onClose()
            }}
          >
            <Copy className="size-3.5 text-muted-foreground" />
            <span>复制点位</span>
          </button>
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              onArmType(target.deviceType)
              onClose()
            }}
          >
            <Plus className="size-3.5 text-muted-foreground" />
            <span>以此类型继续放置</span>
          </button>
          <button
            type="button"
            className={cn(
              itemClass,
              'text-destructive hover:bg-destructive/10 hover:text-destructive',
            )}
            onClick={() => {
              onDeletePoint(target.pointId)
              onClose()
            }}
          >
            <Trash2 className="size-3.5" />
            <span>删除点位</span>
          </button>
        </div>
      </div>
    )
  }

  if (target.kind === 'area') {
    return (
      <div
        ref={menuRef}
        role="menu"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute z-30 w-52 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
      >
        <div className="border-b px-2 py-1.5 text-xs font-semibold">区域 · {target.name}</div>
        <div className="border-b px-2 py-1.5">
          <div className="mb-1 text-xs text-muted-foreground">切换房间类型</div>
          <div className="flex flex-wrap gap-1">
            {AREA_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  onChangeAreaType(target.areaId, t.value)
                  onClose()
                }}
                className={cn(
                  'rounded-md border bg-background px-1.5 py-0.5 text-xs transition-colors hover:border-primary hover:bg-primary/5',
                  t.value === target.areaType && 'border-primary bg-primary/10 font-medium',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-1">
          <button
            type="button"
            className={cn(
              itemClass,
              'text-destructive hover:bg-destructive/10 hover:text-destructive',
            )}
            onClick={() => {
              onDeleteArea(target.areaId)
              onClose()
            }}
          >
            <Trash2 className="size-3.5" />
            <span>删除区域（保留点位）</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute z-30 w-48 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
    >
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          onAddAreaAt(target.sceneX, target.sceneY)
          onClose()
        }}
      >
        <Layers className="size-3.5 text-muted-foreground" />
        <span>在此处添加房间区域</span>
      </button>
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          onFitSheet()
          onClose()
        }}
      >
        <Maximize2 className="size-3.5 text-muted-foreground" />
        <span>图纸铺满画布（100%）</span>
      </button>
    </div>
  )
}

export function CoverageBar({ value }: { value: number }) {
  return <Progress value={value} className="h-1.5" />
}
