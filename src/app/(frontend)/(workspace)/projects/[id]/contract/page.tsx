import Link from 'next/link'
import { FileSignature, Lock, ReceiptText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ContractDocument } from '@/documents/contract-document'
import { resolveDocSetup } from '@/documents/registry'
import { relId } from '@/lib/access'
import {
  contractStatusLabel,
  DEFAULT_CONTRACT_TERMS,
  fmtLongDate,
  paymentAmounts,
} from '@/lib/contracts'
import { quoteShortTitle } from '@/lib/project-name'
import { yuan } from '@/lib/quotes'
import type { Project, Quote } from '@/payload-types'

import { getProject, getProjectDeals } from '../project-data'
import { CreateContractPanel, type ContractValues, type QuoteOption } from './contract-editor'
import { ContractActions, ContractSectionEdit } from './contract-preview'

/**
 * 合同：每个项目一份，由报价生成。默认显示与导出完全一致的合同预览（和打印页共用 ContractDocument），
 * 需要修改哪一部分就点那一部分的「编辑」；签订后锁定内容，只能登记收款。
 */
export default async function ProjectContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ project, archived, readOnly, role, user, payload }, { quotes, contract }] =
    await Promise.all([getProject(id), getProjectDeals(id)])
  const pid = String(project.id)
  const options: QuoteOption[] = quotes.map((q) => ({
    id: String(q.id),
    title: quoteShortTitle(q.title, project.name),
    total: q.total ?? 0,
    status: q.status,
  }))

  if (!contract) {
    const defaultQuote = options.find((q) => q.status === 'accepted') ?? options[0]
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <header>
          <h2 className="text-xl font-semibold tracking-tight">合同</h2>
        </header>
        {readOnly ? (
          <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            {archived ? '项目已归档，没有合同记录。' : '该项目尚未生成合同（当前为仅查看权限）。'}
          </p>
        ) : defaultQuote ? (
          <CreateContractPanel projectId={pid} quotes={options} defaultQuoteId={defaultQuote.id} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
            <FileSignature className="size-8 text-muted-foreground" />
            <p className="font-medium">先生成一份报价</p>
            <p className="max-w-md text-sm text-muted-foreground">
              合同按报价生成，金额和设备清单都来自报价。
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/projects/${pid}/quotes`}>
                <ReceiptText className="size-4" />
                去报价
              </Link>
            </Button>
          </div>
        )}
      </div>
    )
  }

  // 合同依据的报价一定在选项里（即使被移到列表之外，也补上）
  const quoteId = relId(contract.quote) ?? ''
  if (quoteId && !options.some((q) => q.id === quoteId))
    options.push({
      id: quoteId,
      title: '依据的报价',
      total: contract.amount ?? 0,
      status: 'accepted',
    })

  // 预览与打印页同样的取数：带上项目名称、平台和依据报价的明细
  const [full, setup] = await Promise.all([
    payload
      .findByID({
        collection: 'contracts',
        id: contract.id,
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
      .catch(() => null),
    resolveDocSetup('contract', {}, relId(project.owner) || user.id),
  ])
  const doc = full ?? contract
  const docProject = typeof doc.project === 'object' ? (doc.project as Project) : null
  const docQuote = typeof doc.quote === 'object' ? (doc.quote as Quote) : null

  const signed = contract.status === 'signed'
  const values: ContractValues = {
    id: String(contract.id),
    number: contract.number,
    status: contract.status,
    signedAt: contract.signedAt ?? null,
    quoteId,
    amount: contract.amount ?? 0,
    customerName: contract.customerName ?? '',
    customerPhone: contract.customerPhone ?? '',
    address: contract.address ?? '',
    durationDays: contract.durationDays ?? null,
    warrantyMonths: contract.warrantyMonths ?? null,
    terms: contract.terms ?? DEFAULT_CONTRACT_TERMS,
    payments: (contract.payments ?? []).map((p) => ({
      name: p.name,
      percent: p.percent,
      received: Boolean(p.received),
    })),
  }
  const amounts = paymentAmounts(values.amount, values.payments)
  const received = values.payments.reduce((sum, p, i) => sum + (p.received ? amounts[i] : 0), 0)
  const notice = archived
    ? '项目已归档，合同只读。需要修改时请在「归档」里恢复项目。'
    : role === 'read'
      ? '你对这个项目只有查看权限，合同只读。'
      : signed
        ? `合同已于 ${fmtLongDate(contract.signedAt)} 签订，内容已锁定，仍可在「付款方式」处登记收款。需要修改内容请先撤销签订。`
        : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">合同</h2>
            <Badge variant={signed ? 'success' : 'outline'}>
              {contractStatusLabel(contract.status)}
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span className="font-mono">{contract.number}</span>
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            <span>
              金额{' '}
              <span className="font-medium text-foreground tabular-nums">
                {yuan(values.amount)}
              </span>
            </span>
            {values.payments.length ? (
              <>
                <span aria-hidden className="text-muted-foreground/60">
                  ·
                </span>
                <span>
                  已收{' '}
                  <span className="font-medium text-foreground tabular-nums">{yuan(received)}</span>
                </span>
              </>
            ) : null}
          </p>
        </div>
        <ContractActions
          id={values.id}
          signed={signed}
          readOnly={readOnly}
          printHref={`/print/contracts/${values.id}`}
        />
      </header>

      {notice ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border bg-muted/50 px-4 py-2.5 text-sm"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {notice}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          下面就是导出给客户的合同。把鼠标移到要改的部分，点右上角「编辑」；版式与风格在「打印 /
          导出 PDF」里切换。
        </p>
      )}

      <div className="rounded-xl border bg-muted/40 px-2 pb-6 sm:px-6">
        <ContractDocument
          contract={doc}
          project={docProject}
          quote={docQuote}
          style={setup.style}
          company={setup.company}
          layout={setup.layout}
          edit={
            readOnly
              ? undefined
              : (section) =>
                  signed && section !== 'payments' ? null : (
                    <ContractSectionEdit
                      section={section}
                      values={values}
                      quotes={options}
                      signed={signed}
                    />
                  )
          }
        />
      </div>
    </div>
  )
}
