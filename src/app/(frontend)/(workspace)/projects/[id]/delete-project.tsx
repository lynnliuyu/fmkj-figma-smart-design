'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import { deleteProject } from '../actions'

/** 项目信息页底部的「删除项目」：二次确认后删除项目及其报价单、未签合同。 */
export function DeleteProject({
  projectId,
  projectName,
  quoteCount,
}: {
  projectId: string
  projectName: string
  quoteCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const confirm = () =>
    start(async () => {
      setError('')
      const res = await deleteProject(projectId)
      if (!res.ok) return setError(res.error)
      setOpen(false)
      toast.success('项目已删除')
      router.push('/projects')
      router.refresh()
    })

  return (
    <section
      aria-labelledby="danger-title"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 px-5 py-4"
    >
      <div className="min-w-0">
        <p id="danger-title" className="text-sm font-medium">
          删除项目
        </p>
        <p className="text-xs text-muted-foreground">
          删除后点位图、报价单和未签合同都会一并删除，无法恢复。不再跟进的项目也可以选择归档。
        </p>
      </div>
      <Dialog open={open} onOpenChange={(v) => (setOpen(v), setError(''))}>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="text-destructive-strong hover:text-destructive-strong"
            icon={<Trash2 />}
            label="删除项目"
          />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除「{projectName}」？</DialogTitle>
            <DialogDescription>
              将同时删除这个项目的点位图{quoteCount ? `、${quoteCount} 份报价单` : ''}
              和未签合同。删除后无法恢复。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" isDisabled={pending} label="取消" />
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirm}
              isDisabled={pending}
              icon={<Loader2 />}
              label="确认删除"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
