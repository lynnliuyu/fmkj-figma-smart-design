import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { Section, SectionHeader } from '@/components/landing/section'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/brand'
import { getCompanyInfo } from '@/lib/cached-data'
import { DECK_SECTIONS, ORCHESTRATION_RULES, PROPOSAL_FRAMEWORKS } from '@/plugins/proposal/framework'
import { buildTemplateGallery, getTemplatePreviewDocs } from '@/plugins/proposal/preview'
import { loadPublicProposalTemplates } from '@/plugins/proposal/registry'
import { Swatches } from '@/plugins/proposal/template-picker'

import { TemplateCard } from '@/components/proposal-template-card'

export const metadata: Metadata = {
  title: `方案模板库 · ${APP_NAME}`,
  description: '全屋智能方案模板库：每套模板写清适合什么客户、什么时候用、有哪些章节，缩略图就是真实封面，点进去可以看整套样张。',
  alternates: { canonical: '/templates' },
}

/** 模板与示例项目很少变动：按小时重新生成；后台修改模板、场景或图片时立即刷新（见 lib/revalidate-templates.ts） */
export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const [templates, docs, company] = await Promise.all([loadPublicProposalTemplates(), getTemplatePreviewDocs().catch(() => null), getCompanyInfo().catch(() => null)])
  const { items, thumbs } = buildTemplateGallery(templates, docs)
  const owner = items.filter((t) => t.kind === 'owner')
  const construction = items.filter((t) => t.kind === 'construction')
  const frameworks = PROPOSAL_FRAMEWORKS.filter((f) => owner.some((t) => t.framework === f.value))

  return (
    <div data-landing className="min-h-svh overflow-x-clip bg-background text-foreground">
      <LandingNav />
      <main>
        <section aria-labelledby="templates-title" className="px-4 pt-20 sm:px-6 sm:pt-28 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h1 id="templates-title" className="mt-4 max-w-3xl text-display font-medium">
              一份点位，{owner.length + construction.length} 种讲法。
            </h1>
            <p className="mt-6 max-w-2xl text-lead text-muted-foreground">
              同一套点位与报价，换个模板就是另一份提案。每套模板都写清适合什么客户、什么时候用、有哪些章节；缩略图就是真实封面，点进去看整套样张。
            </p>
            <dl className="mt-10 grid max-w-3xl grid-cols-3 gap-6 border-t pt-6">
              <div>
                <dt className="text-xs text-muted-foreground">业主方案</dt>
                <dd className="mt-1 text-2xl font-medium tabular-nums">{owner.length} 套</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">施工交底</dt>
                <dd className="mt-1 text-2xl font-medium tabular-nums">{construction.length} 套</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">版式框架</dt>
                <dd className="mt-1 text-2xl font-medium tabular-nums">{frameworks.length} 种</dd>
              </div>
            </dl>
          </div>
        </section>

        <Section id="owner" labelledBy="owner-title" className="pt-16 sm:pt-20">
          <SectionHeader id="owner-title" title="业主方案">
            给业主看的横版提案。按版式分为{frameworks.map((f) => `「${f.label}」`).join('')}，样张使用平台内置的三层别墅示例项目生成。
          </SectionHeader>
          {frameworks.map((f) => (
            <div key={f.value} className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                <h3 className="text-lg font-medium">{f.label}</h3>
                <p className="text-sm text-muted-foreground">{f.description}</p>
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {owner
                  .filter((t) => t.framework === f.value)
                  .map((t) => (
                    <TemplateCard key={t.value} t={t} thumb={thumbs[t.value]} />
                  ))}
              </div>
            </div>
          ))}
        </Section>

        {construction.length ? (
          <Section id="construction" labelledBy="construction-title" className="pt-0 sm:pt-0">
            <SectionHeader id="construction-title" title="施工交底">
              给安装团队的 A4 横版资料：点位代号、安装位置、房间配置与逐点核对表，不含任何价格，和业主方案分开生成。
            </SectionHeader>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {construction.map((t) => (
                <TemplateCard key={t.value} t={t} thumb={thumbs[t.value]} />
              ))}
            </div>
          </Section>
        ) : null}

        <Section id="compare" labelledBy="compare-title" className="pt-0 sm:pt-0">
          <SectionHeader id="compare-title" title="怎么选">
            按客户和场合挑模板：第一次沟通用场景故事打动人，比价阶段用预算速览，正式汇报用完整提案。
          </SectionHeader>
          <div className="mt-8 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">模板</th>
                  <th className="px-4 py-3 font-medium">版式</th>
                  <th className="px-4 py-3 font-medium">适合什么客户</th>
                  <th className="px-4 py-3 font-medium">什么时候用</th>
                  <th className="px-4 py-3 font-medium">封面 / 画面</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">样张页数</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...owner, ...construction].map((t) => (
                  <tr key={t.value} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/templates/${t.value}`} className="flex items-center gap-2 font-medium whitespace-nowrap hover:underline">
                        <Swatches colors={t.swatches} />
                        {t.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{t.frameworkLabel}</td>
                    <td className="px-4 py-3">{t.audience}</td>
                    <td className="px-4 py-3">{t.occasion}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.coverStyle} · {t.mood}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{t.pages ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="rules" labelledBy="rules-title" className="pt-0 sm:pt-0">
          <SectionHeader id="rules-title" title="编排规范">
            所有模板（包括后台自定义的模板）都按同一套规则编排章节，内容只来自项目的真实数据。
          </SectionHeader>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <ol className="space-y-3">
              {ORCHESTRATION_RULES.map((r, i) => (
                <li key={r} className="flex gap-4 rounded-xl border bg-card p-4 text-sm leading-relaxed">
                  <span className="font-medium text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">章节</th>
                    <th className="px-4 py-3 font-medium">内容</th>
                    <th className="px-4 py-3 font-medium">页数</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {DECK_SECTIONS.map((s) => (
                    <tr key={s.value} className="align-top">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{s.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.description}
                        {s.needsPoints ? '（需要点位）' : ''}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{s.pages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <section aria-labelledby="templates-cta" className="border-t px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
            <div>
              <h2 id="templates-cta" className="text-headline font-medium">
                用自己的项目试一套
              </h2>
              <p className="mt-3 text-lead text-muted-foreground">在项目「归档」或方案页里打开模板选择器，缩略图与页数会按你的项目实时计算。</p>
            </div>
            <Button asChild size="lg" className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85">
              <Link href="/projects">
                进入工作台
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <LandingFooter qrCodeUrl={company?.qrCode?.url ?? '/brand/wechat-contact-qr.jpg'} qrCaption={company?.qrCaption ?? '扫码添加微信'} />
    </div>
  )
}
