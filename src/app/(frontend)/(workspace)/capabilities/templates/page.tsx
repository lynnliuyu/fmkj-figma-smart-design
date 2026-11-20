import Image from 'next/image'

import { EmptyState } from '@astryxdesign/core/EmptyState'
import { PageHeader } from '@/components/page-header'
import { TemplateCard } from '@/components/proposal-template-card'
import { pageTitle } from '@/lib/brand'
import { allStyles } from '@/documents/registry'
import { buildTemplateGallery } from '@/plugins/proposal/preview'
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
  // 用与 /templates 公开页、插件详情页完全一致的图库构造：
  // buildTemplateGallery 是**同步**函数（传 docs=null 时用内置样张数据），
  // 所以本页仍然不查库、不读 searchParams，不会掉回 Suspense 骨架屏。
  const gallery = buildTemplateGallery(BUILTIN_PROPOSAL_TEMPLATES, null)
  const ownerTemplates = gallery.items.filter((t) => t.kind === 'owner')
  const constructionTemplates = gallery.items.filter((t) => t.kind === 'construction')
  const docStyles = allStyles()

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="模板中心"
        description="方案模板、点位图显示方案与文档风格，集中在这里查看。"
      />

      {/* 方案模板 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">方案模板</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            方案演示的章节编排、版式与主题色。在项目里选用后，方案会按所选模板生成。
          </p>
        </div>
        {ownerTemplates.length === 0 && constructionTemplates.length === 0 ? (
          <EmptyState
            title="还没有可用的方案模板"
            description="管理员在后台「方案模板」里添加后，这里会出现。"
          />
        ) : (
          <>
            {/* 业主方案：带真实封面缩略图。原来这里是纯文字卡片，
                用户看不出「墨金 / 原木 / 海盐」的视觉差别。 */}
            {ownerTemplates.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ownerTemplates.map((t) => (
                  <TemplateCard key={t.value} t={t} thumb={gallery.thumbs[t.value]} />
                ))}
              </div>
            ) : null}

            {/* 施工交底：不含价格的 A4 横版，和业主方案分开列。 */}
            {constructionTemplates.length ? (
              <div className="mt-2 flex flex-col gap-3">
                <h3 className="text-sm font-medium text-muted-foreground">施工交底（不含价格）</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {constructionTemplates.map((t) => (
                    <TemplateCard key={t.value} t={t} thumb={gallery.thumbs[t.value]} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* 点位图显示方案 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">点位图显示</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            决定业主方案演示里点位图的底图浓淡、覆盖圈与灯光光晕怎么显示。点位坐标与报价数据不受影响。
          </p>
        </div>
        {/* 显示方案已实现（src/lib/display-profile.ts），不再是「正在开发」。
            选择入口在点位图页的「显示设置」浮层里，保存到当前项目，所以这里只做说明，
            不重复放一套选择器。 */}
        <p className="text-sm text-muted-foreground">
          在项目的点位图页打开「显示设置」即可切换；所选方案保存在当前项目，换项目互不影响。
        </p>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docStyles.map((s) => (
              <div
                key={s.id}
                className="group flex flex-col overflow-hidden rounded-[var(--radius-container)] border bg-card"
              >
                {/* 真实样张：同一份报价内容在不同风格下的排版，用户能直接比字体与留白。
                    只有色块看不出差别——原来那样用户选不出来。 */}
                <div className="relative aspect-[4/3] overflow-hidden border-b bg-muted/40">
                  <Image
                    src={`/doc-styles/style-${s.id}.webp`}
                    alt={`${s.name} 文档风格样张`}
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw"
                    className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold tracking-tight">{s.name}</h3>
                    <div className="flex gap-1">
                      {[s.colors.paper, s.colors.ink, s.colors.muted, s.colors.accent].map(
                        (c, i) => (
                          <span
                            key={`${s.id}-${i}`}
                            className="size-4 rounded-full ring-1 ring-border"
                            style={{ backgroundColor: c }}
                            aria-label={`色值 ${c}`}
                          />
                        ),
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
