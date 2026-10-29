import { ShieldCheck } from 'lucide-react'
import { redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'

import { LoginForm } from './login-form'

export const metadata = { title: '登录 · FMKJ 项目管理' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  if (await appAuth.getCurrentUser()) redirect('/projects')
  const { from } = await searchParams
  const redirectTo = from?.startsWith('/') && !from.startsWith('//') ? from : '/projects'

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="hidden border-r bg-muted/40 p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="leading-none font-semibold">FMKJ</p>
            <p className="mt-1 text-xs text-muted-foreground">项目运营后台</p>
          </div>
        </div>
        <div className="max-w-xl space-y-5">
          <p className="text-3xl font-semibold tracking-normal">项目、产品、报价和交付记录统一管理</p>
          <p className="text-base leading-7 text-muted-foreground">登录后可以查看项目流程、产品库、方案报价、附件和团队权限。</p>
        </div>
      </div>
      <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck className="size-5" />
              </div>
              <span className="text-lg font-semibold">FMKJ</span>
            </div>
          </div>
          <LoginForm redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  )
}
