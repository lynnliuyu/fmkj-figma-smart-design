import Link from 'next/link'

import { BrandMark } from '@/components/brand/brand-mark'
import { Button } from '@astryxdesign/core/Button'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <BrandMark className="size-12" />
      <h1 className="mt-8 text-3xl font-medium tracking-tight">页面不存在或无权访问</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        你访问的项目、报价或页面可能已被删除，或当前账号没有访问权限（错误代码 404）。
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          className="h-10 rounded-full bg-foreground px-5 text-background hover:bg-foreground/85"
          href="/projects"
          label="返回项目列表"
        />
        <Button variant="secondary" className="h-10 rounded-full px-5" href="/" label="返回首页" />
      </div>
    </main>
  )
}
