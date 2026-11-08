import { relId } from '@/lib/access'
import { getProjectOwnerOptions } from '@/lib/cached-data'
import { fmtLongDate, paymentAmounts } from '@/lib/contracts'
import { FINAL_QUOTE_SOURCE_LABEL, resolveFinalQuote } from '@/lib/deliverables'
import { roleLabel } from '@/lib/project-access'
import { projectDisplayName } from '@/lib/project-name'
import { yuan } from '@/lib/quotes'

import { DeleteProject } from './delete-project'
import { getProject, getProjectDeals } from './project-data'
import { ProjectOverview, type ProjectOverviewData } from './project-overview'

/** 项目信息页：默认展示项目档案与交付进度，点「编辑信息」才进入表单；删除项目在编辑视图底部。 */
export default async function ProjectInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ project, role, readOnly, archived, collaboratorCount }, deals] = await Promise.all([
    getProject(id),
    getProjectDeals(id),
  ])
  const pid = String(project.id)
  const ownerOptions = role === 'owner' ? await getProjectOwnerOptions(project as never) : undefined

  const { contract, quotes } = deals
  const final = resolveFinalQuote(quotes, {
    contractQuoteId: relId(contract?.quote),
    finalQuoteId: relId(project.finalQuote),
  })
  const signed = contract?.status === 'signed'
  const amounts = contract ? paymentAmounts(contract.amount ?? 0, contract.payments ?? []) : []
  const received = (contract?.payments ?? []).reduce(
    (sum, p, i) => sum + (p.received ? amounts[i] : 0),
    0,
  )
  const points = project.pointCount ?? 0

  const stage: ProjectOverviewData['stage'] = archived
    ? { label: '已归档', variant: 'secondary' }
    : signed
      ? { label: '已签约', variant: 'success' }
      : contract
        ? { label: '合同待签', variant: 'warning' }
        : quotes.length
          ? { label: '报价中', variant: 'brand' }
          : points
            ? { label: '布点中', variant: 'outline' }
            : { label: '新建', variant: 'outline' }

  const data: ProjectOverviewData = {
    id: pid,
    displayName: projectDisplayName(project.name),
    customerName: project.customerName ?? null,
    customerPhone: project.customerPhone ?? null,
    community: project.community ?? null,
    address: project.address ?? null,
    platform: project.platform ?? null,
    budget: project.budget ?? null,
    notes: project.notes ?? null,
    updated: fmtLongDate(project.updatedAt),
    roleText:
      role === 'owner'
        ? collaboratorCount
          ? `项目管理员 · ${collaboratorCount} 位协作者`
          : '项目管理员'
        : `协作者（${roleLabel(role)}）`,
    stage,
    progress: [
      {
        key: 'points',
        label: '点位',
        value: points ? `${points} 个点位` : '还没有布点',
        done: points > 0,
        href: `/projects/${pid}/point-map`,
      },
      {
        key: 'quotes',
        label: '报价',
        value: final.quote
          ? `${quotes.length} 份 · ${FINAL_QUOTE_SOURCE_LABEL[final.source!]} ${yuan(final.quote.total ?? 0)}`
          : '还没有报价',
        done: Boolean(
          final.quote &&
          (final.source === 'contract' ||
            final.source === 'chosen' ||
            final.quote.status === 'accepted'),
        ),
        href: `/projects/${pid}/quotes`,
      },
      {
        key: 'contract',
        label: '合同',
        value: contract
          ? signed
            ? `已签订 · 已收 ${yuan(received)}`
            : `待签订 · ${yuan(contract.amount ?? 0)}`
          : '未生成合同',
        done: signed,
        href: `/projects/${pid}/contract`,
      },
      {
        key: 'archive',
        label: '归档',
        value: archived ? `已于 ${fmtLongDate(project.archivedAt)} 归档` : '未归档',
        done: archived,
        href: `/projects/${pid}/archive`,
      },
    ],
  }

  return (
    <ProjectOverview
      data={data}
      owners={ownerOptions}
      readOnly={readOnly}
      form={{
        id: pid,
        name: project.name,
        customerName: project.customerName,
        customerPhone: project.customerPhone,
        community: project.community,
        address: project.address,
        platform: project.platform,
        budget: project.budget,
        notes: project.notes,
        owner: relId(project.owner),
      }}
      danger={
        role === 'owner' ? (
          <DeleteProject projectId={pid} projectName={project.name} quoteCount={quotes.length} />
        ) : null
      }
    />
  )
}
