import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { BrandLogo } from '@/components/landing/landing-chrome'
import { appAuth, previewDemoEnabled } from '@/lib/app-auth'
import { APP_NAME, COMPANY_NAME, pageTitle } from '@/lib/brand'
import { emailOtpConfigured } from '@/lib/email-otp'
import { qrLoginAvailable } from '@/lib/mp/auth'
import { safeRedirectPath } from '@/lib/safe-redirect'

import { LoginForm } from './login-form'

export const metadata = { title: pageTitle('登录') }

/** 登录页：只做一件事。介绍和演示在首页，这里只放标识、表单和回到首页的入口。 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; switch?: string; mode?: string; code?: string }>
}) {
  const { from, switch: switchAccount, mode, code } = await searchParams
  const redirectTo = safeRedirectPath(from, '/projects')
  if (!switchAccount && mode !== 'register' && (await appAuth.getCurrentUser()))
    redirect(redirectTo)
  const previewDemo = previewDemoEnabled()
  const initialMode = mode === 'register' ? 'register' : 'login'
  const initialCode = typeof code === 'string' ? code.trim().toUpperCase().slice(0, 40) : ''

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label={`${APP_NAME} 首页`} className="rounded-md">
          <BrandLogo className="h-8 w-auto" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          返回首页
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-20 sm:px-6">
        <div className="w-full max-w-sm">
          <LoginForm
            redirectTo={redirectTo}
            qrAvailable={qrLoginAvailable()}
            otpRequired={emailOtpConfigured()}
            previewDemo={previewDemo}
            initialMode={initialMode}
            initialCode={initialCode}
          />
        </div>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {COMPANY_NAME}
      </footer>
    </div>
  )
}
