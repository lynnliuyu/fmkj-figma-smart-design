'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Check, ImageIcon, Search } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { DeviceSymbol } from '@/components/device-symbol'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { deviceTypeLabel } from '@/lib/device-types'
import { yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'

import type { ProductOption } from './quote-editor'

export type SwapScope = 'line' | 'type'

/** 报价行更换型号：只列出同一设备类型的在售产品，按品牌分组。 */
export function SwapProductDialog({
  open,
  onOpenChange,
  line,
  products,
  sameTypeLines,
  canSetDefault,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  line: { name: string; product: string | null; deviceType: string | null; price: number } | null
  products: ProductOption[]
  /** 同一设备类型的行数（含当前行） */
  sameTypeLines: number
  canSetDefault: boolean
  onConfirm: (product: ProductOption, scope: SwapScope, setDefault: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('')
  const [platform, setPlatform] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [scope, setScope] = useState<SwapScope>('line')
  const [setDefault, setSetDefault] = useState(true)

  const candidates = useMemo(
    () =>
      products.filter(
        (p) => p.status === 'active' && line?.deviceType && p.deviceType === line.deviceType,
      ),
    [products, line?.deviceType],
  )
  const current = line?.product ? products.find((p) => p.id === line.product) : undefined
  const brands = useMemo(() => {
    const map = new Map<string, NonNullable<ProductOption['brand']>>()
    for (const p of candidates) if (p.brand) map.set(p.brand.slug, p.brand)
    return [...map.values()]
  }, [candidates])
  const platforms = useMemo(
    () => [...new Set(candidates.flatMap((p) => p.platforms))],
    [candidates],
  )
  const filtered = candidates.filter((p) => {
    const q = query.trim().toLowerCase()
    return (
      (!q || `${p.name} ${p.sku} ${p.brand?.name ?? ''}`.toLowerCase().includes(q)) &&
      (!brand || p.brand?.slug === brand) &&
      (!platform || p.platforms.includes(platform))
    )
  })
  const groups = useMemo(() => {
    const map = new Map<string, { brand: ProductOption['brand']; items: ProductOption[] }>()
    for (const p of filtered) {
      const k = p.brand?.slug ?? '_'
      map.set(k, { brand: p.brand, items: [...(map.get(k)?.items ?? []), p] })
    }
    return [...map.values()]
  }, [filtered])
  const chosen = candidates.find((p) => p.id === picked)
  const manualPrice = Boolean(current && line && Math.abs(current.price - line.price) > 0.001)

  const reset = (o: boolean) => {
    if (!o) {
      setQuery('')
      setBrand('')
      setPlatform('')
      setPicked(null)
      setScope('line')
      setSetDefault(true)
    }
    onOpenChange(o)
  }

  const filterChip = (
    label: React.ReactNode,
    active: boolean,
    onClick: () => void,
    key: string,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs transition-colors hover:bg-accent',
        active && 'border-primary bg-primary/5 ring-1 ring-primary',
      )}
    >
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {line?.deviceType ? (
              <span className="size-5">
                <DeviceSymbol type={line.deviceType} />
              </span>
            ) : null}
            更换型号
          </DialogTitle>
          <DialogDescription>
            {line ? (
              <>
                当前：{line.name} · {yuan(line.price)}。只列出「{deviceTypeLabel(line.deviceType)}
                」的在售产品。
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称、型号或品牌"
              aria-label="搜索产品"
              className="pl-9"
            />
          </div>
          {brands.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {filterChip('全部品牌', !brand, () => setBrand(''), 'all')}
              {brands.map((b) =>
                filterChip(
                  <>
                    <BrandLogo name={b.name} logo={b.logo} className="h-3.5" />
                    {b.name}
                  </>,
                  brand === b.slug,
                  () => setBrand(brand === b.slug ? '' : b.slug),
                  b.slug,
                ),
              )}
            </div>
          ) : null}
          {platforms.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {filterChip('全部平台', !platform, () => setPlatform(''), 'all')}
              {platforms.map((pl) =>
                filterChip(pl, platform === pl, () => setPlatform(platform === pl ? '' : pl), pl),
              )}
            </div>
          ) : null}
        </div>

        <ScrollArea className="-mx-2 min-h-0 flex-1 basis-80">
          <div className="space-y-4 px-2">
            {groups.map(({ brand: b, items }) => (
              <section key={b?.slug ?? '_'}>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  {b ? <BrandLogo name={b.name} logo={b.logo} className="h-4" /> : null}
                  {b?.name ?? '未知品牌'}
                </div>
                <ul className="grid gap-1.5">
                  {items.map((p) => {
                    const isCurrent = p.id === line?.product
                    const diff = line ? p.price - line.price : 0
                    const active = picked === p.id
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={isCurrent}
                          onClick={() => setPicked(p.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent',
                            active && 'border-primary bg-primary/5 ring-1 ring-primary',
                          )}
                        >
                          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                            {p.image ? (
                              <Image
                                src={p.image}
                                alt=""
                                width={48}
                                height={48}
                                className="size-full bg-white object-contain"
                              />
                            ) : (
                              <ImageIcon className="size-5 text-muted-foreground/50" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.name}</span>
                            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                              <span>{p.sku}</span>
                              {p.platforms.map((pl) => (
                                <Badge key={pl} variant="outline" className="h-4 px-1 text-xs">
                                  {pl}
                                </Badge>
                              ))}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-semibold tabular-nums">
                              {yuan(p.price)}
                            </span>
                            {isCurrent ? (
                              <span className="text-xs text-muted-foreground">当前型号</span>
                            ) : (
                              <span
                                className={cn(
                                  'text-xs tabular-nums',
                                  diff > 0
                                    ? 'text-destructive-strong'
                                    : diff < 0
                                      ? 'text-success'
                                      : 'text-muted-foreground',
                                )}
                              >
                                {diff === 0
                                  ? '同价'
                                  : `${diff > 0 ? '+' : '-'}${yuan(Math.abs(diff))}`}
                              </span>
                            )}
                          </span>
                          {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {groups.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {candidates.length ? '没有匹配的产品' : '产品库里没有同类型的其他在售产品'}
              </p>
            ) : null}
          </div>
        </ScrollArea>

        <div className="space-y-3 border-t pt-3">
          {sameTypeLines > 1 ? (
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as SwapScope)}
              className="flex flex-wrap gap-4"
            >
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="line" />
                只换这一行
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="type" />
                同类全部更换（{sameTypeLines} 行）
              </Label>
            </RadioGroup>
          ) : null}
          {canSetDefault ? (
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={setDefault} onCheckedChange={(v) => setSetDefault(v === true)} />
              同时设为项目默认型号（之后从点位图生成报价也用这个型号）
            </Label>
          ) : null}
          {manualPrice ? (
            <p className="text-xs text-warning">
              当前单价是手动修改过的，更换后将改为新产品的售价。
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)}>
            取消
          </Button>
          <Button
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return
              onConfirm(chosen, sameTypeLines > 1 ? scope : 'line', canSetDefault && setDefault)
              reset(false)
            }}
          >
            {chosen ? `更换为 ${chosen.name}` : '请选择产品'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
