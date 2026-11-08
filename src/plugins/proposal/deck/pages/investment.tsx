/**
 * 07 投资明细：设备条目 Q01…（与平面编号对应）+ 服务条目 S01…（取自报价单附加费用），右侧总价与按空间核对。
 * 条目多时分页，最后一页带不含项与有效期。
 */
import { cn } from '@/lib/utils'

import { money, yuanShort, type DeckFee, type DeckItem } from '../model'
import { amountFont, Chapter, DeckTable, SectionTitle, Slide, type DeckCtx } from '../parts'

export type InvestRow = { kind: 'item'; item: DeckItem } | { kind: 'fee'; fee: DeckFee }

/** 分页：中间页每页 full 行，最后一页最多 last 行（留出不含项色块） */
export function paginateRows<T>(list: T[], full: number, last: number): T[][] {
  if (list.length <= last) return [list]
  const pages: T[][] = []
  let rest = list
  while (rest.length > last) {
    pages.push(rest.slice(0, full))
    rest = rest.slice(full)
  }
  if (rest.length) pages.push(rest)
  else {
    const prev = pages.pop()!
    pages.push(prev.slice(0, prev.length - 3), prev.slice(prev.length - 3))
  }
  return pages
}

function Summary({ ctx, compact = false }: { ctx: DeckCtx; compact?: boolean }) {
  const { m } = ctx
  const rooms = m.d.rooms.filter((r) => r.subtotal > 0).sort((a, b) => b.subtotal - a.subtotal)
  const shown = rooms.slice(0, 7)
  const restSum = rooms.slice(7).reduce((s, r) => s + r.subtotal, 0)
  return (
    <div
      className={cn(
        'flex w-[300px] shrink-0 flex-col overflow-hidden',
        compact ? 'gap-[7px]' : 'gap-[14px]',
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-[8px] rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-linear-to-br from-doc-soft to-doc-soft-to px-[24px]',
          compact ? 'py-[12px]' : 'py-[22px]',
        )}
      >
        <p className="doc-body text-[13px] text-doc-muted">
          方案总价 / 设备{m.fees.length ? ' + 服务' : ''}
        </p>
        <p
          className={cn(
            amountFont(ctx),
            'truncate leading-tight',
            compact ? 'text-[34px]' : 'text-[38px]',
            ctx.theme.accentAmount && 'text-doc-accent',
          )}
        >{`¥${money(m.finalAmount)}`}</p>
        <p className="doc-body truncate text-[11px] text-doc-muted">
          {m.d.quote ? `依据报价单「${m.d.quote.title}」` : '按当前选型售价核算，未含服务费用'}
        </p>
      </div>
      {[
        ['设备小计', m.deviceTotal],
        ...(m.fees.length ? [['服务小计', m.serviceTotal] as [string, number]] : []),
        ...(m.discount ? [['优惠', -m.discount] as [string, number]] : []),
      ].map(([k, v]) => (
        <div key={k as string} className="flex items-baseline justify-between">
          <span className="doc-body text-[15px]">{k}</span>
          <span className={cn(amountFont(ctx), 'text-[20px] text-doc-accent')}>
            {(v as number) < 0 ? `-¥${money(-(v as number))}` : `¥${money(v as number)}`}
          </span>
        </div>
      ))}
      <div className="h-px w-full bg-doc-rule" />
      <p className="doc-strong text-[16px] leading-normal">
        {m.d.quote ? '当前点位测算 / 仅设备' : '按空间核对 / 仅设备'}
      </p>
      {m.d.quote ? (
        <p className="doc-body text-[12px] leading-relaxed text-doc-muted">
          用于核对空间配置，正式报价以本页条目及方案总价为准。
        </p>
      ) : null}
      <div className={cn('flex flex-col', compact ? 'gap-[4px]' : 'gap-[7px]')}>
        {shown.map((r) => (
          <div
            key={r.areaId}
            className="doc-body flex justify-between gap-3 text-[14px] leading-normal"
          >
            <span className="truncate text-doc-muted">{r.displayName}</span>
            <span className="doc-latin shrink-0">{yuanShort(r.subtotal)}</span>
          </div>
        ))}
        {restSum > 0 ? (
          <div className="doc-body flex justify-between text-[14px] text-doc-muted">
            <span>其余 {rooms.length - shown.length} 个空间</span>
            <span className="doc-latin">{yuanShort(Math.round(restSum * 100) / 100)}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function InvestmentPage({
  ctx,
  no,
  total,
  rows,
  part,
  isLast,
  servicePage,
}: {
  ctx: DeckCtx
  no: number
  total: number
  rows: InvestRow[]
  part: string
  isLast: boolean
  servicePage: number | null
}) {
  const { m } = ctx
  const pending = m.items.filter((i) => i.pending).reduce((s, i) => s + i.count, 0)
  return (
    <Slide ctx={ctx} no={no} total={total} name={`07 投资明细${part}`}>
      <Chapter
        ctx={ctx}
        no={no}
        title="每一笔投入，都有清楚的去向。"
        subtitle={`完整设备与服务报价${part} / 人民币 · 元 / 条目编号可对照已关联平面点位`}
        tag="CLEAR INVESTMENT"
      />
      <div className="flex min-h-0 w-full flex-1 items-start gap-[28px] overflow-hidden">
        <div className="flex w-[1000px] shrink-0 flex-col gap-[10px] overflow-hidden">
          {rows.length ? (
            <DeckTable
              ctx={ctx}
              columns={[
                { label: '条目', className: 'w-[72px]' },
                { label: '空间 / 点位', className: 'w-[150px]' },
                { label: '项目', className: 'w-[156px]' },
                { label: '型号 / 服务范围', className: 'w-[262px]' },
                { label: '数量', className: 'w-[70px]' },
                { label: '单价', className: 'w-[145px]' },
                { label: '金额', className: 'w-[145px]' },
              ]}
              tinted={rows.map((r) => r.kind === 'fee')}
              rows={rows.map((r) =>
                r.kind === 'item'
                  ? [
                      <span key="r" className="doc-latin text-doc-accent">
                        {r.item.ref}
                      </span>,
                      <span key="s" className="doc-body">
                        {r.item.rooms.length === 1
                          ? r.item.rooms[0]
                          : r.item.rooms.length
                            ? `${r.item.rooms[0]}等${r.item.rooms.length}处`
                            : '—'}
                      </span>,
                      <span key="n" className="doc-body">
                        {r.item.typeName}
                      </span>,
                      <span key="m" className="doc-body">
                        {r.item.pending
                          ? '待选型'
                          : [r.item.brand, r.item.sku || r.item.name].filter(Boolean).join(' · ')}
                      </span>,
                      <span key="q" className="doc-body">
                        {r.item.count}
                        {r.item.unit}
                      </span>,
                      <span key="p" className="doc-latin">
                        {r.item.pending ? '—' : money(r.item.price)}
                      </span>,
                      <span key="a" className="doc-latin">
                        {r.item.pending ? '待选型' : money(r.item.subtotal)}
                      </span>,
                    ]
                  : [
                      <span key="r" className="doc-latin text-doc-accent">
                        {r.fee.ref}
                      </span>,
                      <span key="s" className="doc-body">
                        服务
                      </span>,
                      <span key="n" className="doc-body">
                        {r.fee.name}
                      </span>,
                      <span key="m" className="doc-body text-doc-muted">
                        覆盖本方案{m.d.points.length}个点位
                      </span>,
                      <span key="q" className="doc-body">
                        1项
                      </span>,
                      <span key="p" className="doc-latin">
                        {money(r.fee.amount)}
                      </span>,
                      <span key="a" className="doc-latin">
                        {money(r.fee.amount)}
                      </span>,
                    ],
              )}
            />
          ) : (
            <SectionTitle title="还没有选型设备" note="在点位图布置设备后自动生成" />
          )}
          {isLast ? (
            <p className="doc-body text-[12px] leading-[1.7] text-doc-muted">
              Q 条目对应平面点位编号，S 条目为整套服务，无额外设备点位。
              {pending ? `${pending}个点位待选型，未计入合计。` : ''}
              价格为参考报价，正式品牌型号、税费及范围以签约清单为准。
            </p>
          ) : null}
        </div>
        <Summary ctx={ctx} compact={isLast} />
      </div>
      {isLast ? (
        <div className="absolute inset-x-[56px] top-[756px] flex h-[120px] gap-[40px] overflow-hidden rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-(--deck-muted-panel) px-[20px] py-[18px]">
          <div className="min-w-0 flex-1">
            <p className="doc-strong text-[16px] leading-normal">不含项目 / 业主另配</p>
            <p className="doc-body mt-[8px] line-clamp-2 text-[14px] leading-[1.65] text-doc-muted">
              {m.exclusionText}
            </p>
          </div>
          <div className="w-[300px] shrink-0">
            <p className="doc-strong text-[16px] leading-normal">有效至 {m.valid}</p>
            <p className="doc-body mt-[8px] text-[13px] leading-[1.65] text-doc-muted">
              出具之日起15日。
              <br />
              {servicePage
                ? `付款与验收约定见第${String(servicePage).padStart(2, '0')}页。`
                : '付款与验收以合同约定为准。'}
            </p>
          </div>
        </div>
      ) : null}
    </Slide>
  )
}
