import Link from 'next/link'
import { AlertCircle, FileText, MapPinned } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { BetaDocLink } from '@/components/beta-doc-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { relId } from '@/lib/access'
import { resolveFinalQuote } from '@/lib/deliverables'
import { fmtDate } from '@/lib/projects'
import { quoteStatusLabel, quoteStatusVariant, yuan } from '@/lib/quotes'
import { loadProjectFeedback } from '@/lib/services/client-feedback-service'

import { getProject, getProjectDeals } from '../project-data'
import { ClientFeedbackList, type FeedbackItem } from './client-feedback-list'
import { DeleteQuoteButton, GenerateQuoteForm } from './quote-controls'
import { SetFinalQuoteButton } from './set-final-button'
import { quoteShortTitle } from '@/lib/project-name'

/** 报价：项目里的全部报价。从点位图生成，逐行换型号、改价后打印给客户。 */
export default async function ProjectQuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const [{ user, project, readOnly, role }, { quotes, contract }] = await Promise.all([
    getProject(id),
    getProjectDeals(id),
  ])
  const pid = String(project.id)
  // 业主在分享页提交的意向反馈（归档后仍可查看；仅查看的协作者不能处理）
  const feedback: FeedbackItem[] = (await loadProjectFeedback(user, pid)).map((f) => ({
    ...f,
    createdLabel: new Date(f.createdAt).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  }))
  const points = project.pointCount ?? 0
  const contractQuoteId = relId(contract?.quote)
  // 定稿：合同依据 → 手动设为定稿 → 已接受 → 最新；交付资料包与方案默认用它
  const final = resolveFinalQuote(quotes, {
    contractQuoteId,
    finalQuoteId: relId(project.finalQuote),
  })
  const finalId = final.quote ? String(final.quote.id) : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">报价</h2>
          <p className="text-sm text-muted-foreground">
            {points ? `已关联点位图 ${points} 个点位` : '未布置点位，可新建空白报价'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 采购备货：按定稿报价汇总采购清单（Beta 单据），放在报价主操作旁边 */}
          <BetaDocLink label="采购备货" href={`/print/projects/${pid}/procurement`} />
          {readOnly ? null : <GenerateQuoteForm projectId={pid} hasPoints={points > 0} />}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong"
        >
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {feedback.length ? (
        <ClientFeedbackList
          projectId={pid}
          items={feedback}
          readOnly={role === 'read'}
          canCreateQuote={!readOnly}
        />
      ) : null}

      {quotes.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="还没有报价"
          description={
            points ? '按点位图自动生成设备清单与金额' : '布置点位后可自动汇总设备数量与型号'
          }
          action={
            points ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${pid}/point-map`}>
                  <MapPinned className="size-4" />
                  去布置点位
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background shadow-2xs">
          {quotes.map((q) => {
            const qid = String(q.id)
            const usedByContract = qid === contractQuoteId
            const isFinal = qid === finalId
            return (
              <li
                key={qid}
                className="group relative flex items-center gap-3 px-4 py-4 transition-colors hover:bg-subtle/80 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/projects/${pid}/quotes/${qid}`}
                    className="block truncate text-sm font-semibold text-foreground after:absolute after:inset-0 group-hover:text-primary"
                  >
                    {quoteShortTitle(q.title, project.name)}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {isFinal && quotes.length > 1 ? (
                      <Badge className="bg-primary text-primary-foreground">定稿</Badge>
                    ) : null}
                    <Badge variant={quoteStatusVariant(q.status)}>
                      {quoteStatusLabel(q.status)}
                    </Badge>
                    {usedByContract ? <span>已用于合同 {contract?.number}</span> : null}
                    <span className="tabular-nums">更新于 {fmtDate(q.updatedAt)}</span>
                  </div>
                </div>
                <span className="text-right text-lg font-bold text-foreground tabular-nums">
                  {yuan(q.total)}
                </span>
                {readOnly || usedByContract ? null : (
                  <div className="relative z-10 flex items-center gap-1">
                    {!isFinal && !contractQuoteId ? (
                      <SetFinalQuoteButton projectId={pid} quoteId={qid} />
                    ) : null}
                    <DeleteQuoteButton quoteId={qid} title={q.title} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
