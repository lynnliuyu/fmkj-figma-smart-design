// 必须最先 import：声明 CSS 级联层序，早于任何引用 Astryx / 主题 CSS 的模块。
// 详见该文件内注释与 Astryx 官方 styling-libraries/tailwind 文档。
import './layers.css'

import React from 'react'
import type { Metadata } from 'next'
import Script from 'next/script'
import { ThemeProvider } from '@/components/theme-provider'
import { AstryxThemeProvider } from '@/components/astryx-theme-provider'
import { BROWSER_WARN_INIT_SCRIPT } from '@/lib/browser-check'
import { BANNER_OFFSET_CSS } from '@/lib/browser-warn-style'
import { BrowserWarningBanner } from '@/components/browser-warning'
import { ASTRYX_THEME_INIT_SCRIPT } from '@/lib/astryx-theme'
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, COMPANY_NAME } from '@/lib/brand'
import { siteSans } from '@/lib/fonts'
import { siteUrl } from '@/lib/site-url'
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
  // 统一走 siteUrl()：生产只设 PUBLIC_URL，由 next.config 派生 NEXT_PUBLIC_SITE_URL
  metadataBase: new URL(siteUrl('http://localhost:3000')),
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
        {/* 旧内核早期提示：head 内联脚本在首次 HTML 解析时执行；等 body 就绪后插入提示，
            不依赖 App chunk/CSS，Edge 100 也能显示。 */}
        {/* 高度由两版写入 html，和主题标记放在同一水合边界，body 只读取 CSS 变量。 */}
        <style>{BANNER_OFFSET_CSS}</style>
        <script dangerouslySetInnerHTML={{ __html: BROWSER_WARN_INIT_SCRIPT }} />
        {renderHeadCustomCode(customScripts?.headStart, 'head-start')}
        {renderHeadCustomCode(customScripts?.headEnd, 'head-end')}
      </head>
      <body className="min-h-screen antialiased">
        <BodyCustomCode html={customScripts?.bodyStart} />
        <BrowserWarningBanner />
        {addBypassLinks && (
          <a className="figma-bypass-link" href="#root">
            Skip to content
          </a>
        )}
        <div id="root" tabIndex={-1}>
          {/* Astryx 设计系统：提供主题上下文；主题可在「设置 → 外观」切换。
              ⚠️ 必须在 ThemeProvider **内层**：Astryx 的 `<Theme mode>` 要读
              next-themes 的 resolvedTheme，包在外面 useTheme() 拿不到值，
              组件 token 会永远停在浅色（暗色下深底深字）。 */}
          <ThemeProvider>
            <AstryxThemeProvider>{children}</AstryxThemeProvider>
          </ThemeProvider>
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
