'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'

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
      variant={archived || !primary ? 'secondary' : 'primary'}
      isDisabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setProjectArchived(projectId, !archived)
          if (!result.ok) return void toast.error(result.error)
          toast.success(archived ? '项目已恢复为进行中' : '项目已归档')
          router.refresh()
        })
      }
      icon={<Loader2 />}
      endContent={<Archive />}
      label="操作"
    />
  )
}
