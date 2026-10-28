'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { QUOTE_STATUSES, quoteTotals, yuan } from '@/lib/quotes'

import { saveQuote } from '../actions'

export type ProductOption = { id: string; name: string; sku: string; unit: string; price: number }
type Line = { key: string; rev?: number; product: string | null; name: string; sku: string; unit: string; price: number; quantity: number }
type Fee = { key: string; name: string; amount: number }
type QuoteState = { id: string; title: string; status: string; discount: number; notes: string; items: Line[]; fees: Fee[] }

const toNum = (v: string) => (v.trim() === '' ? 0 : Number(v))

export function QuoteEditor({
  quote: initial,
  project,
  products,
  readOnly,
}: {
  quote: QuoteState
  project: { id: string; name: string; customerName: string } | null
  products: ProductOption[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [quote, setQuote] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, startSaving] = useTransition()

  const update = (patch: Partial<QuoteState>) => {
    setQuote((q) => ({ ...q, ...patch }))
    setDirty(true)
  }
  const updateLine = (key: string, patch: Partial<Line>) => update({ items: quote.items.map((l) => (l.key === key ? { ...l, ...patch } : l)) })
  const updateFee = (key: string, patch: Partial<Fee>) => update({ fees: quote.fees.map((f) => (f.key === key ? { ...f, ...patch } : f)) })

  const addProduct = (p: ProductOption) => {
    const existing = quote.items.find((l) => l.product === p.id)
    if (existing) updateLine(existing.key, { quantity: existing.quantity + 1, rev: (existing.rev ?? 0) + 1 })
    else update({ items: [...quote.items, { key: crypto.randomUUID(), product: p.id, name: p.name, sku: p.sku, unit: p.unit, price: p.price, quantity: 1 }] })
    setPickerOpen(false)
  }

  const totals = useMemo(() => quoteTotals(quote.items, quote.fees, quote.discount), [quote])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = (then?: () => void) =>
    startSaving(async () => {
      const result = await saveQuote(quote.id, {
        title: quote.title,
        status: quote.status,
        discount: quote.discount,
        notes: quote.notes,
        items: quote.items.map(({ key: _k, rev: _r, ...l }) => l),
        fees: quote.fees.map(({ key: _k, ...f }) => f),
      })
      if (!result.ok) return void toast.error(result.error)
      setDirty(false)
      toast.success('报价已保存')
      router.refresh()
      then?.()
    })

  const openPrint = () => {
    const go = () => window.open(`/print/quotes/${quote.id}`, '_blank')
    if (dirty && !readOnly) save(go)
    else go()
  }

  const numInput = (value: number, onChange: (n: number) => void, label: string, className = 'w-24') => (
    <Input
      type="number"
      min={0}
      step="any"
      inputMode="decimal"
      aria-label={label}
      className={`h-8 text-right tabular-nums ${className}`}
      defaultValue={value}
      disabled={readOnly}
      onChange={(e) => {
        const n = toNum(e.target.value)
        if (Number.isFinite(n)) onChange(n)
      }}
    />
  )

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={project ? `/projects/${project.id}` : '/quotes'}><ChevronLeft className="size-4" />{project ? '返回项目' : '报价列表'}</Link>
        </Button>
        <div className="flex items-center gap-2">
          {readOnly ? <Badge variant="secondary">只读</Badge> : dirty ? <Badge variant="outline">未保存</Badge> : null}
          <Button variant="outline" size="sm" onClick={openPrint}><Printer className="size-4" />打印 / PDF</Button>
          {readOnly ? null : (
            <Button size="sm" disabled={saving} onClick={() => save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存
            </Button>
          )}
        </div>
      </div>

      <header className="grid gap-4 md:grid-cols-[1fr_12rem]">
        <div className="grid gap-2">
          <Label htmlFor="title">报价名称</Label>
          <Input id="title" value={quote.title} disabled={readOnly} onChange={(e) => update({ title: e.target.value })} className="text-base font-semibold" />
          {project ? <p className="text-xs text-muted-foreground">{project.name} · 客户 {project.customerName}</p> : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="status">状态</Label>
          <Select value={quote.status} onValueChange={(v) => update({ status: v })} disabled={readOnly}>
            <SelectTrigger id="status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUOTE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4">
          <CardTitle className="text-base">产品明细</CardTitle>
          {readOnly ? null : (
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm"><Plus className="size-4" />添加产品</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <Command>
                  <CommandInput placeholder="搜索产品名称或型号" />
                  <CommandList>
                    <CommandEmpty>没有匹配的产品</CommandEmpty>
                    <CommandGroup>
                      {products.map((p) => (
                        <CommandItem key={p.id} value={`${p.name} ${p.sku}`} onSelect={() => addProduct(p)}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{p.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{p.sku}</div>
                          </div>
                          <span className="text-xs tabular-nums">{yuan(p.price)}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {quote.items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">还没有产品。可以在点位图里放置设备后重新生成，或点击「添加产品」。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">产品</TableHead>
                  <TableHead className="text-right">单价</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">小计</TableHead>
                  {readOnly ? null : <TableHead className="w-10 pr-4" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.items.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell className="pl-6">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{[l.sku, l.unit && `单位：${l.unit}`].filter(Boolean).join(' · ')}</div>
                    </TableCell>
                    <TableCell className="text-right">{numInput(l.price, (n) => updateLine(l.key, { price: n }), `${l.name} 单价`, 'ml-auto w-28')}</TableCell>
                    <TableCell key={`q-${l.rev ?? 0}`} className="text-right">{numInput(l.quantity, (n) => updateLine(l.key, { quantity: n }), `${l.name} 数量`, 'ml-auto w-20')}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{yuan(l.price * l.quantity)}</TableCell>
                    {readOnly ? null : (
                      <TableCell className="pr-4">
                        <Button variant="ghost" size="icon-sm" aria-label={`删除 ${l.name}`} onClick={() => update({ items: quote.items.filter((x) => x.key !== l.key) })}>
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-6" colSpan={3}>产品小计</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{yuan(totals.productTotal)}</TableCell>
                  {readOnly ? null : <TableCell />}
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">附加费用</CardTitle>
            {readOnly ? null : (
              <Button variant="outline" size="sm" onClick={() => update({ fees: [...quote.fees, { key: crypto.randomUUID(), name: quote.fees.length ? '' : '安装调试费', amount: 0 }] })}>
                <Plus className="size-4" />添加费用
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {quote.fees.length === 0 ? <p className="text-sm text-muted-foreground">如安装调试费、布线费、上门费等</p> : null}
            {quote.fees.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <Input value={f.name} placeholder="费用名称" aria-label="费用名称" className="h-8" disabled={readOnly} onChange={(e) => updateFee(f.key, { name: e.target.value })} />
                {numInput(f.amount, (n) => updateFee(f.key, { amount: n }), `${f.name || '费用'} 金额`, 'w-28')}
                {readOnly ? null : (
                  <Button variant="ghost" size="icon-sm" aria-label="删除费用" onClick={() => update({ fees: quote.fees.filter((x) => x.key !== f.key) })}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">合计</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">产品小计</span><span className="tabular-nums">{yuan(totals.productTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">附加费用</span><span className="tabular-nums">{yuan(totals.feeTotal)}</span></div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">优惠</span>
              {numInput(quote.discount, (n) => update({ discount: n }), '优惠金额', 'w-28')}
            </div>
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">报价总额</span>
              <span className="text-2xl font-bold tabular-nums">{yuan(totals.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">备注（会打印在报价单上）</Label>
        <Textarea id="notes" rows={3} value={quote.notes} disabled={readOnly} placeholder="例如：报价有效期 30 天；含一年免费上门维护" onChange={(e) => update({ notes: e.target.value })} />
      </div>
    </section>
  )
}
