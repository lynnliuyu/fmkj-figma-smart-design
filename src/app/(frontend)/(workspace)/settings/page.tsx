import Link from 'next/link'
import { Activity, ArrowRight } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Button } from '@astryxdesign/core/Button'
import { Section } from '@astryxdesign/core/Section'
import { allStyles, availableStyles, DOC_KIND_LIST, DOC_KINDS } from '@/documents/registry'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { getBrands, getCatalog, getCompanyInfo } from '@/lib/cached-data'
import { DEFAULT_CONTRACT_TERMS } from '@/lib/contracts'
import { isPlatformOperator } from '@/lib/platform-operator'
import { loadCostSettings } from '@/lib/services/cost-settings-service'
import { PLUGIN_CATEGORIES, PLUGINS } from '@/plugins'
import { getPluginFlags } from '@/plugins/state'

import { AppearanceSettings } from './appearance-settings'
import { CompanyForm } from './company-form'
import { CostSettingsCard, type CostBrandOption } from './cost-settings'
import { redirectToLogin } from '@/lib/login-redirect'

export const metadata = { title: pageTitle('设置') }

export default async function SettingsPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const [company, flags, costSettings, brands, catalog, operator] = await Promise.all([
    getCompanyInfo(user.id),
    getPluginFlags(user.id),
    loadCostSettings(user),
    getBrands(),
    getCatalog(),
    isPlatformOperator(user),
  ])
  const enabledStyles = new Set(availableStyles(flags).map((s) => s.id))
  // 品牌按在售产品数排序：常用品牌排在前面
  const productCount = new Map<string, number>()
  for (const p of catalog)
    if (p.brand && (p.status ?? 'active') === 'active')
      productCount.set(p.brand.slug, (productCount.get(p.brand.slug) ?? 0) + 1)
  const costBrands: CostBrandOption[] = brands
    .map((b) => ({
      slug: b.slug,
      name: b.name,
      logo: b.logo,
      products: productCount.get(b.slug) ?? 0,
    }))
    .filter((b) => b.products > 0 || costSettings.brandRates.some((r) => r.brand === b.slug))
    .sort((a, b) => b.products - a.products || a.name.localeCompare(b.name, 'zh'))

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="设置"
        description="外观主题、报价单与合同抬头、联系方式，以及报价内部成本与毛利规则"
      />

      {/*
        页内分区导航：设置页把外观、品牌与联系、成本串成一条长表单，
        首屏只能看到主题选择，后面的业务设置要靠滚动找。吸顶的一排锚点
        让三块内容一眼可见（纯文本链接，不做 Tab——Tab 会打断浏览的连续性）。

        **top 必须是全局顶栏的高度（h-12 = 48px），不能用 top-0**：
        全局顶栏（site-header）是 `sticky top-0 z-50`，这里原来是 `top-0 z-10`，
        吸顶后整条导航被顶栏压在下面 —— 实测滚动后 elementFromPoint 在「外观」链接
        位置取到的是 HEADER，「外观 / 品牌与联系 / 成本与毛利」三个链接全部点不到。
        改用 top-12 让导航停在顶栏下沿；z-index 保持 10 不动，否则会盖住顶栏的下拉菜单。
      */}
      <nav
        aria-label="设置分区"
        className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-1 rounded-[var(--radius-container)] border bg-background/95 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        {[
          { href: '#settings-appearance', label: '外观' },
          { href: '#settings-brand', label: '品牌与联系' },
          { href: '#settings-cost', label: '成本与毛利' },
        ].map((item) => (
          <Button
            key={item.href}
            href={item.href}
            variant="ghost"
            size="sm"
            label={item.label}
            className="text-muted-foreground hover:text-foreground"
          />
        ))}
      </nav>
      {operator ? (
        <Link
          href="/settings/reports"
          className="group flex items-center justify-between gap-3 rounded-[var(--radius-container)] border bg-card px-4 py-3 shadow-2xs transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground">客户使用与运维诊断报告</div>
              <div className="text-xs text-muted-foreground">
                查看客户活跃漏斗、户型图 CAD 识别复盘、AI 模型 Auto 路由统计与异常排障日志
              </div>
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      ) : null}
      {/* 三个设置分组用官方 Section（页面区域），不再自己拼 div + Card。 */}
      <Section id="settings-appearance" variant="transparent" padding={0} className="scroll-mt-24">
        <AppearanceSettings />
      </Section>
      <Section id="settings-brand" variant="transparent" padding={0} className="scroll-mt-24">
        <CompanyForm
          initial={{
            name: company.name ?? '',
            slogan: company.slogan ?? '',
            phone: company.phone ?? '',
            email: company.email ?? '',
            address: company.address ?? '',
            qrCaption: company.qrCaption ?? '',
            quoteNotes: company.quoteNotes ?? '',
            contractTerms: company.contractTerms ?? DEFAULT_CONTRACT_TERMS,
            printProductImages: company.printProductImages !== false,
            logoUrl: company.logo?.url ?? null,
            qrCodeUrl: company.qrCode?.url ?? null,
          }}
          plugins={PLUGINS.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            categoryLabel: PLUGIN_CATEGORIES.find((c) => c.key === p.category)?.label ?? '其他',
            status: p.status,
            enabled: flags[p.id],
          }))}
          documents={{
            kinds: DOC_KIND_LIST.map((kind) => ({
              kind,
              label: DOC_KINDS[kind].label,
              layouts: DOC_KINDS[kind].layouts.map((l) => ({ value: l.value, label: l.label })),
            })),
            styles: allStyles().map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              swatch: [s.colors.paper, s.colors.accent, s.colors.headBg],
              enabled: enabledStyles.has(s.id),
            })),
            defaults: company.documentDefaults,
          }}
        />
      </Section>
      <Section id="settings-cost" variant="transparent" padding={0} className="scroll-mt-24">
        <CostSettingsCard initial={costSettings} brands={costBrands} />
      </Section>
    </section>
  )
}
