/**
 * 08 服务交付（1:1 对应 Figma 节点 8:6729）：服务流程、共同验收清单、付款节点、方案与实施边界确认。
 */
import { DocCheckbox } from '@/documents/parts'
import { cn } from '@/lib/utils'

import { money, yuanShort } from '../model'
import { Chapter, DeckTable, SectionTitle, Slide, type DeckCtx } from '../parts'

export function ServicePage({ ctx, no, total }: { ctx: DeckCtx; no: number; total: number }) {
  const { m } = ctx
  const d = m.d
  const steps = [
    ['01', '现场勘测', '复核户型、供电、网络与安装条件'],
    [
      '02',
      '方案确认',
      m.scenes.length
        ? `核对${d.points.length}点、${m.scenes.length}场景、价格及边界`
        : `核对${d.points.length}个点位、价格及边界`,
    ],
    ['03', '安装联调', '设备到场核验，逐点安装与测试'],
    ['04', '验收培训', '共同测试、账号移交与使用培训'],
  ]
  const blank = '________'
  const serviceAddr = [d.company.address, d.company.qrCaption].filter(Boolean).join(' / ')
  return (
    <Slide ctx={ctx} no={no} total={total} name="08 服务交付 · 付款与确认">
      <Chapter
        ctx={ctx}
        no={no}
        title="从一张方案，到每天安心使用。"
        subtitle="服务流程、付款与验收 / 让每个承诺，都有可核对的交付物"
        tag="SERVICE & HANDOVER"
      />
      <div className="flex h-[106px] w-full shrink-0 items-start gap-[28px] overflow-hidden">
        {steps.map(([n, t, note]) => (
          <div
            key={n}
            className={cn(
              'flex min-w-px flex-1 flex-col gap-[8px] overflow-hidden border-t-2 border-doc-accent pt-[12px]',
              ctx.theme.rounded && 'rounded-t-[2px]',
            )}
          >
            <div className="flex items-center gap-[12px] leading-normal whitespace-nowrap">
              <p className="doc-latin text-[22px] text-doc-accent">{n}</p>
              <p className="doc-strong text-[20px]">{t}</p>
            </div>
            <p className="doc-body text-[13px] leading-[1.65] text-doc-muted">{note}</p>
          </div>
        ))}
      </div>
      <div className="flex w-full shrink-0 items-start gap-[40px] overflow-hidden">
        <div className="flex w-[600px] shrink-0 flex-col items-start gap-[15px] overflow-hidden">
          <SectionTitle title="共同验收，逐项打勾" note="现场记录 / 双方签认" />
          <div className="doc-body flex w-full flex-col gap-[13px] text-[15px] leading-[1.65]">
            {m.checks.map((c) => (
              <p key={c} className="flex w-full items-start gap-[10px]">
                <DocCheckbox className="mt-[0.4em]" />
                <span>{c}</span>
              </p>
            ))}
          </div>
          <div className="h-px w-full bg-doc-rule" />
          <p className="doc-body w-full text-[13px] leading-[1.65] text-doc-muted">
            验收资料：点位与设备清单、场景规则、实测记录、账号交接及维护说明。设备保修与售后期限以正式合同、厂家条款为准；变更需先书面确认。
          </p>
          <div className="flex w-full flex-col gap-[6px] overflow-hidden rounded-(--deck-radius-sm) border border-(--deck-panel-border) bg-linear-to-r from-doc-soft to-doc-soft-to p-[18px]">
            <p className="doc-strong text-[16px] leading-[1.65]">{d.company.name}</p>
            <div className="doc-body text-[13px] whitespace-pre-wrap">
              <p className="leading-[1.65]">{`项目顾问：${m.advisor ?? blank}　 电话：${m.advisorPhone ?? blank}`}</p>
              <p className="leading-[1.65]">{`服务地址 / 微信：${serviceAddr || '________________________'}`}</p>
            </div>
          </div>
        </div>
        <div className="flex w-[688px] shrink-0 flex-col items-start gap-[18px] overflow-hidden">
          <SectionTitle
            title="付款节点"
            note={`合计 ${yuanShort(m.finalAmount)} / ${d.contract?.payments?.length ? '按合同约定' : '比例可按合同约定'}`}
          />
          <DeckTable
            ctx={ctx}
            rowClassName="h-[50px] text-[14px]"
            columns={[
              { label: '比例', className: 'w-[90px]' },
              { label: '金额 / 元', className: 'w-[164px]' },
              { label: '支付条件', className: 'w-[434px]' },
            ]}
            rows={m.nodes.map((n) => [
              <span key="p" className="doc-strong text-doc-accent">
                {n.percent}%
              </span>,
              <span key="a" className="doc-body">
                {money(n.amount)}
              </span>,
              <span key="c" className="doc-body">
                {n.name}
              </span>,
            ])}
          />
          <div className="flex w-full flex-col gap-[13px] overflow-hidden rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-diagram) p-[22px] leading-[1.65]">
            <p className="doc-strong text-[20px]">方案与实施边界确认</p>
            <p className="doc-body text-[13px] text-doc-muted">
              请核对项目资料（{m.place}）、{d.points.length}
              个点位、设备规格、费用及不含项后签署。此处确认方案与实施边界，不替代施工图审查或竣工验收；现场差异与增减费用须另行书面确认。
            </p>
            <div className="doc-body flex w-full gap-[30px] pt-[8px]">
              <div className="flex min-w-px flex-1 flex-col gap-[14px]">
                <p className="text-[13px]">客户签字：________________</p>
                <p className="text-[12px] text-doc-muted">日期：______年____月____日</p>
              </div>
              <div className="flex min-w-px flex-1 flex-col gap-[14px]">
                <p className="truncate text-[13px]">
                  服务商 / 负责人：{m.advisor ? `${d.company.name} · ${m.advisor}` : '____________'}
                </p>
                <p className="text-[12px] text-doc-muted">日期：______年____月____日</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Slide>
  )
}
