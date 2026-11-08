// 必须最先 import：声明 CSS 级联层序，早于任何引用 Astryx / 主题 CSS 的模块。
// 详见该文件内注释与 Astryx 官方 styling-libraries/tailwind 文档。
import './layers.css'

import React from 'react'
import type { Metadata } from 'next'
import Script from 'next/script'
import { ThemeProvider } from '@/components/theme-provider'
import { Theme } from '@astryxdesign/core/theme'
import { themes, defaultThemeSlug } from '@/astryx-themes'
import { ACCENT_INIT_SCRIPT } from '@/lib/appearance'
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, COMPANY_NAME } from '@/lib/brand'
import { siteSans } from '@/lib/fonts'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BodyCustomCode, renderHeadCustomCode } from '@/lib/make-custom-code'
import { makeSiteSettings, sanitizeHtmlAttribute } from '@/lib/make-site-settings'
import './styles.css'

const defaultTitle = `${APP_NAME} ${APP_TAGLINE}`
const title = makeSiteSettings.title ?? defaultTitle
const description = makeSiteSettings.description ?? APP_DESCRIPTION
const favicon = makeSiteSettings.icons?.icon
const socialImage = makeSiteSettings.openGraph?.image
// 未在站点设置里配置分享图时，使用品牌分享图（public/brand）
const defaultSocialImage = {
  url: '/brand/fmkj-og.png',
  width: 1200,
  height: 630,
  alt: defaultTitle,
}
const googleAnalyticsId = sanitizeHtmlAttribute(makeSiteSettings.analytics?.googleAnalyticsId)

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.FIGMA_PUBLIC_URL || 'http://localhost:3000',
  ),
  title,
  description,
  applicationName: APP_NAME,
  creator: COMPANY_NAME,
  publisher: COMPANY_NAME,
  keywords: [
    '繁梦空间',
    'FMKJ',
    '全屋智能设计报价',
    '智能家居报价系统',
    '智能家居方案设计软件',
    '全屋智能点位图',
    '智能家居报价单模板',
    '米家全屋智能方案',
    'Aqara全屋智能报价',
    '全屋WiFi网络拓扑图',
    '智能家居施工交底清单',
  ],
  robots: makeSiteSettings.robots?.index === false ? { follow: false, index: false } : undefined,
  icons: favicon ? { icon: favicon } : undefined,
  openGraph: {
    title,
    description,
    siteName: APP_NAME,
    locale: 'zh_CN',
    type: 'website',
    images: [socialImage ?? defaultSocialImage],
  },
  twitter: {
    card: 'summary_large_image',
    images: [socialImage ?? defaultSocialImage.url],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const language = sanitizeHtmlAttribute(makeSiteSettings.language) || 'zh-CN'
  const addBypassLinks = makeSiteSettings.accessibility?.addBypassLinks === true
  const customScripts = makeSiteSettings.customScripts

  return (
    <html lang={language} suppressHydrationWarning className={`${siteSans.variable} bg-background`}>
      <head>
        {/* 恢复主题风格，避免首屏闪烁 */}
        <script dangerouslySetInnerHTML={{ __html: ACCENT_INIT_SCRIPT }} />
        {renderHeadCustomCode(customScripts?.headStart, 'head-start')}
        {renderHeadCustomCode(customScripts?.headEnd, 'head-end')}
      </head>
      <body className="min-h-screen antialiased">
        <BodyCustomCode html={customScripts?.bodyStart} />
        {addBypassLinks && (
          <a className="figma-bypass-link" href="#root">
            Skip to content
          </a>
        )}
        <div id="root" tabIndex={-1}>
          {/* Astryx 设计系统（试点）：提供主题上下文，供 Astryx 组件使用 */}
          <Theme theme={themes[defaultThemeSlug]}>
            <ThemeProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster />
            </ThemeProvider>
          </Theme>
        </div>
        {googleAnalyticsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="figma-google-analytics" strategy="afterInteractive">
              {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(googleAnalyticsId)});
`}
            </Script>
          </>
        )}
        <BodyCustomCode html={customScripts?.bodyEnd} />
      </body>
    </html>
  )
}
