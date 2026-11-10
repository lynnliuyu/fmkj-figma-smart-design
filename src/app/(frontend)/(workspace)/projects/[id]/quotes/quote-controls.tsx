'use client'

import { useEffect, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { FilePlus2, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { POINT_SCOPES } from '@/lib/point-scopes'

import { createQuoteFromProject, deleteQuote } from './actions'

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      isDisabled={pending}
      icon={<Loader2 />}
      endContent={<FilePlus2 />}
      label="操作"
    />
  )
}

/** 从点位图生成报价：可选统计范围（全部 / 不含灯具 / 仅开关 …）；没有点位时生成空白报价。 */
export function GenerateQuoteForm({
  projectId,
  hasPoints,
}: {
  projectId: string
  hasPoints: boolean
}) {
  return (
    <form action={createQuoteFromProject} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      {hasPoints ? (
        <>
          <Select name="scope" defaultValue="all">
            <SelectTrigger className="w-36" aria-label="统计范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POINT_SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.fullLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SubmitButton>从点位图生成报价</SubmitButton>
        </>
      ) : (
        <SubmitButton>新建空白报价</SubmitButton>
      )}
    </form>
  )
}

/** 删除报价：点一次变成「确认删除」，3 秒内再点才删除，不弹窗。 */
export function DeleteQuoteButton({ quoteId, title }: { quoteId: string; title: string }) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <Button
      type="button"
      variant={armed ? 'destructive' : 'ghost'}
      size="sm"
      isDisabled={pending}
      label="删除"
      className="relative z-10"
      onClick={() => {
        if (!armed) return setArmed(true)
        startTransition(async () => {
          const result = await deleteQuote(quoteId)
          if (!result.ok) {
            toast.error(result.error)
            setArmed(false)
            return
          }
          toast.success(`已删除「${title}」`)
          router.refresh()
        })
      }}
      icon={<Loader2 />}
      endContent={<Trash2 />}
    />
  )
}
