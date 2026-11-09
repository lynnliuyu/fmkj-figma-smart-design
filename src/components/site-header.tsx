'use client'

import { ChevronRight } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { AppearanceMenu } from '@/components/appearance-menu'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { APP_NAME } from '@/lib/brand'

/** 项目详情（/projects/[id]/…）有自己的顶栏（板块切换），这里不再重复显示。 */
export const isProjectDetailPath = (pathname: string) =>
  /^\/projects\/(?!new(?:\/|$))[^/]+/.test(pathname)

const TITLES: [RegExp, string][] = [
  [/^\/projects\/new/, '新建项目'],
  [/^\/projects/, '项目'],
  [/^\/quotes/, '报价'],
  [/^\/products/, '产品库'],
  // 2026-11-09 起 URL 从 /plugins 改名 /capabilities（旧路径 301）。
  // 细分路由必须排在通配前面：/capabilities/templates 的顶栏应显示「模板中心」，
  // 不是父级「能力中心」——否则面包屑与页面标题对不上。
  [/^\/capabilities\/templates/, '模板中心'],
  [/^\/capabilities\/tools/, '全部工具'],
  [/^\/capabilities/, '能力中心'],
  [/^\/ai/, 'AI 对话'],
  [/^\/membership/, '会员与积分'],
  [/^\/settings/, '设置'],
]

export function SiteHeader() {
  const pathname = usePathname()
  if (isProjectDetailPath(pathname)) return null
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? '工作台'
  return (
    // 顶栏只承载侧边栏开关、当前位置和外观设置，压到 48px，把首屏高度还给内容。
    <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-5">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      <Separator
        orientation="vertical"
        className="mx-1 data-vertical:h-4 data-vertical:self-center"
      />
      <nav aria-label="当前位置" className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="hidden text-[13px] text-muted-foreground sm:inline">{APP_NAME}</span>
        <ChevronRight
          aria-hidden
          className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block"
        />
        <span className="truncate text-sm font-semibold text-foreground">{title}</span>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <AppearanceMenu />
      </div>
    </header>
  )
}

/** 兼容旧引用：项目顶栏使用同一个外观菜单 */
export { AppearanceMenu as ThemeMenu }
