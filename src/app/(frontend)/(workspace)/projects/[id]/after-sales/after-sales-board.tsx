'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BadgeCheck,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  DatabaseBackup,
  Ellipsis,
  Headphones,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Shield,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  inWarranty,
  longDay,
  SERVICE_BILLING,
  SERVICE_RECORD_STATUSES,
  SERVICE_RECORD_TYPES,
  serviceBillingLabel,
  serviceStatusLabel,
  serviceTypeLabel,
  toShanghaiDay,
  WARRANTY_STATUS_LABEL,
  type ServiceRecordType,
} from '@/lib/after-sales'
import type { AfterSalesData, ServiceRecordView } from '@/lib/services/after-sales-service'
import { cn } from '@/lib/utils'

import { createConfigBackupAction, deleteServiceRecordAction, saveServiceRecordAction, setServiceRecordStatusAction } from './actions'

const TYPE_ICON: Record<ServiceRecordType, typeof Wrench> = {
  acceptance: BadgeCheck,
  inspection: ClipboardCheck,
  repair: Wrench,
  replacement: RefreshCw,
  remote: Headphones,
  backup: DatabaseBackup,
}
const TITLE_SUGGESTION: Record<ServiceRecordType, string> = {
  acceptance: '竣工交付验收',
  inspection: '定期巡检',
  repair: '上门检修',
  replacement: '设备更换',
  remote: '远程调试',
  backup: '配置备份',
}
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'service', label: '检修与更换' },
  { key: 'inspection', label: '巡检与验收' },
  { key: 'backup', label: '配置备份' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']
const matchesFilter = (r: ServiceRecordView, f: FilterKey) =>
  f === 'all' ||
  (f === 'service' && (r.type === 'repair' || r.type === 'replacement' || r.type === 'remote')) ||
  (f === 'inspection' && (r.type === 'inspection' || r.type === 'acceptance')) ||
  (f === 'backup' && r.type === 'backup')

type FormState = {
  type: ServiceRecordType
  title: string
  serviceDate: string
  status: string
  billing: string
  fee: string
  technician: string
  devices: string
  detail: string
  nextVisitAt: string
}

const yuan = (n: number) => `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`

export function AfterSalesBoard({
  projectId,
  data,
  canEdit,
  archived,
}: {
  projectId: string
  data: AfterSalesData
  canEdit: boolean
  archived: boolean
}) {
  const router = useRouter()
  const today = toShanghaiDay(new Date())!
  const [filter, setFilter] = useState<FilterKey>('all')
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { warranty, stats } = data
  const visible = useMemo(() => data.records.filter((r) => matchesFilter(r, filter)), [data.records, filter])

  const blankForm = (type: ServiceRecordType = 'repair'): FormState => ({
    type,
    title: TITLE_SUGGESTION[type],
    serviceDate: today,
    status: 'done',
    billing: warranty.status === 'expired' ? 'paid' : 'warranty',
    fee: '',
    technician: '',
    devices: '',
    detail: '',
    nextVisitAt: '',
  })
  const openNew = (type?: ServiceRecordType) => {
    setErrors({})
    setEditing({ id: null, form: blankForm(type) })
  }
  const openEdit = (r: ServiceRecordView) => {
    setErrors({})
    setEditing({
      id: r.id,
      form: {
        type: r.type,
        title: r.title,
        serviceDate: r.serviceDate,
        status: r.status,
        billing: r.billing,
        fee: r.fee === null ? '' : String(r.fee),
        technician: r.technician,
        devices: r.devices,
        detail: r.detail,
        nextVisitAt: r.nextVisitAt ?? '',
      },
    })
  }
  const patchForm = (patch: Partial<FormState>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e))
  const changeType = (type: ServiceRecordType) =>
    setEditing((e) => {
      if (!e) return e
      const suggested = Object.values(TITLE_SUGGESTION).includes(e.form.title) || !e.form.title.trim()
      return { ...e, form: { ...e.form, type, title: suggested ? TITLE_SUGGESTION[type] : e.form.title } }
    })
  const changeDate = (serviceDate: string) =>
    setEditing((e) => {
      if (!e) return e
      // 质保已开始计算时，按服务日期是否在质保期内自动带出收费方式（仍可手动修改）
      const billing = warranty.start && e.form.billing !== 'free' ? (inWarranty(warranty, serviceDate) ? 'warranty' : 'paid') : e.form.billing
      return { ...e, form: { ...e.form, serviceDate, billing } }
    })

  const submit = () => {
    if (!editing) return
    const { id, form } = editing
    startTransition(async () => {
      const res = await saveServiceRecordAction(projectId, { ...form, fee: form.billing === 'paid' ? form.fee : null, nextVisitAt: form.nextVisitAt || null }, id)
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
        return
      }
      toast.success(id ? '维保记录已更新' : '已登记维保记录')
      setEditing(null)
      router.refresh()
    })
  }
  const markDone = (r: ServiceRecordView) => {
    setBusyId(r.id)
    startTransition(async () => {
      const res = await setServiceRecordStatusAction(projectId, r.id, 'done')
      setBusyId(null)
      if (!res.ok) return void toast.error(res.error)
      toast.success('已标记为完成')
      router.refresh()
    })
  }
  const remove = (r: ServiceRecordView) => {
    if (!window.confirm(`确定删除「${r.title}」这条记录吗？删除后无法恢复。`)) return
    setBusyId(r.id)
    startTransition(async () => {
      const res = await deleteServiceRecordAction(projectId, r.id)
      setBusyId(null)
      if (!res.ok) return void toast.error(res.error)
      toast.success('已删除')
      router.refresh()
    })
  }
  const backup = () => {
    setBusyId('__backup')
    startTransition(async () => {
      const res = await createConfigBackupAction(projectId)
      setBusyId(null)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`已备份 ${res.devices} 台设备的配置台账`)
      router.refresh()
    })
  }

  const backups = data.records.filter((r) => r.type === 'backup')

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">售后维保</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            质保台账、检修与设备更换记录、配置备份{archived ? ' · 项目已归档，仍可继续登记售后' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/print/projects/${projectId}/after-sales`}>
              <Printer className="size-4" />
              打印维保卡
            </Link>
          </Button>
          {canEdit ? (
            <Button size="sm" onClick={() => openNew()}>
              <Plus className="size-4" />
              新建记录
            </Button>
          ) : null}
        </div>
      </header>

      <WarrantyHero data={data} canEdit={canEdit} onAcceptance={() => openNew('acceptance')} projectId={projectId} />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="检修 / 远程调试" value={`${stats.repairs} 次`} />
        <StatTile label="设备更换" value={`${stats.replacements} 次`} />
        <StatTile label="待处理 / 已预约" value={`${stats.open} 项`} tone={stats.open ? 'warning' : undefined} />
        <StatTile label="下次回访" value={data.nextVisit ? `${Number(data.nextVisit.slice(5, 7))} 月 ${Number(data.nextVisit.slice(8, 10))} 日` : '未安排'} hint={stats.paidTotal ? `保外收费合计 ${yuan(stats.paidTotal)}` : undefined} />
      </dl>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b py-3.5">
            <CardTitle className="text-base">维保记录</CardTitle>
            <div role="tablist" aria-label="筛选维保记录" className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'h-7 rounded-full px-3 text-xs transition-colors',
                    filter === f.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <Shield className="size-6 text-muted-foreground/60" />
                <p className="text-sm font-medium">{data.records.length ? '这个分类下还没有记录' : '还没有维保记录'}</p>
                <p className="max-w-sm text-xs text-muted-foreground">交付时先登记一次「交付验收」，质保就会从那天开始计算；之后的巡检、检修和设备更换都记在这里。</p>
                {canEdit && !data.records.length ? (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => openNew('acceptance')}>
                    <BadgeCheck className="size-4" />
                    登记交付验收
                  </Button>
                ) : null}
              </div>
            ) : (
              <ol className="divide-y">
                {visible.map((r) => (
                  <RecordItem key={r.id} r={r} canEdit={canEdit} busy={busyId === r.id} onEdit={() => openEdit(r)} onDone={() => markDone(r)} onDelete={() => remove(r)} />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="gap-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">配置备份</CardTitle>
              <DatabaseBackup className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs leading-relaxed text-muted-foreground">把当前点位图与定稿报价整理成全屋设备台账留存，日后更换设备、重新配网时以它为基准核对。</p>
              {data.latestBackup?.snapshot ? (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">最近一次 · {data.latestBackup.serviceDate}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{data.latestBackup.snapshot.totals.devices} 台</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {data.latestBackup.snapshot.devices.slice(0, 5).map((d, i) => (
                      <li key={`${d.code}-${i}`} className="flex justify-between gap-2">
                        <span className="truncate">
                          <span className="font-mono text-foreground">{d.code}</span> · {d.room ?? '公共区'} · {d.typeName}
                        </span>
                        <span className="shrink-0 truncate">{d.sku ?? ''}</span>
                      </li>
                    ))}
                  </ul>
                  {data.latestBackup.snapshot.totals.devices > 5 ? <p className="mt-1.5 text-xs text-muted-foreground">完整台账见「打印维保卡」</p> : null}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">还没有配置备份</p>
              )}
              {canEdit ? (
                <Button variant="outline" size="sm" className="w-full" disabled={busyId === '__backup'} onClick={backup}>
                  {busyId === '__backup' ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
                  立即备份当前配置
                </Button>
              ) : null}
              {backups.length > 1 ? <p className="text-xs text-muted-foreground">共 {backups.length} 份备份，旧的备份保留在维保记录里</p> : null}
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">服务依据</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="合同">
                {data.contract ? (
                  <Link href={`/projects/${projectId}/contract`} className="font-medium underline-offset-4 hover:underline">
                    {data.contract.number}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">未生成</span>
                )}
              </Row>
              <Row label="签订日期">{data.contract?.signedAt ?? '—'}</Row>
              <Row label="质保期">{warranty.months} 个月</Row>
              <Row label="交付验收">{data.acceptance ? data.acceptance.serviceDate : '未登记'}</Row>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? '编辑维保记录' : '新建维保记录'}</DialogTitle>
            <DialogDescription>{editing ? SERVICE_RECORD_TYPES.find((t) => t.value === editing.form.type)?.hint : null}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4 py-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="类型" error={errors.type}>
                  <Select value={editing.form.type} onValueChange={(v) => changeType(v as ServiceRecordType)} disabled={editing.form.type === 'backup'}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_RECORD_TYPES.filter((t) => t.value !== 'backup' || editing.form.type === 'backup').map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="服务日期" error={errors.serviceDate} htmlFor="svc-date">
                  <Input id="svc-date" type="date" value={editing.form.serviceDate} onChange={(e) => changeDate(e.target.value)} />
                </Field>
              </div>
              <Field label="摘要" error={errors.title} htmlFor="svc-title">
                <Input id="svc-title" value={editing.form.title} maxLength={120} placeholder="例如：主卧窗帘电机无响应" onChange={(e) => patchForm({ title: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="状态">
                  <Select value={editing.form.status} onValueChange={(v) => patchForm({ status: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_RECORD_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="收费方式">
                  <Select value={editing.form.billing} onValueChange={(v) => patchForm({ billing: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_BILLING.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {editing.form.billing === 'paid' ? (
                  <Field label="收费金额（元）" error={errors.fee} htmlFor="svc-fee">
                    <Input id="svc-fee" type="number" min={0} step="any" inputMode="decimal" value={editing.form.fee} onChange={(e) => patchForm({ fee: e.target.value })} />
                  </Field>
                ) : (
                  <Field label="服务人员" htmlFor="svc-tech">
                    <Input id="svc-tech" value={editing.form.technician} maxLength={40} onChange={(e) => patchForm({ technician: e.target.value })} />
                  </Field>
                )}
              </div>
              {editing.form.billing === 'paid' ? (
                <Field label="服务人员" htmlFor="svc-tech2">
                  <Input id="svc-tech2" value={editing.form.technician} maxLength={40} onChange={(e) => patchForm({ technician: e.target.value })} />
                </Field>
              ) : null}
              <Field label="涉及设备 / 更换明细" htmlFor="svc-devices">
                <Textarea
                  id="svc-devices"
                  rows={2}
                  maxLength={500}
                  value={editing.form.devices}
                  placeholder="例如：主卧 C2 窗帘电机 → 更换为同型号新件（SN 后四位 8812）"
                  onChange={(e) => patchForm({ devices: e.target.value })}
                />
              </Field>
              <Field label="处理过程与结果" htmlFor="svc-detail">
                <Textarea id="svc-detail" rows={3} maxLength={2000} value={editing.form.detail} onChange={(e) => patchForm({ detail: e.target.value })} />
              </Field>
              <Field label="下次回访（可选）" error={errors.nextVisitAt} htmlFor="svc-next">
                <Input id="svc-next" type="date" className="sm:w-48" value={editing.form.nextVisitAt} min={today} onChange={(e) => patchForm({ nextVisitAt: e.target.value })} />
              </Field>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function WarrantyHero({ data, canEdit, onAcceptance, projectId }: { data: AfterSalesData; canEdit: boolean; onAcceptance: () => void; projectId: string }) {
  const w = data.warranty
  if (w.status === 'none') {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-dashed bg-muted/30 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <Shield className="size-5 text-muted-foreground" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">质保还没有开始计算</p>
            <p className="text-sm text-muted-foreground">
              {data.contract ? '合同签订后，或登记一次「交付验收」，系统就会按合同质保期自动倒计时。' : '生成并签订合同（含质保月数），或直接登记「交付验收」后开始计算。'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {!data.contract ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${projectId}/contract`}>去生成合同</Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={onAcceptance}>
              <BadgeCheck className="size-4" />
              登记交付验收
            </Button>
          ) : null}
        </div>
      </div>
    )
  }
  const tone = w.status === 'expired' ? 'destructive' : w.status === 'expiring' ? 'warning' : 'success'
  const Icon = w.status === 'expired' ? ShieldX : w.status === 'expiring' ? ShieldAlert : ShieldCheck
  const days = w.daysLeft ?? 0
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border">
      <div className="grid gap-6 p-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              'flex size-12 items-center justify-center rounded-full',
              tone === 'success' && 'bg-success/12 text-success',
              tone === 'warning' && 'bg-warning/12 text-warning',
              tone === 'destructive' && 'bg-destructive/10 text-destructive-strong',
            )}
          >
            <Icon className="size-6" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">{WARRANTY_STATUS_LABEL[w.status]}</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {days >= 0 ? (
                <>
                  {days}
                  <span className="ml-1 text-base font-normal text-muted-foreground">天后到期</span>
                </>
              ) : (
                <>
                  {Math.abs(days)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">天前已过保</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="space-y-2.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="质保期已过去的比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w.elapsed * 100)}>
            <div
              className={cn('h-full rounded-full', tone === 'success' && 'bg-success', tone === 'warning' && 'bg-warning', tone === 'destructive' && 'bg-destructive')}
              style={{ width: `${Math.max(2, Math.round(w.elapsed * 100))}%` }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              起算 {longDay(w.start)}（{w.startSource === 'acceptance' ? '交付验收' : '合同签订'}）
            </span>
            <span>
              到期 {longDay(w.end)} · 质保 {w.months} 个月
            </span>
          </div>
        </div>
      </div>
      {w.status !== 'active' ? (
        <div className={cn('flex items-center gap-2 border-t px-6 py-2.5 text-xs', tone === 'warning' ? 'bg-warning/10' : 'bg-destructive/5')}>
          <CalendarClock className="size-3.5 shrink-0" />
          {w.status === 'expiring' ? '质保即将到期：建议安排一次到期前巡检，并向业主介绍延保或年度维保服务。' : '已过质保期：后续上门服务默认按「保外收费」登记，可在记录里调整。'}
        </div>
      ) : null}
    </div>
  )
}

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warning' }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-border">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-lg font-semibold tabular-nums', tone === 'warning' && 'text-warning')}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  )
}

function RecordItem({ r, canEdit, busy, onEdit, onDone, onDelete }: { r: ServiceRecordView; canEdit: boolean; busy: boolean; onEdit: () => void; onDone: () => void; onDelete: () => void }) {
  const Icon = TYPE_ICON[r.type]
  return (
    <li className="flex gap-4 px-5 py-4">
      <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', r.status === 'done' ? 'bg-muted text-foreground' : 'bg-warning/12 text-warning')}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{r.title}</span>
          <Badge variant="outline">{serviceTypeLabel(r.type)}</Badge>
          {r.status !== 'done' ? <Badge variant="warning">{serviceStatusLabel(r.status)}</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {[r.serviceDate, r.technician || null, r.type === 'backup' ? null : r.billing === 'paid' && r.fee !== null ? `保外收费 ${yuan(r.fee)}` : serviceBillingLabel(r.billing)].filter(Boolean).join(' · ')}
        </p>
        {r.devices ? <p className="mt-2 text-sm">涉及设备：{r.devices}</p> : null}
        {r.detail ? <p className="mt-1.5 text-sm whitespace-pre-line text-muted-foreground">{r.detail}</p> : null}
        {r.snapshot ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            台账 {r.snapshot.totals.devices} 台设备 · {r.snapshot.totals.rooms} 个空间{r.snapshot.platform ? ` · ${r.snapshot.platform}` : ''}
          </p>
        ) : null}
        {r.nextVisitAt ? (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="size-3" />
            下次回访 {r.nextVisitAt}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`更多操作：${r.title}`} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" />
              编辑
            </DropdownMenuItem>
            {r.status !== 'done' ? (
              <DropdownMenuItem onSelect={onDone}>
                <CircleCheck className="size-4" />
                标记为已完成
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  )
}

function Field({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive-strong">{error}</p> : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}
