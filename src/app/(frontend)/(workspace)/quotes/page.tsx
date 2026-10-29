import Form from 'next/form'
import Link from 'next/link'
import { FileText, Search } from 'lucide-react'
import type { Where } from 'payload'

import { Badge } from '@/components/ui/badge'
import { FilterTabs } from '@/components/filter-tabs'
import { SearchSubmit } from '@/components/search-submit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { QUOTE_STATUSES, quoteStatusLabel, quoteStatusVariant, yuan } from '@/lib/quotes'
import type { Project, Quote } from '@/payload-types'

export const metadata = { title: '报价 · FMKJ 项目管理' }

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await appAuth.getCurrentUser()
  const { q = '', status = '' } = await searchParams
  const payload = await getPayloadClient()

  const where: Where = { and: [] }
  if (q.trim()) where.and!.push({ or: [{ title: { like: q.trim() } }, { 'project.name': { like: q.trim() } }, { 'project.customerName': { like: q.trim() } }] })
  if (status) where.and!.push({ status: { equals: status } })
  const result = await payload.find({
    collection: 'quotes',
    where,
    depth: 1,
    limit: 500,
    sort: '-updatedAt',
    user,
    overrideAccess: false,
    select: { title: true, project: true, status: true, total: true, updatedAt: true },
    populate: { projects: { name: true, customerName: true } },
  })
  const quotes = result.docs as Quote[]

  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, status, ...patch })
    for (const [k, v] of [...params]) if (!v) params.delete(k)
    const s = params.toString()
    return s ? `/quotes?${s}` : '/quotes'
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">报价</h1>
        <p className="text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground tabular-nums">{quotes.length}</span> 份报价；在项目详情页可以从点位图生成新报价
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Form action="/quotes" className="flex flex-wrap items-center gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="搜索报价、项目或客户" aria-label="搜索报价" className="pl-9" />
          </div>
          <SearchSubmit />
        </Form>
        <FilterTabs
          label="按状态筛选"
          items={[{ value: '', label: '全部' }, ...QUOTE_STATUSES].map((s) => ({ key: s.value || 'all', label: s.label, href: href({ status: s.value }), active: status === s.value }))}
        />
      </div>

      {quotes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="font-medium">{q || status ? '没有找到符合条件的报价' : '还没有报价'}</p>
          <p className="text-sm text-muted-foreground">打开一个项目，点击「从点位图生成报价」。</p>
          <Button asChild variant="outline" size="sm" className="mt-2"><Link href="/projects">去项目列表</Link></Button>
        </div>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-6">报价</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="pr-4 text-right md:pr-2">总额</TableHead>
                <TableHead className="hidden pr-6 text-right md:table-cell">更新时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => {
                const project = typeof quote.project === 'object' ? (quote.project as Project) : null
                return (
                  <TableRow key={quote.id} className="relative">
                    <TableCell className="pl-4 sm:pl-6">
                      <Link href={`/quotes/${quote.id}`} className="font-medium after:absolute after:inset-0 hover:underline">{quote.title}</Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">{project ? `${project.name} · ${project.customerName}` : '项目已删除'}</div>
                    </TableCell>
                    <TableCell><Badge variant={quoteStatusVariant(quote.status)}>{quoteStatusLabel(quote.status)}</Badge></TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums md:pr-2">{yuan(quote.total)}</TableCell>
                    <TableCell className="hidden pr-6 text-right text-sm text-muted-foreground tabular-nums md:table-cell">
                      {new Date(quote.updatedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}
