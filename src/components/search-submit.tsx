'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** next/form 搜索按钮：提交后到结果返回之前显示加载状态。 */
export function SearchSubmit({ variant = 'outline' }: { variant?: 'outline' | 'default' }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}搜索
    </Button>
  )
}
