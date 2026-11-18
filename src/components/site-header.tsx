'use client'

import { usePathname } from 'next/navigation'

/** 项目详情（/projects/[id]/…）有自己的顶栏（板块切换），这里不再重复显示。 */
export const isProjectDetailPath = (pathname: string) =>
  /^\/projects\/(?!new(?:\/|$))[^/]+/.test(pathname)

const TITLES: [RegExp, string][] = [
  [/^\/projects\/new/, '新建项目'],
  [/^\/projects/, '项目'],
  [/^\/quotes/, '报价'],
  [/^\/products/, '产品库'],
  [/^\/knx/, 'KNX / ETS'],
  [/^\/smart-home/, '智能家居'],
  // 2026-11-09 起 URL 从 /plugins 改名 /capabilities（旧路径 301）。
  // 细分路由必须排在通配前面：/capabilities/templates 的顶栏应显示「模板中心」，
  // 不是父级「能力中心」——否则面包屑与页面标题对不上。
  [/^\/capabilities\/business-card/, '名片'],
  [/^\/capabilities\/templates/, '模板中心'],
  [/^\/capabilities\/tools/, '全部工具'],
  [/^\/capabilities/, '能力中心'],
  [/^\/ai/, 'AI 对话'],
  [/^\/membership/, '会员与积分'],
  [/^\/settings/, '设置'],
]

/**
 * 页面级位置标（TopNav 的 startContent）：只显示当前板块标题。
 *
 * 产品标识与全局操作（AI 对话、外观切换）在 AppShell 的 TopNav；
 * 页面正文自己负责 h1。这里放在顶栏作为位置提示，避免与正文标题重复。
 */
export function SiteHeader() {
  const pathname = usePathname()
  if (isProjectDetailPath(pathname)) return null
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? '工作台'
  return (
    <span
      data-slot="page-title"
      className="truncate text-sm font-medium text-muted-foreground"
      aria-current="page"
    >
      {title}
    </span>
  )
}

/** 兼容旧引用：项目顶栏使用同一个外观菜单 */
export { AppearanceMenu as ThemeMenu } from '@/components/appearance-menu'
