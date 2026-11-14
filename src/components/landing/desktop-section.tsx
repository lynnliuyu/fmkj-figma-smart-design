import Image from 'next/image'
import { AppWindow, Keyboard, Printer, RefreshCw } from 'lucide-react'

import { DesktopHeroActions } from '@/components/download/desktop-downloads'
import { Section, SectionHeader } from './section'

const POINTS = [
  { icon: AppWindow, text: '独立窗口，回到上次的页面' },
  { icon: Keyboard, text: '⌘ / Ctrl 快捷键直达项目与打印' },
  { icon: Printer, text: '直接调系统打印，导出 PDF 自选路径' },
  { icon: RefreshCw, text: '后台自动更新，断网自动重连' },
]

/**
 * 首页的桌面客户端分区。下载按钮由 DesktopHeroActions 按访客系统推荐安装包；
 * 服务器还没有上传安装包时，它会退化成「使用网页版」而不是死链。
 */
export function DesktopSection() {
  return (
    <Section id="desktop" labelledBy="desktop-title">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_auto]">
        <div>
          <SectionHeader id="desktop-title" title="把工作台装进电脑">
            同一个账号、同一份项目，Windows 和 macOS 都能用。客户端只是个更顺手的窗口，
            网站发布的新功能在客户端里立即可用。
          </SectionHeader>

          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-center gap-2.5 text-sm">
                <point.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{point.text}</span>
              </li>
            ))}
          </ul>

          {/* DesktopHeroActions 自带按系统识别安装包、版本号与大小，并跳 /download 看其它平台 */}
          <DesktopHeroActions />
        </div>

        <div aria-hidden className="relative mx-auto hidden lg:block">
          <div className="absolute inset-0 -z-10 rounded-full bg-primary/10 blur-3xl" />
          <div className="rounded-3xl border border-border bg-card p-8 shadow-window">
            <Image
              src="/brand/fmkj-app-icon-512.png"
              alt=""
              width={512}
              height={512}
              unoptimized
              className="size-36 drop-shadow-lg"
            />
            <p className="mt-4 text-center text-xs text-muted-foreground">Windows · macOS</p>
          </div>
        </div>
      </div>
    </Section>
  )
}
