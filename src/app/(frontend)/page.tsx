import Image from 'next/image'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Gift, MessageCircle, Sparkles } from 'lucide-react'

import { AppsSection } from '@/components/landing/apps-section'
import { DeliverySection } from '@/components/landing/delivery-section'
import { LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { LibrarySection } from '@/components/landing/library-section'
import { PlanDemo } from '@/components/landing/plan-demo'
import { ProposalShowcase } from '@/components/landing/proposal-showcase'
import { QuoteShowcase } from '@/components/landing/quote-showcase'
import { Section } from '@/components/landing/section'
import { Button } from '@astryxdesign/core/Button'
import { MINIMAL_STYLE } from '@/documents/minimal'
import { DOC_KINDS } from '@/documents/registry'
import { APP_NAME, COMPANY_NAME } from '@/lib/brand'
import { getCompanyInfo } from '@/lib/cached-data'
import { getLandingShowcase } from '@/lib/landing-showcase'
import { PLUGIN_DOC_STYLES } from '@/plugins/doc-styles/styles'

export const metadata: Metadata = {
  title: `${APP_NAME} · 全屋智能方案设计与报价工作台`,
  description:
    '在户型图上布好设备点位，系统按设备类型统计数量、匹配产品库型号，一键生成报价单、合同、方案演示与施工交底。为全屋智能设计师与集成商打造的方案工作台。',
  alternates: { canonical: '/' },
}

const DOC_STYLES = [MINIMAL_STYLE, ...PLUGIN_DOC_STYLES]

/**
 * 首页：产品本身就是展示。数据来自系统内置的示例母版项目，
 * 按小时重新生成（示例母版很少改动；改动后最迟一小时生效）。
 */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [data, company] = await Promise.all([
    getLandingShowcase().catch(() => null),
    getCompanyInfo().catch(() => null),
  ])
  const hasDemo = Boolean(data?.sheets.length)
  const wechatQrUrl = company?.qrCode?.url ?? '/brand/wechat-contact-qr.jpg'
  const wechatQrCaption = company?.qrCaption ?? '扫码添加微信'
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FIGMA_PUBLIC_URL ||
    'https://fmkj.top'
  ).replace(/\/+$/, '')
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: COMPANY_NAME,
        alternateName: APP_NAME,
        url: siteUrl,
        logo: `${siteUrl}/brand/fmkj-app-icon-512.png`,
      },
      {
        '@type': 'SoftwareApplication',
        name: `${APP_NAME} · 全屋智能方案设计与报价工作台`,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web, Windows, macOS, 微信小程序',
        url: siteUrl,
        description:
          '面向全屋智能设计师与集成商的点位图绘制、自动选型报价、8章横版方案演示（含AC+AP网络与中控拓扑图）、施工合同与交底清单一体工作台。',
        featureList: [
          '户型图点位绘制与房间分区自动统计',
          '按米家、Aqara、Apple Home、华为、涂鸦、KNX 平台智能匹配型号',
          '6 种报价版式 × 7 套视觉风格一键换装导出 PDF 与长图',
          '8 章 A4 横版客户提案（自动生成 AC 控制器 + 各房间 AP 网络与中控拓扑图）',
          '合同自动带入金额与分期节点、施工交底清单与整套交付资料包一键打包',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: '繁梦空间如何从户型图快速生成全屋智能报价单？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '上传户型图或 DWG 图纸后，在画板上框选房间并摆放开关、灯光、传感器、窗帘、AP 与网关点位，系统会自动按设备类型统计数量并匹配产品库型号，实时生成按系统、按楼层房间或预算概览等 6 种版式的报价单。',
            },
          },
          {
            '@type': 'Question',
            name: '支持生成哪些交付文档给业主和安装施工团队？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '同一份点位与报价数据可一键生成 8 章 A4 横版客户提案（含封面、点位平面、AC+AP 网络与中控拓扑、空间场景与验收表）、多风格报价单、正式施工合同、A4 横版点位布置图以及不含价格的施工交底核对清单，并支持在归档页一键打包为 ZIP 或合并 PDF。',
            },
          },
        ],
      },
    ],
  }
  return (
    <div data-landing className="min-h-svh overflow-x-clip bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingNav />
      <main>
        <section aria-labelledby="hero-title" className="px-4 pt-20 sm:px-6 sm:pt-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 id="hero-title" className="text-display font-medium">
              画完点位，报价就好了
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lead text-muted-foreground">
              在户型图上布好设备点位，系统按设备类型统计数量、匹配产品库型号，
              <br className="hidden sm:block" />
              几分钟出一份能直接交给客户的报价单。
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
                href="/projects"
                icon={<ArrowRight />}
                label="进入工作台"
              />
              {data?.quote ? (
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 rounded-full px-6 text-base"
                  href="#proposal"
                  label="看方案与报价样张"
                />
              ) : null}
            </div>
          </div>
          {data && hasDemo ? (
            <div id="plan" className="mx-auto mt-16 max-w-7xl sm:mt-20">
              <PlanDemo data={data} />
            </div>
          ) : null}
        </section>

        {data && company ? (
          <Section id="proposal" labelledBy="proposal-title" className="pt-28 sm:pt-36">
            <ProposalShowcase data={data} company={company} />
          </Section>
        ) : null}

        {data?.quote && company ? (
          <Section id="quote" labelledBy="quote-title" className="pt-28 sm:pt-36">
            <QuoteShowcase
              data={data}
              quote={data.quote}
              styles={DOC_STYLES}
              layouts={DOC_KINDS.quote.layouts}
              company={company}
            />
          </Section>
        ) : null}

        <DeliverySection total={data?.quote?.total ?? null} styles={DOC_STYLES} />
        {data ? (
          <LibrarySection products={data.library.products} brands={data.library.brands} />
        ) : null}
        <AppsSection />

        <section
          aria-labelledby="closing-title"
          className="border-t border-border/70 px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
        >
          <div className="mx-auto grid max-w-5xl items-center gap-10 rounded-3xl border bg-card p-6 shadow-xs sm:p-10 lg:grid-cols-[1fr_auto]">
            <div className="space-y-5 text-left">
              <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                全屋智能设计师与集成商专属福利
              </div>
              <h2 id="closing-title" className="text-headline font-medium">
                下一个项目，从一张户型图开始
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                免费注册即送 <strong className="font-semibold text-foreground">20 AI 积分</strong>{' '}
                并自带完整三层别墅示例项目。添加微信可领取
                <strong className="font-semibold text-foreground"> 7 天专业版体验兑换码</strong>
                （解锁全套高定提案模板、施工水电布线表与一键交付包），或咨询团队私有化部署。
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  size="lg"
                  className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
                  href="/projects"
                  icon={<ArrowRight />}
                  label="进入工作台"
                />
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 rounded-full px-6 text-base"
                  href="/login?mode=register"
                  icon={<Gift />}
                  label="免费注册领 20 积分"
                />
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-2xl border bg-muted/30 p-5 text-center sm:min-w-56">
              <div className="overflow-hidden rounded-xl border bg-white p-2 shadow-2xs">
                <Image
                  src={wechatQrUrl}
                  alt={wechatQrCaption}
                  width={152}
                  height={152}
                  unoptimized
                  className="size-36 object-contain"
                />
              </div>
              <div className="space-y-0.5">
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                  <MessageCircle className="size-4 text-primary" />
                  {wechatQrCaption}
                </p>
                <p className="text-xs text-muted-foreground">领专业版体验码 · 部署与合作咨询</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter qrCodeUrl={wechatQrUrl} qrCaption={wechatQrCaption} />
    </div>
  )
}
