import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { APP_DESCRIPTION, APP_NAME, COMPANY_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

// 带上首页路径，品牌页、下载页也能直接跳到首页对应分区
const NAV = [
  { label: '点位图', href: '/#plan' },
  { label: '方案模板库', href: '/templates' },
  { label: '报价单', href: '/#quote' },
  { label: '合同与文档', href: '/#delivery' },
  { label: '图例与产品库', href: '/catalog' },
  { label: '文档', href: '/docs' },
  { label: '下载', href: '/download' },
]

/** 横版标识：浅色主题用标准版，深色主题用反白版（文件见 public/brand） */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/brand/fmkj-logo.svg"
        alt={APP_NAME}
        width={436}
        height={120}
        unoptimized
        loading="eager"
        className={cn('dark:hidden', className)}
      />
      <Image
        src="/brand/fmkj-logo-white.svg"
        alt={APP_NAME}
        width={436}
        height={120}
        unoptimized
        loading="eager"
        className={cn('hidden dark:block', className)}
      />
    </>
  )
}

/** 公开页顶部导航：实色底 + 发丝线，吸顶 */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label={`${APP_NAME} 首页`} className="shrink-0 rounded-md">
          <BrandLogo className="h-8 w-auto" />
        </Link>
        <nav aria-label="首页导航" className="hidden items-center gap-0.5 md:flex">
          {NAV.map((item) => (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              className="rounded-full px-3 font-normal text-muted-foreground hover:text-foreground"
            >
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button asChild variant="ghost" className="rounded-full px-3 font-normal">
            <Link href="/login">登录</Link>
          </Button>
          <Button
            asChild
            className="rounded-full bg-foreground px-4 text-background hover:bg-foreground/85"
          >
            <Link href="/projects">进入工作台</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

export function LandingFooter({
  qrCodeUrl = '/brand/wechat-contact-qr.jpg',
  qrCaption = '扫码添加微信',
}: {
  qrCodeUrl?: string | null
  qrCaption?: string | null
} = {}) {
  const year = new Date().getFullYear()
  const groups = [
    { title: '产品', links: NAV.slice(0, 4) },
    {
      title: '开始使用',
      links: [
        { label: '用户文档 (Docs)', href: '/docs' },
        { label: '登录', href: '/login' },
        { label: '免费注册领积分', href: '/login?mode=register' },
        { label: '进入工作台', href: '/projects' },
        { label: '下载客户端', href: '/download' },
      ],
    },
    { title: '关于', links: [{ label: '品牌资源', href: '/brand' }] },
  ]
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-12 lg:px-8">
        <div className="md:col-span-4">
          <BrandLogo className="h-8 w-auto" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {APP_DESCRIPTION}
          </p>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title} className="md:col-span-2">
            <p className="text-sm font-medium">{group.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-sm transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        {qrCodeUrl ? (
          <div className="flex flex-col items-start gap-2.5 md:col-span-2 md:items-end">
            <div className="overflow-hidden rounded-xl border bg-white p-1.5 shadow-2xs">
              <Image
                src={qrCodeUrl}
                alt={qrCaption || '微信联系二维码'}
                width={108}
                height={108}
                unoptimized
                className="size-24 object-contain"
              />
            </div>
            <p className="text-xs text-muted-foreground">{qrCaption || '扫码添加微信'}</p>
          </div>
        ) : null}
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p>
            © {year} {COMPANY_NAME}
          </p>
          <p>文中品牌名称与标识归各自权利人所有</p>
        </div>
      </div>
    </footer>
  )
}
