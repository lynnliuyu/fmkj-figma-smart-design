import { notFound, redirect } from 'next/navigation'

import { PrintToolbar } from '@/components/print-toolbar'
import { ContractDocument } from '@/documents/contract-document'
import { docToolbarGroups, resolveDocSetup } from '@/documents/registry'
import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import type { Project, Quote } from '@/payload-types'

export const metadata = { title: '合同', robots: { index: false, follow: false } }

/**
 * 打印给客户签字的合同：A4 纵向。版式：含报价附件 / 仅正文 / 正式版（封面 + 「第 X 条」+ 签署页 + 附件）/ 订单确认书（单页）。
 * 附件从新的一页开始。
 */
export default async function PrintContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string; layout?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?from=/print/contracts/${id}`)
  const payload = await getPayloadClient()
  const contract = await payload
    .findByID({
      collection: 'contracts',
      id,
      depth: 1,
      user,
      overrideAccess: false,
      populate: {
        projects: { name: true, platform: true, owner: true },
        quotes: {
          title: true,
          items: true,
          fees: true,
          discount: true,
          productTotal: true,
          feeTotal: true,
          total: true,
        },
      },
    })
    .catch(() => null)
  if (!contract) notFound()
  const project = typeof contract.project === 'object' ? (contract.project as Project) : null
  const setup = await resolveDocSetup(
    'contract',
    sp,
    (project ? relId(project.owner) : null) || user.id,
  )
  const { style, company, layout } = setup
  const quote = typeof contract.quote === 'object' ? (contract.quote as Quote) : null
  const confirm = layout === 'confirm'
  const base = `/print/contracts/${id}`
  const href = (patch: { style?: string; layout?: string }) =>
    `${base}?${new URLSearchParams({ style: patch.style ?? style.id, layout: patch.layout ?? layout }).toString()}`

  return (
    <div className="min-h-screen bg-muted/40 pb-8 print:bg-white print:pb-0">
      <PrintToolbar
        back={{
          href: project ? `/projects/${project.id}/archive` : '/projects',
          label: '返回归档',
        }}
        exportName={`${project?.name ?? '项目'}-${confirm ? '订单确认书' : '合同'}-${contract.number}`}
        groups={docToolbarGroups(setup, href)}
      />
      <ContractDocument
        contract={contract}
        project={project}
        quote={quote}
        style={style}
        company={company}
        layout={layout}
      />
    </div>
  )
}
