'use client'

import { useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { EyeOff, Loader2, Save, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@astryxdesign/core/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CostSettings } from '@/lib/quote-costs'
import { cn } from '@/lib/utils'

import { saveCostSettings } from './actions'

export type CostBrandOption = { slug: string; name: string; logo: string | null; products: number }

const discountText = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? '' : String(Math.round(rate * 1000) / 100)

/** 设置 → 报价成本与毛利：品牌拿货折扣、附加费用成本占比、毛利率底线（只影响本人报价台里的内部核算） */
export function CostSettingsCard({
  initial,
  brands,
}: {
  initial: CostSettings
  brands: CostBrandOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [minMargin, setMinMargin] = useState(String(initial.minMarginPercent))
  const [feeCost, setFeeCost] = useState(String(initial.feeCostPercent))
  const [defaultDiscount, setDefaultDiscount] = useState(discountText(initial.defaultRate))
  const [discounts, setDiscounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.brandRates.map((b) => [b.brand, discountText(b.rate)])),
  )
  const [query, setQuery] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const configured = Object.values(discounts).filter((v) => v.trim()).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return brands.filter((b) => !q || b.name.toLowerCase().includes(q) || b.slug.includes(q))
  }, [brands, query])

  const save = () =>
    startTransition(async () => {
      const res = await saveCostSettings({
        brandRates: Object.entries(discounts).map(([brand, discount]) => ({
          brand,
          discount: discount.trim(),
        })),
        defaultDiscount: defaultDiscount.trim() || null,
        feeCostPercent: feeCost,
        minMarginPercent: minMargin,
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
        return
      }
      setErrors({})
      toast.success('成本与毛利设置已保存，报价台会按新折扣重新核算')
      router.refresh()
    })

  return (
    <Card id="cost">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          报价成本与毛利
          <Badge variant="outline">
            <EyeOff />
            仅自己可见
          </Badge>
        </CardTitle>
        <CardDescription>
          设置你的拿货折扣后，报价台会实时估算成本、毛利率和最低成交价。打印的报价单、合同和业主分享页都不会出现任何成本信息。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="cost-min"
            label="毛利率底线"
            suffix="%"
            value={minMargin}
            onChange={setMinMargin}
            error={errors.minMarginPercent}
            hint="低于它时报价台标红，并算出最低成交价"
          />
          <NumberField
            id="cost-fee"
            label="附加费用成本占比"
            suffix="%"
            value={feeCost}
            onChange={setFeeCost}
            error={errors.feeCostPercent}
            hint="安装调试、布线等费用里的人工与辅材成本"
          />
          <NumberField
            id="cost-default"
            label="其他品牌默认折扣"
            suffix="折"
            value={defaultDiscount}
            placeholder="不估算"
            onChange={setDefaultDiscount}
            error={errors.defaultDiscount}
            hint="未单独设置、产品库也没有成本价时按此估算"
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <Label>品牌拿货折扣</Label>
              <p className="text-xs text-muted-foreground">
                按零售价打几折计算成本，例如 Aqara 填 6.5 即零售价 ×
                0.65；留空则用产品库里的成本价。已设置 {configured} 个品牌。
              </p>
            </div>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索品牌"
                aria-label="搜索品牌"
                className="h-8 w-44 pl-8"
              />
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {shown.map((b) => {
              const err = errors[`brand:${b.slug}`]
              const value = discounts[b.slug] ?? ''
              return (
                <li
                  key={b.slug}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2',
                    value.trim() && 'border-foreground/20 bg-muted/40',
                    err && 'border-destructive/50',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                    {b.logo ? (
                      <Image
                        src={b.logo}
                        alt=""
                        width={28}
                        height={28}
                        className="size-full object-contain p-0.5"
                      />
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        {b.name.slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <label htmlFor={`brand-${b.slug}`} className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {err ?? `${b.products} 款在售`}
                    </span>
                  </label>
                  <div className="flex items-center gap-1">
                    <Input
                      id={`brand-${b.slug}`}
                      type="number"
                      inputMode="decimal"
                      min={0.5}
                      max={10}
                      step={0.1}
                      value={value}
                      placeholder="—"
                      onChange={(e) => setDiscounts((d) => ({ ...d, [b.slug]: e.target.value }))}
                      className="h-8 w-20 text-right tabular-nums"
                    />
                    <span className="w-4 text-xs text-muted-foreground">折</span>
                  </div>
                </li>
              )
            })}
          </ul>
          {shown.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">没有匹配的品牌</p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} isDisabled={pending} icon={<Loader2 />} label="保存成本设置" />
        </div>
      </CardContent>
    </Card>
  )
}

function NumberField({
  id,
  label,
  suffix,
  value,
  onChange,
  hint,
  error,
  placeholder,
}: {
  id: string
  label: string
  suffix: string
  value: string
  onChange: (v: string) => void
  hint: string
  error?: string
  placeholder?: string
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="pr-8 tabular-nums"
          aria-invalid={Boolean(error)}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
      <p className={cn('text-xs', error ? 'text-destructive-strong' : 'text-muted-foreground')}>
        {error ?? hint}
      </p>
    </div>
  )
}
