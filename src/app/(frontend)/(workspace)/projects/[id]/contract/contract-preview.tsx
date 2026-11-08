'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSignature,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ContractEditSection } from '@/documents/contract-document'
import {
  DEFAULT_CONTRACT_TERMS,
  paymentAmounts,
  paymentPercentTotal,
  rmbUpper,
  shanghaiDate,
} from '@/lib/contracts'
import { yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'

import { deleteContract, saveContract, setContractStatus } from './actions'
import type { ContractValues, QuoteOption } from './contract-editor'

type Draft = Omit<ContractValues, 'payments'> & {
  payments: { key: string; name: string; percent: number; received: boolean }[]
}

const SECTION: Record<ContractEditSection, { title: string; description: string }> = {
  number: { title: '合同编号', description: '显示在合同页眉、页脚与导出文件名里。' },
  parties: {
    title: '甲方信息',
    description: '甲方（客户）的姓名、电话和施工地址。乙方信息来自「设置 → 报价单与合同抬头」。',
  },
  amount: {
    title: '金额、工期与质保',
    description: '合同金额以这里为准；更换依据报价会带入该报价的金额。',
  },
  payments: { title: '付款方式', description: '分期名称与比例，金额按合同金额自动计算。' },
  terms: { title: '其他约定', description: '写进合同「其他约定」一条，按行分段。' },
}

const toNum = (v: string) => (v.trim() === '' ? NaN : Number(v))
const toDraft = (v: ContractValues): Draft => ({
  ...v,
  payments: v.payments.map((p) => ({ ...p, key: crypto.randomUUID() })),
})

/**
 * 合同预览里某一部分的「编辑」入口：只打开这一部分的字段，保存后刷新预览。
 * 合同签订后只能登记收款（服务端同样只接受收款状态的修改）。
 */
export function ContractSectionEdit({
  section,
  values,
  quotes,
  signed,
}: {
  section: ContractEditSection
  values: ContractValues
  quotes: QuoteOption[]
  signed: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(values))
  const [pending, startTransition] = useTransition()
  const meta = SECTION[section]
  const receiptOnly = signed && section === 'payments'
  const title = receiptOnly ? '登记收款' : `编辑${meta.title}`

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setPayment = (key: string, patch: Partial<Draft['payments'][number]>) =>
    setDraft((d) => ({
      ...d,
      payments: d.payments.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    }))
  const amounts = useMemo(
    () => paymentAmounts(draft.amount || 0, draft.payments),
    [draft.amount, draft.payments],
  )
  const percentTotal = paymentPercentTotal(draft.payments)
  const selectedQuote = quotes.find((q) => q.id === draft.quoteId)

  const save = () =>
    startTransition(async () => {
      const result = await saveContract(draft.id, {
        number: draft.number,
        quoteId: draft.quoteId,
        amount: draft.amount,
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        address: draft.address,
        durationDays: draft.durationDays,
        warrantyMonths: draft.warrantyMonths,
        terms: draft.terms,
        payments: draft.payments.map(({ key: _key, ...p }) => p),
      })
      if (!result.ok) return void toast.error(result.error)
      toast.success(receiptOnly ? '收款状态已更新' : `${meta.title}已更新`)
      setOpen(false)
      router.refresh()
    })

  const text = (
    id: 'number' | 'customerName' | 'customerPhone' | 'address',
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`contract-${id}`}>{label}</Label>
      <Input
        id={`contract-${id}`}
        value={draft[id] ?? ''}
        onChange={(e) => set({ [id]: e.target.value })}
        {...props}
      />
    </div>
  )
  const int = (id: 'durationDays' | 'warrantyMonths', label: string, unit: string, max: number) => (
    <div className="grid gap-2">
      <Label htmlFor={`contract-${id}`}>{label}</Label>
      <div className="relative">
        <Input
          id={`contract-${id}`}
          type="number"
          min={0}
          max={max}
          inputMode="numeric"
          value={draft[id] ?? ''}
          className="pr-12 tabular-nums"
          onChange={(e) => {
            const n = toNum(e.target.value)
            set({ [id]: Number.isFinite(n) ? Math.round(n) : null })
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  )

  const fields = () => {
    switch (section) {
      case 'number':
        return text('number', '合同编号', { maxLength: 40, className: 'font-mono' })
      case 'parties':
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {text('customerName', '甲方（客户）', { maxLength: 60, autoComplete: 'off' })}
              {text('customerPhone', '甲方电话', {
                maxLength: 30,
                inputMode: 'tel',
                autoComplete: 'off',
              })}
            </div>
            {text('address', '施工地址', { maxLength: 200 })}
          </>
        )
      case 'amount':
        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="contract-quote">依据报价</Label>
              <Select
                value={draft.quoteId}
                onValueChange={(v) => {
                  const q = quotes.find((x) => x.id === v)
                  set({ quoteId: v, ...(q ? { amount: q.total } : {}) })
                }}
              >
                <SelectTrigger id="contract-quote" className="w-full min-w-0">
                  <SelectValue className="min-w-0" />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{q.title}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {yuan(q.total)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="contract-amount">合同金额</Label>
                {selectedQuote && Math.abs(selectedQuote.total - (draft.amount || 0)) > 0.001 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="-my-1 text-muted-foreground"
                    onClick={() => set({ amount: selectedQuote.total })}
                  >
                    <RotateCcw className="size-3" />
                    按报价金额 {yuan(selectedQuote.total)}
                  </Button>
                ) : null}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  ¥
                </span>
                <Input
                  id="contract-amount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={Number.isFinite(draft.amount) ? draft.amount : ''}
                  className="pl-7 text-base font-semibold tabular-nums"
                  onChange={(e) => set({ amount: toNum(e.target.value) })}
                />
              </div>
              <p className="text-xs text-muted-foreground">大写：{rmbUpper(draft.amount || 0)}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {int('durationDays', '工期', '天', 365)}
              {int('warrantyMonths', '质保期', '个月', 120)}
            </div>
          </>
        )
      case 'payments':
        return (
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                合同金额{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {yuan(draft.amount || 0)}
                </span>
              </span>
              <span
                className={cn(
                  'tabular-nums',
                  Math.abs(percentTotal - 100) > 0.001 && draft.payments.length
                    ? 'font-medium text-destructive-strong'
                    : undefined,
                )}
              >
                比例合计 {percentTotal}%
              </span>
            </div>
            <ul className="divide-y rounded-lg border">
              {draft.payments.map((p, i) => (
                <li key={p.key} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  {receiptOnly ? (
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.name || `第 ${i + 1} 期`}{' '}
                      <span className="text-muted-foreground tabular-nums">{p.percent}%</span>
                    </span>
                  ) : (
                    <>
                      <Input
                        aria-label={`第 ${i + 1} 期款项名称`}
                        value={p.name}
                        maxLength={40}
                        placeholder="款项名称"
                        className="h-8 min-w-0 flex-1"
                        onChange={(e) => setPayment(p.key, { name: e.target.value })}
                      />
                      <div className="relative w-20 shrink-0">
                        <Input
                          aria-label={`第 ${i + 1} 期比例`}
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={Number.isFinite(p.percent) ? p.percent : ''}
                          className="h-8 pr-6 text-right tabular-nums"
                          onChange={(e) => setPayment(p.key, { percent: toNum(e.target.value) })}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    </>
                  )}
                  <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">
                    {yuan(amounts[i])}
                  </span>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={p.received}
                      onCheckedChange={(c) => setPayment(p.key, { received: c === true })}
                      aria-label={`第 ${i + 1} 期已收款`}
                    />
                    已收
                  </label>
                  {receiptOnly ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      aria-label={`删除第 ${i + 1} 期`}
                      onClick={() =>
                        set({ payments: draft.payments.filter((x) => x.key !== p.key) })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
              {draft.payments.length ? null : (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                  还没有分期，合同里不显示付款表
                </li>
              )}
            </ul>
            {receiptOnly || draft.payments.length >= 6 ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start"
                onClick={() =>
                  set({
                    payments: [
                      ...draft.payments,
                      {
                        key: crypto.randomUUID(),
                        name: '',
                        percent: Math.max(0, Math.round((100 - percentTotal) * 100) / 100),
                        received: false,
                      },
                    ],
                  })
                }
              >
                <Plus className="size-4" />
                添加一期
              </Button>
            )}
          </div>
        )
      case 'terms':
        return (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="contract-terms">约定内容</Label>
              {draft.terms === DEFAULT_CONTRACT_TERMS ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-my-1 text-muted-foreground"
                  onClick={() => set({ terms: DEFAULT_CONTRACT_TERMS })}
                >
                  <RotateCcw className="size-3" />
                  恢复默认条款
                </Button>
              )}
            </div>
            <Textarea
              id="contract-terms"
              rows={10}
              maxLength={5000}
              value={draft.terms}
              onChange={(e) => set({ terms: e.target.value })}
              className="leading-relaxed"
            />
          </div>
        )
    }
  }

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        // 按钮放在白色的合同纸上：用文档自己的纸色和墨色，深色主题下也保持清晰（不跟随应用的深色按钮）
        className="border-doc-rule bg-doc-paper text-doc-ink shadow-sm hover:bg-[color-mix(in_oklch,var(--doc-accent)_8%,var(--doc-paper))] hover:text-doc-accent aria-expanded:bg-doc-paper dark:bg-doc-paper dark:hover:bg-[color-mix(in_oklch,var(--doc-accent)_8%,var(--doc-paper))]"
        onClick={() => {
          setDraft(toDraft(values))
          setOpen(true)
        }}
      >
        <Pencil className="size-3" />
        {receiptOnly ? '登记收款' : '编辑'}
        <span className="sr-only">{meta.title}</span>
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent
          className={section === 'payments' || section === 'terms' ? 'sm:max-w-xl' : 'sm:max-w-md'}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {receiptOnly ? '合同已签订，内容已锁定，只能登记各期是否已收款。' : meta.description}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            {fields()}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 合同顶部的操作：打印 / 导出、标记签订（选签订日期）、撤销签订、删除。 */
export function ContractActions({
  id,
  signed,
  readOnly,
  printHref,
}: {
  id: string
  signed: boolean
  readOnly: boolean
  printHref: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<'sign' | 'unsign' | 'delete' | null>(null)
  const [signOpen, setSignOpen] = useState(false)
  const [signDate, setSignDate] = useState(() => shanghaiDate())
  const [confirmDelete, setConfirmDelete] = useState(false)

  const changeStatus = async (status: 'signed' | 'draft') => {
    if (busy) return
    setBusy(status === 'signed' ? 'sign' : 'unsign')
    try {
      const result = await setContractStatus(id, status, status === 'signed' ? signDate : undefined)
      if (!result.ok) return void toast.error(result.error)
      toast.success(
        status === 'signed' ? '已标记为签订，合同内容已锁定' : '已撤销签订，可以修改合同',
      )
      setSignOpen(false)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    try {
      const result = await deleteContract(id)
      if (!result.ok) return void toast.error(result.error)
      toast.success('合同已删除')
      setConfirmDelete(false)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={printHref} target="_blank" rel="noopener">
          <Printer className="size-4" />
          打印 / 导出 PDF
        </a>
      </Button>
      {readOnly ? null : signed ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void changeStatus('draft')}
        >
          {busy === 'unsign' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Undo2 className="size-4" />
          )}
          撤销签订
        </Button>
      ) : (
        <>
          <Popover open={signOpen} onOpenChange={setSignOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" disabled={busy !== null}>
                <FileSignature className="size-4" />
                标记为已签订
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void changeStatus('signed')
                }}
              >
                <div className="grid gap-1">
                  <p className="text-sm font-medium">标记为已签订</p>
                  <p className="text-xs text-muted-foreground">
                    签订后合同与依据的报价都会锁定，仍可登记收款。
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contract-sign-date">签订日期</Label>
                  <Input
                    id="contract-sign-date"
                    type="date"
                    value={signDate}
                    max={shanghaiDate()}
                    onChange={(e) => setSignDate(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" disabled={busy !== null || !signDate}>
                  {busy === 'sign' ? <Loader2 className="size-4 animate-spin" /> : null}确认签订
                </Button>
              </form>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="更多合同操作"
                disabled={busy !== null}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                删除合同
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog
            open={confirmDelete}
            onOpenChange={(o) => busy !== 'delete' && setConfirmDelete(o)}
          >
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>删除这份合同？</DialogTitle>
                <DialogDescription>
                  合同内容和收款记录会一起删除，之后可以重新从报价生成。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy === 'delete'}
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy === 'delete'}
                  onClick={() => void remove()}
                >
                  {busy === 'delete' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  删除合同
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
