'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  BookOpen,
  Cable,
  Crown,
  FolderKanban,
  Home,
  IdCard,
  LayoutTemplate,
  LogOut,
  PackageSearch,
  Plus,
  Settings,
  Wrench,
} from 'lucide-react'

import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { BetaBadge } from '@/components/beta-badge'
import { ClientAvailableBadge } from '@/components/client-available-badge'
import { GuardedLink } from '@/components/guarded-link'
import { LinkPending } from '@/components/link-pending'
import { MembershipDialog } from '@/components/workspace-dialogs'
import { useWorkspaceChrome } from '@/components/workspace-chrome'
import { hasLeaveGuard, runLeaveGuard } from '@/lib/leave-guard'
import { activeNavUrl } from '@/lib/nav-active'
import { cn } from '@/lib/utils'
import type { PluginId } from '@/plugins/types'

export type SidebarUser = { name: string; email: string }
export type SidebarBrand = { name: string; logo: string | null }
export type SidebarPlugin = {
  id: PluginId
  name: string
  description: string
  status: 'ready' | 'coming-soon'
  enabled: boolean
  where: string
  provides: string[]
}

/** 空间设计工作台：项目 + 产品库 */
const workNav = [
  { icon: FolderKanban, label: '项目', url: '/projects' },
  { icon: PackageSearch, label: '产品库', url: '/products' },
] as const

/** HA 助手：只读查看已连接现场 Home Assistant（客户端可用 → 下载桌面客户端） */
export const homeNav = [
  { icon: Home, label: '智能家居', url: '/smart-home', desktopOnly: true },
] as const

/** KNX / ETS：第一期只留模块位，点进去是空态页（开发中） */
export const knxNav = [{ icon: Cable, label: 'KNX 工程', url: '/knx', beta: true }] as const

/** 营销工具：第一期只放名片（页面与 URL 沿用现有的能力页） */
const marketingNav = [{ icon: IdCard, label: '名片', url: '/capabilities/business-card' }] as const

/** 低频入口不占侧栏：收在左下角齿轮的「设置」菜单里 */
const settingsNav = [
  { icon: Settings, label: '公司与报价设置', url: '/settings' },
  { icon: Activity, label: '客户使用报告', url: '/settings/reports' },
  { icon: BookOpen, label: '使用文档', url: '/docs' },
] as const

/**
 * 模板与工具入口：留在侧栏的两个能力功能（模板中心 / 全部工具）。
 * 原「能力中心」分组标题和「AI 能力」组都已从侧栏移除——
 * AI 对话挪到了右侧常驻一列（components/ai/ai-panel.tsx），
 * 能力中心总览页 /capabilities 保留、可直接 URL 访问（帮助手册里已说明），
 * 但不再占侧栏：只把这两个高频能力功能作为独立组挂在侧栏主体。
 */
const toolNav = [
  { icon: LayoutTemplate, label: '模板中心', url: '/capabilities/templates' },
  { icon: Wrench, label: '全部工具', url: '/capabilities/tools' },
] as const

/** 侧边栏所有可点入口 —— 判定当前页要看全集，见 activeNavUrl */
const ALL_NAV_URLS = [
  ...workNav.map((i) => i.url),
  ...homeNav.map((i) => i.url),
  ...knxNav.map((i) => i.url),
  ...marketingNav.map((i) => i.url),
  ...settingsNav.map((i) => i.url),
  ...toolNav.map((i) => i.url),
] as const

/**
 * 官方 SideNavItem 的导航项。
 *
 * 用 `as={GuardedLink}` 保留「页面有未保存修改时先确认再跳转」的行为；
 * Beta / 客户端可用标记分别走 `endContent`（纯展示）与 `actions`
 * （可交互的独立下载链接），与官方对这两个插槽的约定一致。
 */
function NavItem({
  icon: Icon,
  label,
  url,
  active,
  beta = false,
  desktopOnly = false,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  url: string
  active: boolean
  beta?: boolean
  desktopOnly?: boolean
}) {
  return (
    <SideNavItem
      label={label}
      href={url}
      as={GuardedLink}
      icon={Icon}
      isSelected={active}
      endContent={
        beta ? (
          <BetaBadge />
        ) : desktopOnly ? (
          <LinkPending className="size-3.5 opacity-60" />
        ) : undefined
      }
      actions={desktopOnly ? <ClientAvailableBadge /> : undefined}
    />
  )
}

/** 跳转到设置项：有未保存修改时先走保存守卫再跳（与 GuardedLink 行为一致）。 */
function useGuardedNavigate() {
  const router = useRouter()
  return (href: string) => {
    if (!hasLeaveGuard()) {
      router.push(href)
      return
    }
    void runLeaveGuard().then((ok) => {
      if (ok) router.push(href)
    })
  }
}

export function AppSidebar({
  user,
  brand,
  plugins,
  ai,
  showOperatorReports = false,
}: {
  user: SidebarUser
  brand: SidebarBrand
  plugins: SidebarPlugin[]
  /** 会员与积分菜单里显示的剩余积分（AI 面板本身在右栏，由 layout 直接传参） */
  ai: { credits: number }
  /** 跨客户的使用报告只对平台运营人员显示入口 */
  showOperatorReports?: boolean
}) {
  const pathname = usePathname()
  const navigate = useGuardedNavigate()
  const { sidebarCollapsed, setSidebarCollapsed } = useWorkspaceChrome()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [membershipOpen, setMembershipOpen] = useState(false)

  // ⚠️ 只让**最长匹配**的那条亮，否则父级入口会跟子路由一起亮
  //（`/ai` 是 `/ai/image` 的前缀、`/capabilities` 是 `/capabilities/templates` 的前缀）。
  // 2026-11-14 用户报「点了能力中心的选项一直是点击状态，切换也还是」就是这个。
  // 判定逻辑在 lib/nav-active.ts，有单测盯住。
  const activeUrl = useMemo(() => activeNavUrl(pathname, ALL_NAV_URLS), [pathname])
  const isActive = (url: string) => activeUrl === url
  const visibleSettingsNav = settingsNav.filter(
    (item) => showOperatorReports || item.url !== '/settings/reports',
  )
  const inSettings = visibleSettingsNav.some((item) => isActive(item.url))

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } finally {
      window.location.assign('/login?switch=1')
    }
  }

  return (
    <SideNav
      collapsible={{ isCollapsed: sidebarCollapsed, onCollapsedChange: setSidebarCollapsed }}
      topContent={
        sidebarCollapsed ? (
          <IconButton
            label="新建项目"
            icon={<Plus />}
            href="/projects/new"
            as={GuardedLink}
            variant="primary"
            size="sm"
          />
        ) : (
          <Button
            label="新建项目"
            icon={<Plus />}
            href="/projects/new"
            as={GuardedLink}
            variant="primary"
            size="sm"
            className="w-full"
          />
        )
      }
      footer={
        <div className={cn('flex items-center gap-1.5 px-1 pb-1', sidebarCollapsed && 'flex-col')}>
          {/* 账户菜单 */}
          <DropdownMenu
            placement="above"
            alignment="start"
            menuWidth={256}
            renderTrigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label={`账户：${user.name}`}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left',
                  'hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
                  sidebarCollapsed && 'justify-center px-1',
                )}
              >
                <Avatar name={user.name} size={32} className="text-xs font-semibold" />
                {sidebarCollapsed ? null : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
                )}
              </button>
            )}
          >
            <div className="flex items-center gap-2.5 p-2">
              <Avatar name={user.name} size={36} className="text-sm font-semibold" />
              <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                <span className="truncate text-sm font-semibold">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </div>
            <DropdownMenuDivider />
            <DropdownMenuItem
              label="会员与积分"
              icon={Crown}
              endContent={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {ai.credits.toLocaleString('zh-CN')}
                </span>
              }
              onClick={() => setMembershipOpen(true)}
            />
            <DropdownMenuDivider />
            <DropdownMenuItem
              label={isLoggingOut ? '退出中' : '退出登录'}
              icon={LogOut}
              isDisabled={isLoggingOut}
              onClick={() => void handleLogout()}
            />
          </DropdownMenu>

          {/* 设置菜单 */}
          <DropdownMenu
            placement="above"
            alignment="end"
            menuWidth={208}
            renderTrigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label="设置"
                data-active={inSettings || undefined}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground',
                  'hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
                  'data-active:bg-subtle data-active:text-foreground',
                )}
              >
                <Settings className="size-4" />
              </button>
            )}
          >
            {visibleSettingsNav.map(({ icon: Icon, label, url }) => (
              <DropdownMenuItem
                key={url}
                label={label}
                icon={Icon}
                onClick={() => navigate(url)}
                endContent={
                  isActive(url) ? <span className="text-xs text-muted-foreground">当前</span> : null
                }
              />
            ))}
          </DropdownMenu>
        </div>
      }
    >
      <SideNavSection title="空间设计工作台">
        {workNav.map((item) => (
          <NavItem
            key={item.url}
            {...item}
            active={isActive(item.url) && pathname !== '/projects/new'}
          />
        ))}
      </SideNavSection>

      {/* HA 助手：只读查看已连接现场 Home Assistant（第一期只读模组） */}
      <SideNavSection title="HA 助手">
        {homeNav.map((item) => (
          <NavItem key={item.url} {...item} active={isActive(item.url)} />
        ))}
      </SideNavSection>

      {/* KNX / ETS：第一期只留模块位，点进去是「建设中」空态页 */}
      <SideNavSection title="KNX / ETS">
        {knxNav.map((item) => (
          <NavItem key={item.url} {...item} active={isActive(item.url)} />
        ))}
      </SideNavSection>

      {/* 营销工具：第一期只放名片，页面与 URL 不动 */}
      <SideNavSection title="营销工具">
        {marketingNav.map((item) => (
          <NavItem key={item.url} {...item} active={isActive(item.url)} />
        ))}
      </SideNavSection>

      {/* 模板与工具：独立成组挂在侧栏主体。原「能力中心」分组标题入口
          与「AI 能力」组都已移除；/capabilities 总览页保留、可直接 URL 访问。 */}
      <SideNavSection title="模板与工具">
        {toolNav.map((item) => (
          <NavItem key={item.url} {...item} active={isActive(item.url)} />
        ))}
      </SideNavSection>

      <MembershipDialog
        open={membershipOpen}
        onOpenChange={setMembershipOpen}
        credits={ai.credits}
      />
    </SideNav>
  )
}
