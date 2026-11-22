import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  AppWindow,
  ArrowRight,
  Keyboard,
  Printer,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react'

import { DesktopHeroActions, DesktopPlatformCards } from '@/components/download/desktop-downloads'
import { LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { SectionHeading } from '@/components/landing/section-heading'
import { Button } from '@astryxdesign/core/Button'
import { Kbd } from '@astryxdesign/core/Kbd'
import { APP_NAME, pageTitle } from '@/lib/brand'

export const metadata: Metadata = {
  title: pageTitle('下载桌面客户端'),
  description: `${APP_NAME} Windows / macOS 桌面客户端：独立窗口、快捷键、打印导出和自动更新，登录一次长期有效。`,
  alternates: { canonical: '/download' },
}

// 官方 Kbd 用 `mod` 表示平台修饰键（macOS 渲染成 ⌘、其它平台渲染成 Ctrl），
// 自动跟随平台，不用自己按系统分支拼按键。
const SHORTCUTS = [
  { keys: 'mod+1', label: '项目' },
  { keys: 'mod+2', label: '产品库' },
  { keys: 'mod+P', label: '打印' },
  { keys: 'mod+N', label: '新窗口' },
]

const FEATURES = [
  {
    icon: AppWindow,
    title: '独立窗口，专注工作',
    text: '记住窗口尺寸与上次打开的页面，支持多窗口并排对照方案。',
  },
  {
    icon: Keyboard,
    title: '全局快捷键',
    text: '快速切换项目与产品库、一键唤起打印（macOS 使用 ⌘）。',
  },
  {
    icon: Printer,
    title: '顺手打印与导出',
    text: '直接调用系统打印；导出 PDF 时自选路径，完成后一键打开目录。',
  },
  {
    icon: RefreshCw,
    title: '自动更新与断网重连',
    text: '后台静默更新版本，网络波动自动重连并恢复当前工作页。',
  },
  {
    icon: ShieldCheck,
    title: '安全隔离',
    text: '仅加载工作台安全域名，公用电脑支持一键退出并清理本地缓存。',
  },
  { icon: Server, title: '支持私有部署', text: '在「帮助 → 服务器设置」配置团队自建服务器地址。' },
]

const INSTALL_STEPS = [
  {
    title: 'Windows',
    steps: [
      '双击安装程序，按提示选择安装位置。',
      '如果出现「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」。',
      '安装完成后，从桌面或开始菜单打开「繁梦空间」。',
    ],
  },
  {
    title: 'macOS',
    steps: [
      '打开下载的 DMG（或解压 ZIP），把「繁梦空间」拖进「应用程序」。',
      '首次打开如提示无法验证开发者：前往「系统设置 → 隐私与安全性」，点「仍要打开」。',
      '之后从启动台或程序坞直接打开即可。',
    ],
  },
  {
    title: '网页安装版',
    steps: [
      '用 Chrome 或 Edge 打开网页版并登录。',
      '点地址栏右侧的「安装」图标，把繁梦空间添加为应用。',
      'Safari 用户：在菜单栏选择「文件 → 添加到程序坞」。',
    ],
  },
]

/** 下载页：Windows / macOS 桌面客户端与网页安装版 */
export default function DownloadPage() {
  return (
    <div data-landing className="min-h-svh overflow-x-clip bg-background text-foreground">
      <LandingNav />
      <main>
        <section aria-labelledby="download-title">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24 lg:grid-cols-2 lg:px-8">
            <div>
              <h1 id="download-title" className="text-display font-semibold">
                {/* 按词组换行，避免窄屏断在「装 / 进」中间 */}
                <span className="inline-block">把{APP_NAME}</span>
                <span className="inline-block">装进你的电脑</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lead text-balance text-muted-foreground">
                独立窗口打开工作台，设计、报价、合同一气呵成。登录一次长期有效，新版本自动送达。
              </p>
              <DesktopHeroActions />
            </div>

            <div aria-hidden className="relative mx-auto w-full max-w-lg">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-window">
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="ml-3 text-xs text-muted-foreground">{APP_NAME}</span>
                </div>
                <div className="grid grid-cols-4">
                  <div className="col-span-1 space-y-3 border-r border-border p-4">
                    <div className="h-2 w-3/4 rounded-full bg-primary/60" />
                    <div className="h-2 w-2/3 rounded-full bg-muted" />
                    <div className="h-2 w-1/2 rounded-full bg-muted" />
                    <div className="h-2 w-2/3 rounded-full bg-muted" />
                  </div>
                  <div className="col-span-3 flex flex-col items-center gap-5 p-8">
                    <Image
                      src="/brand/fmkj-app-icon-512.png"
                      alt=""
                      width={512}
                      height={512}
                      unoptimized
                      className="size-28 drop-shadow-lg"
                    />
                    <div className="grid w-full grid-cols-3 gap-2">
                      <div className="h-12 rounded-lg bg-muted/70" />
                      <div className="h-12 rounded-lg bg-muted/70" />
                      <div className="h-12 rounded-lg bg-primary/15" />
                    </div>
                    <div className="h-2 w-2/3 rounded-full bg-muted" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="platforms"
          aria-labelledby="platforms-title"
          className="scroll-mt-20 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="platforms-title"
              eyebrow="选择你的平台"
              title="一个账号，所有电脑通用"
              description="一个账号，客户端、网页版和小程序的项目与报价实时同步。"
              className="max-w-2xl"
            />
            <DesktopPlatformCards />
          </div>
        </section>

        <section aria-labelledby="features-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="features-title"
              eyebrow="为桌面而生"
              title="比浏览器更顺手的工作台"
              className="max-w-2xl"
            />
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="bg-card p-6 sm:p-8">
                  <feature.icon aria-hidden className="size-5 text-muted-foreground" />
                  <h3 className="mt-6 font-medium">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.text}
                  </p>
                  {feature.icon === Keyboard ? (
                    <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      {SHORTCUTS.map((shortcut) => (
                        <li key={shortcut.label} className="flex items-center gap-2">
                          <Kbd keys={shortcut.keys} />
                          {shortcut.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="install-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="install-title"
              eyebrow="安装说明"
              title="三步装好，马上开工"
              description="客户端暂未购买代码签名证书，首次安装可能提示风险，按下面步骤确认即可。"
              className="max-w-2xl"
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {INSTALL_STEPS.map((group) => (
                <div key={group.title} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="font-medium">{group.title}</h3>
                  <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
                    {group.steps.map((step, index) => (
                      <li key={step} className="flex gap-3">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground tabular-nums">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
                href="/projects"
                icon={<ArrowRight />}
                label="先用网页版"
              />
              <Button
                size="lg"
                variant="secondary"
                className="h-11 rounded-full px-6 text-base"
                href="/login"
                label="登录账号"
              />
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
