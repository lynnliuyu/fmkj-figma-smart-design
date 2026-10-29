"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, ChevronsUpDown, FileText, FolderKanban, LogOut, PackageSearch } from "lucide-react"

import { LinkPending } from "@/components/link-pending"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export type SidebarUser = { name: string; email: string; roleLabel: string; isAdmin: boolean }

const nav: { icon: typeof PackageSearch; label: string; url: string; soon?: boolean }[] = [
  { icon: FolderKanban, label: "项目", url: "/projects" },
  { icon: PackageSearch, label: "产品库", url: "/products" },
  { icon: FileText, label: "报价", url: "/quotes" },
]

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || "用"

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await fetch("/auth/logout", { method: "POST" })
    } finally {
      window.location.assign("/login")
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="group-data-[collapsible=icon]:px-1.5">
              <Link href="/projects">
                {/* 品牌字标：用公司缩写代替模板自带的 ⌘ 占位图标 */}
                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-[11px] font-bold tracking-tight text-sidebar-primary-foreground">
                  FM
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">FMKJ</span>
                  <span className="truncate text-xs text-muted-foreground">项目运营后台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>常用</SidebarGroupLabel>
          <SidebarMenu>
            {nav.map((item) => (
              <SidebarMenuItem key={item.label}>
                {item.soon ? (
                  <>
                    <SidebarMenuButton disabled tooltip={`${item.label}（即将上线）`}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      <Badge variant="outline" className="text-[10px]">即将上线</Badge>
                    </SidebarMenuBadge>
                  </>
                ) : (
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)} tooltip={item.label}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.label}</span>
                      <LinkPending className="ml-auto size-3.5" />
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        {user.isAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>设置</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")} tooltip="公司信息">
                  <Link href="/settings">
                    <Building2 />
                    <span>公司信息</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.roleLabel}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side="top"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={isLoggingOut} onSelect={() => void handleLogout()}>
                  <LogOut />
                  {isLoggingOut ? "退出中" : "退出登录"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
