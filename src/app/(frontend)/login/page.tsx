import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@astryxdesign/core/Card'
import { VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'

import { BrandLogo } from '@/components/landing/landing-chrome'
import { appAuth, previewDemoEnabled } from '@/lib/app-auth'
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, COMPANY_NAME, pageTitle } from '@/lib/brand'
import { emailOtpConfigured } from '@/lib/email-otp'
import { qrLoginAvailable } from '@/lib/mp/auth'
import { safeRedirectPath } from '@/lib/safe-redirect'

import { LoginForm } from './login-form'

export const metadata = { title: pageTitle('登录') }

/**
 * 登录页：只做一件事。介绍和演示在首页，这里只放标识、表单和回到首页的入口。
 *
 * 外壳（Astryx 风格）：宽屏左右分栏 —— 左品牌区（品牌标识 + 品牌语 + 品牌紫氛围），
 * 右表单区；窄屏堆叠，且表单排在品牌区之前（先能用，再谈氛围）。
 * 认证逻辑全部在 login-form.tsx，这里不碰。
 */
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
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6 lg:px-10">
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

      {/* order-1/order-2：窄屏表单在前、品牌区在后；lg 起对调成左品牌 / 右表单 */}
      <main className="flex flex-1 flex-col lg:flex-row">
        <div className="order-1 flex items-center justify-center px-4 pt-4 pb-10 sm:px-6 lg:order-2 lg:w-1/2 lg:px-10 lg:py-12">
          <Card width="100%" maxWidth={420} padding={6} elevation="low">
            <LoginForm
              redirectTo={redirectTo}
              qrAvailable={qrLoginAvailable()}
              otpRequired={emailOtpConfigured()}
              previewDemo={previewDemo}
              initialMode={initialMode}
              initialCode={initialCode}
            />
          </Card>
        </div>

        {/* 品牌区：纯装饰 + APP_* 文案，窄屏堆叠在表单之后 */}
        <aside
          aria-hidden
          className="relative order-2 flex items-center overflow-hidden border-t border-border/60 px-4 py-10 sm:px-6 lg:order-1 lg:w-1/2 lg:border-t-0 lg:border-r lg:px-12 lg:py-16 bg-linear-to-br from-muted via-background to-accent dark:from-card dark:via-background dark:to-accent/60"
        >
          {/* 品牌紫光斑（纯装饰，overflow-hidden 保证不产生横向滚动） */}
          <div className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-accent/20 blur-3xl dark:bg-accent/25" />
          <div className="pointer-events-none absolute -right-10 -bottom-28 size-80 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />

          <VStack gap={5} width="100%" maxWidth={440} hAlign="start" className="relative">
            <Text type="label" color="accent" className="uppercase tracking-[0.2em]">
              {APP_NAME}
            </Text>
            <Heading level={2} type="display-2" color="accent">
              {APP_TAGLINE}
            </Heading>
            <Text type="large" className="max-w-[42ch]">
              {APP_DESCRIPTION}
            </Text>
          </VStack>
        </aside>
      </main>

      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {COMPANY_NAME}
      </footer>
    </div>
  )
}
