'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Coins, Gift, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/** 兑换码充值弹窗：不再有会员等级卡片，只保留「输入兑换码充值 AI 积分」 */
export function MembershipDialog({
  open,
  onOpenChange,
  credits,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  credits: number
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      toast.error('请输入兑换码')
      return
    }
    setPending(true)
    try {
      const res = await fetch('/membership/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        error?: string
      }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? '兑换失败，请检查兑换码')
        return
      }
      toast.success(data.message ?? '兑换成功')
      setCode('')
      router.refresh()
    } catch {
      toast.error('网络错误，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="text-lg font-semibold">兑换码充值 AI 积分</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                全站功能统一按 AI 积分计费，输入兑换码即可充值积分
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border bg-muted/40 px-3 py-1.5 text-xs">
              <Coins className="size-3.5 text-primary" />
              <span className="font-medium tabular-nums">
                {credits.toLocaleString('zh-CN')} 积分
              </span>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleRedeem} className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="输入兑换码（如 FMKJ-XXXX-XXXX）"
            aria-label="兑换码"
            maxLength={40}
            disabled={pending}
            className="font-mono tracking-wider uppercase"
          />
          <Button
            type="submit"
            isDisabled={pending}
            className="shrink-0"
            icon={<Loader2 />}
            label="立即兑换"
          />
        </form>

        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-xs text-muted-foreground hover:text-foreground"
          href="/membership"
          as={Link}
          icon={<ArrowRight />}
          label="查看积分任务与明细"
        />
      </DialogContent>
    </Dialog>
  )
}
