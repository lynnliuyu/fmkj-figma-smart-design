import { redirect } from 'next/navigation'

import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { appAuth } from '@/lib/app-auth'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  manager: '经理',
  designer: '设计师',
  sales: '销售',
  viewer: '只读',
}

/** 需要员工登录的系统页面。 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect('/login')

  return (
    <SidebarProvider>
      <AppSidebar user={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[user.role] ?? user.role, isAdmin: user.role === 'admin' }} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-6 px-4 py-5 md:px-8 md:py-7">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
