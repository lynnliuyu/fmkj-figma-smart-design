import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Check, Download, X } from 'lucide-react'

import { BrandLogo, LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { SectionHeading } from '@/components/landing/section-heading'
import { Button } from '@astryxdesign/core/Button'
import { APP_NAME, COMPANY_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: `品牌标识 · ${APP_NAME}`,
  description: `${COMPANY_NAME}品牌标识、应用图标、品牌色与使用规范，提供 SVG / PNG 下载。`,
  alternates: { canonical: '/brand' },
}

const B = '/brand'

const CONCEPTS = [
  {
    src: `${B}/concept-home.svg`,
    title: 'Dream · 繁梦手写字',
    text: '流畅柔和的手写笔触，代表客户与团队心中丰富的想象力，也传递有温度的服务体验。',
  },
  {
    src: `${B}/concept-moon.svg`,
    title: 'SPACE · 几何字与光环',
    text: '方正稳固的定制几何字形搭配 -18° 倾斜轨道光环，象征可靠的技术底座与持续陪伴。',
  },
  {
    src: `${B}/concept-stars.svg`,
    title: '星芒 · AI 智能与灵感',
    text: '以四角星芒替代字母 A 的横画，象征 AI 驱动的智能设计与点亮空间的灵感。',
  },
]

type Asset = {
  span: string
  name: string
  note: string
  preview: string
  w: number
  h: number
  dark: boolean
  downloads: { label: string; href: string }[]
}
const LOCKUPS: Asset[] = [
  {
    span: 'lg:col-span-3',
    name: '横版标识',
    note: '首选组合，用于网站、报价单页眉、名片',
    preview: `${B}/fmkj-logo.svg`,
    w: 436,
    h: 120,
    dark: false,
    downloads: [
      { label: 'SVG', href: `${B}/fmkj-logo.svg` },
      { label: 'PNG', href: `${B}/fmkj-logo@2x.png` },
    ],
  },
  {
    span: 'lg:col-span-3',
    name: '横版标识 · 反白',
    note: '深色背景、视频片尾、展会背板',
    preview: `${B}/fmkj-logo-white.svg`,
    w: 436,
    h: 120,
    dark: true,
    downloads: [
      { label: 'SVG', href: `${B}/fmkj-logo-white.svg` },
      { label: 'PNG', href: `${B}/fmkj-logo-white@2x.png` },
    ],
  },
  {
    span: 'sm:col-span-2 lg:col-span-6',
    name: '公司全称组合',
    note: '合同、发票、公文、官网页脚',
    preview: `${B}/fmkj-logo-full.svg`,
    w: 760,
    h: 120,
    dark: false,
    downloads: [
      { label: 'SVG', href: `${B}/fmkj-logo-full.svg` },
      { label: '反白 SVG', href: `${B}/fmkj-logo-full-white.svg` },
    ],
  },
  {
    span: 'lg:col-span-2',
    name: '竖版标识',
    note: '方形空间、海报、包装、启动页',
    preview: `${B}/fmkj-logo-vertical.svg`,
    w: 200,
    h: 290,
    dark: false,
    downloads: [
      { label: 'SVG', href: `${B}/fmkj-logo-vertical.svg` },
      { label: 'PNG', href: `${B}/fmkj-logo-vertical@2x.png` },
    ],
  },
  {
    span: 'lg:col-span-2',
    name: '竖版标识 · 反白',
    note: '深色方形空间',
    preview: `${B}/fmkj-logo-vertical-white.svg`,
    w: 200,
    h: 290,
    dark: true,
    downloads: [{ label: 'SVG', href: `${B}/fmkj-logo-vertical-white.svg` }],
  },
  {
    span: 'lg:col-span-2',
    name: '标志 · 浅色背景',
    note: '单独使用标志图形（浅色底）',
    preview: `${B}/fmkj-mark.svg`,
    w: 256,
    h: 256,
    dark: false,
    downloads: [
      { label: 'SVG', href: `${B}/fmkj-mark.svg` },
      { label: 'PNG', href: `${B}/fmkj-mark-512.png` },
    ],
  },
  {
    span: 'lg:col-span-3',
    name: '标志 · 单色墨蓝',
    note: '黑白印刷、盖章、雕刻',
    preview: `${B}/fmkj-mark-black.svg`,
    w: 256,
    h: 256,
    dark: false,
    downloads: [{ label: 'SVG', href: `${B}/fmkj-mark-black.svg` }],
  },
  {
    span: 'lg:col-span-3',
    name: '标志 · 单色白',
    note: '深色或照片背景上的单色使用',
    preview: `${B}/fmkj-mark-white.svg`,
    w: 256,
    h: 256,
    dark: true,
    downloads: [{ label: 'SVG', href: `${B}/fmkj-mark-white.svg` }],
  },
]

const COLORS = [
  {
    name: '星光紫',
    en: 'Starlight',
    hex: '#8F72FF',
    rgb: '143 114 255',
    swatch: 'bg-brand-indigo',
    use: '品牌强调色，星夜渐变的起点',
  },
  {
    name: '科技蓝',
    en: 'Tech Blue',
    hex: '#4F86FF',
    rgb: '79 134 255',
    swatch: 'bg-brand-violet',
    use: '品牌强调色，星夜渐变的终点',
  },
  {
    name: '晨光蓝',
    en: 'Dawn Blue',
    hex: '#3C6BFF',
    rgb: '60 107 255',
    swatch: 'bg-brand-moon',
    use: '浅色版 Dream 起点、交互强调',
  },
  {
    name: '星夜紫',
    en: 'Night Violet',
    hex: '#17123F',
    rgb: '23 18 63',
    swatch: 'bg-brand-night',
    use: '深色背景、主色应用图标底色',
  },
  {
    name: '墨蓝',
    en: 'Ink Navy',
    hex: '#141B3E',
    rgb: '20 27 62',
    swatch: 'bg-brand-ink',
    use: '浅色版 SPACE 与标准正文',
  },
  {
    name: '晨雾白',
    en: 'Mist',
    hex: '#EEF1FA',
    rgb: '238 241 250',
    swatch: 'bg-brand-mist',
    use: '浅色背景与分区留白',
  },
]

const DONTS = [
  { label: '不要拉伸或压扁', className: 'scale-x-150' },
  { label: '不要旋转倾斜', className: '-rotate-12' },
  { label: '不要改变标准色', className: 'hue-rotate-90' },
  { label: '不要加阴影或描边特效', className: 'drop-shadow-xl blur-xs' },
]

function DownloadButton({ href, label }: { href: string; label: string }) {
  return <Button size="sm" variant="secondary" href={href} icon={<Download />} label={label} />
}

function Surface({
  dark,
  className,
  children,
}: {
  dark: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl',
        dark ? 'bg-brand-night ring-1 ring-border' : 'bg-brand-mist',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 品牌规范页：标志释义、组合、应用图标、品牌色、字体与使用规范，所有资源可下载。 */
export default function BrandPage() {
  return (
    <div
      data-landing
      data-accent="fanmeng"
      className="min-h-svh overflow-x-clip bg-background text-foreground"
    >
      <LandingNav />
      <main>
        <section aria-labelledby="brand-title">
          <div className="mx-auto max-w-5xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 lg:px-8">
            <h1 id="brand-title" className="sr-only">
              {COMPANY_NAME}品牌标识
            </h1>
            <Image
              src={`${B}/fmkj-logo-vertical.svg`}
              alt={`${APP_NAME}标识`}
              width={258}
              height={264}
              unoptimized
              priority
              className="mx-auto h-48 w-auto sm:h-60 dark:hidden"
            />
            <Image
              src={`${B}/fmkj-logo-vertical-white.svg`}
              alt={`${APP_NAME}标识`}
              width={258}
              height={264}
              unoptimized
              className="mx-auto hidden h-48 w-auto sm:h-60 dark:block"
            />
            <p className="mx-auto mt-8 max-w-2xl text-lead text-pretty text-muted-foreground">
              {COMPANY_NAME}的品牌标识由手写体 Dream、定制几何字
              SPACE、倾斜光环与四角星芒构成：让每一个梦想，都有智能的空间。
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
                href={`${B}/fmkj-logo.svg`}
                icon={<Download />}
                label="下载横版标识"
              />
              <Button
                size="lg"
                variant="secondary"
                className="h-11 rounded-full px-6 text-base"
                href={`${B}/fmkj-app-icon-1024.png`}
                icon={<Download />}
                label="下载应用图标"
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="concept-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="concept-title"
              eyebrow="标志释义"
              title="柔与刚、人与技术，相互成就"
              description="手写 Dream 与几何 SPACE 结合倾斜光环与星芒，从应用图标到大幅背板都清晰醒目。"
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {CONCEPTS.map((c) => (
                <div key={c.title} className="rounded-2xl border border-border bg-card/50 p-6">
                  <Surface dark className="aspect-4/3">
                    <Image
                      src={c.src}
                      alt=""
                      width={256}
                      height={256}
                      unoptimized
                      className="size-32"
                    />
                  </Surface>
                  <h3 className="mt-5 text-lg font-semibold">{c.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="lockup-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="lockup-title"
              eyebrow="标识组合"
              title="按场景选择合适的组合"
              description="所有文字均已转为矢量路径，在任何设备上打开都不会缺字或变形。"
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {LOCKUPS.map((a) => (
                <div
                  key={a.name}
                  className={cn(
                    'flex flex-col rounded-2xl border border-border bg-card/50 p-4',
                    a.span,
                  )}
                >
                  <Surface dark={a.dark} className="h-40 px-6">
                    <Image
                      src={a.preview}
                      alt={a.name}
                      width={a.w}
                      height={a.h}
                      unoptimized
                      className={cn('w-auto', a.h > a.w ? 'h-28' : a.w === a.h ? 'h-20' : 'h-14')}
                    />
                  </Surface>
                  <div className="mt-4 flex flex-1 flex-col">
                    <h3 className="text-sm font-semibold">{a.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{a.note}</p>
                    <div className="mt-3 flex flex-wrap gap-2 pt-1">
                      {a.downloads.map((d) => (
                        <DownloadButton key={d.href} href={d.href} label={d.label} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="icon-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="icon-title"
              eyebrow="应用图标"
              title="网站、手机与小程序图标"
              description="深空黑底色配微光，在浅色桌面、深色模式和微信圆形头像中都足够醒目。"
            />
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card/50 p-6 lg:col-span-2">
                <div className="flex flex-wrap items-end justify-center gap-8 py-6">
                  {[
                    { size: 'size-32', label: '1024 · 应用商店' },
                    { size: 'size-20', label: '180 · iOS 主屏' },
                    { size: 'size-12', label: '48 · 桌面' },
                    { size: 'size-8', label: '32 · 浏览器' },
                    { size: 'size-4', label: '16 · 标签页' },
                  ].map((s) => (
                    <figure key={s.label} className="flex flex-col items-center gap-3">
                      <Image
                        src={`${B}/fmkj-app-icon.svg`}
                        alt=""
                        width={1024}
                        height={1024}
                        unoptimized
                        className={s.size}
                      />
                      <figcaption className="text-xs text-muted-foreground tabular-nums">
                        {s.label}
                      </figcaption>
                    </figure>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <DownloadButton href={`${B}/fmkj-app-icon.svg`} label="SVG" />
                  <DownloadButton href={`${B}/fmkj-app-icon-1024.png`} label="PNG 1024" />
                  <DownloadButton href={`${B}/fmkj-app-icon-512.png`} label="PNG 512" />
                  <DownloadButton href="/favicon.ico" label="favicon.ico" />
                </div>
              </div>
              <div className="flex flex-col rounded-2xl border border-border bg-card/50 p-6">
                <Surface dark={false} className="flex-1 flex-col gap-3 py-8">
                  <Image
                    src={`${B}/fmkj-miniprogram-144.png`}
                    alt="微信小程序头像预览"
                    width={144}
                    height={144}
                    unoptimized
                    className="size-24 rounded-full ring-4 ring-brand-paper"
                  />
                  <p className="text-sm font-medium text-brand-ink">{APP_NAME}</p>
                </Surface>
                <h3 className="mt-4 text-sm font-semibold">微信小程序头像</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  在微信公众平台「设置 → 基本设置」上传，系统会自动裁成圆形。
                </p>
                <div className="mt-3">
                  <DownloadButton href={`${B}/fmkj-miniprogram-144.png`} label="PNG 144" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="color-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="color-title"
              eyebrow="品牌色"
              title="星夜蓝紫，晨光破晓"
              description="深色场景使用星光紫至科技蓝渐变，浅色场景使用晨光蓝至梦境紫与墨蓝。"
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COLORS.map((c) => (
                <div
                  key={c.hex}
                  className="overflow-hidden rounded-2xl border border-border bg-card/50"
                >
                  <div className={cn('h-28', c.swatch)} />
                  <div className="space-y-1 p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{c.name}</h3>
                      <span className="text-xs text-muted-foreground">{c.en}</span>
                    </div>
                    <p className="text-sm tabular-nums">
                      {c.hex} <span className="text-muted-foreground">· RGB {c.rgb}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{c.use}</p>
                  </div>
                </div>
              ))}
            </div>
            <div
              role="img"
              className="mt-4 h-16 rounded-2xl bg-linear-to-r from-brand-indigo to-brand-violet"
              aria-label="标准渐变：繁梦蓝到星夜紫，135°"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              星夜渐变：星光紫 #8F72FF → 科技蓝 #4F86FF
            </p>
          </div>
        </section>

        <section aria-labelledby="type-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="type-title"
              eyebrow="品牌字体"
              title="中文思源黑体，英文 Inter"
              description="两款均为免费商用开源字体（SIL OFL）。网站和产品界面用 Inter 配系统中文字体（苹方 / 微软雅黑），宣传物料用思源黑体。"
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card/50 p-6">
                <p className="text-xs text-muted-foreground">中文 · 思源黑体 / Noto Sans SC</p>
                <p className="mt-4 text-5xl font-bold tracking-widest">繁梦空间</p>
                <p className="mt-3 text-lg text-muted-foreground">
                  为每一个家，编织安心入梦的智能空间。
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  标识用 Bold（字距 +8%），标题用 Bold / Medium，正文用 Regular。
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/50 p-6">
                <p className="text-xs text-muted-foreground">英文 · Dream Space 定制字标与 Inter</p>
                <BrandLogo className="mt-4 h-12 w-auto" />
                <p className="mt-4 text-3xl font-semibold tracking-tight">Dream Space 0123456789</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  大标题用 Semibold（字距 -2%，自动切换 Display 字形），正文用
                  Regular；数字一律等宽对齐。正文中英文品牌名写作 Dream
                  Space（首字母大写，中间留空格）。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="usage-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="usage-title"
              eyebrow="使用规范"
              title="保持呼吸感，保持原样"
              description="请直接使用本页提供的标识文件，不要自行重新排版或描摹。"
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card/50 p-6">
                <Surface dark={false} className="h-48">
                  <div className="relative border border-dashed border-brand-indigo/60 p-8">
                    <Image
                      src={`${B}/fmkj-logo.svg`}
                      alt=""
                      width={436}
                      height={120}
                      unoptimized
                      className="h-12 w-auto"
                    />
                    <span className="absolute top-1 left-1 text-xs text-brand-indigo">X</span>
                  </div>
                </Surface>
                <h3 className="mt-4 text-sm font-semibold">安全空间与最小尺寸</h3>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li className="flex gap-2">
                    <Check className="size-3.5 shrink-0 text-success" />
                    四周至少留出一个「X」的空白（X = 标志高度的 1/4）。
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-3.5 shrink-0 text-success" />
                    横版标识最小宽度 120px（印刷 30mm）；单独标志最小 16px。
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-3.5 shrink-0 text-success" />
                    浅色背景用标准版，深色或照片背景用反白版。
                  </li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {DONTS.map((d) => (
                  <div key={d.label} className="rounded-2xl border border-border bg-card/50 p-4">
                    <Surface dark={false} className="relative h-28 overflow-hidden">
                      <Image
                        src={`${B}/fmkj-logo.svg`}
                        alt=""
                        width={436}
                        height={120}
                        unoptimized
                        className={cn('h-8 w-auto', d.className)}
                      />
                      <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-destructive text-background">
                        <X className="size-3" />
                      </span>
                    </Surface>
                    <p className="mt-3 text-xs text-muted-foreground">{d.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
