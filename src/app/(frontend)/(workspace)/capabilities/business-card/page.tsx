import type { Metadata } from 'next'

import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { cardInfoFromCompany } from '@/lib/business-card'
import { getCompanyInfo } from '@/lib/cached-data'
import { siteUrl } from '@/lib/site-url'
import { getPluginFlags } from '@/plugins/state'
import { redirectToLogin } from '@/lib/login-redirect'

import { CardStudio } from './card-studio'

export const metadata: Metadata = { title: pageTitle('名片') }

/**
 * 名片（插件）：全站入口，和具体项目无关 —— 名片上放的是公司抬头、自己的电话和微信。
 * 公司名与二维码从「设置 → 公司资料」读，成员可以在页面上临时改姓名/头衔/电话。
 */
export default async function BusinessCardPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()

  const flags = await getPluginFlags(user.id)
  if (!flags['business-card']) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="font-heading text-xl font-semibold">名片</h1>
        <p className="text-sm text-muted-foreground">
          「名片」插件已在「设置 → 插件」里关闭。重新启用后即可导出名片。
        </p>
      </section>
    )
  }

  const company = await getCompanyInfo(user.id)
  return (
    <CardStudio
      defaultInfo={cardInfoFromCompany(company, siteUrl())}
      defaultName={user.name ?? user.email ?? ''}
    />
  )
}
