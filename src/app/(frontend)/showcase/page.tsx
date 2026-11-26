import type { Metadata } from 'next'
import { Button } from '@astryxdesign/core/Button'

import { BrandLogo } from '@/components/landing/landing-chrome'
import { PointMarker } from '@/components/point-marker'
import { deviceLook } from '@/board/packs/smart-home/look'
import { categoryOfType, DEVICE_CATEGORIES, deviceTypeOf } from '@/lib/device-types'
import { APP_NAME, COMPANY_NAME } from '@/lib/brand'
import {
  getLandingShowcase,
  type LandingShowcase,
  type ShowcaseSheet as SheetData,
} from '@/lib/landing-showcase'
import { yuan } from '@/lib/quotes'

import { ShowcaseSheet } from './showcase-sheet'

export const metadata: Metadata = {
  title: `展示 · ${APP_NAME}`,
  description: `${COMPANY_NAME}方案展示页：1920×1080 固定版式，供媒体、视频与投屏使用。`,
}

const VW = 1200
const VH = 800

/**
 * 方案展示页：1920×1080 固定版式（16:9），标题 + 大数字 + 点位图 + 报价摘要，
 * 供媒体截图、视频成片与线下投屏使用。内容来自系统内置示例母版项目。
 *
 * 用「展示版」点位图（public/demo-plans/*-showcase.png，去引线/型号文字），
 * 缩到 960px 仍可读。不套全站导航/页脚——它是给视频机位与投屏的独立画面。
 */
export const dynamic = 'force-dynamic'

const catSlug = (type: string) => categoryOfType(type)?.slug ?? 'other'
const catOrder = (type: string) => DEVICE_CATEGORIES.findIndex((c) => c.slug === catSlug(type))
const typeName = (type: string) => deviceTypeOf(type)?.name ?? '设备'

function SheetMarkers({ sheet }: { sheet: SheetData }) {
  // 展示图已经烘焙点位，只在施工图上叠加原始坐标标记。
  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="pointer-events-none absolute inset-0 size-full"
      role="img"
      aria-label={`${sheet.floor}点位图，共 ${sheet.points.length} 个设备点位`}
    >
      {sheet.points.map((p) => (
        <g key={p.id} transform={`translate(${p.rx * VW} ${p.ry * VH})`}>
          <circle r={12} fill="white" opacity={0.95} />
          <circle r={10} fill={deviceLook(p.type).color} />
        </g>
      ))}
    </svg>
  )
}

function QuoteSummary({ data }: { data: LandingShowcase }) {
  const quote = data.quote
  if (!quote) return <p className="text-sm text-muted-foreground">此方案暂无报价。</p>
  const rows = [...quote.lines]
    .sort((a, b) => catOrder(a.type) - catOrder(b.type) || b.price * b.qty - a.price * a.qty)
    .slice(0, 5)
  return (
    <div className="grid gap-x-6 gap-y-1.5 text-sm">
      {rows.map((l, i) => (
        <div key={`${l.type}-${i}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <PointMarker type={l.type} className="size-4" />
          <span className="truncate text-foreground/80">{typeName(l.type)}</span>
          <span className="tabular-nums text-foreground">{yuan(l.price * l.qty)}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-medium">
        <span>报价合计</span>
        <span className="tabular-nums text-foreground">{yuan(quote.total)}</span>
      </div>
    </div>
  )
}

export default async function ShowcasePage() {
  const data = await getLandingShowcase().catch((error: unknown) => {
    console.error('[showcase] failed to load demo data', error)
    return null
  })
  if (!data) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-8 text-foreground">
        <section className="space-y-4 text-center">
          <h1 className="text-2xl font-semibold">方案暂时无法加载</h1>
          <p className="text-muted-foreground">请稍后重试。</p>
          <Button href="/showcase" label="重试" />
        </section>
      </main>
    )
  }
  const { project, roomCount } = data
  const sheet = data.sheets[0]
  const shownCount = data.sheets.reduce((s, sh) => s + sh.points.length, 0)
  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-hidden p-8">
      <div className="relative w-full max-w-[1920px] overflow-hidden rounded-2xl bg-background p-10 shadow-window ring-1 ring-border">
        {/* 顶栏：品牌 + 项目名 */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-5 w-auto text-foreground" />
            <span className="text-sm text-muted-foreground">全屋智能方案</span>
          </div>
          <div className="text-right">
            <p className="text-xl font-medium tracking-tight">{project.name}</p>
            <p className="text-sm text-muted-foreground">
              {project.community && `${project.community} · `}
              {project.platform}
            </p>
          </div>
        </header>

        {/* 主体：左大数字 + 右点位图，底排报价摘要 */}
        <div className="grid grid-cols-12 items-center gap-10">
          <div className="col-span-3">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              一个点位图，
              <br />
              几分钟出报价。
            </h1>
            <dl className="mt-8 space-y-5">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">设备点位</dt>
                <dd className="text-5xl font-semibold tabular-nums text-foreground">
                  {shownCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">房间</dt>
                <dd className="text-5xl font-semibold tabular-nums text-foreground">{roomCount}</dd>
              </div>
            </dl>
          </div>

          <div className="col-span-6">
            <ShowcaseSheet
              key={sheet?.url}
              constructionUrl={sheet?.url}
              alt={`${project.name} 点位图`}
              markers={sheet ? <SheetMarkers sheet={sheet} /> : null}
            />
          </div>

          <div className="col-span-3">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">报价摘要</p>
            <QuoteSummary data={data} />
          </div>
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>{APP_NAME}</span>
          <span>{COMPANY_NAME}</span>
        </footer>
      </div>
    </main>
  )
}
