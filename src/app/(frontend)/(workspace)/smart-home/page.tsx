import { ClientAvailableBadge } from '@/components/client-available-badge'
import { PageHeader, PageShell } from '@/components/page-header'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { redirectToLogin } from '@/lib/login-redirect'

import { SmartHomeClient } from './smart-home-client'

export const metadata = { title: pageTitle('智能家居') }

/** 校验工作台登录，设备数据由桌面客户端直连读取。 */
export default async function SmartHomePage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()

  return (
    <PageShell className="gap-5">
      <PageHeader title="智能家居" badge={<ClientAvailableBadge />} />
      <SmartHomeClient />
    </PageShell>
  )
}
