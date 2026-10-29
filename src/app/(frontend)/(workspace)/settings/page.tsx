import { redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import type { Media } from '@/payload-types'

import { CompanyForm } from './company-form'

export const metadata = { title: '公司信息 · FMKJ 项目管理' }

export default async function SettingsPage() {
  const user = await appAuth.getCurrentUser()
  if (user?.role !== 'admin') redirect('/projects')
  const payload = await getPayloadClient()
  const settings = await payload.findGlobal({ slug: 'company-settings', depth: 1, user, overrideAccess: false })
  const img = (m: unknown) => (m && typeof m === 'object' ? ((m as Media).url ?? null) : null)

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">公司信息</h1>
        <p className="text-sm text-muted-foreground">显示在报价单抬头和底部，仅管理员可修改</p>
      </header>
      <CompanyForm
        initial={{
          name: settings.name ?? '',
          slogan: settings.slogan ?? '',
          phone: settings.phone ?? '',
          email: settings.email ?? '',
          address: settings.address ?? '',
          qrCaption: settings.qrCaption ?? '',
          quoteNotes: settings.quoteNotes ?? '',
          printProductImages: settings.printProductImages !== false,
          logoUrl: img(settings.logo),
          qrCodeUrl: img(settings.qrCode),
        }}
      />
    </section>
  )
}
