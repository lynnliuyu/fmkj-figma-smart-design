/* eslint-disable @next/next/no-img-element -- 导出 PDF / 图片需要同源普通 <img> */
/**
 * 01 封面（主题的 cover 决定版式）：band = 顶部照片色带 + 下方标题（栖序设计稿原样）；
 * immersive = 整幅照片 + 纸色渐变；split = 左文右图；type = 纯文字大字封面（不用照片）；
 * gallery = 画廊横幅；arch = 拱窗照片；architectural = 左图右文的建筑目录。
 */
import { pointScopeLabel } from '@/lib/point-scopes'

import { yuanShort } from '../model'
import { Brand, headerTagline, imgLoading, PageNumber, Slide, type DeckCtx } from '../parts'

const SUBTITLE = '全屋智能 · 点位设计与服务报价'

function facts(ctx: DeckCtx) {
  const { m } = ctx
  const d = m.d
  return {
    tags: ['生活场景', `${d.points.length}点位设计`, '透明报价', '安心交付'],
    who: `${m.customer}　/　${m.layoutText}`,
    doc: m.date,
    accent:
      [
        m.platform ? `${m.platform}生态` : null,
        d.scope === 'all' ? null : pointScopeLabel(d.scope),
        m.advisor ? `顾问 ${m.advisor}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || '全屋智能设计方案',
    year: m.date.slice(0, 4),
  }
}

export function CoverPage({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const t = ctx.theme
  if (t.cover === 'immersive') return <ImmersiveCover ctx={ctx} no={no} total={total} />
  if (t.cover === 'split') return <SplitCover ctx={ctx} no={no} total={total} />
  if (t.cover === 'type') return <TypeCover ctx={ctx} no={no} total={total} />
  if (t.cover === 'gallery') return <GalleryCover ctx={ctx} no={no} total={total} />
  if (t.cover === 'arch') return <ArchCover ctx={ctx} no={no} total={total} />
  if (t.cover === 'architectural') return <ArchitecturalCover ctx={ctx} no={no} total={total} />
  const f = facts(ctx)
  return (
    <Slide ctx={ctx} no={no} total={total} name="01 封面" cover>
      <div className="absolute inset-x-[56px] top-[28px] flex h-[34px] items-center justify-between">
        <Brand ctx={ctx} large />
        <p className="doc-latin text-[12px] whitespace-nowrap text-doc-muted">{t.coverTagline}</p>
      </div>
      <div className="absolute inset-x-0 top-[90px] h-[520px] overflow-hidden">
        <img src={t.coverPhoto} alt="" {...imgLoading(ctx)} className="size-full object-cover" />
        <span className="doc-body absolute bottom-[26px] left-[56px] bg-white px-[12px] py-[5px] text-[11px] text-[#252523]">
          {t.photoNote}
        </span>
      </div>
      <div className="absolute top-[648px] left-[56px] w-[830px]">
        <h1 className="doc-display text-[56px] leading-[1.25] whitespace-nowrap">{t.headline}</h1>
        <p className="doc-body mt-[14px] text-[24px] leading-normal">{SUBTITLE}</p>
        <div className="mt-[16px] flex items-center gap-[20px]">
          <span
            aria-hidden
            className="h-[3px] w-[100px] bg-linear-to-r from-doc-soft to-doc-soft-to"
          />
          <p className="doc-body text-[14px] whitespace-pre text-doc-muted">
            {f.tags.join('　 /　 ')}
          </p>
        </div>
      </div>
      <div className="absolute top-[650px] left-[930px] flex w-[454px] flex-col gap-[6px] border-l border-doc-rule pl-[28px]">
        <p className="doc-strong truncate text-[24px] leading-normal">{ctx.m.place}</p>
        <p className="doc-body truncate text-[17px] leading-normal text-doc-muted">{f.who}</p>
        <p className="doc-body truncate text-[13px] leading-normal text-doc-accent">{f.accent}</p>
      </div>
      <div className="absolute inset-x-[56px] top-[906px] flex h-[44px] items-center justify-between leading-normal">
        <p className="doc-latin text-[11px] whitespace-pre text-doc-muted">{`${headerTagline(ctx)}      ${f.doc}`}</p>
        <PageNumber ctx={ctx} no={no} total={total} />
      </div>
    </Slide>
  )
}

/** 墨金臻选：整幅照片 + 左侧深色渐变，金色眉标、衬线大标题、底部四栏信息 */
function ImmersiveCover({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const t = ctx.theme
  const f = facts(ctx)
  const d = ctx.m.d
  const cols: [string, string][] = [
    ['PROJECT', ctx.m.place],
    ['CLIENT', f.who],
    ['SCALE', `${d.rooms.length}个空间 · ${d.points.length}个点位`],
    ['INVESTMENT', yuanShort(ctx.m.finalAmount)],
  ]
  return (
    <Slide ctx={ctx} no={no} total={total} name="01 封面" cover>
      <img
        src={t.coverPhoto}
        alt=""
        {...imgLoading(ctx)}
        className="absolute inset-0 size-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-r from-doc-paper via-doc-paper/80 to-doc-paper/10"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[420px] bg-linear-to-t from-doc-paper via-doc-paper/85 to-transparent"
      />
      <div className="absolute inset-x-[56px] top-[36px] flex h-[34px] items-center justify-between">
        <Brand ctx={ctx} large />
        <p className="doc-latin text-[11px] tracking-[0.28em] whitespace-nowrap text-doc-accent">
          {t.coverTagline}
        </p>
      </div>
      <div className="absolute top-[250px] left-[56px] w-[760px]">
        <p className="doc-latin text-[12px] tracking-[0.36em] text-doc-accent">
          SMART LIVING PROPOSAL · {f.year}
        </p>
        <h1 className="doc-display mt-[24px] text-[64px] leading-[1.2] whitespace-nowrap">
          {t.headline}
        </h1>
        <span aria-hidden className="mt-[28px] block h-px w-[120px] bg-doc-accent" />
        <p className="doc-body mt-[24px] text-[22px] leading-normal">{SUBTITLE}</p>
        <p className="doc-body mt-[10px] text-[14px] whitespace-pre text-doc-muted">
          {f.tags.join('　·　')}
        </p>
      </div>
      <div className="absolute inset-x-[56px] top-[748px] grid grid-cols-4 gap-[32px] border-t border-doc-accent/40 pt-[22px]">
        {cols.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <p className="doc-latin text-[10.5px] tracking-[0.3em] text-doc-accent">{k}</p>
            <p
              className={
                k === 'INVESTMENT'
                  ? 'doc-numeral mt-[8px] truncate text-[24px] text-doc-accent'
                  : 'doc-body mt-[10px] truncate text-[16px]'
              }
            >
              {v}
            </p>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-[56px] top-[906px] flex h-[44px] items-center justify-between leading-normal">
        <p className="doc-latin text-[11px] text-doc-muted">
          {f.doc}　 ·　 {f.accent}
        </p>
        <PageNumber ctx={ctx} no={no} total={total} />
      </div>
      <span className="doc-body absolute right-[56px] bottom-[96px] text-[11px] text-doc-muted">
        {t.photoNote}
      </span>
    </Slide>
  )
}

/** 原木自然：左侧文字与项目卡片，右侧圆角竖幅照片 */
function SplitCover({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const t = ctx.theme
  const f = facts(ctx)
  const d = ctx.m.d
  const stats: [string, string][] = [
    ['智能点位', String(d.points.length)],
    ['覆盖空间', String(d.rooms.length)],
    ['方案预算', yuanShort(ctx.m.finalAmount)],
  ]
  return (
    <Slide ctx={ctx} no={no} total={total} name="01 封面" cover>
      <div className="absolute top-[36px] left-[56px] flex h-[34px] items-center">
        <Brand ctx={ctx} large />
      </div>
      <div className="absolute top-[188px] left-[56px] w-[640px]">
        <p className="doc-latin text-[12px] tracking-[0.3em] text-doc-accent">
          {t.coverTagline} · {f.year}
        </p>
        <h1 className="doc-display mt-[22px] text-[54px] leading-[1.25]">{t.headline}</h1>
        <p className="doc-body mt-[18px] text-[22px] leading-normal">{SUBTITLE}</p>
        <div className="mt-[22px] flex flex-wrap gap-[10px]">
          {f.tags.map((tag) => (
            <span
              key={tag}
              className="doc-body rounded-full border border-doc-accent/50 px-[14px] py-[5px] text-[13px] text-doc-accent"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute top-[560px] left-[56px] w-[640px] rounded-(--deck-radius) bg-(--deck-panel) px-[28px] py-[24px]">
        <p className="doc-display truncate text-[24px] leading-normal">{ctx.m.place}</p>
        <p className="doc-body mt-[6px] truncate text-[16px] text-doc-muted">{f.who}</p>
        <div className="mt-[18px] grid grid-cols-3 gap-[16px] border-t border-doc-rule pt-[16px]">
          {stats.map(([k, v]) => (
            <div key={k}>
              <p className="doc-numeral text-[26px] leading-tight text-doc-accent">{v}</p>
              <p className="doc-body mt-[2px] text-[12px] text-doc-muted">{k}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute top-[36px] right-[56px] h-[888px] w-[636px] overflow-hidden rounded-[28px]">
        <img src={t.coverPhoto} alt="" {...imgLoading(ctx)} className="size-full object-cover" />
        <span className="doc-body absolute bottom-[22px] left-[22px] rounded-full bg-(--deck-chip) px-[12px] py-[5px] text-[11px] text-(--deck-chip-ink)">
          {t.photoNote}
        </span>
      </div>
      <div className="absolute top-[906px] left-[56px] flex h-[44px] w-[640px] items-center justify-between leading-normal">
        <p className="doc-latin text-[11px] text-doc-muted">{f.doc}</p>
        <PageNumber ctx={ctx} no={no} total={total} />
      </div>
      <p className="doc-body absolute top-[836px] left-[56px] w-[640px] truncate text-[12px] text-doc-accent">
        {f.accent}
      </p>
    </Slide>
  )
}

/** 纯文字封面（素白极简）：大字标题 + 超大点位数字 + 底部四栏信息，不用照片 */
function TypeCover({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const t = ctx.theme
  const f = facts(ctx)
  const d = ctx.m.d
  const cols: [string, string][] = [
    ['PROJECT', ctx.m.place],
    ['CLIENT', f.who],
    ['SCALE', `${d.rooms.length}个空间 · ${d.points.length}个点位`],
    ['INVESTMENT', yuanShort(ctx.m.finalAmount)],
  ]
  return (
    <Slide ctx={ctx} no={no} total={total} name="01 封面" cover>
      <div className="absolute inset-x-[56px] top-[36px] flex h-[34px] items-center justify-between">
        <Brand ctx={ctx} large />
        <p className="doc-latin text-[11px] tracking-[0.32em] whitespace-nowrap text-doc-muted">
          {t.coverTagline}
        </p>
      </div>
      <div aria-hidden className="absolute inset-x-[56px] top-[96px] h-px bg-doc-ink" />
      <div className="absolute top-[176px] left-[56px] w-[820px]">
        <p className="doc-latin text-[12px] tracking-[0.36em] text-doc-muted">
          PROPOSAL · {f.year}
        </p>
        <h1 className="doc-display mt-[28px] text-[84px] leading-[1.12]">{t.headline}</h1>
        <p className="doc-body mt-[28px] text-[24px] leading-normal">{SUBTITLE}</p>
        <p className="doc-body mt-[12px] text-[14px] whitespace-pre text-doc-muted">
          {f.tags.join('　/　')}
        </p>
      </div>
      <div className="absolute top-[176px] right-[56px] flex w-[420px] flex-col items-end text-right">
        <p className="doc-numeral text-[200px] leading-[0.9] tracking-[-0.04em]">
          {d.points.length}
        </p>
        <p className="doc-latin mt-[10px] text-[12px] tracking-[0.3em] text-doc-muted">
          SMART POINTS · 智能点位
        </p>
        <p className="doc-body mt-[26px] max-w-[420px] truncate text-[14px] text-doc-muted">
          {f.accent}
        </p>
      </div>
      <div className="absolute inset-x-[56px] top-[730px] grid grid-cols-4 gap-[32px] border-t border-doc-ink pt-[22px]">
        {cols.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <p className="doc-latin text-[10.5px] tracking-[0.3em] text-doc-muted">{k}</p>
            <p
              className={
                k === 'INVESTMENT'
                  ? 'doc-numeral mt-[8px] truncate text-[30px]'
                  : 'doc-body mt-[10px] truncate text-[17px]'
              }
            >
              {v}
            </p>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-[56px] top-[906px] flex h-[44px] items-center justify-between leading-normal">
        <p className="doc-latin text-[11px] text-doc-muted">{f.doc}</p>
        <PageNumber ctx={ctx} no={no} total={total} />
      </div>
    </Slide>
  )
}

function CoverFooter({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  return (
    <div className="absolute inset-x-[72px] top-[906px] flex h-[44px] items-center justify-between border-t border-doc-rule">
      <p className="doc-latin text-[11px] text-doc-muted">{facts(ctx).doc}</p>
      <PageNumber ctx={ctx} no={no} total={total} />
    </div>
  )
}

/** 赤陶中古：标题在上，留边横幅照片与侧边项目签条构成画廊式封面。 */
function GalleryCover({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const t = ctx.theme
  const f = facts(ctx)
  return (
    <Slide ctx={ctx} no={no} total={total} name="01 封面" cover>
      <div className="absolute inset-x-[72px] top-[36px] flex h-[34px] items-center justify-between">
        <Brand ctx={ctx} large />
        <p className="doc-latin text-[11px] tracking-[0.16em] text-doc-muted">{t.coverTagline}</p>
      </div>
      <div className="absolute top-[132px] left-[72px] w-[1296px] border-t border-doc-rule pt-[24px]">
        <h1 className="doc-display line-clamp-2 text-[52px] leading-[1.25]">{t.headline}</h1>
        <p className="doc-body mt-[12px] text-[22px] text-doc-muted">{SUBTITLE}</p>
      </div>
      <div className="absolute top-[306px] left-[72px] h-[480px] w-[1008px] border border-doc-rule bg-(--deck-panel) p-[12px]">
        <img src={t.coverPhoto} alt="" {...imgLoading(ctx)} className="size-full object-cover" />
      </div>
      <div className="absolute top-[306px] right-[72px] flex w-[244px] flex-col border-t border-doc-accent pt-[20px]">
        <p className="doc-display text-[25px] leading-[1.45]">{ctx.m.place}</p>
        <p className="doc-body mt-[14px] text-[16px] leading-[1.7] text-doc-muted">{f.who}</p>
        <p className="doc-body mt-[30px] border-t border-doc-rule pt-[18px] text-[14px] leading-[1.7] text-doc-accent">
          {f.accent}
        </p>
        <dl className="doc-body mt-[34px] space-y-[18px] text-[14px]">
          <div>
            <dt className="text-doc-muted">方案内容</dt>
            <dd className="mt-[6px]">
              {ctx.m.d.points.length} 个点位 · {ctx.m.d.rooms.length} 个空间
            </dd>
          </div>
          <div>
            <dt className="text-doc-muted">方案预算</dt>
            <dd className="doc-numeral mt-[6px] text-[27px]">{yuanShort(ctx.m.finalAmount)}</dd>
          </div>
        </dl>
      </div>
      <p className="doc-body absolute top-[806px] left-[72px] text-[11px] text-doc-muted">
        {t.photoNote}
      </p>
      <p className="doc-body absolute top-[844px] left-[72px] text-[14px] text-doc-muted">
        {f.tags.join('　 /　 ')}
      </p>
      <CoverFooter ctx={ctx} no={no} total={total} />
    </Slide>
  )
}

/** 海盐柔雅：拱窗照片与下方题注，左侧以舒展留白承载完整项目信息。 */
function ArchCover({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const t = ctx.theme
  const f = facts(ctx)
  return (
    <Slide ctx={ctx} no={no} total={total} name="01 封面" cover>
      <div className="absolute inset-x-[72px] top-[36px] flex h-[34px] items-center justify-between">
        <Brand ctx={ctx} large />
        <p className="doc-latin text-[11px] tracking-[0.16em] text-doc-muted">{t.coverTagline}</p>
      </div>
      <div className="absolute top-[232px] left-[72px] w-[620px]">
        <h1 className="doc-display line-clamp-2 text-[56px] leading-[1.35]">{t.headline}</h1>
        <p className="doc-body mt-[24px] text-[23px] leading-normal text-doc-muted">{SUBTITLE}</p>
        <span aria-hidden className="mt-[32px] block h-px w-[96px] bg-doc-accent" />
      </div>
      <div className="absolute top-[536px] left-[72px] w-[620px]">
        <p className="doc-display text-[26px] leading-normal">{ctx.m.place}</p>
        <p className="doc-body mt-[14px] text-[17px] text-doc-muted">{f.who}</p>
        <p className="doc-body mt-[12px] text-[14px] text-doc-accent">{f.accent}</p>
        <p className="doc-body mt-[30px] border-t border-doc-rule pt-[18px] text-[16px] text-doc-muted">
          {ctx.m.d.points.length} 个智能点位　/　{ctx.m.d.rooms.length} 个空间　/　
          {yuanShort(ctx.m.finalAmount)}
        </p>
      </div>
      <div className="absolute top-[130px] right-[72px] h-[650px] w-[560px] overflow-hidden rounded-t-[280px] border border-doc-rule bg-(--deck-panel) p-[12px]">
        <div className="size-full overflow-hidden rounded-t-[268px]">
          <img src={t.coverPhoto} alt="" {...imgLoading(ctx)} className="size-full object-cover" />
        </div>
      </div>
      <p className="doc-body absolute top-[800px] right-[72px] w-[560px] text-center text-[11px] text-doc-muted">
        {t.photoNote}
      </p>
      <CoverFooter ctx={ctx} no={no} total={total} />
    </Slide>
  )
}

/** 岩灰建筑：左侧整张竖幅照片，右侧标题与逐行项目目录；无圆角和照片叠字。 */
function ArchitecturalCover({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const t = ctx.theme
  const f = facts(ctx)
  const rows: [string, string][] = [
    ['项目', ctx.m.place],
    ['业主与户型', f.who],
    ['设计规模', `${ctx.m.d.points.length} 个点位 / ${ctx.m.d.rooms.length} 个空间`],
    ['方案预算', yuanShort(ctx.m.finalAmount)],
  ]
  return (
    <Slide ctx={ctx} no={no} total={total} name="01 封面" cover>
      <div className="absolute inset-x-[72px] top-[36px] flex h-[34px] items-center justify-between">
        <Brand ctx={ctx} large />
        <p className="doc-latin text-[11px] tracking-[0.12em] text-doc-muted">{t.coverTagline}</p>
      </div>
      <div className="absolute top-[136px] left-[72px] h-[664px] w-[584px] overflow-hidden border border-doc-rule">
        <img src={t.coverPhoto} alt="" {...imgLoading(ctx)} className="size-full object-cover" />
      </div>
      <p className="doc-body absolute top-[822px] left-[72px] w-[584px] text-[11px] text-doc-muted">
        {t.photoNote}
      </p>
      <div className="absolute top-[136px] right-[72px] w-[640px] border-t border-doc-ink pt-[30px]">
        <h1 className="doc-display line-clamp-2 text-[56px] leading-[1.3]">{t.headline}</h1>
        <p className="doc-body mt-[24px] text-[23px] text-doc-muted">{SUBTITLE}</p>
        <dl className="mt-[70px] border-t border-doc-rule">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[116px_1fr] items-start gap-[20px] border-b border-doc-rule py-[22px]"
            >
              <dt className="doc-body text-[14px] text-doc-muted">{label}</dt>
              <dd className="doc-strong text-[18px] leading-[1.6]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="doc-body mt-[24px] text-[14px] text-doc-accent">{f.accent}</p>
      </div>
      <CoverFooter ctx={ctx} no={no} total={total} />
    </Slide>
  )
}
