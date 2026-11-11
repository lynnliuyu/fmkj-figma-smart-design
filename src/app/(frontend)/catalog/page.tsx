import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { PointMarker } from '@/components/point-marker'
import { ProductThumb } from '@/components/product-thumb'
import { Badge } from '@/components/ui/badge'
import { Button } from '@astryxdesign/core/Button'
import { pageTitle } from '@/lib/brand'
import { getCatalog } from '@/lib/cached-data'
import { categoryOfType, DEVICE_GROUPS } from '@/lib/device-types'
import { yuan } from '@/lib/quotes'
import { wiringSpecOf } from '@/app/(frontend)/print/projects/[id]/wiring/page'

/**
 * 运行时渲染，不在构建期预渲染。
 *
 * 为什么：这一页要 `await getCatalog()`（真连数据库取产品目录）。用
 * `revalidate` 让它在构建期预渲染时，构建机会去连生产库——库慢、不可达，
 * 或者 Payload 检测到迁移状态需要交互确认，构建就会卡住（实测卡满 60 秒
 * 后失败，报 `/catalog took more than 60 seconds`）。
 *
 * 同类的公开页（`/templates`、`/docs`）都是 `force-dynamic`，这一页之前漏了。
 * 产品目录本来就随后台数据变，运行时渲染 + 下面的缓存更贴合语义。
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: pageTitle('全屋智能点位图例符号与产品选型库'),
  description:
    '涵盖智能开关、调光灯具、传感器、智能门锁、电动窗帘、中控网关、AC+AP 全屋 WiFi 与 VRF 空调控制等 11 大系统、30+ 种 CAD 标准点位图例符号、水电零火线预留规范及主流品牌产品选型参考。',
  alternates: { canonical: '/catalog' },
}

export default async function PublicCatalogPage() {
  const catalog = await getCatalog().catch(() => [])
  const active = catalog.filter((p) => p.status === 'active')
  const brandNames = [
    ...new Set(active.map((p) => p.brand?.name).filter((v): v is string => Boolean(v))),
  ]

  return (
    <div data-landing className="min-h-svh overflow-x-clip bg-background text-foreground">
      <LandingNav />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="max-w-3xl">
          <h1 className="text-display font-medium">点位图例与产品选型库</h1>
          {/* 产品库为空时不能写「覆盖 0 个品牌、0 款在售产品」——那是把内部状态
              当宣传。部署方还没导入产品时改成只讲图例与规范本身。 */}
          <p className="mt-5 text-lead text-muted-foreground">
            {active.length > 0
              ? `统一全屋智能点位图符号、代号前缀与水电预留规范，覆盖 ${brandNames.length} 个主流品牌、${active.length} 款在售产品。`
              : '统一全屋智能点位图符号、代号前缀与水电预留规范，涵盖 11 大系统与 30+ 种 CAD 标准图例。'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
              href="/projects"
              icon={<ArrowRight />}
              label="用这些设备画点位出报价"
            />
            <Button
              size="lg"
              variant="secondary"
              className="h-11 rounded-full px-6 text-base"
              href="#products"
              label={active.length > 0 ? `浏览在售产品（${active.length}）` : '查看点位图例'}
            />
          </div>
        </div>

        {/* 一、全屋智能标准点位图例与水电预留规范 */}
        <section aria-labelledby="legend-title" className="mt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-4">
            <h2 id="legend-title" className="text-2xl font-medium tracking-tight">
              标准点位图例与水电施工预留规范
            </h2>
            <span className="text-sm text-muted-foreground">
              11 大系统类别 · 点位图、报价单与水电交底单共用
            </span>
          </div>

          <div className="mt-8 space-y-10">
            {DEVICE_GROUPS.map(({ category, types }) => (
              <div key={category.slug} className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <h3 className="text-base font-medium">{category.name}</h3>
                  <Badge variant="outline" className="font-mono text-xs">
                    代号前缀 {category.code}1, {category.code}2…
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {types.map((t) => {
                    const spec = wiringSpecOf(t.value)
                    return (
                      <div
                        key={t.value}
                        className="flex items-start gap-3.5 rounded-[var(--radius-container)] border border-border bg-card p-4"
                      >
                        <PointMarker type={t.value} className="mt-0.5 size-8 shrink-0" />
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{t.name}</span>
                            <span className="font-mono text-muted-foreground">
                              {category.code}n
                            </span>
                          </div>
                          <p className="mt-1.5 text-muted-foreground">{spec.box}</p>
                          <p className="mt-0.5 text-muted-foreground">{spec.cable}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 二、各系统代表在售产品（不含内部成本价） */}
        <section id="products" aria-labelledby="products-title" className="mt-24 scroll-mt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-4">
            <h2 id="products-title" className="text-2xl font-medium tracking-tight">
              {active.length > 0 ? '各系统主流选型参考' : '各系统图例与施工规范'}
            </h2>
            <span className="text-sm text-muted-foreground">
              共 {active.length} 款在售型号 · 登录工作台可查看完整产品库与批量选型
            </span>
          </div>

          <div className="mt-8 space-y-12">
            {DEVICE_GROUPS.map(({ category }) => {
              const items = active.filter(
                (p) => categoryOfType(p.deviceType)?.slug === category.slug,
              )
              if (!items.length) return null
              const shown = items.slice(0, 8)
              return (
                <div key={category.slug} className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <h3 className="text-base font-medium">{category.name}系统</h3>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      共 {items.length} 款型号
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {shown.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col justify-between gap-3 rounded-[var(--radius-container)] border border-border bg-card p-3.5"
                      >
                        <div className="flex gap-3">
                          <ProductThumb
                            src={p.image?.url}
                            alt={p.name}
                            size={96}
                            loading="lazy"
                            className="size-14 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            {p.brand ? (
                              <BrandLogo
                                name={p.brand.name}
                                logo={p.brand.logo}
                                className="h-3.5 max-w-16"
                              />
                            ) : null}
                            <p className="mt-1 line-clamp-2 text-xs leading-snug font-medium">
                              {p.name}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                              {p.sku}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-baseline justify-between border-t border-border/60 pt-2 text-xs">
                          <span className="truncate text-muted-foreground">
                            {p.platforms.length ? p.platforms.slice(0, 2).join(' / ') : '通用'}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {yuan(p.price)}
                            <span className="font-normal text-muted-foreground">
                              /{p.unit || '个'}
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
