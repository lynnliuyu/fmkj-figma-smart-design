import Link from 'next/link'
import { Button } from '@astryxdesign/core/Button'
import { APP_NAME } from '@/lib/brand'

/** 分享链接过期时的页面：明确告知「已过期」，而不是含糊的 404。 */
export function SharedLinkExpired() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="text-lg font-semibold">这个链接已经过期</div>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        方案链接由 {APP_NAME} 的分享设置控制有效期。请联系对接人重新生成一个链接，
        或直接让他把方案发给你。
      </p>
      <Button variant="secondary" size="sm" href="/" label="返回首页" />
    </div>
  )
}
