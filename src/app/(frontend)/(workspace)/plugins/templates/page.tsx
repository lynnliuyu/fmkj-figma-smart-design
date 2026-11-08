import Link from 'next/link'
import { ArrowUpRight, Sparkles } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pageTitle } from '@/lib/brand'
import { allStyles } from '@/documents/registry'
import { BUILTIN_PROPOSAL_TEMPLATES } from '@/plugins/proposal/templates'

export const metadata = { title: pageTitle('模板中心') }

/**
 * 模板中心（PROJECT-ARCHITECTURE §7.2）。
 *
 * 侧边栏「模板中心」的正式入口。之前它指向 /templates —— 那是公开营销落地页
 * （带 LandingNav/Footer，给站外访客看的），不是工作台内的模板中心。
 *
 * 设计取舍：本页刻意做成**完全同步的静态页面**，不查库、不读 searchParams。
 * 原因：`(workspace)/plugins/loading.tsx` 是父级路由的骨架屏，任何 async 数据
 * 获取都会让本页挂在 Suspense 里；实测用 async + await searchParams + 查库时，
 * 客户端始终只看到 36 个骨架块、卡片高度为 0。
 * 模板清单用内置常量（BUILTIN_PROPOSAL_TEMPLATES），文档风格用 allStyles()（同步）。
 */
export default function TemplateCenterPage() {
  const proposalTemplates = BUILTIN_PROPOSAL_TEMPLATES
  const docStyles = allStyles()

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        title="模板中心"
        description="方案模板、点位图显示方案与文档风格，集中在这里查看与选用。"
      />

      {/* 方案模板 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">方案模板</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            方案演示的章节编排、版式与主题色。在项目里选用后，方案会按所选模板生成。
          </p>
        </div>
        {proposalTemplates.length === 0 ? (
          <EmptyState
            title="还没有可用的方案模板"
            description="管理员在后台「方案模板」里添加后，这里会出现。"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {proposalTemplates.map((t) => (
              <Card key={t.value}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <span>{t.label}</span>
                    <Badge variant="outline">{t.kind === 'owner' ? '业主方案' : '施工交底'}</Badge>
                  </CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {t.highlights?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {t.highlights.map((h) => (
                        <Badge key={h} variant="secondary">
                          {h}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {t.audience ? (
                    <p className="text-xs text-muted-foreground">适合：{t.audience}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 点位图显示方案 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">点位图显示</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            设备图标样式、无线波纹、灯光光晕等显示效果。点位坐标与报价数据不受影响。
          </p>
        </div>
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="点位图显示方案正在开发"
          description="目前可以在点位图页的画板设置里临时调整显示效果；独立的显示方案会在后续版本提供。"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/projects">
                去项目里查看点位图
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          }
        />
      </section>

      {/* 文档风格 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">文档风格</h2>
          <p className="mt-1 text-sm text-muted-foreground">报价单与合同共用同一套文档风格。</p>
        </div>
        {docStyles.length === 0 ? (
          <EmptyState title="还没有可用的文档风格" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docStyles.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle>{s.name}</CardTitle>
                  <CardDescription>{s.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1.5">
                    {[s.colors.paper, s.colors.ink, s.colors.muted, s.colors.accent].map((c, i) => (
                      <span
                        key={`${s.id}-${i}`}
                        className="size-6 rounded-[var(--radius-inner)] ring-1 ring-border"
                        style={{ backgroundColor: c }}
                        aria-label={`色值 ${c}`}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
