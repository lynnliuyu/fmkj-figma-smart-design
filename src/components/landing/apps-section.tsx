import Link from 'next/link'
import { ArrowRight, Globe, Monitor, Smartphone } from 'lucide-react'

import { Section, SectionHeader } from './section'

const APPS = [
  {
    icon: Globe,
    title: '网页版',
    text: '浏览器打开就是工作台，Chrome 和 Edge 还能安装成应用。',
    href: '/projects',
    cta: '进入工作台',
  },
  {
    icon: Monitor,
    title: '桌面客户端',
    text: 'Windows 与 macOS，独立窗口、快捷键，直接调用系统打印。',
    href: '/download',
    cta: '了解桌面客户端',
  },
  {
    icon: Smartphone,
    title: '微信小程序',
    text: '扫码登录，在客户家里看项目、改点位、查产品、发报价。',
    href: '/login',
    cta: '去扫码登录',
  },
]

/** 多端入口：网页、桌面客户端、微信小程序，同一份数据 */
export function AppsSection() {
  return (
    <Section id="apps" labelledBy="apps-title" className="sm:pt-16">
      <SectionHeader id="apps-title" title="办公室用电脑，现场用手机">
        网页、桌面客户端和微信小程序用的是同一份数据，在哪改都实时同步。
      </SectionHeader>
      <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {APPS.map((app) => (
          <li key={app.title} className="flex flex-col bg-card p-6 sm:p-8">
            <app.icon aria-hidden className="size-5 text-muted-foreground" />
            <h3 className="mt-6 font-medium">{app.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{app.text}</p>
            <Link
              href={app.href}
              className="group mt-6 inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium"
            >
              {app.cta}
              <ArrowRight
                aria-hidden
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}
