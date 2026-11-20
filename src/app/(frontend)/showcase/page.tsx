import type { Metadata } from 'next'
import Image from 'next/image'

import { BrandLogo } from '@/components/landing/landing-chrome'
import { PointMarker } from '@/components/point-marker'
import { deviceLook } from '@/board/packs/smart-home/look'
import { categoryOfType, DEVICE_CATEGORIES, deviceTypeOf } from '@/lib/device-types'
import { APP_NAME, COMPANY_NAME } from '@/lib/brand'
import { getLandingShowcase } from '@/lib/landing-showcase'
import { yuan } from '@/lib/quotes'

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

function ShowcaseSheet({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getLandingShowcase>>>
}) {
  const sheet = data.sheets[0]
  if (!sheet) return null
  // 展示版点位图（与施工版同尺寸），回退到 ordinary light 图
  const url = sheet.url.includes('-showcase')
    ? sheet.url
    : sheet.url.replace('-light.png', '-showcase.png')
  // 展示版 PNG 已把房间标签与彩色点位烘焙进去（export-showcase-plans.mjs），
  // 不能在其上再叠一层 SVG 标记——导出脚本对点位做了画布居中+防碰撞偏移，
  // 与页面上原样 rx/ry 画的不重合，会出现成对错位的双重点。
  // 只有拿不到展示版、回退到施工版（light）时才需要在此叠加标记。
  const isShowcase = url.includes('-showcase')
  return (
    <div className="relative aspect-16/9 overflow-hidden rounded-xl ring-1 ring-border">
      {/* 点位图 2400×1600（3:2）在 16:9 容器里占满高度、水平居中：
          内层宽 = 高×3/2 = 27/32 容器宽，左右各留 5/64（7.8125%）。
          内层 div 与图片显示区域严格重合，让回退路径的 SVG 覆盖层
          与图片像素逐一对齐。 */}
      <div className="absolute inset-y-0 left-[7.8125%] w-[84.375%]">
        <Image
          src={url}
          alt={`${data.project.name} 点位图`}
          fill
          sizes="1200px"
          className="object-contain"
          unoptimized
          priority
        />
        {!isShowcase && (
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            className="pointer-events-none absolute inset-0 size-full"
            role="img"
            aria-label={`${sheet.floor}点位图，共 ${data.pointCount} 个设备点位`}
          >
            {sheet.points.map((p) => {
              const look = deviceLook(p.type)
              return (
                <g key={p.id} transform={`translate(${p.rx * VW} ${p.ry * VH})`}>
                  <circle r={12} fill="white" opacity={0.95} />
                  <circle r={10} fill={look.color} />
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

function QuoteSummary({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getLandingShowcase>>>
}) {
  const quote = data.quote
  if (!quote) return null
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
        <span className="tabular-nums text-accent">{yuan(quote.total)}</span>
      </div>
    </div>
  )
}

export default async function ShowcasePage() {
  const data = await getLandingShowcase().catch(() => null)
  if (!data) return null
  const { project, roomCount } = data
  const shownCount = data.sheets.reduce((s, sh) => s + sh.points.length, 0)
  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-hidden p-8">
      <div className="relative w-full max-w-[1920px] overflow-hidden rounded-2xl bg-[var(--background)] p-10 shadow-window ring-1 ring-border">
        {/* 顶栏：品牌 + 项目名 */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-5 w-auto text-accent" />
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
                <dd className="text-5xl font-semibold tabular-nums text-accent">{shownCount}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">房间</dt>
                <dd className="text-5xl font-semibold tabular-nums text-accent">{roomCount}</dd>
              </div>
            </dl>
          </div>

          <div className="col-span-6">
            <ShowcaseSheet data={data} />
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
