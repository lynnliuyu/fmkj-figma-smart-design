import fs from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'

import { LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { ScaledStack } from '@/components/scaled-frame'
import { Button } from '@astryxdesign/core/Button'
import { APP_NAME } from '@/lib/brand'
import { getCompanyInfo } from '@/lib/cached-data'
import { constructionDeckPages } from '@/plugins/proposal/construction-deck'
import { DeckRoot, deckPreviewPages } from '@/plugins/proposal/deck'
import { toPickerTemplate } from '@/plugins/proposal/picker-data'
import { getTemplatePreviewDocs, templatePreview, templateTheme } from '@/plugins/proposal/preview'
import { loadPublicProposalTemplates } from '@/plugins/proposal/registry'
import { resolveProposalTemplate } from '@/plugins/proposal/templates'
import { Swatches } from '@/plugins/proposal/template-picker'

import { TemplateCard } from '@/components/proposal-template-card'

export const dynamic = 'force-dynamic'
/** 后台新增的模板第一次访问时生成，之后按小时或保存时刷新 */
export const dynamicParams = true

/** 有静态缩略图（scripts/generate-template-thumbnails.mjs 生成）时用作分享卡片 */
const staticThumb = (slug: string) => {
  const rel = `/proposal-templates/${slug}.jpg`
  return fs.existsSync(path.join(process.cwd(), 'public', rel)) ? rel : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const tpl = resolveProposalTemplate(slug, await loadPublicProposalTemplates())
  if (!tpl) return { title: `方案模板 · ${APP_NAME}` }
  const image = staticThumb(tpl.value)
  return {
    title: `${tpl.label} · 方案模板库 · ${APP_NAME}`,
    description: `${tpl.description}。适合${tpl.audience}，${tpl.occasion}。`,
    alternates: { canonical: `/templates/${tpl.value}` },
    ...(image
      ? {
          openGraph: {
            images: [{ url: image, width: 1200, height: 800, alt: `${tpl.label}封面` }],
          },
        }
      : {}),
  }
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [templates, docs, company] = await Promise.all([
    loadPublicProposalTemplates(),
    getTemplatePreviewDocs().catch(() => null),
    getCompanyInfo().catch(() => null),
  ])
  const tpl = resolveProposalTemplate(slug, templates)
  if (!tpl) notFound()
  const { pages } = templatePreview(tpl, docs)
  const t = toPickerTemplate(tpl, { pages })
  const theme = templateTheme(tpl)
  const date = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const others = templates.filter((x) => x.value !== tpl.value && x.kind === tpl.kind).slice(0, 3)
  const otherCards = others.map((x) => {
    const p = templatePreview(x, docs)
    return { t: toPickerTemplate(x, { pages: p.pages }), thumb: p.thumb }
  })
  const facts: [string, string][] = [
    ['版式', t.frameworkLabel],
    ['样张页数', t.pages ? `${t.pages} 页（随项目增减）` : '随项目变化'],
    ['封面', t.coverStyle],
    ['画面', t.mood],
    ['价格', t.priceShown ? '含预算与设备明细' : '不含价格'],
  ]

  return (
    <div data-landing className="min-h-svh overflow-x-clip bg-background text-foreground">
      <LandingNav />
      <main>
        <section aria-labelledby="template-title" className="px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 text-muted-foreground"
              href="/templates"
              icon={<ArrowLeft />}
              label="方案模板库"
            />
            <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 id="template-title" className="text-headline font-medium">
                    {t.label}
                  </h1>
                  <Swatches colors={t.swatches} />
                </div>
                <p className="mt-4 text-lead text-muted-foreground">{t.description}</p>
                <dl className="mt-8 space-y-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">适合什么客户</dt>
                    <dd className="mt-1 text-base font-medium">{t.audience}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">什么时候用</dt>
                    <dd className="mt-1 text-base font-medium">{t.occasion}</dd>
                  </div>
                </dl>
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {t.highlights.map((h) => (
                    <span
                      key={h}
                      className="rounded-full border px-3 py-1 text-xs text-muted-foreground"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
                    href="/projects"
                    icon={<ArrowRight />}
                    label="在项目里使用"
                  />
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-11 rounded-full px-6 text-base"
                    href="#sample"
                    label="看整套样张"
                  />
                </div>
              </div>
              <div className="space-y-6">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border bg-card p-5 text-sm">
                  {facts.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="mt-1">{v}</dd>
                    </div>
                  ))}
                </dl>
                {t.sections.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      章节顺序（按编排规范）
                    </p>
                    <ol className="divide-y rounded-2xl border bg-card">
                      {t.sections.map((s, i) => (
                        <li
                          key={s.value}
                          className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm"
                        >
                          <span>
                            <span className="mr-3 text-muted-foreground tabular-nums">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            {s.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{s.pages}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <ul className="space-y-2 rounded-2xl border bg-card p-5 text-sm">
                    {[
                      '项目信息封面与全屋点位图',
                      '房间配置与设备清单（含点位代号）',
                      '逐点安装核对表，现场打勾确认',
                      '不出现任何单价与总价',
                    ].map((x) => (
                      <li key={x} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {x}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          id="sample"
          aria-labelledby="sample-title"
          className="mt-16 scroll-mt-20 border-y bg-neutral-200/60 px-4 py-12 sm:px-6 lg:px-8 dark:bg-neutral-900"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="sample-title" className="text-lg font-medium">
                整套样张
              </h2>
              <p className="text-sm text-muted-foreground">
                示例：平台内置的三层别墅项目 · 页数随项目的图纸、房间与设备自动增减
              </p>
            </div>
            {docs ? (
              tpl.kind === 'owner' ? (
                <ScaledStack width={1440}>
                  <DeckRoot theme={theme}>
                    {deckPreviewPages(docs, theme, { insights: true, sections: tpl.sections })}
                  </DeckRoot>
                </ScaledStack>
              ) : (
                <ScaledStack width={1123}>
                  <div className="space-y-6">
                    {constructionDeckPages(docs, 'symbol', true, date).map((render, i) => (
                      <div key={i}>{render(i + 1)}</div>
                    ))}
                  </div>
                </ScaledStack>
              )
            ) : (
              <p className="rounded-2xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
                示例项目暂时不可用，请稍后再来看样张。
              </p>
            )}
          </div>
        </section>

        {otherCards.length ? (
          <section aria-labelledby="others-title" className="px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="others-title" className="text-lg font-medium">
                  再看看其他模板
                </h2>
                <Link
                  href="/templates"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  全部模板
                </Link>
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {otherCards.map((c) => (
                  <TemplateCard key={c.t.value} t={c.t} thumb={c.thumb} />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <LandingFooter
        qrCodeUrl={company?.qrCode?.url ?? '/brand/wechat-contact-qr.jpg'}
        qrCaption={company?.qrCaption ?? '扫码添加微信'}
      />
    </div>
  )
}
