'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  Eye,
  EyeOff,
  FileSignature,
  ImageIcon,
  Layers,
  ListFilter,
  Lock,
  MapPinned,
  Percent,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { DeviceSymbol } from '@/components/device-symbol'
import { GuardedLink } from '@/components/guarded-link'
import { PlanFigure } from '@/components/plan-figure'
import { PointMarker } from '@/components/point-marker'
import { ProductThumb } from '@/components/product-thumb'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Card as AstryxCard } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Field } from '@astryxdesign/core/Field'
import { Link } from '@astryxdesign/core/Link'
import { Popover } from '@astryxdesign/core/Popover'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { WORKBENCH_SECTION_HEADING_CLASS } from '@/components/page-header'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { contractStatusLabel } from '@/lib/contracts'
import { DEVICE_TYPE_ORDER, deviceTypeLabel } from '@/lib/device-types'
import { registerLeaveGuard } from '@/lib/leave-guard'
import { inferScopeFromTitle, POINT_SCOPES, type PointScope } from '@/lib/point-scopes'
import type { StoredScene } from '@/lib/point-scene'
import { buildQuoteFloorGroups } from '@/lib/quote-areas'
import {
  DEFAULT_COST_SETTINGS,
  marginSummary,
  rateLabel,
  unitCostOf,
  type CostProduct,
  type CostSettings,
  type MarginSummary,
  type UnitCost,
} from '@/lib/quote-costs'
import { QUOTE_STATUSES, quoteTotals, yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'

import { createContract } from '../../contract/actions'
import { saveQuote, setQuoteProjectDefault, syncQuoteFromPointMap } from '../actions'
import { SwapProductDialog, type SwapScope } from './swap-product-dialog'

export type ProductOption = {
  id: string
  name: string
  /** 报价列表用的可选短名；空字符串表示列表直接显示 name */
  shortName: string
  sku: string
  unit: string
  price: number
  status: string
  deviceType: string | null
  brand: { slug: string; name: string; logo: string | null } | null
  platforms: string[]
  image: string | null
}
type Line = {
  key: string
  rev?: number
  /** 数据库中的明细行 ID，保存时回传以便服务端识别换型号 */
  id: string | null
  product: string | null
  deviceType: string | null
  image: string | null
  name: string
  shortName: string
  sku: string
  unit: string
  price: number
  quantity: number
}
type Fee = { key: string; name: string; amount: number }
type QuoteState = {
  id: string
  title: string
  status: string
  discount: number
  notes: string
  items: Line[]
  fees: Fee[]
}

/** 报价列表里显示的名字：有短名用短名，没有就用完整产品名（不做截断推导）。 */
export const quoteItemLabel = (item: { name: string; shortName?: string | null }) =>
  item.shortName?.trim() || item.name

/**
 * 报价明细行标题：短名保持单行，完整名称放在 title / aria-label 里，
 * 悬停和读屏都能拿到正式名称；打印 / 合同 / 导出仍直接用 item.name。
 */
export function QuoteItemName({
  item,
  className,
}: {
  item: { name: string; shortName?: string | null }
  className?: string
}) {
  const label = quoteItemLabel(item)
  const usesShortName = label !== item.name
  return (
    <span className={cn('block min-w-0 truncate', className)} title={item.name}>
      {/* 可见文字保持短名单行；短名不是正式名称，对读屏器隐藏，另用 sr-only 提供完整名称。 */}
      <span aria-hidden={usesShortName || undefined}>{label}</span>
      {usesShortName ? <span className="sr-only">{item.name}</span> : null}
    </span>
  )
}

/** 从产品库新增一行时的快照：短名也一起快照，之后产品库改短名不影响已出的报价。 */
export function newQuoteLine(p: ProductOption): Line {
  return {
    key: crypto.randomUUID(),
    id: null,
    product: p.id,
    deviceType: p.deviceType,
    image: p.image,
    name: p.name,
    shortName: p.shortName,
    sku: p.sku,
    unit: p.unit,
    price: p.price,
    quantity: 1,
  }
}

/** 换型号：名称、短名、型号、单价全部换成新产品的快照，数量保持不变。 */
export function swapQuoteLine(l: Line, p: ProductOption): Line {
  return {
    ...l,
    product: p.id,
    deviceType: p.deviceType,
    image: p.image,
    name: p.name,
    shortName: p.shortName,
    sku: p.sku,
    unit: p.unit,
    price: p.price,
    rev: (l.rev ?? 0) + 1,
  }
}

const toNum = (v: string) => (v.trim() === '' ? 0 : Number(v))
/** 表格单元格里的数字输入：平时像文字，悬停 / 聚焦时才显示输入框（行内编辑） */
const INLINE_NUM =
  'border-transparent bg-transparent shadow-none hover:border-input hover:bg-background focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/20'

/**
 * 报价里的单价 / 数量 / 费用 / 优惠都靠「边输边算」实时联动合计，
 * 官方 `NumberInput` 只在失焦 / 回车时提交会切断这份联动 —— 这里就地保留
 * 原生 number 输入（类名与旧适配层的原生回退分支一致），提交语义不变。
 */
const NATIVE_NUM_CLASS =
  'h-8 w-full min-w-0 rounded-[var(--radius-element)] border border-input bg-background px-2.5 py-1 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow,border-color] duration-150 placeholder:text-muted-foreground/75 hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-70 md:text-sm dark:bg-input/20'

/** 受控数字输入框：输入时保持原始文本（方便输入小数点），失焦或外部变更时同步数值 */
function EditableNumber({
  value,
  onChange,
  label,
  disabled,
  className = 'w-24',
}: {
  value: number
  onChange: (n: number) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  const [text, setText] = useState(() => String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])
  return (
    <input
      type="number"
      min={0}
      step="any"
      inputMode="decimal"
      aria-label={label}
      value={focused ? text : String(value)}
      disabled={disabled}
      className={cn(NATIVE_NUM_CLASS, 'h-7 px-2 text-right tabular-nums', className)}
      onFocus={() => {
        setFocused(true)
        setText(String(value))
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value)
        const n = toNum(e.target.value)
        if (Number.isFinite(n) && n >= 0) onChange(n)
      }}
    />
  )
}

export function QuoteEditor({
  quote: initial,
  project,
  projectQuotes = [],
  projectScene,
  projectDefaults,
  products,
  costs,
  costSettings = DEFAULT_COST_SETTINGS,
  readOnly,
  lockReason = null,
  contract = null,
  pendingPoints = 0,
}: {
  quote: QuoteState
  project: { id: string; name: string; customerName: string }
  projectQuotes?: { id: string; title: string; total: number }[]
  projectScene?: Partial<StoredScene> | null
  projectDefaults?: unknown
  products: ProductOption[]
  /** 产品成本（内部参考，不会打印）；为 null 时不显示成本与毛利。 */
  costs: Record<string, number> | null
  /** 查看者自己的拿货折扣与毛利率底线（设置 → 报价成本与毛利） */
  costSettings?: CostSettings
  readOnly: boolean
  /** 只读原因：项目已归档，或报价已用于已签订的合同 */
  lockReason?: string | null
  /** 项目的合同（每个项目一份）以及是否依据这份报价 */
  contract?: { number: string; status: string; usesThisQuote: boolean } | null
  /** 从点位图生成时未能确定型号的点位数 */
  pendingPoints?: number
}) {
  const router = useRouter()
  const showToast = useToast()
  const [quote, setQuote] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [swapKey, setSwapKey] = useState<string | null>(null)
  const [lineQuery, setLineQuery] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [saving, startSaving] = useTransition()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setQuote(initial)
    setDirty(false)
    setSelectedKeys(new Set())
  }, [initial])

  const floorGroups = useMemo(
    () => buildQuoteFloorGroups(projectScene, projectDefaults, products, quote.items),
    [projectScene, projectDefaults, products, quote.items],
  )
  const [viewMode, setViewMode] = useState<'floors' | 'summary'>('summary')
  const [planMode, setPlanMode] = useState<'symbol' | 'product' | 'hide'>('symbol')
  const roomCount = useMemo(
    () => floorGroups.reduce((sum, floor) => sum + floor.rooms.length, 0),
    [floorGroups],
  )
  const currentScope = useMemo(() => inferScopeFromTitle(quote.title), [quote.title])

  const update = (patch: Partial<QuoteState>) => {
    setQuote((q) => ({ ...q, ...patch }))
    setDirty(true)
  }
  const updateLine = (key: string, patch: Partial<Line>) =>
    update({ items: quote.items.map((l) => (l.key === key ? { ...l, ...patch } : l)) })
  const updateFee = (key: string, patch: Partial<Fee>) =>
    update({ fees: quote.fees.map((f) => (f.key === key ? { ...f, ...patch } : f)) })

  const addProduct = (p: ProductOption) => {
    const existing = quote.items.find((l) => l.product === p.id)
    if (existing)
      updateLine(existing.key, { quantity: existing.quantity + 1, rev: (existing.rev ?? 0) + 1 })
    else update({ items: [...quote.items, newQuoteLine(p)] })
    setPickerOpen(false)
  }

  const activeProducts = useMemo(() => products.filter((p) => p.status === 'active'), [products])
  const catalogPriceById = useMemo(() => new Map(products.map((p) => [p.id, p.price])), [products])
  // 产品库未定价（0 元）时没有可参照的原价，不提示「已改价」
  const catalogPriceOf = (productId: string | null) => {
    const price = productId ? catalogPriceById.get(productId) : undefined
    return price && price > 0 ? price : undefined
  }
  const pickerGroups = useMemo(
    () =>
      DEVICE_TYPE_ORDER.map((t) => ({
        type: t,
        items: activeProducts.filter((p) => p.deviceType === t),
      }))
        .concat([{ type: '', items: activeProducts.filter((p) => !p.deviceType) }])
        .filter((g) => g.items.length),
    [activeProducts],
  )

  // 旧 cmdk 命令面板换成官方 DropdownMenu 的数据模式：搜索框进 header，产品按设备类型分组。
  // 这里在渲染期就地推导（不用 useMemo，避免把每次渲染重建的 addProduct 塞进依赖数组）。
  const productPickerItems = (() => {
    const q = productQuery.trim().toLowerCase()
    const matches = (p: ProductOption) =>
      !q ||
      `${p.name} ${p.shortName} ${p.sku} ${p.brand?.name ?? ''} ${deviceTypeLabel(p.deviceType)}`
        .toLowerCase()
        .includes(q)
    const sections = pickerGroups
      .map((g) => ({
        type: 'section' as const,
        id: g.type || 'none',
        title: g.type ? deviceTypeLabel(g.type) : '未分类',
        items: g.items.filter(matches).map((p) => ({
          id: p.id,
          label: p.name,
          description: `${p.brand?.name ?? ''} · ${p.sku}`,
          icon: (
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
              {p.image ? (
                <Image
                  src={p.image}
                  alt=""
                  width={32}
                  height={32}
                  className="size-full bg-white object-contain"
                />
              ) : (
                <span className="size-5">
                  <DeviceSymbol type={p.deviceType} />
                </span>
              )}
            </span>
          ),
          endContent: <span className="text-xs tabular-nums">{yuan(p.price)}</span>,
          onClick: () => addProduct(p),
        })),
      }))
      .filter((s) => s.items.length)
    return sections.length ? sections : [{ label: '没有匹配的产品', isDisabled: true }]
  })()

  const swapLine = swapKey ? (quote.items.find((l) => l.key === swapKey) ?? null) : null
  const applySwap = (p: ProductOption, scope: SwapScope, setDefault: boolean) => {
    if (!swapLine) return
    const targets =
      scope === 'type'
        ? quote.items.filter((l) => l.deviceType && l.deviceType === swapLine.deviceType)
        : [swapLine]
    const keys = new Set(targets.map((l) => l.key))
    // 数量保持不变；单价改为新产品售价
    update({
      items: quote.items.map((l) => (keys.has(l.key) ? swapQuoteLine(l, p) : l)),
    })
    showToast({ body: `已更换 ${targets.length} 行为「${p.name}」，记得保存` })
    if (setDefault && project && p.deviceType) {
      void setQuoteProjectDefault(project.id, p.deviceType, p.id).then((r) =>
        r.ok
          ? showToast({ body: '已同时设为项目默认型号' })
          : showToast({ body: r.error, type: 'error' }),
      )
    }
  }

  const totals = useMemo(() => quoteTotals(quote.items, quote.fees, quote.discount), [quote])
  const totalQuantity = useMemo(
    () => quote.items.reduce((sum, l) => sum + (l.quantity || 0), 0),
    [quote.items],
  )
  const filteredItems = useMemo(() => {
    const q = lineQuery.trim().toLowerCase()
    if (!q) return quote.items
    return quote.items.filter((l) =>
      `${l.name} ${l.shortName} ${l.sku} ${l.deviceType ? deviceTypeLabel(l.deviceType) : ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [quote.items, lineQuery])
  const activeSelectedKeys = useMemo(
    () => new Set([...selectedKeys].filter((k) => quote.items.some((l) => l.key === k))),
    [selectedKeys, quote.items],
  )
  const selectedSubtotal = useMemo(
    () =>
      quote.items
        .filter((l) => activeSelectedKeys.has(l.key))
        .reduce((s, l) => s + l.price * l.quantity, 0),
    [quote.items, activeSelectedKeys],
  )
  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((l) => activeSelectedKeys.has(l.key))

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const l of filteredItems) {
        if (checked) next.add(l.key)
        else next.delete(l.key)
      }
      return next
    })
  }

  const toggleSelectLine = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const applyBatchDiscount = (rate: number) => {
    if (!activeSelectedKeys.size) return
    update({
      items: quote.items.map((l) => {
        if (!activeSelectedKeys.has(l.key)) return l
        const base = catalogPriceOf(l.product) ?? l.price
        return { ...l, price: Math.round(base * rate * 100) / 100 }
      }),
    })
    showToast({
      body: `已对所选 ${activeSelectedKeys.size} 项设备应用 ${Math.round(rate * 100) / 10} 折`,
    })
  }

  const restoreBatchOriginPrice = () => {
    if (!activeSelectedKeys.size) return
    update({
      items: quote.items.map((l) => {
        if (!activeSelectedKeys.has(l.key)) return l
        const origin = catalogPriceOf(l.product)
        return origin !== undefined ? { ...l, price: origin } : l
      }),
    })
    showToast({ body: `已恢复所选 ${activeSelectedKeys.size} 项设备的目录原价` })
  }

  const deleteBatchSelected = () => {
    if (!activeSelectedKeys.size) return
    const count = activeSelectedKeys.size
    update({ items: quote.items.filter((l) => !activeSelectedKeys.has(l.key)) })
    setSelectedKeys(new Set())
    showToast({ body: `已删除所选 ${count} 项设备` })
  }

  const roundDownTotal = (unit: 100 | 1000) => {
    const gross = totals.productTotal + totals.feeTotal
    if (gross <= unit) return
    const target = Math.floor(gross / unit) * unit
    const nextDiscount = Math.max(0, Math.round((gross - target) * 100) / 100)
    update({ discount: nextDiscount })
    showToast({ body: `已自动抹零至 ${yuan(target)}（优惠 ${yuan(nextDiscount)}）` })
  }

  // 内部成本：品牌拿货折扣 → 产品库成本价 → 默认折扣（见 src/lib/quote-costs.ts）；只在报价台显示，不打印
  const costProducts = useMemo(
    () =>
      new Map<string, CostProduct>(
        products.map((p) => [
          p.id,
          {
            id: p.id,
            price: p.price,
            cost: costs?.[p.id] ?? null,
            brandSlug: p.brand?.slug ?? null,
          },
        ]),
      ),
    [products, costs],
  )
  const unitCost = (l: Line): UnitCost | null =>
    costs && l.product ? unitCostOf(costProducts.get(l.product), costSettings) : null
  const margin = useMemo(
    () =>
      costs
        ? marginSummary(quote.items, costProducts, totals.feeTotal, totals.total, costSettings)
        : null,
    [costs, quote.items, costProducts, totals.feeTotal, totals.total, costSettings],
  )
  // 防窥：当着业主的面打开报价台时，一键隐藏全部内部成本信息（按浏览器记住）
  const [hideInternal, setHideInternal] = useState(false)
  useEffect(() => {
    try {
      setHideInternal(localStorage.getItem('fmkj:quote:hide-internal') === '1')
    } catch {
      /* 存储不可用时默认显示 */
    }
  }, [])
  const toggleInternal = () =>
    setHideInternal((v) => {
      try {
        localStorage.setItem('fmkj:quote:hide-internal', v ? '0' : '1')
      } catch {
        /* 忽略 */
      }
      return !v
    })
  const showCosts = Boolean(costs) && !hideInternal

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const persist = async () => {
    const result = await saveQuote(quote.id, {
      title: quote.title,
      status: quote.status,
      discount: quote.discount,
      notes: quote.notes,
      items: quote.items.map((l) => ({
        id: l.id,
        product: l.product,
        name: l.name,
        shortName: l.shortName || null,
        sku: l.sku,
        unit: l.unit,
        price: l.price,
        quantity: l.quantity,
      })),
      fees: quote.fees.map(({ key: _k, ...f }) => f),
    }).catch(() => ({ ok: false as const, error: '暂时无法保存报价，请检查网络后重试。' }))
    if (!result.ok) {
      showToast({ body: result.error, type: 'error' })
      return false
    }
    setDirty(false)
    showToast({ body: '报价已保存' })
    router.refresh()
    return true
  }
  const save = (then?: () => void) =>
    startSaving(async () => {
      if (await persist()) then?.()
    })

  // 切换项目板块或侧边栏导航时，先自动保存未保存的修改
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => {
    if (!dirty || readOnly) return
    return registerLeaveGuard(
      async () =>
        (await persistRef.current()) ||
        window.confirm('报价保存失败，仍要离开吗？未保存的修改会丢失。'),
    )
  }, [dirty, readOnly])

  const [creatingContract, setCreatingContract] = useState(false)
  const generateContract = async () => {
    if (creatingContract) return
    if (dirty && !readOnly && !(await persist())) return
    setCreatingContract(true)
    try {
      const result = await createContract(project.id, quote.id)
      if (!result.ok) return void showToast({ body: result.error, type: 'error' })
      showToast({ body: '已生成合同，请核对内容' })
      router.push(`/projects/${project.id}/contract`)
    } finally {
      setCreatingContract(false)
    }
  }

  /** 无缝跳回点位图（如有未保存的临时改价或换型号，先自动保存再跳转；支持直接定位到指定楼层、房间或点位代号） */
  const switchToPointMap = (opts?: { sheet?: string; area?: string; point?: string }) => {
    const params = new URLSearchParams({ quoteId: quote.id, scope: currentScope })
    if (opts?.sheet) params.set('sheet', opts.sheet)
    if (opts?.area) params.set('area', opts.area)
    if (opts?.point) params.set('point', opts.point)
    const url = `/projects/${project.id}/point-map?${params.toString()}`
    const go = () => router.push(url)
    if (dirty && !readOnly) save(go)
    else go()
  }

  /** 从点位图同步最新点位数量到当前报价（保留临时改价、换过的型号与附加费用） */
  const syncFromPointMap = async (targetScope: PointScope = currentScope) => {
    if (syncing || saving) return
    const runSync = async () => {
      setSyncing(true)
      try {
        const res = await syncQuoteFromPointMap(quote.id, targetScope)
        if (!res.ok) {
          showToast({ body: res.error, type: 'error' })
          return
        }
        showToast({
          body: `已从点位图同步（${POINT_SCOPES.find((s) => s.value === res.scope)?.fullLabel}）`,
        })
        router.refresh()
      } finally {
        setSyncing(false)
      }
    }
    if (dirty && !readOnly) save(() => void runSync())
    else await runSync()
  }

  const numInput = (
    value: number,
    onChange: (n: number) => void,
    label: string,
    className = 'w-24',
  ) => (
    <EditableNumber
      value={value}
      onChange={onChange}
      label={label}
      disabled={readOnly}
      className={cn('h-8', className)}
    />
  )

  return (
    /*
      pb-24：给右下角浮动的毛利胶囊留出安全区。
      实测（1440×900）胶囊 264×40 停在 (1120,808)，而「报价备注」textarea 横向
      289→1407、纵向 803→871，两者 bbox 相交 264×40 —— 滚到页面底部时胶囊正好
      盖住备注框右下角的文字。底部留出 96px（胶囊 40 + 间距 32 + 再余 24），
      备注框就永远滚不到胶囊下面。
    */
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-24">
      <SwapProductDialog
        open={Boolean(swapLine)}
        onOpenChange={(o) => !o && setSwapKey(null)}
        line={swapLine}
        products={products}
        sameTypeLines={
          swapLine
            ? quote.items.filter((l) => l.deviceType && l.deviceType === swapLine.deviceType).length
            : 0
        }
        canSetDefault={Boolean(project)}
        onConfirm={applySwap}
      />
      {/*
        页面标题：本页原来没有任何 h1/h2（视觉审计里是唯一一个「没有页面标题」的工作台页）。
        项目条已给出「这是哪个项目」，这里补上这一页是什么 + 一句话说明，
        字号与 `PageHeader` 的一级标题同级，左边缘与其他工作台页对齐。
      */}
      <div className="min-w-0">
        <h2 className={WORKBENCH_SECTION_HEADING_CLASS}>报价</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          调整设备清单、附加费用与备注；保存后可在业主版报价单里导出 PDF。
        </p>
      </div>

      {/* 顶栏操作区（Untitled UI 面包屑 + 主次按钮） */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            as={GuardedLink}
            href={`/projects/${project.id}/quotes`}
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 text-xs font-medium text-muted-foreground hover:text-foreground"
            icon={<ChevronLeft />}
            label="全部报价"
          />
          {projectQuotes.length > 1 ? (
            <DropdownMenu
              alignment="start"
              menuWidth="16rem"
              renderTrigger={(props) => (
                <Button
                  {...props}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 border-border bg-background text-xs font-medium text-fg-secondary shadow-2xs"
                  aria-label="切换到项目里的其他报价"
                  icon={<ChevronDown />}
                  label={projectQuotes.length ? `切换报价（${projectQuotes.length}）` : '切换报价'}
                />
              )}
              items={projectQuotes.map((q) => ({
                id: q.id,
                label: (
                  <span
                    className={cn(
                      'flex-1 truncate',
                      q.id === quote.id && 'font-semibold text-primary',
                    )}
                  >
                    {q.title}
                  </span>
                ),
                endContent: (
                  <span className="ml-3 text-xs text-muted-foreground tabular-nums">
                    {yuan(q.total)}
                  </span>
                ),
                onClick: () => {
                  if (q.id === quote.id) return
                  const go = () => router.push(`/projects/${project.id}/quotes/${q.id}`)
                  if (dirty && !readOnly) save(go)
                  else go()
                },
              }))}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <Badge variant="neutral" label={'只读'} />
          ) : dirty ? (
            <Badge
              variant="neutral"
              className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
              label={'未保存修改'}
            />
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            className="h-8 border-border bg-background text-xs font-medium shadow-2xs"
            isDisabled={saving || syncing}
            onClick={() => switchToPointMap()}
            icon={<MapPinned />}
            label="调整点位图"
          />
          {readOnly ? null : (
            <Button
              size="sm"
              className="h-8 bg-primary text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
              isDisabled={saving}
              isLoading={saving}
              onClick={() => save()}
              icon={<Save />}
              label="保存报价"
            />
          )}
        </div>
      </div>

      {lockReason ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{lockReason}</span>
        </div>
      ) : null}

      {margin ? (
        <MarginCapsule
          margin={margin}
          settings={costSettings}
          hidden={hideInternal}
          onToggle={toggleInternal}
        />
      ) : null}

      {/* Untitled UI + IBM Carbon 顶部报价概览与 4 格 KPI 指标条 */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xs">
        <div className="grid gap-4 border-b border-border p-4 sm:p-5 md:grid-cols-[1fr_11rem]">
          <Field label="报价方案名称" inputID="title">
            <TextInput
              label={'title'}
              isLabelHidden
              id="title"
              value={quote.title}
              isDisabled={readOnly}
              onChange={(v) => update({ title: v })}
              controlClassName="h-9 border-border bg-subtle/50 text-base font-semibold text-foreground focus-visible:bg-background"
            />
          </Field>
          <Field label="报价状态" inputID="status">
            <Selector
              id="status"
              label="报价状态"
              isLabelHidden
              size="sm"
              width="100%"
              value={quote.status}
              options={QUOTE_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
              isDisabled={readOnly}
              onChange={(v) => update({ status: v })}
              controlClassName="h-9 border-border bg-subtle/50 text-xs font-medium"
            />
          </Field>
        </div>

        {/* 4 格核心数据指标条 */}
        <div className="grid grid-cols-2 divide-x divide-y divide-border bg-subtle/50 sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-3 sm:px-5">
            <div className="text-xs font-medium text-muted-foreground">设备总件数</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {totalQuantity}
              </span>
              <span className="text-xs text-muted-foreground">
                件 · {quote.items.length} 项型号
              </span>
            </div>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <div className="text-xs font-medium text-muted-foreground">设备产品小计</div>
            <div className="mt-1 text-lg font-semibold text-foreground tabular-nums">
              {yuan(totals.productTotal)}
            </div>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <div className="text-xs font-medium text-muted-foreground">附加费与优惠</div>
            <div className="mt-1 flex items-baseline gap-2 text-sm font-medium tabular-nums">
              <span className="text-fg-secondary">+{yuan(totals.feeTotal)}</span>
              {quote.discount > 0 ? (
                <span className="text-success">-{yuan(quote.discount)}</span>
              ) : null}
            </div>
          </div>
          <div className="bg-subtle px-4 py-3 sm:px-5">
            <div className="text-xs font-medium text-muted-foreground">报价总额</div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight text-foreground tabular-nums">
              {yuan(totals.total)}
            </div>
          </div>
        </div>
      </div>

      {contract?.usesThisQuote ? (
        <p className="-mt-2 text-sm text-muted-foreground">
          已用于合同 {contract.number}（{contractStatusLabel(contract.status)}）
          <GuardedLink
            href={`/projects/${project.id}/contract`}
            className="ml-2 font-medium text-foreground underline-offset-4 hover:underline"
          >
            查看合同
          </GuardedLink>
        </p>
      ) : !contract && !readOnly && quote.status === 'accepted' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">客户已确认此报价，可直接生成合同</span>
          <Button
            size="sm"
            isDisabled={creatingContract || saving}
            isLoading={creatingContract}
            onClick={() => void generateContract()}
            icon={<FileSignature />}
            endContent={<ArrowRight />}
            label="生成合同"
          />
        </div>
      ) : null}

      {pendingPoints ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span>点位图中有 {pendingPoints} 个点位尚未匹配型号，未计入本报价</span>
          </span>
          <Link type="inherit" hasUnderline onClick={() => switchToPointMap()}>
            去点位图查看
          </Link>
        </div>
      ) : null}

      {/* 主表卡：工具条 header + 全出血表格 content，两槽 padding={0}，内边距由内层自管 */}
      <AstryxCard
        padding={0}
        className="gap-0 overflow-hidden border-0 bg-card text-sm text-card-foreground shadow-xs ring-1 ring-border"
      >
        {/* IBM Carbon 数据表格工具条（当勾选行时切换为品牌蓝紫批量操作条） */}
        {activeSelectedKeys.size > 0 && viewMode === 'summary' && !readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary bg-primary px-4 py-2.5 text-primary-foreground sm:px-5">
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <CheckSquare className="size-4" />
                已选 {activeSelectedKeys.size} 项设备
              </span>
              <span className="h-3.5 w-px bg-primary-foreground/30" />
              <span className="text-primary-foreground/90 tabular-nums">
                选中行小计 {yuan(selectedSubtotal)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <DropdownMenu
                alignment="end"
                renderTrigger={(props) => (
                  <Button
                    {...props}
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 bg-primary-foreground/15 px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-foreground/25"
                    icon={<Percent />}
                    label="批量折扣"
                  />
                )}
                items={[
                  { label: '按目录价 9.5 折计算', onClick: () => applyBatchDiscount(0.95) },
                  { label: '按目录价 9.0 折计算', onClick: () => applyBatchDiscount(0.9) },
                  { label: '按目录价 8.5 折计算', onClick: () => applyBatchDiscount(0.85) },
                  { label: '按目录价 8.0 折计算', onClick: () => applyBatchDiscount(0.8) },
                ]}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={restoreBatchOriginPrice}
                className="h-7 gap-1 bg-primary-foreground/15 px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-foreground/25"
                icon={<RotateCcw />}
                label="恢复原价"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={deleteBatchSelected}
                className="h-7 gap-1 bg-primary-foreground/15 px-2.5 text-xs font-medium text-primary-foreground hover:bg-red-500/80"
                icon={<Trash2 />}
                label="批量删除"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedKeys(new Set())}
                className="h-7 px-2 text-xs text-primary-foreground/85 hover:bg-primary-foreground/15 hover:text-primary-foreground"
                icon={<X />}
                label="取消选择"
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-subtle/40 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="shrink-0 font-heading text-sm font-semibold whitespace-nowrap text-foreground">
              设备明细清单
            </div>
            {floorGroups.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <TabList
                  role="tablist"
                  aria-label="明细视图"
                  className="workspace-view-tabs"
                  size="sm"
                  value={viewMode}
                  onChange={(v) => setViewMode(v as 'floors' | 'summary')}
                >
                  <Tab
                    value="floors"
                    panelId="quote-lines-panel"
                    icon={<Layers />}
                    label="按房间"
                    endContent={<span className="text-xs tabular-nums">{roomCount}</span>}
                  />
                  <Tab value="summary" panelId="quote-lines-panel" label="整单汇总" />
                </TabList>
                {viewMode === 'floors' ? (
                  <SegmentedControl
                    label="点位图显示"
                    size="sm"
                    layout="hug"
                    value={planMode}
                    onChange={(v) => setPlanMode(v as 'symbol' | 'product' | 'hide')}
                  >
                    <SegmentedControlItem value="symbol" label="设备图标" />
                    <SegmentedControlItem value="product" label="产品图" />
                    <SegmentedControlItem value="hide" label="隐藏图纸" />
                  </SegmentedControl>
                ) : null}
              </div>
            ) : null}
            {/* 整单汇总模式下的实时筛选框（IBM Carbon Table Search） */}
            {viewMode === 'summary' && quote.items.length > 0 ? (
              <div className="relative w-48 sm:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <TextInput
                  label={'筛选报价明细'}
                  isLabelHidden
                  value={lineQuery}
                  onChange={(v) => setLineQuery(v)}
                  placeholder="筛选型号、SKU 或分类…"
                  hasClear
                  controlClassName="h-8 border-border bg-background pl-8 text-xs"
                />
              </div>
            ) : null}
          </div>
          {readOnly ? null : (
            <div className="flex items-center gap-2">
              {project ? (
                <div className="flex items-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={syncing || saving}
                    className="rounded-r-none border-r-0"
                    onClick={() => void syncFromPointMap(currentScope)}
                    isLoading={syncing}
                    icon={<RefreshCw />}
                    label="从点位图同步"
                  />
                  <DropdownMenu
                    alignment="end"
                    renderTrigger={(props) => (
                      <Button
                        {...props}
                        variant="secondary"
                        size="sm"
                        isDisabled={syncing || saving}
                        className="rounded-l-none px-1.5"
                        label="选择同步范围"
                        icon={<ChevronDown />}
                      />
                    )}
                    items={POINT_SCOPES.map((s) => ({
                      id: s.value,
                      label: (
                        <span className={cn('flex-1', s.value === currentScope && 'font-semibold')}>
                          按「{s.fullLabel}」同步
                        </span>
                      ),
                      onClick: () => void syncFromPointMap(s.value),
                    }))}
                  />
                </div>
              ) : null}
              <DropdownMenu
                alignment="end"
                placement="below"
                // 原 `PopoverContent className="w-96 p-0"`：`w-96` = 384 是浮层外框宽度；
                // 官方菜单对应 `menuWidth`，高度上限沿用原来的 max-h-96（384px）。
                menuWidth={384}
                menuMaxHeight={384}
                isMenuOpen={pickerOpen}
                onOpenChange={(o) => {
                  setPickerOpen(o)
                  if (!o) setProductQuery('')
                }}
                renderTrigger={(props) => (
                  <Button
                    {...props}
                    variant="secondary"
                    size="sm"
                    icon={<Plus />}
                    label="添加产品"
                  />
                )}
                header={
                  <TextInput
                    label="搜索产品"
                    isLabelHidden
                    value={productQuery}
                    onChange={(v) => setProductQuery(v)}
                    placeholder="搜索产品名称、型号、品牌或设备类型"
                    aria-label="搜索产品名称、型号、品牌或设备类型"
                    controlClassName="h-8"
                  />
                }
                items={productPickerItems}
              />
            </div>
          )}
        </div>
        <div id="quote-lines-panel">
          {quote.items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              还没有产品。可以在点位图里放置设备后重新生成，或点击「添加产品」。
            </p>
          ) : viewMode === 'floors' && floorGroups.length > 0 ? (
            <div className="divide-y">
              {floorGroups.map((floor) => (
                <div key={floor.sheetId} className="space-y-3 p-4 md:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-base font-semibold">{floor.floorName}</h3>
                      <span className="text-xs text-muted-foreground">
                        {floor.sheetName} · {floor.rooms.length} 个区域 · {floor.pointCount} 个点位
                      </span>
                      {project ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => switchToPointMap({ sheet: floor.sheetId })}
                          icon={<MapPinned />}
                          label="去点位图看本层"
                        />
                      ) : null}
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      楼层小计 {yuan(floor.subtotal)}
                    </div>
                  </div>
                  {planMode !== 'hide' && floor.sheetUrl ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-background">
                      <PlanFigure
                        sheetUrl={floor.sheetUrl}
                        points={floor.planPoints}
                        areas={floor.planAreas}
                        mode={planMode}
                        className="mx-auto max-h-80 w-full"
                      />
                    </div>
                  ) : null}
                  {/* 瀑布流两列：房间卡片高度差别大，网格会留下大块空白 */}
                  <div className="gap-3 md:columns-2">
                    {floor.rooms.map((room) => (
                      <div
                        key={room.id}
                        className="mb-3 flex break-inside-avoid flex-col rounded-xl border bg-background p-3.5"
                      >
                        <div className="mb-2.5 flex items-baseline justify-between border-b pb-2">
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <span className="text-sm font-semibold">{room.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {room.typeLabel} · {room.pointCount} 个点位
                            </span>
                            {project && room.typeLabel !== '未分区' ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => switchToPointMap({ area: room.name })}
                                label="定位房间"
                              />
                            ) : null}
                          </div>
                          <span className="text-sm font-semibold tabular-nums">
                            {yuan(room.subtotal)}
                          </span>
                        </div>
                        <div className="divide-y">
                          {room.lines.map((line) => {
                            const originPrice = catalogPriceOf(line.productId)
                            const priceChanged =
                              originPrice !== undefined &&
                              Math.abs(originPrice - line.price) > 0.001
                            return (
                              <div
                                key={`${room.id}-${line.deviceType}-${line.productId}`}
                                className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-2.5"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                  <ProductThumb
                                    src={line.image}
                                    alt={line.name}
                                    size={96}
                                    loading="lazy"
                                    className="size-10 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <PointMarker
                                        type={line.deviceType}
                                        className="size-4 shrink-0"
                                      />
                                      <QuoteItemName item={line} className="text-sm font-medium" />
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                      <span>{line.typeName}</span>
                                      {line.sku ? <span>· {line.sku}</span> : null}
                                      {line.codes.length ? (
                                        <span className="inline-flex flex-wrap items-center gap-1 font-mono text-xs">
                                          （
                                          {line.codes.map((code, idx) => (
                                            <span key={code}>
                                              {project ? (
                                                <Link
                                                  type="inherit"
                                                  hasUnderline
                                                  tooltip={`在点位图中定位并选中 ${code}`}
                                                  onClick={() => switchToPointMap({ point: code })}
                                                >
                                                  {code}
                                                </Link>
                                              ) : (
                                                code
                                              )}
                                              {idx < line.codes.length - 1 ? '、' : ''}
                                            </span>
                                          ))}
                                          ）
                                        </span>
                                      ) : null}
                                      {!readOnly && line.lineKey ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-auto p-0 text-xs text-muted-foreground no-underline hover:text-primary hover:no-underline"
                                          onClick={() => setSwapKey(line.lineKey)}
                                          icon={<ArrowLeftRight />}
                                          label="更换型号"
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 pl-[calc(var(--spacing)*10+var(--spacing)*2.5)] text-xs tabular-nums sm:shrink-0 sm:flex-col sm:items-end sm:justify-center sm:gap-0 sm:pl-0 sm:text-right">
                                  <div className="flex items-center gap-1 text-muted-foreground sm:order-2 sm:mt-1 sm:justify-end">
                                    <span>¥</span>
                                    <EditableNumber
                                      value={line.price}
                                      disabled={readOnly || !line.lineKey}
                                      label={`${room.name} ${line.name} 单价`}
                                      className={cn('h-6 w-20 px-1.5 text-xs', INLINE_NUM)}
                                      onChange={(n) =>
                                        line.lineKey && updateLine(line.lineKey, { price: n })
                                      }
                                    />
                                    <span>
                                      × {line.quantity}
                                      {line.unit || '个'}
                                    </span>
                                  </div>
                                  <div className="text-sm font-semibold sm:order-1">
                                    {yuan(line.subtotal)}
                                  </div>
                                  {priceChanged && line.lineKey ? (
                                    <div className="mt-0.5 flex w-full items-center justify-end gap-1 text-xs text-warning sm:order-3 sm:w-auto">
                                      <span>原价 {yuan(originPrice)}</span>
                                      {!readOnly ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-auto p-0 text-xs"
                                          onClick={() =>
                                            updateLine(line.lineKey!, { price: originPrice })
                                          }
                                          icon={<RotateCcw />}
                                          label="恢复"
                                        />
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* 手机窄屏（< md）采用纵向自适应卡片行，确保单价与数量输入框完全在 390px 屏幕内 */}
              <div className="divide-y md:hidden">
                {quote.items.map((l) => (
                  <div key={l.key} className="space-y-2.5 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                        {l.image ? (
                          <Image
                            src={l.image}
                            alt=""
                            width={40}
                            height={40}
                            className="size-full bg-white object-contain"
                          />
                        ) : l.deviceType ? (
                          <span className="size-5">
                            <DeviceSymbol type={l.deviceType} />
                          </span>
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground/50" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <QuoteItemName item={l} className="text-sm font-medium leading-snug" />
                        <div className="mt-0.5 flex min-w-0 items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate">
                            {[
                              l.deviceType ? deviceTypeLabel(l.deviceType) : null,
                              l.sku,
                              l.unit && `单位：${l.unit}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          {!readOnly && l.deviceType ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto shrink-0 p-0 text-xs text-muted-foreground no-underline hover:text-primary hover:no-underline"
                              onClick={() => setSwapKey(l.key)}
                              icon={<ArrowLeftRight />}
                              label="更换型号"
                            />
                          ) : null}
                        </div>
                      </div>
                      {readOnly ? null : (
                        <IconButton
                          variant="ghost"

                          className="-mr-1 shrink-0"
                          aria-label={`删除 ${l.name}`}
                          onClick={() =>
                            update({ items: quote.items.filter((x) => x.key !== l.key) })
                          }
                          label={`删除 ${l.name}`}
                          icon={<Trash2 />}
                          size="sm"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pl-[calc(var(--spacing)*10+var(--spacing)*2.5)] text-xs tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">单价</span>
                        {numInput(
                          l.price,
                          (n) => updateLine(l.key, { price: n }),
                          `${l.name} 单价`,
                          'w-24',
                        )}
                        <span className="text-muted-foreground">×</span>
                        {numInput(
                          l.quantity,
                          (n) => updateLine(l.key, { quantity: n }),
                          `${l.name} 数量`,
                          'w-16',
                        )}
                      </div>
                      <div className="ml-auto text-sm font-semibold">
                        {yuan(l.price * l.quantity)}
                      </div>
                    </div>
                    {(() => {
                      const originPrice = catalogPriceOf(l.product)
                      if (originPrice === undefined || Math.abs(originPrice - l.price) <= 0.001)
                        return null
                      return (
                        <div className="flex items-center justify-end gap-1 pl-[calc(var(--spacing)*10+var(--spacing)*2.5)] text-xs text-warning tabular-nums">
                          <span>原价 {yuan(originPrice)}</span>
                          {!readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => updateLine(l.key, { price: originPrice })}
                              icon={<RotateCcw />}
                              label="恢复"
                            />
                          ) : null}
                        </div>
                      )
                    })()}
                  </div>
                ))}
                <div className="flex items-center justify-between bg-muted/40 px-4 py-3 text-sm">
                  <span className="font-medium">产品小计</span>
                  <span className="font-semibold tabular-nums">{yuan(totals.productTotal)}</span>
                </div>
              </div>

              {/* 平板与桌面端（>= md）IBM Carbon 高密度数据表格 */}
              <div className="hidden md:block">
                <Table hasHover>
                  <TableHeader>
                    <TableRow isHeaderRow>
                      {readOnly ? null : (
                        <TableHeaderCell className="w-10 max-w-none pl-5">
                          <CheckboxInput
                            label={'全选当前列表中的设备'}
                            isLabelHidden
                            value={allFilteredSelected}
                            onChange={(v) => toggleSelectAllFiltered(Boolean(v))}
                            aria-label="全选当前列表中的设备"
                          />
                        </TableHeaderCell>
                      )}
                      <TableHeaderCell
                        className={cn(
                          'max-w-none text-xs font-semibold text-muted-foreground',
                          readOnly && 'pl-6',
                        )}
                      >
                        设备型号与规格
                      </TableHeaderCell>
                      {showCosts ? (
                        <TableHeaderCell className="max-w-none text-right">
                          内部成本
                        </TableHeaderCell>
                      ) : null}
                      <TableHeaderCell className="max-w-none text-right">零售单价</TableHeaderCell>
                      <TableHeaderCell className="max-w-none text-right">数量</TableHeaderCell>
                      <TableHeaderCell className="max-w-none text-right">小计金额</TableHeaderCell>
                      {readOnly ? null : <TableHeaderCell className="w-10 max-w-none pr-4" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((l) => {
                      const isSelected = activeSelectedKeys.has(l.key)
                      return (
                        <TableRow
                          key={l.key}
                          className={cn(
                            'transition-colors',
                            isSelected && 'bg-primary/[0.04] hover:bg-primary/[0.07]',
                          )}
                        >
                          {readOnly ? null : (
                            <TableCell className="max-w-none pl-5">
                              <CheckboxInput
                                label={'选择'}
                                isLabelHidden
                                value={isSelected}
                                onChange={(v) => toggleSelectLine(l.key, Boolean(v))}
                                aria-label={`选择 ${l.name}`}
                              />
                            </TableCell>
                          )}
                          <TableCell
                            className={cn('max-w-none whitespace-normal', readOnly && 'pl-6')}
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                                {l.image ? (
                                  <Image
                                    src={l.image}
                                    alt=""
                                    width={44}
                                    height={44}
                                    className="size-full bg-white object-contain"
                                  />
                                ) : l.deviceType ? (
                                  <span className="size-6">
                                    <DeviceSymbol type={l.deviceType} />
                                  </span>
                                ) : (
                                  <ImageIcon className="size-4 text-muted-foreground/50" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <QuoteItemName item={l} className="font-medium" />
                                <div className="mt-0.5 flex min-w-0 items-center gap-x-2 text-xs text-muted-foreground">
                                  <span className="min-w-0 flex-1 truncate">
                                    {[
                                      l.deviceType ? deviceTypeLabel(l.deviceType) : null,
                                      l.sku,
                                      l.unit && `单位：${l.unit}`,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                  {!readOnly && l.deviceType ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-auto shrink-0 p-0 text-xs text-muted-foreground no-underline hover:text-primary hover:no-underline"
                                      onClick={() => setSwapKey(l.key)}
                                      icon={<ArrowLeftRight />}
                                      label="更换型号"
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          {showCosts ? <CostCell cost={unitCost(l)} /> : null}
                          <TableCell className="max-w-none text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              {numInput(
                                l.price,
                                (n) => updateLine(l.key, { price: n }),
                                `${l.name} 单价`,
                                cn('ml-auto w-28', INLINE_NUM),
                              )}
                              {(() => {
                                const originPrice = catalogPriceOf(l.product)
                                if (
                                  originPrice === undefined ||
                                  Math.abs(originPrice - l.price) <= 0.001
                                )
                                  return null
                                return (
                                  <span className="flex items-center gap-1 text-xs text-warning tabular-nums">
                                    原价 {yuan(originPrice)}
                                    {!readOnly ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto p-0 text-xs"
                                        onClick={() => updateLine(l.key, { price: originPrice })}
                                        icon={<RotateCcw />}
                                        label="恢复"
                                      />
                                    ) : null}
                                  </span>
                                )
                              })()}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-none text-right">
                            {numInput(
                              l.quantity,
                              (n) => updateLine(l.key, { quantity: n }),
                              `${l.name} 数量`,
                              cn('ml-auto w-20', INLINE_NUM),
                            )}
                          </TableCell>
                          <TableCell className="max-w-none text-right font-medium tabular-nums">
                            {yuan(l.price * l.quantity)}
                          </TableCell>
                          {readOnly ? null : (
                            <TableCell className="max-w-none pr-4">
                              <IconButton
                                variant="ghost"

                                aria-label={`删除 ${l.name}`}
                                onClick={() =>
                                  update({ items: quote.items.filter((x) => x.key !== l.key) })
                                }
                                label={`删除 ${l.name}`}
                                icon={<Trash2 />}
                                size="sm"
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell
                        className="max-w-none pl-6 font-medium"
                        colSpan={(showCosts ? 4 : 3) + (readOnly ? 0 : 1)}
                      >
                        产品小计
                      </TableCell>
                      <TableCell className="max-w-none text-right font-bold text-foreground tabular-nums">
                        {yuan(totals.productTotal)}
                      </TableCell>
                      {readOnly ? null : <TableCell className="max-w-none" />}
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </>
          )}
        </div>
      </AstryxCard>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <AstryxCard
          padding={0}
          className="border-0 bg-card text-sm text-card-foreground shadow-xs ring-1 ring-border"
        >
          <div className="flex flex-row items-center justify-between gap-1.5 px-5 pt-5 pb-1.5">
            <div className="font-heading text-base font-semibold tracking-tight">附加费用</div>
            {readOnly ? null : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  update({
                    fees: [
                      ...quote.fees,
                      {
                        key: crypto.randomUUID(),
                        name: quote.fees.length ? '' : '安装调试费',
                        amount: 0,
                      },
                    ],
                  })
                }
                className="border-workspace-outline dark:border-workspace-outline-dark"
                icon={<Plus />}
                label="添加费用"
              />
            )}
          </div>
          <div className="space-y-2.5 px-5 pt-1.5 pb-5">
            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-xs text-muted-foreground">快捷填入：</span>
                {[
                  {
                    name: '全屋设备安装调试费',
                    amount: Math.max(800, Math.round((totals.productTotal * 0.08) / 100) * 100),
                  },
                  { name: '强弱电布线技术交底', amount: 600 },
                  { name: '专属场景定制与一年上门维保', amount: 0 },
                ].map((preset) => (
                  <Button
                    key={preset.name}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="border-workspace-outline dark:border-workspace-outline-dark"
                    icon={<Plus />}
                    label={preset.name}
                    onClick={() =>
                      update({
                        fees: [
                          ...quote.fees,
                          { key: crypto.randomUUID(), name: preset.name, amount: preset.amount },
                        ],
                      })
                    }
                  />
                ))}
              </div>
            ) : null}
            {quote.fees.length === 0 ? (
              <p className="text-sm text-muted-foreground">如安装调试费、布线费、上门费等</p>
            ) : null}
            {quote.fees.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <TextInput
                  label={'费用名称'}
                  isLabelHidden
                  value={f.name}
                  placeholder="费用名称"
                  aria-label="费用名称"
                  controlClassName="h-8"
                  isDisabled={readOnly}
                  onChange={(v) => updateFee(f.key, { name: v })}
                />
                {numInput(
                  f.amount,
                  (n) => updateFee(f.key, { amount: n }),
                  `${f.name || '费用'} 金额`,
                  'w-28',
                )}
                {readOnly ? null : (
                  <IconButton
                    variant="ghost"

                    aria-label="删除费用"
                    onClick={() => update({ fees: quote.fees.filter((x) => x.key !== f.key) })}
                    label="删除费用"
                    icon={<Trash2 />}
                    size="sm"
                  />
                )}
              </div>
            ))}
          </div>
        </AstryxCard>

        <AstryxCard
          padding={0}
          className="border-0 bg-card text-sm text-card-foreground shadow-xs ring-1 ring-border"
        >
          <div className="flex flex-row items-center justify-between gap-1.5 px-5 pt-5 pb-1.5">
            <div className="font-heading text-base font-semibold tracking-tight">结算汇总</div>
            {!readOnly && totals.productTotal + totals.feeTotal > 100 ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => roundDownTotal(100)}
                  className="h-6 px-2 text-xs text-primary hover:bg-primary/8 hover:text-primary"
                  tooltip="自动计算优惠金额，使报价总额抹去零头至整百"
                  icon={<Sparkles />}
                  label="抹零至百位"
                />
                {totals.productTotal + totals.feeTotal > 1000 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => roundDownTotal(1000)}
                    className="h-6 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    tooltip="自动计算优惠金额，使报价总额抹去零头至整千"
                    label="抹零至千位"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-2 px-5 pt-1.5 pb-5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">产品小计</span>
              <span className="tabular-nums">{yuan(totals.productTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">附加费用</span>
              <span className="tabular-nums">{yuan(totals.feeTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">优惠</span>
              {numInput(quote.discount, (n) => update({ discount: n }), '优惠金额', 'w-28')}
            </div>
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">报价总额</span>
              <span className="text-2xl font-bold tabular-nums">{yuan(totals.total)}</span>
            </div>
            {margin && !hideInternal ? (
              <MarginBreakdown
                margin={margin}
                settings={costSettings}
                className="mt-3 rounded-lg bg-muted/60 p-3"
              />
            ) : null}
          </div>
        </AstryxCard>
      </div>

      <AstryxCard
        padding={0}
        className="border-0 bg-card text-sm text-card-foreground shadow-xs ring-1 ring-border"
      >
        <div className="px-5 pb-5 pt-4">
          <Field label="报价备注" inputID="notes">
            <TextArea
              id="notes"
              label="报价备注"
              isLabelHidden
              rows={3}
              value={quote.notes}
              isDisabled={readOnly}
              placeholder="例如：报价有效期 30 天；含一年免费上门维护"
              onChange={(v) => update({ notes: v })}
            />
          </Field>
        </div>
      </AstryxCard>
    </section>
  )
}

const pct = (r: number) => `${(r * 100).toFixed(1)}%`
type MarginTone = 'ok' | 'near' | 'below'
const toneOf = (m: MarginSummary, s: CostSettings): MarginTone =>
  m.belowFloor || m.profit < 0 ? 'below' : m.rate * 100 < s.minMarginPercent + 5 ? 'near' : 'ok'
const COST_SOURCE: Record<UnitCost['source'], string> = {
  brand: '品牌拿货折扣',
  catalog: '产品库成本价',
  default: '默认拿货折扣',
}

/** 单价成本单元格：鼠标悬停显示成本依据 */
function CostCell({ cost }: { cost: UnitCost | null }) {
  // 官方的 TableCell 不收原生 title，成本依据改用官方 Tooltip 承载（默认 200ms 延迟）。
  const detail = cost
    ? `${COST_SOURCE[cost.source]}${cost.rate ? ` · ${rateLabel(cost.rate)}` : ''}`
    : '未设置成本：在「设置 → 报价成本与毛利」里填写品牌折扣'
  return (
    <TableCell className="max-w-none text-right text-sm text-muted-foreground tabular-nums">
      <Tooltip content={detail} placement="below">
        <span className="inline-flex items-center gap-1">
          {cost ? (
            <>
              {cost.source !== 'catalog' ? (
                <span className="rounded bg-muted px-1 text-[10px] leading-4">
                  {cost.rate ? rateLabel(cost.rate) : '估'}
                </span>
              ) : null}
              {yuan(cost.cost)}
            </>
          ) : (
            '—'
          )}
        </span>
      </Tooltip>
    </TableCell>
  )
}

/** 内部核算明细：成本构成、毛利、底线价与还能让利的空间 */
function MarginBreakdown({
  margin,
  settings,
  className,
}: {
  margin: MarginSummary
  settings: CostSettings
  className?: string
}) {
  const tone = toneOf(margin, settings)
  return (
    <div className={cn('space-y-1.5 text-sm', className)}>
      <div className="flex justify-between">
        <span className="text-muted-foreground">产品成本</span>
        <span className="tabular-nums">{yuan(margin.productCost)}</span>
      </div>
      {margin.feeCost ? (
        <div className="flex justify-between">
          <span className="text-muted-foreground">附加费用成本（{settings.feeCostPercent}%）</span>
          <span className="tabular-nums">{yuan(margin.feeCost)}</span>
        </div>
      ) : null}
      <div className="flex justify-between">
        <span className="text-muted-foreground">内部成本合计（不打印）</span>
        <span className="tabular-nums">{yuan(margin.cost)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">毛利</span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            tone === 'below'
              ? 'text-destructive-strong'
              : tone === 'near'
                ? 'text-warning'
                : 'text-success',
          )}
        >
          {yuan(margin.profit)}（{pct(margin.rate)}）
        </span>
      </div>
      <div className="flex justify-between border-t border-border/70 pt-1.5">
        <span className="text-muted-foreground">底线价（毛利率 {settings.minMarginPercent}%）</span>
        <span className="tabular-nums">{yuan(margin.floorPrice)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {margin.headroom >= 0 ? '还可让利' : '已低于底线'}
        </span>
        <span
          className={cn(
            'font-medium tabular-nums',
            margin.headroom >= 0 ? 'text-foreground' : 'text-destructive-strong',
          )}
        >
          {yuan(Math.abs(margin.headroom))}
        </span>
      </div>
      {margin.missing ? (
        <p className="text-xs text-warning">
          {margin.missing} 行未设置成本，未计入合计。
          <GuardedLink href="/settings#cost" className="ml-1 underline underline-offset-2">
            设置品牌折扣
          </GuardedLink>
        </p>
      ) : null}
    </div>
  )
}

/** 窄屏放在顶栏下方，避免覆盖编辑控件；桌面继续浮动显示。 */
function MarginCapsule({
  margin,
  settings,
  hidden,
  onToggle,
}: {
  margin: MarginSummary
  settings: CostSettings
  hidden: boolean
  onToggle: () => void
}) {
  const tone = toneOf(margin, settings)
  if (hidden) {
    return (
      <IconButton
        type="button"
        variant="secondary"

        onClick={onToggle}
        className="size-10 self-start rounded-full bg-background shadow-lg md:fixed md:right-6 md:bottom-6 md:z-30 print:hidden"
        aria-label="显示内部成本与毛利"
        tooltip="显示内部成本与毛利"
        label="显示内部成本与毛利"
        icon={<EyeOff />}
        size="md"
      />
    )
  }
  return (
    <div className="flex w-fit max-w-full items-center rounded-full bg-foreground text-background shadow-xl md:fixed md:right-6 md:bottom-6 md:z-30 print:hidden">
      <Popover
        label="内部毛利核算"
        // 原 `side="top" align="end"` → 官方 `placement` / `alignment`。
        placement="above"
        alignment="end"
        // 原 `PopupContent className="w-80"`：`w-80` = 320。padding 保持官方默认 3 —— 原浮层
        // 有内边距（内容直接贴 PopoverContent，没有 p-0），转官方后默认 12px 与之相当。
        width={320}
        content={
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">内部毛利核算</p>
              <Badge
                variant={tone === 'below' ? 'error' : tone === 'near' ? 'warning' : 'success'}
                label={tone === 'below' ? '低于底线' : tone === 'near' ? '接近底线' : '毛利健康'}
              />
            </div>
            <MarginBreakdown margin={margin} settings={settings} />
            <p className="mt-3 text-xs text-muted-foreground">
              成本依据：
              {[
                margin.sources.brand ? `品牌折扣 ${margin.sources.brand} 行` : null,
                margin.sources.catalog ? `产品库成本 ${margin.sources.catalog} 行` : null,
                margin.sources.default ? `默认折扣 ${margin.sources.default} 行` : null,
              ]
                .filter(Boolean)
                .join(' · ') || '暂无'}
              。仅你自己可见，不会打印或出现在分享页。
            </p>
            <GuardedLink
              href="/settings#cost"
              className="mt-2 inline-flex text-xs font-medium underline-offset-4 hover:underline"
            >
              调整拿货折扣与毛利率底线 →
            </GuardedLink>
          </>
        }
      >
        <button
          type="button"
          className="flex h-10 items-center gap-2.5 rounded-l-full pr-2 pl-4 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="查看内部毛利核算"
        >
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              tone === 'below' ? 'bg-destructive' : tone === 'near' ? 'bg-warning' : 'bg-success',
            )}
          />
          <span className="text-background/70">毛利</span>
          <span className="font-semibold tabular-nums">{yuan(margin.profit)}</span>
          <span className="tabular-nums text-background/80">{pct(margin.rate)}</span>
        </button>
      </Popover>
      <span aria-hidden className="h-5 w-px bg-background/20" />
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 items-center rounded-r-full pr-3.5 pl-2.5 text-background/70 transition-colors hover:text-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="隐藏内部成本（防止业主看到）"
        title="隐藏内部成本（防止业主看到）"
      >
        <Eye className="size-4" />
      </button>
    </div>
  )
}
