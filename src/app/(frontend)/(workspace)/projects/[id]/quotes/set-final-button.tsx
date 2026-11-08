'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { setDeliverables } from '../archive/actions'

/** 把这份报价设为定稿：交付资料包、方案默认都用它 */
export function SetFinalQuoteButton({
  projectId,
  quoteId,
}: {
  projectId: string
  quoteId: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="ghost"
      size="xs"
      className="relative z-10 text-muted-foreground"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setDeliverables(projectId, { finalQuote: quoteId })
          if (!res.ok) return void toast.error(res.error)
          toast.success('已设为定稿报价，交付资料包和方案默认使用这一份')
          router.refresh()
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <BadgeCheck className="size-3.5" />
      )}
      设为定稿
    </Button>
  )
}
