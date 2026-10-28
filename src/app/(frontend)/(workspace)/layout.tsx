import Link from 'next/link'
import { redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  manager: '经理',
  designer: '设计师',
  sales: '销售',
  viewer: '只读',
}

const NAV = [
  { href: '/products', label: '产品库' },
  { href: '/projects', label: '项目工作台', soon: true },
  { href: '/quotes', label: '报价', soon: true },
]

/** 需要员工登录的系统页面。 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
          <Link href="/products" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">FM</span>
            <span className="text-sm font-semibold">繁梦空间</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) =>
              item.soon ? (
                <span key={item.href} className="cursor-not-allowed rounded-md px-3 py-1.5 text-zinc-400" title="即将上线">
                  {item.label}
                </span>
              ) : (
                <Link key={item.href} href={item.href} className="rounded-md px-3 py-1.5 font-medium text-zinc-900 hover:bg-zinc-100">
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-zinc-500">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <form action="/auth/logout" method="post">
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100">退出</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
