import { notFound, redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { yuan } from '@/lib/quotes'
import Image from 'next/image'

import { getCompanyInfo } from '@/lib/cached-data'
import type { Media, Project, User } from '@/payload-types'

import { PrintButton } from './print-button'

export const metadata = { title: '报价单' }

/** 给客户的报价单：独立于系统外框，A4 打印 / 另存为 PDF。 */
export default async function PrintQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/quotes/${id}`)
  const payload = await getPayloadClient()
  const quote = await payload.findByID({ collection: 'quotes', id, depth: 2, user, overrideAccess: false, populate: { projects: { pointMap: false } } }).catch(() => null)
  if (!quote) notFound()
  const project = typeof quote.project === 'object' ? (quote.project as Project) : null
  const company = await getCompanyInfo()
  const logo = company.logo
  const qr = company.qrCode
  const contact = [company.phone && `电话：${company.phone}`, company.email && `邮箱：${company.email}`, company.address && `地址：${company.address}`].filter(Boolean) as string[]
  const owner = project && typeof project.owner === 'object' ? (project.owner as User | null) : null
  const showImages = company.printProductImages && (quote.items ?? []).some((i) => i.image && typeof i.image === 'object' && (i.image as Media).url)
  const date = new Date(quote.updatedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-muted/40 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[16mm] text-[13px] leading-relaxed text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-neutral-300 pb-5">
          <div className="flex items-center gap-3">
            {logo ? (
              <Image src={logo.url} alt={logo.alt || company.name} width={logo.width ?? 96} height={logo.height ?? 96} className="h-12 w-auto object-contain" unoptimized />
            ) : null}
            <div>
              <div className="text-lg font-semibold">{company.name}</div>
              {company.slogan ? <div className="text-xs text-neutral-500">{company.slogan}</div> : null}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-wide">报价单</div>
            <div className="text-xs text-neutral-500">{date}</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-8 gap-y-1 py-5 text-[12px]">
          <div><span className="text-neutral-500">客户：</span>{project?.customerName ?? '—'}</div>
          <div><span className="text-neutral-500">项目：</span>{project?.name ?? quote.title}</div>
          <div><span className="text-neutral-500">电话：</span>{project?.customerPhone ?? '—'}</div>
          <div><span className="text-neutral-500">地址：</span>{[project?.community, project?.address].filter(Boolean).join(' ') || '—'}</div>
          {owner ? <div><span className="text-neutral-500">联系人：</span>{owner.name}{owner.phone ? ` ${owner.phone}` : ''}</div> : null}
        </section>

        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-neutral-300 bg-neutral-50 text-left">
              <th className="w-10 py-2 pl-2 font-medium">序号</th>
              {showImages ? <th className="w-14 py-2 font-medium">图片</th> : null}
              <th className="py-2 font-medium">产品</th>
              <th className="py-2 font-medium">型号</th>
              <th className="py-2 text-right font-medium">单价</th>
              <th className="py-2 text-right font-medium">数量</th>
              <th className="py-2 pr-2 text-right font-medium">金额</th>
            </tr>
          </thead>
          <tbody>
            {(quote.items ?? []).map((item, i) => (
              <tr key={item.id ?? i} className="border-b border-neutral-200 break-inside-avoid">
                <td className="py-2 pl-2 tabular-nums">{i + 1}</td>
                {showImages ? (
                  <td className="py-1.5">
                    {item.image && typeof item.image === 'object' && (item.image as Media).url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(item.image as Media).url!} alt="" className="size-10 rounded object-cover" />
                    ) : null}
                  </td>
                ) : null}
                <td className="py-2">{item.name}</td>
                <td className="py-2 text-neutral-500">{item.sku}</td>
                <td className="py-2 text-right tabular-nums">{yuan(item.price)}</td>
                <td className="py-2 text-right tabular-nums">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{yuan(item.price * item.quantity)}</td>
              </tr>
            ))}
            {(quote.fees ?? []).map((fee, i) => (
              <tr key={fee.id ?? `fee-${i}`} className="border-b border-neutral-200 break-inside-avoid">
                <td className="py-2 pl-2 tabular-nums">{(quote.items?.length ?? 0) + i + 1}</td>
                <td className="py-2" colSpan={showImages ? 5 : 4}>{fee.name}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{yuan(fee.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="ml-auto mt-4 w-64 space-y-1 text-[12px] break-inside-avoid">
          <div className="flex justify-between"><span className="text-neutral-500">产品小计</span><span className="tabular-nums">{yuan(quote.productTotal)}</span></div>
          {quote.feeTotal ? <div className="flex justify-between"><span className="text-neutral-500">附加费用</span><span className="tabular-nums">{yuan(quote.feeTotal)}</span></div> : null}
          {quote.discount ? <div className="flex justify-between"><span className="text-neutral-500">优惠</span><span className="tabular-nums">-{yuan(quote.discount)}</span></div> : null}
          <div className="flex items-baseline justify-between border-t border-neutral-300 pt-2">
            <span className="font-medium">合计</span>
            <span className="text-lg font-semibold tabular-nums">{yuan(quote.total)}</span>
          </div>
        </section>

        {quote.notes ? (
          <section className="mt-8 break-inside-avoid border-t border-neutral-200 pt-3 text-[12px]">
            <div className="mb-1 font-medium">备注</div>
            <p className="whitespace-pre-line text-neutral-600">{quote.notes}</p>
          </section>
        ) : null}

        {contact.length || qr?.url ? (
          <section className="mt-8 flex items-center justify-between gap-6 border-t border-neutral-200 pt-3 text-[12px] break-inside-avoid">
            <div>
              <div className="mb-1 font-medium">联系我们</div>
              {contact.map((line) => <p key={line} className="text-neutral-600">{line}</p>)}
            </div>
            {qr ? (
              <figure className="flex flex-col items-center gap-1">
                <Image src={qr.url} alt={qr.alt || '二维码'} width={88} height={88} className="size-[88px] object-contain" unoptimized />
                {company.qrCaption ? <figcaption className="text-[10px] text-neutral-500">{company.qrCaption}</figcaption> : null}
              </figure>
            ) : null}
          </section>
        ) : null}

        <footer className="mt-12 grid grid-cols-2 gap-8 text-[12px] break-inside-avoid">
          <div className="border-t border-neutral-400 pt-2 text-neutral-500">客户确认签字 / 日期</div>
          <div className="border-t border-neutral-400 pt-2 text-neutral-500">{company.name} 盖章 / 日期</div>
        </footer>
      </article>
    </div>
  )
}
