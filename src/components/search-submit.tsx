'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'

/** next/form 搜索按钮：提交后到结果返回之前显示加载状态。 */
export function SearchSubmit({ variant = 'secondary' }: { variant?: 'secondary' | 'primary' }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} isDisabled={pending} icon={<Loader2 />} label="搜索" />
  )
}
