'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { hasLeaveGuard, runLeaveGuard } from '@/lib/leave-guard'

/** 普通链接；当前页面有未保存修改时，先执行保存守卫再跳转。 */
export function GuardedLink({
  href,
  onClick,
  ...props
}: React.ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter()
  return (
    <Link
      href={href}
      {...props}
      onClick={(e) => {
        onClick?.(e)
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          !hasLeaveGuard()
        )
          return
        e.preventDefault()
        void runLeaveGuard().then((ok) => {
          if (ok) router.push(href)
        })
      }}
    />
  )
}
