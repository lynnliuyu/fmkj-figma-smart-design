import { redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'

import { LoginForm } from './login-form'

export const metadata = { title: '登录 · 繁梦空间' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  if (await appAuth.getCurrentUser()) redirect('/products')
  const { from } = await searchParams
  const redirectTo = from?.startsWith('/') && !from.startsWith('//') ? from : '/products'

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white text-sm font-bold text-zinc-950">FM</div>
          <div>
            <p className="font-semibold">繁梦空间</p>
            <p className="text-xs text-zinc-400">智能家居项目管理与方案报价</p>
          </div>
        </div>
        <div className="relative max-w-md space-y-4">
          <p className="text-3xl leading-snug font-semibold">项目、点位、产品与报价，在一个工作台里完成</p>
          <p className="text-sm leading-6 text-zinc-400">登录后查看产品库、维护方案并输出客户报价。</p>
        </div>
        <p className="relative text-xs text-zinc-500">FMKJ V4</p>
      </section>

      <section className="flex items-center justify-center bg-zinc-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">登录工作台</h1>
          <p className="mt-2 text-sm text-zinc-500">使用管理员为你开通的员工账号登录</p>
          <LoginForm redirectTo={redirectTo} />
        </div>
      </section>
    </main>
  )
}
