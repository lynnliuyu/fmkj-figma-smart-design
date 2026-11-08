'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { setProjectArchived } from './actions'

export function ArchiveButton({
  projectId,
  archived,
  primary,
}: {
  projectId: string
  archived: boolean
  primary: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant={archived || !primary ? 'outline' : 'default'}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setProjectArchived(projectId, !archived)
          if (!result.ok) return void toast.error(result.error)
          toast.success(archived ? '项目已恢复为进行中' : '项目已归档')
          router.refresh()
        })
      }
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : archived ? (
        <ArchiveRestore className="size-4" />
      ) : (
        <Archive className="size-4" />
      )}
      {archived ? '恢复项目' : '归档项目'}
    </Button>
  )
}
