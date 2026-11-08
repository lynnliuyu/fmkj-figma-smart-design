import { MapPinned } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import type { CompanyInfo } from '@/lib/cached-data'
import { brandInitials } from '@/lib/brand'
import { cn } from '@/lib/utils'

import { docVars } from './theme'
import type { DocStyle } from './types'

/**
 * 文档模板的通用部件。所有颜色、字体都来自风格变量（bg-doc-*、doc-display …），
 * 同一份结构在不同风格下自动换装；结构差异（页眉、标题、表格形式）由风格的变体字段决定。
 */

/** 文档根节点：写入风格变量，打印时保留背景色。 */
export function DocRoot({
  style,
  className,
  children,
}: {
  style: DocStyle
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      data-doc-style={style.id}
      style={docVars(style)}
      className={cn(
        'doc-body overflow-x-auto text-doc-ink [print-color-adjust:exact] print:overflow-visible',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 纵向 A4 长文（报价单、合同、交底清单）：导出 PDF 时按 A4 自动分页。 */
export function DocArticle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <article
      data-export-page="flow"
      className={cn(
        'mx-auto mt-6 w-[210mm] min-w-[210mm] shrink-0 bg-doc-paper px-[14mm] py-[14mm] text-[12.5px] leading-relaxed shadow-sm print:mt-0 print:w-auto print:min-w-0 print:max-w-none print:p-0 print:shadow-none',
        className,
      )}
    >
      {children}
    </article>
  )
}

/** 横向 A4 单页（点位图）：每页单独导出为一页 PDF。 */
export function DocSheetPage({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      data-export-page
      className={cn(
        'relative mx-auto flex h-[210mm] w-[297mm] min-w-[297mm] shrink-0 flex-col overflow-hidden bg-doc-paper px-[12mm] py-[9mm] shadow-sm break-after-page last:break-after-auto print:h-[209mm] print:shadow-none',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** 品牌名里的英文部分（FMKJ 智能家居 → FMKJ），用于英文副标。 */
export const brandLatin = (name: string) =>
  name.match(/[A-Za-z][A-Za-z0-9&.-]*/)?.[0]?.toUpperCase() ?? ''

/** 品牌标记：有 Logo 用 Logo，自定义公司缺图时显示名称缩写。 */
export function BrandMark({ company, className }: { company: CompanyInfo; className?: string }) {
  const logo = company.logo
  if (logo) {
    return (
      <Image
        src={logo.url}
        alt={logo.alt || company.name}
        width={logo.width ?? 96}
        height={logo.height ?? 96}
        className={cn('w-auto object-contain', className)}
        unoptimized
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex aspect-square shrink-0 items-center justify-center rounded-sm border border-doc-rule text-[10px] font-semibold text-doc-accent',
        className,
      )}
    >
      {brandInitials(company.name)}
    </span>
  )
}

/** 页眉：editorial 品牌标记 + 英文副标 / band 色带 / line 细线。右侧放日期、编号等信息。 */
export function DocHeader({
  style,
  company,
  meta,
}: {
  style: DocStyle
  company: CompanyInfo
  meta?: React.ReactNode
}) {
  if (style.header === 'editorial') {
    const tagline = [brandLatin(company.name), style.tagline].filter(Boolean).join('  /  ')
    return (
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <BrandMark company={company} className="h-[20px]" />
          <span className="doc-display text-[14px] leading-none">{company.name}</span>
        </div>
        <div className="text-right">
          <div className="doc-latin text-[9.5px] whitespace-pre text-doc-muted">{tagline}</div>
          {meta ? <div className="mt-1 text-[10px] text-doc-muted">{meta}</div> : null}
        </div>
      </header>
    )
  }
  const brand = (
    <div className="flex items-center gap-3">
      {company.logo ? (
        <span
          className={cn('flex items-center rounded-doc', style.header === 'band' && 'bg-white p-1')}
        >
          <BrandMark company={company} className="h-10" />
        </span>
      ) : null}
      <div>
        <div className="doc-display text-[16px] leading-tight">{company.name}</div>
        {company.slogan ? (
          <div
            className={cn(
              'text-[10.5px]',
              style.header === 'band' ? 'opacity-80' : 'text-doc-muted',
            )}
          >
            {company.slogan}
          </div>
        ) : null}
      </div>
    </div>
  )
  if (style.header === 'band') {
    return (
      <header className="flex items-center justify-between gap-6 rounded-doc bg-doc-head px-5 py-4 text-doc-head-fg">
        {brand}
        {meta ? <div className="text-right text-[10.5px] opacity-85">{meta}</div> : null}
      </header>
    )
  }
  return (
    <header className="flex items-center justify-between gap-6 border-b border-doc-rule pb-4">
      {brand}
      {meta ? <div className="text-right text-[10.5px] text-doc-muted">{meta}</div> : null}
    </header>
  )
}

/** 文档标题：numbered 大号细体编号 / underline 强调短线 / plain。 */
export function DocTitle({
  style,
  no,
  title,
  subtitle,
  tag,
  center = false,
}: {
  style: DocStyle
  no?: string
  title: string
  subtitle?: React.ReactNode
  tag?: string
  center?: boolean
}) {
  if (center) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="doc-display text-[24px] leading-tight tracking-[0.2em]">{title}</h1>
        {style.title !== 'plain' ? (
          <span aria-hidden className="block h-[3px] w-12 bg-doc-accent" />
        ) : null}
        {subtitle ? <p className="text-[11px] text-doc-muted">{subtitle}</p> : null}
      </div>
    )
  }
  const tagEl = tag ? (
    <span className="doc-latin shrink-0 pb-1 text-[9.5px] tracking-[0.12em] whitespace-nowrap text-doc-muted">
      {tag}
    </span>
  ) : null
  if (style.title === 'numbered') {
    return (
      <div className="flex items-end gap-5">
        {no ? (
          <span className="doc-numeral text-[44px] leading-none whitespace-nowrap text-doc-accent">
            {no}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="doc-display text-[24px] leading-[1.25]">{title}</h1>
          {subtitle ? <p className="text-[11.5px] text-doc-muted">{subtitle}</p> : null}
        </div>
        {tagEl}
      </div>
    )
  }
  return (
    <div className="flex items-end justify-between gap-5">
      <div className="min-w-0 space-y-1.5">
        <h1 className="doc-display text-[23px] leading-tight tracking-wide">{title}</h1>
        {style.title === 'underline' ? (
          <span aria-hidden className="block h-[3px] w-10 bg-doc-accent" />
        ) : null}
        {subtitle ? <p className="text-[11.5px] text-doc-muted">{subtitle}</p> : null}
      </div>
      {no ? (
        <span className="doc-numeral text-[22px] leading-none whitespace-nowrap">{no}</span>
      ) : (
        tagEl
      )}
    </div>
  )
}

/** 分节标题：左侧标题，右侧强调色旁注（来自设计稿「共同验收，逐项打勾 / 现场记录 · 双方签认」）。 */
export function DocSectionHeading({
  style,
  title,
  note,
  className,
}: {
  style: DocStyle
  title: React.ReactNode
  note?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-pdf-keep-next
      className={cn(
        'flex items-baseline justify-between gap-4',
        style.title !== 'numbered' && 'border-b border-doc-rule pb-1.5',
        className,
      )}
    >
      <h2 className="doc-display text-[15px] leading-snug">{title}</h2>
      {note ? <span className="text-right text-[10.5px] text-doc-accent">{note}</span> : null}
    </div>
  )
}

/** 表格样式：ruled 细线 / dark 深色表头 + 斑马纹 / grid 网格。 */
export function docTable(style: DocStyle) {
  const grid = style.table === 'grid'
  const dark = style.table === 'dark'
  return {
    head: cn(
      'bg-doc-head text-left text-doc-head-fg',
      style.table === 'ruled' && 'border-y border-doc-rule',
    ),
    th: cn('doc-strong px-2 py-2 whitespace-nowrap', grid && 'border border-doc-rule'),
    row: (i: number) =>
      cn(
        'break-inside-avoid',
        grid ? '' : 'border-b border-doc-rule',
        dark && i % 2 === 1 && 'bg-doc-stripe',
      ),
    td: cn('px-2', grid && 'border border-doc-rule'),
  }
}

/** 键值信息网格（客户、项目、地址……）。 */
export function DocFacts({
  items,
  cols = 2,
  className,
}: {
  items: [string, React.ReactNode][]
  cols?: 2 | 3 | 4
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-8 gap-y-1.5 text-[11.5px]',
        cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4',
        className,
      )}
    >
      {items.map(([k, v]) => (
        <div key={k} className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-doc-muted">{k}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{v || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 签字栏。 */
export function DocSignatures({
  parties,
  className,
}: {
  parties: { label: string; name?: string | null }[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-10 text-[11.5px] break-inside-avoid',
        parties.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
        className,
      )}
    >
      {parties.map((p) => (
        <div key={p.label} className="space-y-6">
          <div>
            {p.label}：{p.name ? <span className="doc-strong">{p.name}</span> : null}
          </div>
          <div className="border-b border-doc-ink/40 pb-1 text-doc-muted">日期：</div>
        </div>
      ))}
    </div>
  )
}

/** 服务联系卡片（来自设计稿「服务商名称 / 项目顾问 / 电话」）。 */
export function DocContactCard({
  company,
  contact,
  className,
}: {
  company: CompanyInfo
  contact?: { name?: string | null; phone?: string | null } | null
  className?: string
}) {
  const blank = '________'
  return (
    <div
      className={cn(
        'rounded-doc bg-linear-to-r from-doc-soft to-doc-soft-to p-[18px] break-inside-avoid',
        className,
      )}
    >
      <p className="doc-strong text-[13px] leading-[1.65]">{company.name}</p>
      <div className="text-[11px] leading-[1.65]">
        <p>
          项目顾问：{contact?.name || blank}　 电话：{contact?.phone || company.phone || blank}
        </p>
        <p>
          服务地址 / 微信：
          {[company.address, company.qrCaption].filter(Boolean).join(' / ') ||
            '________________________'}
        </p>
      </div>
    </div>
  )
}

/** 页脚：细线 + 左中右三段（地址 / 文件编号 / 页码）。 */
export function DocFooter({
  left,
  center,
  right,
  className,
}: {
  left?: React.ReactNode
  center?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <footer className={cn('space-y-2 break-inside-avoid', className)}>
      <div className="h-px bg-doc-rule" />
      <div className="flex items-start justify-between gap-6 text-[9.5px] text-doc-muted">
        <span className="whitespace-pre">{left}</span>
        <span className="doc-latin whitespace-pre">{center}</span>
        <span className="doc-latin whitespace-nowrap text-doc-ink">{right}</span>
      </div>
    </footer>
  )
}

/** 打勾方框（打印后手写勾选）。用边框画出，不依赖字体里的「□」字形，导出 PDF 时也一致。 */
export function DocCheckbox({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-[0.85em] shrink-0 border border-current', className)}
    />
  )
}

/** 打印页的空状态（只在屏幕上显示，不打印）：一句说明 + 去布置点位。 */
export function DocEmpty({
  projectId,
  children,
}: {
  projectId: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-[297mm] flex-col items-center gap-3 rounded-lg border border-dashed border-foreground/20 bg-background px-6 py-10 text-center print:hidden">
      <MapPinned className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{children}</p>
      <Button asChild size="sm" variant="outline">
        <Link href={`/projects/${projectId}/point-map`}>去布置点位</Link>
      </Button>
    </div>
  )
}
