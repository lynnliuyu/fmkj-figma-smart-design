'use client'

import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'

/** 放在 <Link> 内部：点击后到页面返回之前显示转圈，避免“点了没反应”。 */
export function LinkPending({ className = 'size-3.5' }: { className?: string }) {
  const { pending } = useLinkStatus()
  return pending ? <Loader2 aria-hidden className={`${className} animate-spin`} /> : null
}
