'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import { quoteStatusLabel, yuan } from '@/lib/quotes'

import { createContract, type ContractInput } from './actions'

export type QuoteOption = { id: string; title: string; total: number; status: string }
export type ContractValues = Omit<ContractInput, 'payments'> & {
  id: string
  status: string
  signedAt: string | null
  payments: { name: string; percent: number; received: boolean }[]
}

/** 还没有合同：选一份报价生成。默认选客户已确认的报价，没有则选最新的。 */
export function CreateContractPanel({
  projectId,
  quotes,
  defaultQuoteId,
}: {
  projectId: string
  quotes: QuoteOption[]
  defaultQuoteId: string
}) {
  const router = useRouter()
  const [quoteId, setQuoteId] = useState(defaultQuoteId)
  const [pending, startTransition] = useTransition()
  return (
    <div className="rounded-[var(--radius-container)] bg-card shadow-xs ring-1 ring-border">
      <div className="border-b px-5 py-4">
        <h3 className="text-base font-semibold">选择报价生成合同</h3>
        <p className="text-sm text-muted-foreground">
          自动带入报价金额、客户资料与默认条款，生成后可修改。
        </p>
      </div>
      <div role="radiogroup" aria-label="合同依据的报价" className="divide-y">
        {quotes.map((q) => (
          <label
            key={q.id}
            className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 has-[:checked]:bg-muted/60"
          >
            <input
              type="radio"
              name="quote"
              value={q.id}
              checked={quoteId === q.id}
              onChange={() => setQuoteId(q.id)}
              className="size-4 accent-foreground"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{q.title}</span>
              <span className="text-xs text-muted-foreground">{quoteStatusLabel(q.status)}</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">{yuan(q.total)}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end border-t px-5 py-4">
        <Button
          isDisabled={pending || !quoteId}
          onClick={() =>
            startTransition(async () => {
              const result = await createContract(projectId, quoteId)
              if (!result.ok) return void toast.error(result.error)
              toast.success('合同已生成，请核对内容')
              router.refresh()
            })
          }
          icon={<Loader2 />}
          label="生成合同"
        />
      </div>
    </div>
  )
}
