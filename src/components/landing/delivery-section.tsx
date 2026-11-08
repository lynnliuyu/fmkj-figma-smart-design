import { DOC_KINDS } from '@/documents/registry'
import type { DocStyle } from '@/documents/types'
import {
  DEFAULT_DURATION_DAYS,
  DEFAULT_PAYMENTS,
  DEFAULT_WARRANTY_MONTHS,
  paymentAmounts,
} from '@/lib/contracts'
import { PROPOSAL_TEMPLATES } from '@/plugins/proposal/templates'

import { money, Section, SectionHeader } from './section'

/** 合同与交付文档：付款节点按已确认报价算好；文档目录全部来自文档模板登记表。 */
export function DeliverySection({ total, styles }: { total: number | null; styles: DocStyle[] }) {
  const docs = [
    {
      name: DOC_KINDS.quote.label,
      items: DOC_KINDS.quote.layouts.map((l) => l.label),
      note: `${DOC_KINDS.quote.layouts.length} 种版式 × ${styles.length} 套风格可换`,
    },
    {
      name: '方案演示',
      items: PROPOSAL_TEMPLATES.map((t) => t.label),
      note: 'A4 横版，含封面、点位图、网络与中控拓扑、空间场景与预算',
    },
    {
      name: DOC_KINDS.contract.label,
      items: DOC_KINDS.contract.layouts.map((l) => l.label),
      note: '签订后锁定，只能登记收款',
    },
    {
      name: DOC_KINDS.plans.label,
      items: DOC_KINDS.plans.layouts.map((l) => l.label),
      note: '附设备图例与统计',
    },
    {
      name: DOC_KINDS.checklist.label,
      items: DOC_KINDS.checklist.layouts.map((l) => l.label),
      note: '给安装团队，不含价格',
    },
  ]
  return (
    <Section id="delivery" labelledBy="delivery-title">
      <SectionHeader id="delivery-title" title="合同和交付文档，跟着报价走">
        客户确认报价后一键生成合同，金额、付款节点、工期和质保自动带入。
      </SectionHeader>
      <div className="mt-14 grid gap-6 lg:grid-cols-5">
        {total != null ? <PaymentSchedule total={total} /> : null}
        <div
          className={
            total != null
              ? 'rounded-2xl border border-border bg-card lg:col-span-3'
              : 'rounded-2xl border border-border bg-card lg:col-span-5'
          }
        >
          <h3 className="px-6 pt-6 font-medium sm:px-8 sm:pt-8">交付文档</h3>
          <ul className="mt-3 divide-y divide-border">
            {docs.map((d) => (
              <li
                key={d.name}
                className="grid gap-x-6 gap-y-1 px-6 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:px-8"
              >
                <p className="text-sm font-medium">
                  {d.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                    {d.items.length} 种
                  </span>
                </p>
                <div className="text-sm">
                  <p>{d.items.join(' · ')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{d.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

/** 付款节点：金额由系统按比例计算，最后一期补齐尾差 */
function PaymentSchedule({ total }: { total: number }) {
  const amounts = paymentAmounts(total, DEFAULT_PAYMENTS)
  let before = 0
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 sm:p-8 lg:col-span-2">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-medium">付款节点</h3>
        <p className="text-sm text-muted-foreground">
          合同金额{' '}
          <span className="font-semibold text-foreground tabular-nums">{money(total)}</span>
        </p>
      </div>
      <ol className="mt-7 flex flex-col gap-7">
        {DEFAULT_PAYMENTS.map((p, i) => {
          const start = before
          before += p.percent
          const when = p.name.match(/（(.*)）/)?.[1]
          return (
            <li key={p.name}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm">
                  <span className="font-medium">{p.name.replace(/（.*）/, '')}</span>
                  {when ? <span className="ml-2 text-muted-foreground">{when}</span> : null}
                </p>
                <p className="font-semibold tabular-nums">{money(amounts[i] ?? 0)}</p>
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                {/* 整条代表合同总额：已付的前几期浅色，本期实色 */}
                <div
                  aria-hidden
                  className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/25"
                    style={{ width: `${start}%` }}
                  />
                  <div
                    className="absolute inset-y-0 rounded-full bg-primary"
                    style={{ left: `${start}%`, width: `${p.percent}%` }}
                  />
                </div>
                <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                  {p.percent}%
                </span>
              </div>
            </li>
          )
        })}
      </ol>
      <dl className="mt-auto grid grid-cols-3 gap-4 border-t border-border pt-5 text-sm max-lg:mt-8">
        {[
          ['工期', `${DEFAULT_DURATION_DAYS} 天`],
          ['质保', `${DEFAULT_WARRANTY_MONTHS} 个月`],
          ['合同版式', `${DOC_KINDS.contract.layouts.length} 种`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-1 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
