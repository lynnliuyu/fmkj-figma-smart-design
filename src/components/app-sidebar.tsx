"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import {
  Activity,
  Blocks,
  BookOpen,
  Bot,
  Crown,
  FolderKanban,
  Image as ImageIcon,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  PackageSearch,
  Palette,
  Plus,
  Settings,
  WandSparkles,
} from "lucide-react"

import type { AiModelOption, AiProjectContext } from "@/components/ai/ai-elements"
import { BrandMark } from "@/components/brand/brand-mark"
import { GuardedLink } from "@/components/guarded-link"
import { LinkPending } from "@/components/link-pending"
import { MembershipDialog } from "@/components/workspace-dialogs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { APP_NAME, APP_TAGLINE } from "@/lib/brand"
import { cn } from "@/lib/utils"
import type { PluginId } from "@/plugins/types"

// AI 对话面板只在切到「AI 对话」时才加载，不拖慢其他页面的首屏
const AiSidebarDock = dynamic(() => import("@/components/ai/ai-sidebar-dock").then((m) => m.AiSidebarDock), { ssr: false })

export type SidebarUser = { name: string; email: string }
export type SidebarBrand = { name: string; logo: string | null }
export type SidebarPlugin = {
  id: PluginId
  name: string
  description: string
  status: "ready" | "coming-soon"
  enabled: boolean
  where: string
  provides: string[]
}

/** 日常工作：项目 → 产品 → AI */
const workNav = [
  { icon: FolderKanban, label: "项目", url: "/projects" },
  { icon: PackageSearch, label: "产品库", url: "/products" },
] as const

/** 低频入口不占侧栏：收在左下角齿轮的「设置」菜单里 */
const settingsNav = [
  { icon: Settings, label: "公司与报价设置", url: "/settings" },
  { icon: Activity, label: "客户使用报告", url: "/settings/reports" },
  { icon: Blocks, label: "插件市场", url: "/plugins" },
  { icon: BookOpen, label: "使用文档", url: "/docs" },
] as const

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || "我"

/** 左下角两个按钮共用的样式：图标模式下都收成 32px 的方块 */
const footerButton =
  "flex items-center rounded-lg outline-hidden transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"

function NavItem({ icon: Icon, label, url, active }: { icon: React.ComponentType; label: string; url: string; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <GuardedLink href={url}>
          <Icon />
          <span>{label}</span>
          <LinkPending className="ml-auto size-3.5" />
        </GuardedLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({
  user,
  brand,
  plugins,
  projects,
  ai,
  showOperatorReports = false,
}: {
  user: SidebarUser
  brand: SidebarBrand
  plugins: SidebarPlugin[]
  /** 只给 AI 对话面板提供项目上下文；侧栏本身不再列出最近项目 */
  projects: AiProjectContext[]
  ai: { credits: number; configured: boolean; models?: AiModelOption[] }
  /** 跨客户的使用报告只对平台运营人员显示入口 */
  showOperatorReports?: boolean
}) {
  const pathname = usePathname()
  const { state, isMobile, setOpen, widthPx } = useSidebar()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [mode, setMode] = useState<"nav" | "chat">("nav")
  const [membershipOpen, setMembershipOpen] = useState(false)

  const aiCopilotEnabled = plugins.some((p) => p.id === "ai-copilot" && p.status === "ready" && p.enabled)
  const effectiveMode = aiCopilotEnabled && state === "expanded" ? mode : "nav"
  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`)
  const collapsed = state === "collapsed" && !isMobile
  const visibleSettingsNav = settingsNav.filter((item) => showOperatorReports || item.url !== "/settings/reports")
  const inSettings = visibleSettingsNav.some((item) => isActive(item.url))

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await fetch("/auth/logout", { method: "POST" })
    } finally {
      window.location.assign("/login?switch=1")
    }
  }

  return (
    <Sidebar
      collapsible="icon"
      style={
        effectiveMode === "chat" && !widthPx
          ? // AI 对话比导航宽一些便于阅读，但随屏幕宽度收放，避免挤压右侧工作区（1280 宽约 19rem，1440 宽约 21.5rem）
            ({ "--sidebar-width": "clamp(18rem, 24vw, 22rem)" } as React.CSSProperties)
          : undefined
      }
    >
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={APP_NAME}>
              <GuardedLink href="/projects">
                {/* 平台标志；副标题是当前工作区（公司）名称，公司 Logo 仍用于报价单与合同抬头 */}
                <BrandMark decorative className="size-8" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold tracking-wide">{APP_NAME}</span>
                  {/* 公司名与平台名相同（自营团队）时显示平台副标，避免上下两行重复 */}
                  <span className="truncate text-xs text-muted-foreground">{brand.name && brand.name !== APP_NAME ? brand.name : APP_TAGLINE}</span>
                </div>
              </GuardedLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* 侧边栏模式：导航 | AI 对话（仅在启用「AI 对话侧栏（高级）」插件时显示） */}
        {aiCopilotEnabled ? (
          <>
            <Tabs
              value={effectiveMode}
              onValueChange={(v) => setMode(v === "chat" ? "chat" : "nav")}
              className="group-data-[collapsible=icon]:hidden"
            >
              <TabsList className="w-full">
                <TabsTrigger value="nav" aria-controls="sidebar-panel" className="text-xs">
                  <LayoutGrid className="size-3.5" />
                  导航
                </TabsTrigger>
                <TabsTrigger value="chat" aria-controls="sidebar-panel" className="text-xs">
                  <MessageSquareText className="size-3.5" />
                  AI 对话
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* 折叠为图标模式时，提供一键展开到 AI 对话侧栏的按钮 */}
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="展开 AI 对话侧栏"
                  onClick={() => {
                    setOpen(true)
                    setMode("chat")
                  }}
                >
                  <MessageSquareText />
                  <span>AI 对话</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        ) : null}
      </SidebarHeader>

      {effectiveMode === "chat" ? (
        <div id="sidebar-panel" className="flex min-h-0 flex-1 flex-col">
          <AiSidebarDock plugins={plugins.filter((p) => p.id !== "ai-copilot")} projects={projects} credits={ai.credits} configured={ai.configured} models={ai.models} />
        </div>
      ) : (
        <>
          <SidebarContent id="sidebar-panel">
            {/* 最常用的动作放在最显眼的位置 */}
            <SidebarGroup className="pb-0">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="新建项目"
                    className="justify-center bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-xs inset-shadow-btn hover:bg-[color-mix(in_oklch,var(--sidebar-primary),black_10%)] hover:text-sidebar-primary-foreground active:bg-sidebar-primary active:text-sidebar-primary-foreground group-data-[collapsible=icon]:justify-start dark:hover:bg-[color-mix(in_oklch,var(--sidebar-primary),white_12%)]"
                  >
                    <GuardedLink href="/projects/new">
                      <Plus />
                      <span>新建项目</span>
                    </GuardedLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>工作台</SidebarGroupLabel>
              <SidebarMenu>
                {workNav.map((item) => (
                  <NavItem key={item.url} {...item} active={isActive(item.url) && pathname !== "/projects/new"} />
                ))}
                {aiCopilotEnabled ? <NavItem icon={Bot} label="AI 对话" url="/ai" active={isActive("/ai")} /> : null}
              </SidebarMenu>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>插件</SidebarGroupLabel>
              <SidebarMenu>
                <NavItem icon={Blocks} label="插件市场" url="/plugins" active={isActive("/plugins")} />
                {aiCopilotEnabled ? (
                  <>
                    <NavItem icon={WandSparkles} label="插件功能" url="/plugins/tools" active={isActive("/plugins/tools")} />
                    <NavItem icon={ImageIcon} label="AI 生图" url="/ai/image" active={isActive("/ai/image")} />
                    <NavItem icon={Palette} label="户型图风格化" url="/ai/image/style" active={isActive("/ai/image/style")} />
                  </>
                ) : null}
              </SidebarMenu>
            </SidebarGroup>

          </SidebarContent>

          {/* 左下角：头像（账户菜单）+ 齿轮（设置菜单）；外观切换在顶栏右侧，这里不重复 */}
          <SidebarFooter className="border-t border-sidebar-border">
            <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`账户：${user.name}`}
                        className={cn(footerButton, "h-9 min-w-0 flex-1 gap-2 px-1.5 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0")}
                      >
                        <Avatar className="size-7">
                          <AvatarFallback className="bg-sidebar-primary/12 text-xs font-semibold text-sidebar-primary">{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium group-data-[collapsible=icon]:hidden">{user.name}</span>
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right" hidden={!collapsed}>
                    {user.name}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64">
                  <DropdownMenuLabel className="flex items-center gap-2.5 p-2 font-normal">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-sidebar-primary/12 text-sm font-semibold text-sidebar-primary">{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{user.name}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setMembershipOpen(true)}>
                    <Crown />
                    会员与积分
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{ai.credits.toLocaleString("zh-CN")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={isLoggingOut} onSelect={() => void handleLogout()}>
                    <LogOut />
                    {isLoggingOut ? "退出中" : "退出登录"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="设置"
                        data-active={inSettings || undefined}
                        className={cn(footerButton, "size-8 shrink-0 justify-center text-sidebar-foreground/70 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground")}
                      >
                        <Settings className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side={collapsed ? "right" : "top"}>设置</TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="top" align={collapsed ? "start" : "end"} sideOffset={8} className="w-52">
                  {visibleSettingsNav.map(({ icon: Icon, label, url }) => (
                    <DropdownMenuItem key={url} asChild className={cn(isActive(url) && "bg-accent/60 font-medium")}>
                      <GuardedLink href={url} aria-current={isActive(url) ? "page" : undefined}>
                        <Icon />
                        {label}
                      </GuardedLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarFooter>
        </>
      )}
      <SidebarRail />
      <MembershipDialog open={membershipOpen} onOpenChange={setMembershipOpen} credits={ai.credits} />
    </Sidebar>
  )
}
