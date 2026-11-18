'use client'

import {
  Cable,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileUp,
  Grid3x3,
  Hand,
  ImageDown,
  MousePointer2,
  Pentagon,
  Redo2,
  Ruler,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wifi,
} from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Popover } from '@astryxdesign/core/Popover'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Slider } from '@astryxdesign/core/Slider'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { SystemPack } from '@/board/core/pack'
import { SYMBOL_SIZES } from '@/board/core/symbols'
import { ICON_STYLE_OPTIONS } from '@/board/core/types'
import type { BoardTool, LayerId, ViewSettings } from '@/board/core/types'
import { cn } from '@/lib/utils'

export const BOARD_TOOLS: {
  id: BoardTool
  label: string
  shortLabel: string
  key: string
  icon: typeof Hand
  edit?: boolean
}[] = [
  { id: 'select', label: '选择与移动', shortLabel: '选择', key: 'V', icon: MousePointer2 },
  { id: 'pan', label: '平移画布', shortLabel: '平移', key: 'H / 空格', icon: Hand },
  {
    id: 'area',
    label: '绘制房间区域轮廓',
    shortLabel: '区域',
    key: 'A',
    icon: Pentagon,
    edit: true,
  },
  { id: 'calibrate', label: '标定图纸比例', shortLabel: '标定', key: 'C', icon: Ruler, edit: true },
]

const TOOLS: { id: BoardTool; label: string; key: string; icon: typeof Hand; edit?: boolean }[] = [
  { id: 'select', label: '选择', key: 'V', icon: MousePointer2 },
  { id: 'pan', label: '平移', key: 'H / 空格', icon: Hand },
  { id: 'area', label: '画区域：点出房间轮廓', key: 'A', icon: Pentagon, edit: true },
  { id: 'calibrate', label: '标定比例', key: 'C', icon: Ruler, edit: true },
]

/** 显示面板里的图层顺序（自上而下，和画面里的前后一致）；「点位代号」挂在点位下面 */
export const LAYER_ROWS: { id: LayerId; hint: string }[] = [
  { id: 'symbol', hint: '设备图标' },
  { id: 'area', hint: '房间轮廓与名称' },
  { id: 'shape', hint: '线、文字等标注' },
  { id: 'sheet', hint: '户型底图' },
]

/** 辅助图层的图标（按系统包里的图层 ID） */
const OVERLAY_ICONS: Record<string, typeof Wifi> = { coverage: Wifi, 'light-links': Cable }

/**
 * 「显示」弹窗里的图层与显示设置（Untitled UI 紧凑层级风格）。
 * 彩平风格只在顶栏「风格化」菜单里选，这里只调底图浓度，避免同一功能出现两处。
 */
export function BoardLayersPanel({
  view,
  onView,
  pack,
}: {
  view: ViewSettings
  onView: (patch: Partial<ViewSettings>) => void
  pack: SystemPack
}) {
  const layerName = (id: LayerId) => pack.layers.find((l) => l.id === id)?.name ?? id
  const hiddenCount = LAYER_ROWS.filter((l) => !view.layers[l.id]).length + (view.labels ? 0 : 1)
  const overlays = pack.overlays ?? []
  const showAll = () =>
    onView({ labels: true, layers: { sheet: true, area: true, shape: true, symbol: true } })

  return (
    <div className="space-y-4 px-3 py-3 text-xs">
      {/* 图层开关 */}
      <section className="space-y-1">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            画布图层
          </span>
          {hiddenCount ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={showAll}
              label="全部显示"
              className="h-6 px-1.5 text-[11px] text-primary hover:underline"
            />
          ) : null}
        </div>
        <ul className="space-y-0.5">
          {LAYER_ROWS.map((row) => {
            const on = view.layers[row.id]
            return (
              <li key={row.id} className="space-y-0.5">
                <LayerRow
                  on={on}
                  name={layerName(row.id)}
                  hint={row.hint}
                  onToggle={() => onView({ layers: { ...view.layers, [row.id]: !on } })}
                />
                {row.id === 'symbol' ? (
                  <LayerRow
                    on={view.labels}
                    name="点位代号"
                    hint="编号标签"
                    indent
                    disabled={!on}
                    onToggle={() => onView({ labels: !view.labels })}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      {/* 智能辅助图层 */}
      {overlays.length ? (
        <section className="space-y-1.5 border-t border-border pt-3">
          <div className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            智能辅助层
          </div>
          <ul className="space-y-0.5">
            {overlays.map((o) => {
              const on = Boolean(view.overlays?.[o.id])
              const Icon = OVERLAY_ICONS[o.id] ?? Sparkles
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={!view.layers.symbol}
                    onClick={() => onView({ overlays: { ...view.overlays, [o.id]: !on } })}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors disabled:opacity-40',
                      on ? 'bg-primary/8 text-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-3.5 shrink-0',
                        on ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                    <span
                      className={cn(
                        'h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors',
                        on ? 'bg-primary' : 'bg-input',
                      )}
                      aria-hidden
                    >
                      <span
                        className={cn(
                          'block size-3 rounded-full bg-background shadow-xs transition-transform',
                          on && 'translate-x-3',
                        )}
                      />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* 底图浓度 */}
      <section className="space-y-2 border-t border-border px-1 pt-3">
        <Slider
          label="底图浓度"
          min={15}
          max={100}
          step={5}
          value={Math.round(view.sheetOpacity * 100)}
          onChange={(v: number) => onView({ sheetOpacity: v / 100 })}
          valueDisplay="text"
          formatValue={(v: number) => `${v}%`}
        />
      </section>

      {/* 符号外观与辅助线 */}
      <section className="space-y-2.5 border-t border-border pt-3">
        <Segmented
          label="符号样式"
          value={view.symbolStyle}
          options={[
            { value: 'plan', label: '平面符号' },
            { value: 'marker', label: '实心标记' },
          ]}
          onChange={(v) => onView({ symbolStyle: v as ViewSettings['symbolStyle'] })}
        />
        <Segmented
          label="图标风格"
          value={view.iconStyle ?? 'default'}
          options={ICON_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onView({ iconStyle: v as ViewSettings['iconStyle'] })}
        />
        <Segmented
          label="符号尺寸"
          value={String(view.symbolSize)}
          options={SYMBOL_SIZES.map((s) => ({ value: String(s.value), label: s.label }))}
          onChange={(v) => onView({ symbolSize: Number(v) })}
        />
        <div className="flex items-center gap-1.5 pt-0.5">
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={view.grid}
            onClick={() => onView({ grid: !view.grid })}
            className={cn(
              'h-7 flex-1 text-xs font-normal',
              view.grid && 'border-primary/40 bg-primary/8 font-medium text-primary',
            )}
            icon={<Grid3x3 className="size-3.5" />}
            label="网格"
          />
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={view.rulers}
            onClick={() => onView({ rulers: !view.rulers })}
            className={cn(
              'h-7 flex-1 text-xs font-normal',
              view.rulers && 'border-primary/40 bg-primary/8 font-medium text-primary',
            )}
            icon={<Ruler className="size-3.5" />}
            label="标尺"
          />
        </div>
      </section>
    </div>
  )
}

/**
 * 顶栏右侧的「显示」图标按钮与弹窗：显示范围（children）、图层、辅助层、底图浓度、符号、网格与标尺都收在这里。
 * highlighted：有非默认的显示设置（如只看部分专业）时在图标上加一个小圆点。
 */
export function BoardViewPopover({
  view,
  onView,
  pack,
  highlighted = false,
  children,
}: {
  view: ViewSettings
  onView: (patch: Partial<ViewSettings>) => void
  pack: SystemPack
  highlighted?: boolean
  children?: React.ReactNode
}) {
  const hiddenCount = LAYER_ROWS.filter((l) => !view.layers[l.id]).length + (view.labels ? 0 : 1)
  const overlays = pack.overlays ?? []
  const overlayOn = overlays.filter((o) => view.overlays?.[o.id]).length
  const label = hiddenCount ? `显示设置（${hiddenCount} 项已隐藏）` : '显示设置'

  return (
    <Popover
      label={label}
      placement="below"
      alignment="end"
      // 调用点原来用 `w-72`；官方的 `width` 才是浮层外框的宽度（挂内层 div 会被外框裁掉）。
      width={288}
      padding={0}
      hasLightDismiss
      hasEscapeDismiss
      content={
        <div
          className="max-h-[min(40rem,calc(100svh-7rem))] overflow-y-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
          <BoardLayersPanel view={view} onView={onView} pack={pack} />
        </div>
      }
    >
      <Tooltip content={label} placement="below">
        <IconButton
          variant="ghost"
          // 官方浮层把开合状态写在触发器的 `aria-expanded` 上（不是 radix 的 `data-state`）。
          className="relative text-muted-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
          label={label}
          size="md"
          icon={
            <span className="relative">
              <SlidersHorizontal />
              {hiddenCount ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 size-1.5 rounded-full bg-warning"
                />
              ) : highlighted || overlayOn ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </span>
          }
        />
      </Tooltip>
    </Popover>
  )
}

/** 画布左上角的工具条：工具、撤销重做、网格 / 标尺、视图、导入导出 */
export function BoardToolbar(props: {
  tool: BoardTool
  onTool: (t: BoardTool) => void
  view: ViewSettings
  onView: (patch: Partial<ViewSettings>) => void
  pack: SystemPack
  readOnly: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onAutoGenerate?: () => void
  onExportPng: () => void
  onExportJson: () => void
  onImportJson: () => void
  offset: boolean
}) {
  const { tool, view, onView, readOnly } = props
  const btn = 'size-8 rounded-md'
  const layerName = (id: LayerId) => props.pack.layers.find((l) => l.id === id)?.name ?? id
  const hiddenCount = LAYER_ROWS.filter((l) => !view.layers[l.id]).length + (view.labels ? 0 : 1)
  const overlays = props.pack.overlays ?? []
  const overlayOn = overlays.filter((o) => view.overlays?.[o.id]).length
  const showAll = () =>
    onView({ labels: true, layers: { sheet: true, area: true, shape: true, symbol: true } })
  const exportItems: DropdownMenuOption[] = [
    {
      id: 'png',
      label: (
        <span className="flex items-center gap-2">
          <ImageDown className="size-4" />
          导出当前图纸 PNG（{props.pack.paper}，含图例）
        </span>
      ),
      onClick: props.onExportPng,
    },
    {
      id: 'json',
      label: (
        <span className="flex items-center gap-2">
          <FileJson className="size-4" />
          导出画板 JSON
        </span>
      ),
      onClick: props.onExportJson,
    },
    ...(readOnly
      ? []
      : [
          {
            id: 'import',
            label: (
              <span className="flex items-center gap-2">
                <FileUp className="size-4" />
                导入画板 JSON（替换当前内容）
              </span>
            ),
            onClick: props.onImportJson,
          },
        ]),
    { type: 'divider' as const },
  ]
  return (
    <div
      className={cn(
        'absolute z-10 flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-sm',
        props.offset ? 'top-7 left-7' : 'top-3 left-3',
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TOOLS.filter((t) => !t.edit || !readOnly).map((t) => (
        <IconButton
          key={t.id}
          variant={tool === t.id ? 'secondary' : 'ghost'}
          size="md"
          className={btn}
          aria-pressed={tool === t.id}
          label={t.label}
          tooltip={`${t.label}（${t.key}）`}
          icon={<t.icon className="size-4" />}
          onClick={() => props.onTool(t.id)}
        />
      ))}
      {readOnly ? null : (
        <>
          <span className="mx-0.5 h-5 w-px bg-border" />
          {props.onAutoGenerate ? (
            <IconButton
              variant="ghost"
              size="md"
              className={cn(btn, 'text-primary hover:text-primary')}
              label="智能生成点位"
              tooltip="智能生成点位（覆盖当前点位，可随时撤销）"
              icon={<Sparkles className="size-4" />}
              onClick={props.onAutoGenerate}
            />
          ) : null}
          <IconButton
            variant="ghost"
            size="md"
            className={btn}
            isDisabled={!props.canUndo}
            label="撤销"
            tooltip="撤销（Ctrl/⌘ + Z）"
            icon={<Undo2 className="size-4" />}
            onClick={props.onUndo}
          />
          <IconButton
            variant="ghost"
            size="md"
            className={btn}
            isDisabled={!props.canRedo}
            label="重做"
            tooltip="重做（Ctrl/⌘ + Shift + Z）"
            icon={<Redo2 className="size-4" />}
            onClick={props.onRedo}
          />
        </>
      )}
      <span className="mx-0.5 h-5 w-px bg-border" />
      <IconButton
        variant={view.grid ? 'secondary' : 'ghost'}
        size="md"
        className={btn}
        aria-pressed={view.grid}
        label="网格"
        tooltip="网格 25cm（G）"
        icon={<Grid3x3 className="size-4" />}
        onClick={() => onView({ grid: !view.grid })}
      />
      <Popover
        label={hiddenCount ? `显示与隐藏（${hiddenCount} 项已隐藏）` : '显示与隐藏'}
        placement="below"
        alignment="start"
        width={288}
        padding={0}
        hasLightDismiss
        hasEscapeDismiss
        content={
          <div onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
              <p className="text-sm font-medium">显示与隐藏</p>
              {hiddenCount ? (
                <Button variant="ghost" size="sm" label="全部显示" onClick={showAll} />
              ) : null}
            </div>
            {/* 每个图层一行：眼睛图标就是开关，隐藏的行变灰 */}
            <ul className="px-1.5 pb-1.5">
              {LAYER_ROWS.map((row) => {
                const on = view.layers[row.id]
                return (
                  <li key={row.id}>
                    <LayerRow
                      on={on}
                      name={layerName(row.id)}
                      hint={row.hint}
                      onToggle={() => onView({ layers: { ...view.layers, [row.id]: !on } })}
                    />
                    {row.id === 'symbol' ? (
                      <LayerRow
                        on={view.labels}
                        name="点位代号"
                        hint="图标下方的编号"
                        indent
                        disabled={!on}
                        onToggle={() => onView({ labels: !view.labels })}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {overlays.length ? (
              <div className="border-t px-1.5 py-1.5">
                <p className="px-1.5 pt-1 pb-1 text-xs font-medium text-muted-foreground">
                  智能辅助图层（只显示，不写进图纸）
                </p>
                <ul>
                  {overlays.map((o) => {
                    const on = Boolean(view.overlays?.[o.id])
                    const Icon = OVERLAY_ICONS[o.id] ?? Sparkles
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          disabled={!view.layers.symbol}
                          onClick={() => onView({ overlays: { ...view.overlays, [o.id]: !on } })}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-40',
                            !on && 'text-muted-foreground',
                          )}
                        >
                          <Icon className={cn('size-4 shrink-0', on && 'text-primary')} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span>{o.name}</span>
                            <span className="truncate text-xs text-muted-foreground">{o.hint}</span>
                          </span>
                          <span
                            className={cn(
                              'h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors',
                              on ? 'bg-primary' : 'bg-muted',
                            )}
                            aria-hidden
                          >
                            <span
                              className={cn(
                                'block size-3 rounded-full bg-background shadow-sm transition-transform',
                                on && 'translate-x-3',
                              )}
                            />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            <div className="space-y-3 border-t px-3 py-3 text-xs">
              <Slider
                label="底图浓度"
                min={15}
                max={100}
                step={5}
                value={Math.round(view.sheetOpacity * 100)}
                onChange={(v: number) => onView({ sheetOpacity: v / 100 })}
                valueDisplay="text"
                formatValue={(v: number) => `${v}%`}
              />
              <Segmented
                label="符号样式"
                value={view.symbolStyle}
                options={[
                  { value: 'plan', label: '平面符号' },
                  { value: 'marker', label: '实心标记' },
                ]}
                onChange={(v) => onView({ symbolStyle: v as ViewSettings['symbolStyle'] })}
              />
              <Segmented
                label="图标风格"
                value={view.iconStyle ?? 'default'}
                options={ICON_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => onView({ iconStyle: v as ViewSettings['iconStyle'] })}
              />
              <Segmented
                label="符号大小"
                value={String(view.symbolSize)}
                options={SYMBOL_SIZES.map((s) => ({ value: String(s.value), label: s.label }))}
                onChange={(v) => onView({ symbolSize: Number(v) })}
              />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">标尺（Shift + R）</span>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-pressed={view.rulers}
                  onClick={() => onView({ rulers: !view.rulers })}
                  label={view.rulers ? '已显示' : '已隐藏'}
                />
              </div>
            </div>
          </div>
        }
      >
        <IconButton
          variant={hiddenCount ? 'secondary' : 'ghost'}
          size="md"
          className={cn(btn, 'relative')}
          label={hiddenCount ? `显示与隐藏（${hiddenCount} 项已隐藏）` : '显示与隐藏'}
          tooltip={
            hiddenCount
              ? `有 ${hiddenCount} 项已隐藏`
              : '显示与隐藏：图层、代号、底图浓度、符号样式'
          }
          icon={
            <span className="relative">
              {hiddenCount ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {hiddenCount ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 size-1.5 rounded-full bg-warning"
                />
              ) : overlayOn ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </span>
          }
        />
      </Popover>
      <DropdownMenu
        placement="below"
        alignment="start"
        menuWidth="12.6rem"
        items={exportItems}
        footer={<p className="px-2 py-1 text-xs text-muted-foreground">{props.pack.export.note}</p>}
        renderTrigger={(triggerProps) => (
          <Button
            {...triggerProps}
            variant="ghost"
            isIconOnly
            size="md"
            className={btn}
            label="导入导出"
            tooltip="导出图片 / 画板 JSON"
            icon={<Download className="size-4" />}
          />
        )}
      />
    </div>
  )
}

function LayerRow({
  on,
  name,
  hint,
  onToggle,
  indent,
  disabled,
}: {
  on: boolean
  name: string
  hint: string
  onToggle: () => void
  indent?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:opacity-40',
        indent && 'pl-6',
        on ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {on ? (
        <Eye className="size-3.5 shrink-0 text-primary" />
      ) : (
        <EyeOff className="size-3.5 shrink-0" />
      )}
      <span
        className={cn('flex-1 font-medium', !on && 'line-through decoration-muted-foreground/50')}
      >
        {name}
      </span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </button>
  )
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</span>
      <SegmentedControl label={label} value={value} onChange={onChange} size="sm" layout="hug">
        {options.map((o) => (
          <SegmentedControlItem key={o.value} value={o.value} label={o.label} />
        ))}
      </SegmentedControl>
    </div>
  )
}
