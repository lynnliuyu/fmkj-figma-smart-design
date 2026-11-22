'use client'

/**
 * 智能家居总览页的客户端交互区。
 *
 * 有可用的桌面桥时直连 Home Assistant，按连接状态显示实时视图或设置引导。
 * 无可用的桌面桥时显示桌面客户端入口。
 *
 * 实时视图按「现场验收 / 调试」组织：连接状态 → 汇总 → 快捷控制 →
 * 环境读数 → 需要处理 → 全部设备（默认折叠 + 分页）。默认不渲染全部实体，
 * 避免实体多时首屏卡死。
 *
 * 控制行为：调用 `callService`，pending 时禁用，失败就地提示，成功后重新
 * `getStates()`。不做乐观更新 —— 界面只反映主进程真正读回来的状态。
 */

import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Home,
  PanelLeft,
  RefreshCw,
  Search,
  Settings,
  Star,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { EmptyState } from '@/components/empty-state'
import { StatTile } from '@/components/stat-tile'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table'
import {
  callHaService,
  detectDesktopHa,
  isHaControlDomain,
  openDesktopSettings,
  readHaStates,
  readHaStatus,
  type DesktopHaBridge,
  type HaControlDomain,
  type HaControlService,
  type HaEntityState,
  type HaStatus,
} from '@/lib/desktop-ha'
import { assembleOverview, type EntityRow, type SmartHomeOverview } from '@/plugins/ha-mcp/overview'

/** 实体类型域的展示白名单：从已有实体里挑出现的域。 */
function domainOptions(entities: SmartHomeOverview['entities']): string[] {
  return [...new Set(entities.map((e) => e.domain))].sort((a, b) =>
    a.localeCompare(b, 'zh-Hans-CN'),
  )
}

function stringAttr(attributes: Record<string, unknown>, key: string): string | null {
  const value = attributes[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberAttr(attributes: Record<string, unknown>, key: string): number | null {
  const value = attributes[key]
  // Number(null) === 0、Number('') === 0 —— 缺失值不能变成 0。
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function stringListAttr(attributes: Record<string, unknown>, key: string): string[] {
  const value = attributes[key]
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

/** 把桥返回的 states 映射成既有 `SmartHomeData` 的展示结构（统计口径复用 overview.ts）。 */
function liveOverview(states: HaEntityState[]): SmartHomeOverview {
  const assembled = assembleOverview({
    configured: true,
    entities: states.map((state) => ({
      entityId: state.entityId,
      name: stringAttr(state.attributes, 'friendly_name') ?? '',
      area: stringAttr(state.attributes, 'area_name') ?? stringAttr(state.attributes, 'area'),
      state: state.state,
    })),
  })
  if (assembled.configured) return assembled
  // assembleOverview({ configured: true }) 不会走到这里，纯为类型收窄。
  return {
    configured: true,
    totalEntities: 0,
    activeEntities: 0,
    areas: [],
    entities: [],
    health: null,
  }
}

function roundTemperature(value: number): number {
  return Math.round(value * 10) / 10
}

const HVAC_MODE_LABELS: Record<string, string> = {
  off: '关闭',
  heat: '制热',
  cool: '制冷',
  auto: '自动',
  heat_cool: '自动',
  dry: '除湿',
  fan_only: '送风',
}

function hvacModeLabel(mode: string): string {
  return HVAC_MODE_LABELS[mode] ?? mode
}

const OFFLINE_STATES = new Set(['unavailable', 'unknown'])

function isOfflineState(value: string): boolean {
  return OFFLINE_STATES.has(value)
}

const COVER_STATE_LABELS: Record<string, string> = {
  open: '已打开',
  opened: '已打开',
  closed: '已关闭',
  opening: '正在打开',
  closing: '正在关闭',
}

/** 实时视图里的状态中文。未知状态原样显示，避免把 HA 的枚举藏起来。 */
function stateLabel(entity: EntityRow): string {
  if (entity.state === 'unavailable') return '不可用'
  if (entity.state === 'unknown') return '未知'
  if (entity.domain === 'light' || entity.domain === 'switch') {
    return entity.state === 'on' ? '开' : entity.state === 'off' ? '关' : entity.state
  }
  if (entity.domain === 'cover') return COVER_STATE_LABELS[entity.state] ?? entity.state
  if (entity.domain === 'climate') return hvacModeLabel(entity.state)
  return entity.state
}

/** 空调卡显示当前温度与设定温度；HA 的 `temperature` 是设定值，不是实测值。 */
function deviceStatus(entity: EntityRow, attributes: Record<string, unknown>): string {
  if (entity.domain !== 'climate') return stateLabel(entity)
  const currentTemperature = numberAttr(attributes, 'current_temperature')
  const targetTemperature = numberAttr(attributes, 'temperature')
  const parts: string[] = []
  if (currentTemperature !== null) parts.push(`当前温度 ${currentTemperature}°C`)
  if (targetTemperature !== null) parts.push(`设定温度 ${targetTemperature}°C`)
  parts.push(stateLabel(entity))
  return parts.join(' · ')
}

function isOnEntity(entity: EntityRow): boolean {
  if (entity.state === 'on' || entity.state === 'open' || entity.state === 'opening') return true
  if (entity.domain === 'climate') {
    return !isOfflineState(entity.state) && entity.state !== 'off' && entity.state !== ''
  }
  return false
}

/**
 * 环境读数：sensor 里的温度 / 湿度。
 * 有 device_class 时只认 temperature / humidity（battery 等一律排除）；
 * device_class 缺失才用单位兜底，并显式排除电池实体。
 */
function readingUnit(entityId: string, attributes: Record<string, unknown>): string | null {
  const deviceClass = stringAttr(attributes, 'device_class')
  const unit = stringAttr(attributes, 'unit_of_measurement')

  if (deviceClass) {
    if (deviceClass === 'temperature') return unit ?? '°C'
    if (deviceClass === 'humidity') return unit ?? '%'
    return null
  }

  if (unit === '°C' || unit === '℃') return unit
  if (unit === '%') {
    if (entityId.toLowerCase().includes('battery')) return null
    return unit
  }
  return null
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp)
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function StatCard({
  label,
  value,
  icon,
  testId,
}: {
  label: string
  value: number
  icon: React.ElementType
  testId?: string
}) {
  const Icon = icon
  return (
    <div
      data-testid={testId}
      className="rounded-[var(--radius-container)] border border-border bg-card px-5 py-4 shadow-xs"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-1.5 font-heading text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  )
}

function OverviewStats({
  data,
  showArea = true,
}: {
  data: SmartHomeOverview
  /** 实时数据没有区域字段时不显示区域数，避免把「未分配区域」当成 1 个区域。 */
  showArea?: boolean
}) {
  return (
    <div
      className={
        showArea ? 'grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-3.5 sm:grid-cols-2'
      }
    >
      {showArea ? (
        <StatCard label="区域" value={data.areas.length} icon={Home} testId="ha-stat-areas" />
      ) : null}
      <StatCard label="实体总数" value={data.totalEntities} icon={Cpu} testId="ha-stat-total" />
      <StatCard
        label="在线状态下"
        value={data.activeEntities}
        icon={Search}
        testId="ha-stat-active"
      />
    </div>
  )
}

function DesktopRequiredView({ canOpenClient }: { canOpenClient: boolean }) {
  return (
    <EmptyState
      icon={<Home className="size-5" />}
      title="此功能需在桌面客户端使用"
      description={
        <>
          智能家居控制需要在桌面客户端内使用，网页版不提供。
          <br />
          网页版仅展示说明，不读取你的 Home Assistant 数据。
        </>
      }
      action={
        canOpenClient ? (
          <Button label="打开客户端" href="fanmeng://open/smart-home" />
        ) : (
          <Button label="下载客户端" as={Link} href="/download" />
        )
      }
    />
  )
}

/** 桌面客户端尚未配置：不伪造数据，直接引导去客户端设置。 */
function DesktopUnconfiguredView({ status }: { status: HaStatus }) {
  return (
    <EmptyState
      icon={<PanelLeft className="size-5" />}
      title="客户端还没有连接 Home Assistant"
      description={
        status.error ??
        '在客户端设置里填写 Home Assistant 地址和长期访问令牌，保存后这里会显示实时设备。'
      }
      action={
        <Button
          label="去设置"
          variant="secondary"
          icon={<Settings className="size-4" />}
          data-testid="ha-open-settings"
          onClick={() => void openDesktopSettings()}
        />
      }
    />
  )
}

/**
 * 连接状态条。连接成功时显示地址 / HA 版本 / 最后更新与刷新；
 * 失败时换成警示色点 + 错误原因 + 重试 / 去设置。
 */
function ConnectionBar({
  status,
  updatedAt,
  error,
  warning,
  refreshing = false,
  onRefresh,
  onRetry,
}: {
  status?: HaStatus
  updatedAt?: number | null
  error?: string
  /** 刷新失败时的就地提示：保留旧数据，不清空视图。 */
  warning?: string | null
  refreshing?: boolean
  onRefresh?: () => void
  onRetry?: () => void
}) {
  if (error !== undefined) {
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius-container)] border border-border bg-card px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-warning" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">连接失败</div>
            <p className="mt-1 text-xs text-pretty text-warning">{error}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            label="重试"
            variant="secondary"
            size="sm"
            data-testid="ha-retry"
            onClick={onRetry}
          />
          <Button
            label="设置"
            variant="ghost"
            size="sm"
            icon={<Settings className="size-4" />}
            data-testid="ha-open-settings"
            onClick={() => void openDesktopSettings()}
          />
        </div>
      </div>
    )
  }

  const baseUrl = status?.baseUrl ?? null
  const version = status?.version ?? null
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-container)] border border-border bg-card px-4 py-3 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={
              warning
                ? 'size-2.5 shrink-0 rounded-full bg-warning'
                : 'size-2.5 shrink-0 rounded-full bg-emerald-500'
            }
          />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-foreground">
              {warning ? '连接异常' : '已连接'}
            </span>
            {baseUrl ? (
              <span className="truncate text-xs text-muted-foreground">{baseUrl}</span>
            ) : null}
            {version ? <Badge variant="neutral" label={`HA ${version}`} /> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {updatedAt ? `最后更新 ${formatClock(updatedAt)}` : '最后更新 —'}
          </span>
          <Button
            label={refreshing ? '刷新中…' : '刷新'}
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="size-4" />}
            isDisabled={refreshing}
            data-testid="ha-refresh"
            onClick={onRefresh}
          />
          <Button
            label="设置"
            variant="ghost"
            size="sm"
            icon={<Settings className="size-4" />}
            data-testid="ha-open-settings"
            onClick={() => void openDesktopSettings()}
          />
        </div>
      </div>
      {warning ? <p className="text-xs text-pretty text-warning">刷新失败：{warning}</p> : null}
    </div>
  )
}

/** 汇总条：3 个指标，发丝线分隔。 */
function SummaryStrip({
  entities,
  sensorCount,
}: {
  entities: EntityRow[]
  /** 温度 / 湿度传感器数量（不是全部 sensor，否则会把电量、信号类实体算进来） */
  sensorCount: number
}) {
  const controllable = useMemo(
    () => entities.filter((e) => isHaControlDomain(e.domain)),
    [entities],
  )
  const onCount = controllable.filter(isOnEntity).length
  const offlineCount = entities.filter((e) => isOfflineState(e.state)).length

  return (
    <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-[var(--radius-container)] border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div data-testid="ha-stat-controllable">
        <StatTile
          size="inline"
          label="可控设备"
          value={controllable.length}
          hint={`开启 ${onCount}`}
        />
      </div>
      <div data-testid="ha-stat-offline">
        <StatTile
          size="inline"
          label="离线"
          value={offlineCount}
          tone={offlineCount > 0 ? 'warning' : undefined}
          hint="不可用或未知"
        />
      </div>
      <div data-testid="ha-stat-sensors">
        <StatTile size="inline" label="环境读数" value={sensorCount} hint="温度 · 湿度" />
      </div>
    </div>
  )
}

const CONTROL_GROUPS: ReadonlyArray<{ domain: HaControlDomain; label: string }> = [
  { domain: 'light', label: '灯' },
  { domain: 'switch', label: '开关' },
  { domain: 'cover', label: '窗帘' },
  { domain: 'climate', label: '空调' },
]

const GROUP_LIMIT = 6

function compareEntities(a: EntityRow, b: EntityRow, pinned: ReadonlySet<string>): number {
  const aPinned = pinned.has(a.entityId)
  const bPinned = pinned.has(b.entityId)
  if (aPinned !== bPinned) return aPinned ? -1 : 1

  const aOffline = isOfflineState(a.state)
  const bOffline = isOfflineState(b.state)
  if (aOffline !== bOffline) return aOffline ? 1 : -1

  return a.name.localeCompare(b.name, 'zh-Hans-CN')
}

/** 单台设备卡：名称 + 状态 + 主操作 + 置顶。 */
function DeviceCard({
  entity,
  attributes,
  pinned,
  onTogglePin,
  controls,
}: {
  entity: EntityRow
  attributes: Record<string, unknown>
  pinned: boolean
  onTogglePin: () => void
  controls: React.ReactNode
}) {
  return (
    <div
      data-testid={`ha-device-${entity.entityId}`}
      className="flex flex-col gap-3 rounded-[var(--radius-container)] border border-border bg-card px-4 py-3 shadow-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{entity.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {deviceStatus(entity, attributes)}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          label={pinned ? `取消置顶 ${entity.name}` : `置顶 ${entity.name}`}
          icon={<Star className={pinned ? 'size-4 fill-current text-warning' : 'size-4'} />}
          data-testid={`ha-pin-${entity.entityId}`}
          onClick={onTogglePin}
        />
      </div>
      {controls}
    </div>
  )
}

/** 一组同类型设备：默认 6 台，置顶的始终显示。 */
function DeviceGroup({
  domain,
  label,
  entities,
  attributesById,
  pinned,
  onTogglePin,
  renderControls,
}: {
  domain: HaControlDomain
  label: string
  entities: EntityRow[]
  attributesById: ReadonlyMap<string, Record<string, unknown>>
  pinned: ReadonlySet<string>
  onTogglePin: (entityId: string) => void
  renderControls: (entity: EntityRow) => React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  const ordered = useMemo(
    () => [...entities].sort((a, b) => compareEntities(a, b, pinned)),
    [entities, pinned],
  )

  const { visible, hidden } = useMemo(() => {
    if (expanded) return { visible: ordered, hidden: 0 }
    const first = ordered.slice(0, GROUP_LIMIT)
    const pinnedBeyond = ordered.slice(GROUP_LIMIT).filter((entity) => pinned.has(entity.entityId))
    const visibleIds = new Set([...first, ...pinnedBeyond].map((entity) => entity.entityId))
    return {
      visible: ordered.filter((entity) => visibleIds.has(entity.entityId)),
      hidden: ordered.length - visibleIds.size,
    }
  }, [ordered, pinned, expanded])

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">
        {label}{' '}
        <span className="font-normal text-muted-foreground tabular-nums">({entities.length})</span>
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((entity) => (
          <DeviceCard
            key={entity.entityId}
            entity={entity}
            attributes={attributesById.get(entity.entityId) ?? {}}
            pinned={pinned.has(entity.entityId)}
            onTogglePin={() => onTogglePin(entity.entityId)}
            controls={renderControls(entity)}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            label={`显示其余 ${hidden} 个`}
            data-testid={`ha-group-more-${domain}`}
            onClick={() => setExpanded(true)}
          />
        </div>
      ) : null}
    </section>
  )
}

/** 环境读数卡：只读，不吃控制按钮。 */
function ReadingCard({ entity, unit }: { entity: EntityRow; unit: string }) {
  return (
    <div
      data-testid={`ha-reading-${entity.entityId}`}
      className="rounded-[var(--radius-container)] border border-border bg-card px-4 py-3 shadow-xs"
    >
      <div className="truncate text-xs text-muted-foreground">{entity.name}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
          {entity.state}
        </span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

/** 「需要处理」清单：只看不可用 / 未知，最多 20 条。 */
function AttentionList({ entities }: { entities: EntityRow[] }) {
  if (entities.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">
        需要处理{' '}
        <span className="font-normal text-muted-foreground tabular-nums">({entities.length})</span>
      </h2>
      <div className="overflow-hidden rounded-[var(--radius-container)] border bg-card">
        {entities.slice(0, 20).map((entity, index) => (
          <div
            key={entity.entityId}
            data-testid={`ha-attention-${entity.entityId}`}
            className={
              index === 0
                ? 'flex items-center justify-between gap-3 px-4 py-2.5'
                : 'flex items-center justify-between gap-3 border-t border-border px-4 py-2.5'
            }
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{entity.name}</div>
              <div className="truncate text-xs text-muted-foreground">{entity.entityId}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs">
              <Badge variant="neutral" label={entity.domain} />
              <span className="text-warning">{stateLabel(entity)}</span>
            </div>
          </div>
        ))}
      </div>
      {entities.length > 20 ? (
        <p className="text-xs text-muted-foreground">还有 {entities.length - 20} 个未列出。</p>
      ) : null}
    </section>
  )
}

const ROWS_PER_PAGE = 30

/** 全部设备：默认折叠；展开后搜索 + 类型筛选 + 分页（30 行/次）。 */
function AllDevicesPanel({ entities }: { entities: EntityRow[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('all')
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE)

  const domains = useMemo(() => domainOptions(entities), [entities])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entities.filter((entity) => {
      if (domain !== 'all' && entity.domain !== domain) return false
      if (!q) return true
      return entity.name.toLowerCase().includes(q) || entity.entityId.toLowerCase().includes(q)
    })
  }, [entities, query, domain])

  const visible = rows.slice(0, visibleCount)
  const remaining = rows.length - visible.length

  return (
    <section className="flex flex-col gap-3">
      <div>
        <Button
          variant="ghost"
          size="sm"
          label={`全部设备（${entities.length}）`}
          icon={open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          data-testid="ha-all-devices-toggle"
          onClick={() => setOpen((value) => !value)}
        />
      </div>

      {open ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextInput
              label="搜索全部设备"
              isLabelHidden
              value={query}
              onChange={(value) => {
                setQuery(value)
                setVisibleCount(ROWS_PER_PAGE)
              }}
              placeholder="搜索设备名称 / ID"
              hasClear
              width="100%"
              controlClassName="w-full sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant={domain === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                label="全部类型"
                onClick={() => {
                  setDomain('all')
                  setVisibleCount(ROWS_PER_PAGE)
                }}
              />
              {domains.map((item) => (
                <Button
                  key={item}
                  variant={domain === item ? 'secondary' : 'ghost'}
                  size="sm"
                  label={item}
                  onClick={() => {
                    setDomain(item)
                    setVisibleCount(ROWS_PER_PAGE)
                  }}
                />
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              compact
              title={entities.length === 0 ? '暂无可显示的设备' : '没有匹配的设备'}
              description={
                entities.length === 0
                  ? '现场 Home Assistant 还没读到任何实体。'
                  : '换个关键词试试。'
              }
            />
          ) : (
            <Table hasHover>
              <TableHeader>
                <TableRow isHeaderRow>
                  <TableHeaderCell className="pl-4 sm:pl-6">名称 / ID</TableHeaderCell>
                  <TableHeaderCell className="hidden sm:table-cell">类型</TableHeaderCell>
                  <TableHeaderCell className="pr-6 text-right">状态</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((entity) => (
                  <TableRow key={entity.entityId} data-testid={`ha-row-${entity.entityId}`}>
                    <TableCell className="max-w-0 py-3 pl-4 sm:pl-6">
                      <div className="truncate text-sm font-medium text-foreground">
                        {entity.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {entity.entityId}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="neutral" className="rounded-md" label={entity.domain} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <span
                        className={
                          isOfflineState(entity.state)
                            ? 'text-sm text-muted-foreground'
                            : 'text-sm text-foreground'
                        }
                      >
                        {stateLabel(entity)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {remaining > 0 ? (
            <div>
              <Button
                variant="ghost"
                size="sm"
                label={`显示更多（剩余 ${remaining}）`}
                data-testid="ha-rows-more"
                onClick={() => setVisibleCount((value) => value + ROWS_PER_PAGE)}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

/** 置顶集合存在 localStorage，key 含 baseUrl，换服务器不会串数据。 */
function usePinnedEntities(baseUrl: string | null) {
  const storageKey = `fmkj:ha:pins:${baseUrl ?? 'unconfigured'}`
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setPinned(new Set())
        return
      }
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setPinned(new Set(parsed.filter((value): value is string => typeof value === 'string')))
      }
    } catch {
      setPinned(new Set())
    }
  }, [storageKey])

  function toggle(entityId: string) {
    setPinned((previous) => {
      const next = new Set(previous)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        // 隐私模式 / 配额满：置顶只在本次会话生效，不影响控制。
      }
      return next
    })
  }

  return [pinned, toggle] as const
}

/**
 * 桌面实时视图：连接条 → 汇总 → 快捷控制 → 环境读数 → 需要处理 → 全部设备。
 * 白名单实体的控制按钮都在这里生成，非白名单一律不渲染按钮。
 */
function LiveView({
  ha,
  status,
  states,
  updatedAt,
  refreshing,
  refreshWarning,
  onStates,
  onRefresh,
  readStates,
}: {
  ha: DesktopHaBridge
  status: HaStatus
  states: HaEntityState[]
  updatedAt: number | null
  refreshing: boolean
  refreshWarning: string | null
  onStates: (states: HaEntityState[]) => void
  onRefresh: () => void
  /** 带请求代次的读状态：只有最新一次读取的结果会返回 `ok`。 */
  readStates: () => Promise<StatesReadResult>
}) {
  const [pending, setPending] = useState<Record<string, HaControlService>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pinned, togglePin] = usePinnedEntities(status.baseUrl)

  const entities = useMemo(() => liveOverview(states).entities, [states])
  const attributesById = useMemo(
    () => new Map(states.map((state) => [state.entityId, state.attributes])),
    [states],
  )

  const controlEntities = useMemo(
    () => entities.filter((entity) => isHaControlDomain(entity.domain)),
    [entities],
  )

  const grouped = useMemo(() => {
    const groups = new Map<HaControlDomain, EntityRow[]>()
    for (const group of CONTROL_GROUPS) groups.set(group.domain, [])
    for (const entity of controlEntities) {
      if (isHaControlDomain(entity.domain)) groups.get(entity.domain)?.push(entity)
    }
    return groups
  }, [controlEntities])

  const readings = useMemo(() => {
    return entities
      .filter((entity) => entity.domain === 'sensor')
      .map((entity) => {
        const unit = readingUnit(entity.entityId, attributesById.get(entity.entityId) ?? {})
        return unit ? { entity, unit } : null
      })
      .filter((reading): reading is { entity: EntityRow; unit: string } => reading !== null)
  }, [entities, attributesById])

  const offlineEntities = useMemo(
    () => entities.filter((entity) => isOfflineState(entity.state)),
    [entities],
  )

  async function runAction(
    entity: EntityRow,
    service: HaControlService,
    data?: Record<string, unknown>,
  ) {
    if (pending[entity.entityId]) return

    setPending((prev) => ({ ...prev, [entity.entityId]: service }))
    setErrors((prev) => {
      if (!(entity.entityId in prev)) return prev
      const next = { ...prev }
      delete next[entity.entityId]
      return next
    })

    const result = await callHaService(
      { domain: entity.domain, service, entityId: entity.entityId, ...(data ? { data } : {}) },
      ha,
    )

    if (!result.ok) {
      setErrors((prev) => ({ ...prev, [entity.entityId]: result.error ?? '操作失败' }))
      setPending((prev) => {
        const next = { ...prev }
        delete next[entity.entityId]
        return next
      })
      return
    }

    // 成功不做乐观更新：重新读一遍主进程聚合后的真实状态。
    // 和刷新共用代次保护：后发起的读取才能落 UI，旧快照直接丢弃。
    const statesResult = await readStates()
    if (statesResult.kind === 'ok') {
      onStates(statesResult.states)
    } else if (statesResult.kind === 'error') {
      setErrors((prev) => ({
        ...prev,
        [entity.entityId]: '操作已提交，但刷新状态失败，请重试。',
      }))
    }
    setPending((prev) => {
      const next = { ...prev }
      delete next[entity.entityId]
      return next
    })
  }

  function renderControls(entity: EntityRow): React.ReactNode {
    if (!isHaControlDomain(entity.domain)) return null

    const busy = Boolean(pending[entity.entityId])
    const error = errors[entity.entityId]
    const attributes = attributesById.get(entity.entityId) ?? {}
    const testId = (suffix: string) => `ha-control-${entity.entityId}-${suffix}`

    let controls: React.ReactNode = null

    if (entity.domain === 'light' || entity.domain === 'switch') {
      const isOn = entity.state === 'on'
      controls = (
        <Button
          size="sm"
          variant="ghost"
          label={isOn ? '关闭' : '开启'}
          isDisabled={busy}
          data-testid={testId('toggle')}
          onClick={() => void runAction(entity, isOn ? 'turn_off' : 'turn_on')}
        />
      )
    } else if (entity.domain === 'cover') {
      const position = numberAttr(attributes, 'current_position')
      const baseline = position ?? 0
      const clamped = (next: number) => Math.max(0, Math.min(100, next))
      controls = (
        <>
          <Button
            size="sm"
            variant="ghost"
            label="打开"
            isDisabled={busy}
            data-testid={testId('open')}
            onClick={() => void runAction(entity, 'turn_on')}
          />
          <Button
            size="sm"
            variant="ghost"
            label="关闭"
            isDisabled={busy}
            data-testid={testId('close')}
            onClick={() => void runAction(entity, 'turn_off')}
          />
          <span className="px-1 text-xs text-muted-foreground tabular-nums">
            位置 {position === null ? '—' : `${position}%`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            label="位置 +10%"
            isDisabled={busy || position === null}
            data-testid={testId('position-up')}
            onClick={() =>
              void runAction(entity, 'set_cover_position', {
                position: clamped(baseline + 10),
              })
            }
          />
          <Button
            size="sm"
            variant="ghost"
            label="位置 −10%"
            isDisabled={busy || position === null}
            data-testid={testId('position-down')}
            onClick={() =>
              void runAction(entity, 'set_cover_position', {
                position: clamped(baseline - 10),
              })
            }
          />
        </>
      )
    } else if (entity.domain === 'climate') {
      const current = numberAttr(attributes, 'temperature')
      const rawStep = numberAttr(attributes, 'target_temp_step')
      const step = rawStep !== null && rawStep > 0 ? rawStep : 0.5
      const modes = stringListAttr(attributes, 'hvac_modes')
      controls = (
        <>
          <Button
            size="sm"
            variant="ghost"
            label="温度 −"
            isDisabled={busy || current === null}
            data-testid={testId('temp-down')}
            onClick={() =>
              current !== null &&
              void runAction(entity, 'set_temperature', {
                temperature: roundTemperature(current - step),
              })
            }
          />
          <span className="px-1 text-xs text-muted-foreground tabular-nums">
            {current === null ? '—' : `${current}°C`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            label="温度 +"
            isDisabled={busy || current === null}
            data-testid={testId('temp-up')}
            onClick={() =>
              current !== null &&
              void runAction(entity, 'set_temperature', {
                temperature: roundTemperature(current + step),
              })
            }
          />
          {modes.map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={entity.state === mode ? 'secondary' : 'ghost'}
              label={hvacModeLabel(mode)}
              isDisabled={busy}
              data-testid={testId(`mode-${mode}`)}
              onClick={() => void runAction(entity, 'set_hvac_mode', { hvac_mode: mode })}
            />
          ))}
        </>
      )
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1">{controls}</div>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ConnectionBar
        status={status}
        updatedAt={updatedAt}
        refreshing={refreshing}
        warning={refreshWarning}
        onRefresh={onRefresh}
      />
      <SummaryStrip entities={entities} sensorCount={readings.length} />

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">快捷控制</h2>
        {controlEntities.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有读到灯光、开关、窗帘或空调设备。</p>
        ) : (
          CONTROL_GROUPS.map((group) => {
            const groupEntities = grouped.get(group.domain) ?? []
            if (groupEntities.length === 0) return null
            return (
              <DeviceGroup
                key={group.domain}
                domain={group.domain}
                label={group.label}
                entities={groupEntities}
                attributesById={attributesById}
                pinned={pinned}
                onTogglePin={togglePin}
                renderControls={renderControls}
              />
            )
          })
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">环境读数</h2>
        {readings.length === 0 ? (
          <p className="text-sm text-muted-foreground">没有读到温度或湿度传感器。</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {readings.slice(0, 8).map((reading) => (
                <ReadingCard
                  key={reading.entity.entityId}
                  entity={reading.entity}
                  unit={reading.unit}
                />
              ))}
            </div>
            {readings.length > 8 ? (
              <p className="text-xs text-muted-foreground">
                还有 {readings.length - 8} 个读数未显示。
              </p>
            ) : null}
          </>
        )}
      </section>

      <AttentionList entities={offlineEntities} />
      <AllDevicesPanel entities={entities} />
    </div>
  )
}

/** 一次 `getStates` 的结果：`stale` 表示已有更晚发起的读取，旧快照不能落 UI。 */
type StatesReadResult =
  | { kind: 'ok'; states: HaEntityState[] }
  | { kind: 'stale' }
  | { kind: 'error' }

type BridgeView =
  | { kind: 'desktop-required'; canOpenClient: boolean }
  | { kind: 'loading' }
  | { kind: 'unconfigured'; status: HaStatus }
  | { kind: 'live'; ha: DesktopHaBridge; status: HaStatus; states: HaEntityState[] }
  | { kind: 'error'; message: string }

function LoadingView() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <EmptyState
      compact
      title="正在连接 Home Assistant…"
      description={
        <span className="flex flex-col gap-1">
          <span>
            正在从桌面客户端获取实时状态。
            {elapsed >= 3 ? `已等待 ${elapsed} 秒` : ''}
          </span>
          <span className="text-xs">令牌填写有误时，Home Assistant 需要约 10 秒才会返回结果。</span>
        </span>
      }
    />
  )
}

/** 错误态：连接条本身显示原因与重试 / 去设置；下方不再重复按钮。 */
function DesktopErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <ConnectionBar error={message} onRetry={onRetry} />
      <EmptyState
        icon={<PanelLeft className="size-5" />}
        title="无法读取 Home Assistant 数据"
        description="检查客户端设置中的地址和令牌后重试。"
      />
    </div>
  )
}

/** 首屏先展示入口说明，挂载后由桌面桥接管实时视图。 */
export function SmartHomeClient() {
  const [view, setView] = useState<BridgeView>({ kind: 'desktop-required', canOpenClient: false })
  const [attempt, setAttempt] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  // 刷新与单设备操作都会读 states；只允许最后发起的那次读取落 UI。
  const statesReadSeq = useRef(0)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const ha = await detectDesktopHa()
      if (cancelled) return

      if (!ha) {
        // 普通网页无法可靠探测系统协议，只在检测到客户端桥标记时提供深链。
        const desktop = (window as Window & { fanmengDesktop?: { isDesktop?: boolean } })
          .fanmengDesktop
        setView({ kind: 'desktop-required', canOpenClient: desktop?.isDesktop === true })
        return
      }

      setView({ kind: 'loading' })

      const status = await readHaStatus(ha)
      if (cancelled) return
      if (!status) {
        setView({ kind: 'error', message: '无法读取桌面客户端的 Home Assistant 状态。' })
        return
      }

      if (!status.configured) {
        setView({ kind: 'unconfigured', status })
        return
      }

      // 已配置但未连接：直接进入错误态，不再发 getStates 白等超时。
      // HA 在令牌错误时约 10 秒才回 401，多一次调用就是多等一轮。
      if (!status.connected) {
        setView({
          kind: 'error',
          message: status.error ?? '无法连接 Home Assistant，请检查地址或令牌。',
        })
        return
      }

      const states = await readHaStates(ha)
      if (cancelled) return
      if (!states) {
        setView({
          kind: 'error',
          message: status.error ?? '无法读取 Home Assistant 实体状态，请检查连接或令牌。',
        })
        return
      }

      setUpdatedAt(Date.now())
      setRefreshWarning(null)
      setView({ kind: 'live', ha, status, states })
    })()

    return () => {
      cancelled = true
    }
  }, [attempt])

  /**
   * 读一次 states 并打上代次。并发读取时，只有最后发起的那次能返回 `ok`；
   * 先发后到的旧快照返回 `stale`，调用方必须丢弃。
   */
  async function readLatestStates(ha: DesktopHaBridge): Promise<StatesReadResult> {
    statesReadSeq.current += 1
    const sequence = statesReadSeq.current
    const states = await readHaStates(ha)
    if (sequence !== statesReadSeq.current) return { kind: 'stale' }
    if (!states) return { kind: 'error' }
    return { kind: 'ok', states }
  }

  /**
   * 原地刷新：保持 `kind:'live'`，只替换 states。这样搜索词、类型筛选、
   * 分页、分组展开和滚动位置都不会被卸载重置；失败也保留上一份数据，
   * 只在连接条里就地提示。
   */
  async function refreshLive() {
    if (view.kind !== 'live' || refreshing) return
    const ha = view.ha

    setRefreshing(true)
    setRefreshWarning(null)

    const status = await readHaStatus(ha)
    if (!status || !status.configured || !status.connected) {
      setRefreshWarning(status?.error ?? '无法连接 Home Assistant，请检查地址或令牌。')
      setRefreshing(false)
      return
    }

    const result = await readLatestStates(ha)
    if (result.kind === 'stale') {
      setRefreshing(false)
      return
    }
    if (result.kind === 'error') {
      setRefreshWarning(status.error ?? '无法读取 Home Assistant 实体状态，请检查连接或令牌。')
      setRefreshing(false)
      return
    }

    setUpdatedAt(Date.now())
    setRefreshWarning(null)
    setView((current) =>
      current.kind === 'live' ? { ...current, status, states: result.states } : current,
    )
    setRefreshing(false)
  }

  if (view.kind === 'loading') return <LoadingView />
  if (view.kind === 'unconfigured') return <DesktopUnconfiguredView status={view.status} />
  if (view.kind === 'error') {
    return <DesktopErrorView message={view.message} onRetry={() => setAttempt((n) => n + 1)} />
  }
  if (view.kind === 'live') {
    return (
      <LiveView
        ha={view.ha}
        status={view.status}
        states={view.states}
        updatedAt={updatedAt}
        refreshing={refreshing}
        refreshWarning={refreshWarning}
        onStates={(states) => {
          setUpdatedAt(Date.now())
          // 有更新的真实状态进来，旧的「刷新失败」提示就不成立了。
          setRefreshWarning(null)
          setView((current) => (current.kind === 'live' ? { ...current, states } : current))
        }}
        onRefresh={() => void refreshLive()}
        readStates={() => readLatestStates(view.ha)}
      />
    )
  }

  return <DesktopRequiredView canOpenClient={view.canOpenClient} />
}
