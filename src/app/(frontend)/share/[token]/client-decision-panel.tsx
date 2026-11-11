'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, PenLine, Send } from 'lucide-react'

import { money, SectionHeader } from '@/components/landing/section'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Checkbox } from '@/components/ui/checkbox'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { submitIntent } from './actions'
import { SignaturePad } from './signature-pad'

export type CompareLine = {
  itemId: string
  category: string
  categoryName: string
  name: string
  sku: string
  unit: string
  qty: number
  amount: number
  brandName: string | null
}
export type CompareQuote = {
  id: string
  title: string
  total: number
  productTotal: number
  feeTotal: number
  discount: number
  isMain: boolean
  lines: CompareLine[]
}

type Done = {
  intentTotal: number
  deferredCount: number
  title: string
  decision: 'confirm' | 'revise'
}

/**
 * 业主分享页：多套方案同屏对比（按设备类别看数量与差价）+ 勾选「暂缓」的设备 + 手写签名确认意向。
 * 提交的是意向反馈，不会改动设计师的原报价。
 */
export function ClientDecisionPanel({
  shareToken,
  quotes,
  companyName,
  defaultName,
  canSubmit,
}: {
  shareToken: string
  quotes: CompareQuote[]
  companyName: string
  defaultName: string
  canSubmit: boolean
}) {
  const initial = quotes.find((q) => q.isMain) ?? quotes[0]
  const [selectedId, setSelectedId] = useState(initial?.id ?? '')
  const [deferred, setDeferred] = useState<Record<string, Set<string>>>({})
  const [decision, setDecision] = useState<'confirm' | 'revise'>('confirm')
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = quotes.find((q) => q.id === selectedId) ?? initial
  const cheapest = Math.min(...quotes.map((q) => q.total))
  const deferredSet = (selected && deferred[selected.id]) || new Set<string>()
  const deferredAmount = selected
    ? selected.lines.filter((l) => deferredSet.has(l.itemId)).reduce((s, l) => s + l.amount, 0)
    : 0
  const intentTotal = Math.max(0, (selected?.total ?? 0) - deferredAmount)

  // 对比表：按设备类别汇总每套方案的数量与金额
  const categories = useMemo(() => {
    const order: { key: string; name: string }[] = []
    for (const q of quotes)
      for (const l of q.lines)
        if (!order.some((c) => c.key === l.category))
          order.push({ key: l.category, name: l.categoryName })
    return order.map((c) => ({
      ...c,
      cells: quotes.map((q) => {
        const ls = q.lines.filter((l) => l.category === c.key)
        return {
          qty: ls.reduce((s, l) => s + l.qty, 0),
          amount: ls.reduce((s, l) => s + l.amount, 0),
        }
      }),
    }))
  }, [quotes])

  if (!selected) return null

  const toggleLine = (itemId: string) =>
    setDeferred((d) => {
      const next = new Set(d[selected.id] ?? [])
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return { ...d, [selected.id]: next }
    })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const res = await submitIntent(shareToken, {
        quoteId: selected.id,
        deferredItemIds: [...deferredSet],
        decision,
        customerName: name,
        customerPhone: phone,
        message,
        signature,
        agree,
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        setFormError(res.error)
        return
      }
      setErrors({})
      setDone({
        intentTotal: res.intentTotal,
        deferredCount: res.deferredCount,
        title: selected.title,
        decision,
      })
    })
  }

  return (
    <section
      id="decide"
      aria-labelledby="decide-title"
      className="px-4 pt-20 sm:px-6 sm:pt-28 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          id="decide-title"
          title={
            quotes.length > 1
              ? `${quotes.length} 套方案，选出最适合您家的那一套`
              : '确认您的意向方案'
          }
        >
          {quotes.length > 1 ? '对比各方案的配置差异与差价，' : ''}
          把暂时不需要的设备标记为「暂缓」，签名后提交给设计师。这是购买意向，不是正式合同，设计师会据此为您调整方案。
        </SectionHeader>

        {quotes.length > 1 ? (
          <>
            <div
              role="tablist"
              aria-label="选择方案"
              className={cn(
                'mt-10 grid gap-3',
                quotes.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
                quotes.length === 4 && 'lg:grid-cols-4',
              )}
            >
              {quotes.map((q) => {
                const active = q.id === selected.id
                const diff = q.total - cheapest
                return (
                  <button
                    key={q.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(q.id)}
                    className={cn(
                      'rounded-2xl border p-5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'bg-card hover:border-foreground/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{q.title}</span>
                      {q.isMain ? (
                        <Badge variant={active ? 'neutral' : 'neutral'} label={'设计师推荐'} />
                      ) : null}
                    </div>
                    <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">
                      {money(q.total)}
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        active ? 'text-background/70' : 'text-muted-foreground',
                      )}
                    >
                      {q.lines.length} 项设备 ·{' '}
                      {diff > 0 ? `比最低方案多 ${money(diff)}` : '价格最低'}
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <caption className="sr-only">各方案按设备类别的数量与金额对比</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">
                      设备类别
                    </th>
                    {quotes.map((q) => (
                      <th
                        key={q.id}
                        scope="col"
                        className={cn(
                          'px-4 py-3 text-right font-medium',
                          q.id === selected.id && 'bg-muted/60 text-foreground',
                        )}
                      >
                        {q.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => {
                    const differs =
                      new Set(c.cells.map((x) => `${x.qty}:${Math.round(x.amount)}`)).size > 1
                    return (
                      <tr key={c.key} className="border-b last:border-b-0">
                        <th scope="row" className="px-5 py-2.5 text-left font-normal">
                          {c.name}
                          {differs ? (
                            <span className="ml-1.5 text-xs text-warning">有差异</span>
                          ) : null}
                        </th>
                        {c.cells.map((cell, i) => (
                          <td
                            key={quotes[i].id}
                            className={cn(
                              'px-4 py-2.5 text-right tabular-nums',
                              quotes[i].id === selected.id && 'bg-muted/60',
                              !cell.qty && 'text-muted-foreground',
                            )}
                          >
                            {cell.qty ? (
                              <>
                                <span className={cn(differs && 'font-medium')}>
                                  {money(cell.amount)}
                                </span>
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  ×{cell.qty}
                                </span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                  <tr className="border-t bg-muted/30 font-medium">
                    <th scope="row" className="px-5 py-3 text-left">
                      合计（含服务费与优惠）
                    </th>
                    {quotes.map((q) => (
                      <td
                        key={q.id}
                        className={cn(
                          'px-4 py-3 text-right tabular-nums',
                          q.id === selected.id && 'bg-muted/60',
                        )}
                      >
                        {money(q.total)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
              <span className="font-medium">{selected.title} · 设备清单</span>
              <span className="text-xs text-muted-foreground">
                {done ? '已提交' : '取消勾选 = 暂缓这项设备'}
              </span>
            </div>
            <ul className="max-h-[32rem] divide-y overflow-y-auto">
              {selected.lines.map((l) => {
                const off = deferredSet.has(l.itemId)
                return (
                  <li key={l.itemId}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40',
                        (done || !canSubmit) && 'cursor-default',
                      )}
                    >
                      <Checkbox
                        checked={!off}
                        disabled={Boolean(done) || !canSubmit}
                        onCheckedChange={() => toggleLine(l.itemId)}
                        aria-label={`${off ? '恢复' : '暂缓'}：${l.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            off && 'text-muted-foreground line-through',
                          )}
                        >
                          {l.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[l.categoryName, l.brandName, `${l.qty}${l.unit}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {off ? <Badge variant="warning" label={'暂缓'} /> : null}
                      <span
                        className={cn(
                          'w-20 text-right text-sm tabular-nums',
                          off && 'text-muted-foreground line-through',
                        )}
                      >
                        {money(l.amount)}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {selected.feeTotal || selected.discount ? (
              <div className="space-y-1 border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
                {selected.feeTotal ? (
                  <p className="flex justify-between">
                    <span>安装调试等服务费</span>
                    <span className="tabular-nums">{money(selected.feeTotal)}</span>
                  </p>
                ) : null}
                {selected.discount ? (
                  <p className="flex justify-between">
                    <span>优惠</span>
                    <span className="tabular-nums">−{money(selected.discount)}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {done ? (
            <div className="rounded-2xl border bg-card p-6 lg:sticky lg:top-24">
              <CheckCircle2 className="size-8 text-success" />
              <h3 className="mt-3 text-lg font-semibold">已提交给 {companyName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {done.decision === 'confirm'
                  ? '感谢确认！设计师会尽快与您联系，安排后续签约与施工。'
                  : '已收到您的调整意见，设计师会据此修改方案后再发给您。'}
              </p>
              <dl className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">意向方案</dt>
                  <dd className="text-right font-medium">{done.title}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">暂缓设备</dt>
                  <dd>{done.deferredCount} 项</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">意向合计</dt>
                  <dd className="font-semibold tabular-nums">{money(done.intentTotal)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <form
              onSubmit={submit}
              noValidate
              className="rounded-2xl border bg-card p-5 lg:sticky lg:top-24"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">意向合计</span>
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {money(intentTotal)}
                </span>
              </div>
              {deferredAmount > 0 ? (
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  原价 <span className="line-through">{money(selected.total)}</span> · 暂缓{' '}
                  {deferredSet.size} 项，减少 {money(deferredAmount)}
                </p>
              ) : null}

              <fieldset className="mt-5" disabled={!canSubmit || pending}>
                <legend className="sr-only">您的意向</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['confirm', '确认这套方案'],
                      ['revise', '希望再调整'],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={decision === v}
                      onClick={() => setDecision(v)}
                      className={cn(
                        'h-10 rounded-xl border text-sm font-medium transition-colors',
                        decision === v
                          ? 'border-foreground bg-foreground text-background'
                          : 'hover:border-foreground/40',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="fb-name">您的称呼</Label>
                    <TextInput
                      label={'例如：王先生'}
                      isLabelHidden
                      id="fb-name"
                      value={name}
                      onChange={(v) => setName(v)}
                      aria-invalid={Boolean(errors.customerName)}
                      placeholder="例如：王先生"
                    />
                    {errors.customerName ? (
                      <p className="text-xs text-destructive-strong">{errors.customerName}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="fb-phone">联系电话（可选）</Label>
                    <TextInput
                      label={'fb-phone'}
                      isLabelHidden
                      id="fb-phone"
                      value={phone}
                      inputMode="tel"
                      onChange={(v) => setPhone(v)}
                      aria-invalid={Boolean(errors.customerPhone)}
                    />
                    {errors.customerPhone ? (
                      <p className="text-xs text-destructive-strong">{errors.customerPhone}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="fb-message">
                      {decision === 'revise' ? '希望调整的地方' : '给设计师的留言（可选）'}
                    </Label>
                    <Textarea
                      id="fb-message"
                      rows={3}
                      maxLength={1000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      aria-invalid={Boolean(errors.message)}
                      placeholder={
                        decision === 'revise'
                          ? '例如：客厅想换成无主灯方案，主卧窗帘改双轨'
                          : '例如：希望下周末安排上门复尺'
                      }
                    />
                    {errors.message ? (
                      <p className="text-xs text-destructive-strong">{errors.message}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="flex items-center gap-1.5">
                      <PenLine className="size-3.5" />
                      手写签名{decision === 'revise' ? '（可选）' : ''}
                    </Label>
                    <SignaturePad onChange={setSignature} invalid={Boolean(errors.signature)} />
                    {errors.signature ? (
                      <p className="text-xs text-destructive-strong">{errors.signature}</p>
                    ) : null}
                  </div>
                  <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Checkbox
                      checked={agree}
                      onCheckedChange={(v) => setAgree(v === true)}
                      className="mt-0.5"
                      aria-invalid={Boolean(errors.agree)}
                    />
                    <span>
                      我已查看方案内容。以上为购买意向，最终价格与配置以双方签订的合同为准。
                    </span>
                  </label>
                  {errors.agree ? (
                    <p className="-mt-1 text-xs text-destructive-strong">{errors.agree}</p>
                  ) : null}
                </div>
              </fieldset>

              {formError && !Object.keys(errors).length ? (
                <p
                  role="alert"
                  className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive-strong"
                >
                  {formError}
                </p>
              ) : null}
              <Button
                type="submit"
                className="mt-4 w-full"
                isDisabled={!canSubmit || pending}
                icon={<Loader2 />}
                endContent={<Send />}
                label={
                  canSubmit
                    ? decision === 'confirm'
                      ? '签名确认意向'
                      : '提交调整意见'
                    : '演示链接不能提交'
                }
              />
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
