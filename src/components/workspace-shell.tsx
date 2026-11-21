'use client'

import { AppShell } from '@astryxdesign/core/AppShell'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'

import { AiPanelToggle } from '@/components/ai/ai-panel'
import { AppearanceMenu } from '@/components/appearance-menu'
import { AppSidebar } from '@/components/app-sidebar'
import { BrandMark } from '@/components/brand/brand-mark'
import { SiteHeader } from '@/components/site-header'
import { WorkspaceChromeProvider } from '@/components/workspace-chrome'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

/**
 * 工作区外壳（Astryx 原生 AppShell + TopNav + SideNav）。
 *
 * 官方迁移顺序要求先落应用框架：AppShell 负责 skip link、main landmark、
 * 窄屏导航抽屉与整页栅格；TopNav 标识产品；SideNav 承担页面级导航。
 * 页面内容仍然由各路由自己的 header 与 content 负责（SiteHeader 只保留
 * 当前页标题），这样「框架」与「页面内容」的职责与官方模板一致。
 */
export function WorkspaceShell({
  user,
  brand,
  plugins,
  ai,
  showOperatorReports,
  rightPanel,
  children,
}: {
  user: { name: string; email: string }
  brand: { name: string; logo: string | null }
  plugins: import('@/components/app-sidebar').SidebarPlugin[]
  ai: { credits: number }
  showOperatorReports: boolean
  /** 宽屏 AI 对话右栏（窄屏时它自己渲染成抽屉，不占位） */
  rightPanel?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <WorkspaceChromeProvider>
      <AppShell
        height="fill"
        contentPadding={0}
        topNav={
          <TopNav
            label="工作台导航"
            className="border-b border-sidebar-border bg-sidebar"
            heading={
              <TopNavHeading
                logo={<BrandMark decorative className="size-6" />}
                heading={APP_NAME}
                subheading={brand.name && brand.name !== APP_NAME ? brand.name : APP_TAGLINE}
                headingHref="/projects"
              />
            }
            startContent={<SiteHeader />}
            endContent={
              <div className="flex items-center gap-1">
                <AiPanelToggle />
                <AppearanceMenu />
              </div>
            }
          />
        }
        sideNav={
          <AppSidebar
            className="bg-sidebar md:border-r md:border-sidebar-border"
            user={user}
            brand={brand}
            plugins={plugins}
            ai={ai}
            showOperatorReports={showOperatorReports}
          />
        }
      >
        <div className="flex w-full items-start">
          <div
            data-slot="workspace-page"
            className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-5 md:px-8 md:py-7"
          >
            {children}
          </div>
          {rightPanel}
        </div>
      </AppShell>
    </WorkspaceChromeProvider>
  )
}
