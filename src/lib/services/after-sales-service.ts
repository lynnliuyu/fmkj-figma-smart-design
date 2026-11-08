import { APIError, ValidationError } from 'payload'

import { relId } from '@/lib/access'
import {
  isServiceBilling,
  isServiceRecordStatus,
  isServiceRecordType,
  MAX_SNAPSHOT_DEVICES,
  parseServiceSnapshot,
  toShanghaiDay,
  warrantyInfo,
  type ServiceBilling,
  type ServiceRecordStatus,
  type ServiceRecordType,
  type ServiceSnapshot,
  type ServiceSnapshotDevice,
} from '@/lib/after-sales'
import { deviceTypeOf } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import { loadProjectDocs, type ProjectDocsData } from '@/lib/project-docs'
import type { User } from '@/payload-types'

/** 售后维保业务规则（网页 Server Action 与打印页共用）。 */
export type AfterSalesResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export type ServiceRecordInput = {
  type: string
  title: string
  serviceDate: string
  status?: string
  detail?: string
  devices?: string
  billing?: string
  fee?: number | string | null
  technician?: string
  nextVisitAt?: string | null
}

export type ServiceRecordView = {
  id: string
  type: ServiceRecordType
  title: string
  serviceDate: string
  status: ServiceRecordStatus
  detail: string
  devices: string
  billing: ServiceBilling
  fee: number | null
  technician: string
  nextVisitAt: string | null
  snapshot: ServiceSnapshot | null
  createdAt: string
}

function failure(error: unknown, fallback: string) {
  if (error instanceof ValidationError) return '有字段未通过校验，请检查后重试'
  if (error instanceof APIError && error.status < 500) return error.message
  const code = (error as { status?: number })?.status
  if (code === 403) return '没有权限修改这个项目的维保记录'
  if (code === 404) return '记录不存在或已被删除'
  console.error('[after-sales]', fallback, error)
  return fallback
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** 只有日期的字段按上海中午存储，避免跨时区显示成前一天 */
const dayToIso = (day: string) => new Date(`${day}T12:00:00+08:00`).toISOString()
const validDay = (v: unknown) =>
  typeof v === 'string' &&
  DAY_RE.test(v) &&
  !Number.isNaN(new Date(`${v}T12:00:00+08:00`).getTime())
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** 校验并整理表单输入（只接受白名单字段）；配置备份只能由系统生成 */
export function normalizeServiceInput(
  input: ServiceRecordInput,
  opts: { allowBackup?: boolean } = {},
) {
  const fieldErrors: Record<string, string> = {}
  if (!isServiceRecordType(input.type) || (input.type === 'backup' && !opts.allowBackup))
    fieldErrors.type = '请选择记录类型'
  const title = text(input.title, 120)
  if (!title) fieldErrors.title = '请填写摘要'
  if (!validDay(input.serviceDate)) fieldErrors.serviceDate = '请选择服务日期'
  const status: ServiceRecordStatus = isServiceRecordStatus(input.status) ? input.status : 'done'
  const billing: ServiceBilling = isServiceBilling(input.billing) ? input.billing : 'warranty'
  let fee: number | null = null
  if (billing === 'paid') {
    const n = typeof input.fee === 'string' ? Number(input.fee) : input.fee
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10_000_000)
      fieldErrors.fee = '请填写有效的收费金额'
    else fee = Math.round(n * 100) / 100
  }
  const nextVisit = input.nextVisitAt ? String(input.nextVisitAt) : ''
  if (nextVisit && !validDay(nextVisit)) fieldErrors.nextVisitAt = '回访日期无效'
  if (Object.keys(fieldErrors).length) return { ok: false as const, fieldErrors }
  return {
    ok: true as const,
    data: {
      type: input.type as ServiceRecordType,
      title,
      serviceDate: dayToIso(input.serviceDate),
      status,
      detail: text(input.detail, 2000) || null,
      devices: text(input.devices, 500) || null,
      billing,
      fee,
      technician: text(input.technician, 40) || null,
      nextVisitAt: nextVisit ? dayToIso(nextVisit) : null,
    },
  }
}

type RawRecord = {
  id: string | number
  type?: string | null
  title?: string | null
  serviceDate?: string | null
  status?: string | null
  detail?: string | null
  devices?: string | null
  billing?: string | null
  fee?: number | null
  technician?: string | null
  nextVisitAt?: string | null
  snapshot?: unknown
  createdAt?: string | null
}

export const presentServiceRecord = (r: RawRecord): ServiceRecordView => ({
  id: String(r.id),
  type: isServiceRecordType(r.type) ? r.type : 'repair',
  title: r.title ?? '',
  serviceDate: toShanghaiDay(r.serviceDate) ?? toShanghaiDay(r.createdAt) ?? '',
  status: isServiceRecordStatus(r.status) ? r.status : 'done',
  detail: r.detail ?? '',
  devices: r.devices ?? '',
  billing: isServiceBilling(r.billing) ? r.billing : 'warranty',
  fee: typeof r.fee === 'number' ? r.fee : null,
  technician: r.technician ?? '',
  nextVisitAt: toShanghaiDay(r.nextVisitAt),
  snapshot: r.type === 'backup' ? parseServiceSnapshot(r.snapshot) : null,
  createdAt: r.createdAt ?? '',
})

/** 项目的维保台账：全部记录（新的在前）、合同、质保期与下次回访 */
export async function loadAfterSales(user: User, projectId: string) {
  const payload = await getPayloadClient()
  const [records, contracts] = await Promise.all([
    payload.find({
      collection: 'service-records',
      where: { project: { equals: projectId } },
      sort: ['-serviceDate', '-createdAt'],
      limit: 300,
      depth: 0,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'contracts',
      where: { project: { equals: projectId } },
      limit: 1,
      depth: 0,
      user,
      overrideAccess: false,
      select: { number: true, status: true, signedAt: true, warrantyMonths: true },
    }),
  ])
  const list = records.docs.map((r) => presentServiceRecord(r as unknown as RawRecord))
  // 最早的一次交付验收作为质保起算日
  const acceptance =
    list
      .filter((r) => r.type === 'acceptance' && r.status === 'done' && r.serviceDate)
      .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))[0] ?? null
  const contract = contracts.docs[0] ?? null
  const warranty = warrantyInfo(contract, acceptance?.serviceDate ?? null)
  const today = toShanghaiDay(new Date())!
  const upcoming =
    list
      .flatMap((r) => [r.nextVisitAt, r.status === 'scheduled' ? r.serviceDate : null])
      .filter((d): d is string => Boolean(d && d >= today))
      .sort()[0] ?? null
  return {
    records: list,
    contract: contract
      ? {
          id: String(contract.id),
          number: contract.number,
          status: contract.status,
          signedAt: toShanghaiDay(contract.signedAt),
          warrantyMonths: contract.warrantyMonths ?? null,
        }
      : null,
    warranty,
    acceptance,
    nextVisit: upcoming,
    latestBackup: list.find((r) => r.type === 'backup' && r.snapshot) ?? null,
    stats: {
      repairs: list.filter((r) => r.type === 'repair' || r.type === 'remote').length,
      replacements: list.filter((r) => r.type === 'replacement').length,
      open: list.filter((r) => r.status !== 'done').length,
      paidTotal:
        Math.round(list.reduce((s, r) => s + (r.billing === 'paid' ? (r.fee ?? 0) : 0), 0) * 100) /
        100,
    },
  }
}
export type AfterSalesData = Awaited<ReturnType<typeof loadAfterSales>>

export async function saveServiceRecord(
  user: User,
  projectId: string,
  input: ServiceRecordInput,
  id?: string | null,
): Promise<AfterSalesResult<{ id: string }>> {
  const payload = await getPayloadClient()
  let existingType: string | null = null
  if (id) {
    const existing = await payload
      .findByID({
        collection: 'service-records',
        id,
        depth: 0,
        user,
        overrideAccess: false,
        select: { project: true, type: true },
      })
      .catch(() => null)
    if (!existing || relId(existing.project) !== String(projectId))
      return { ok: false, error: '记录不存在或已被删除' }
    existingType = existing.type ?? null
  }
  // 配置备份只能由系统生成；编辑已有备份时保持类型不变
  const normalized = normalizeServiceInput(
    existingType === 'backup' ? { ...input, type: 'backup' } : input,
    { allowBackup: existingType === 'backup' },
  )
  if (!normalized.ok)
    return {
      ok: false,
      error: Object.values(normalized.fieldErrors)[0] ?? '请检查填写的内容',
      fieldErrors: normalized.fieldErrors,
    }
  if (existingType && existingType !== 'backup' && normalized.data.type === 'backup')
    return { ok: false, error: '不能把记录改成配置备份' }
  try {
    const doc = id
      ? await payload.update({
          collection: 'service-records',
          id,
          data: normalized.data,
          user,
          overrideAccess: false,
          depth: 0,
          select: { title: true },
        })
      : await payload.create({
          collection: 'service-records',
          data: { ...normalized.data, project: projectId },
          user,
          overrideAccess: false,
          depth: 0,
          select: { title: true },
        })
    return { ok: true, id: String(doc.id) }
  } catch (error) {
    return { ok: false, error: failure(error, '保存失败，请稍后重试') }
  }
}

export async function setServiceRecordStatus(
  user: User,
  id: string,
  status: string,
): Promise<AfterSalesResult> {
  if (!isServiceRecordStatus(status)) return { ok: false, error: '状态无效' }
  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'service-records',
      id,
      data: { status },
      user,
      overrideAccess: false,
      depth: 0,
      select: { status: true },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failure(error, '更新失败，请稍后重试') }
  }
}

export async function deleteServiceRecord(user: User, id: string): Promise<AfterSalesResult> {
  try {
    const payload = await getPayloadClient()
    await payload.delete({ collection: 'service-records', id, user, overrideAccess: false })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failure(error, '删除失败，请稍后重试') }
  }
}

/** 由已读取的项目文档数据生成全屋设备台账（按房间排列，房间外的设备排在最后） */
export function snapshotFromDocs(d: ProjectDocsData): ServiceSnapshot {
  const floorOf = new Map(d.floors.map((f) => [f.sheetId, f.floorName]))
  const seen = new Set<string>()
  const devices: ServiceSnapshotDevice[] = []
  const push = (p: (typeof d.points)[number], room: string | null, floor: string | null) => {
    if (seen.has(p.id) || devices.length >= MAX_SNAPSHOT_DEVICES) return
    seen.add(p.id)
    const prod = p.productId ? d.productById.get(p.productId) : null
    devices.push({
      code: p.code || '—',
      type: p.deviceType,
      typeName: deviceTypeOf(p.deviceType)?.name ?? '设备',
      room,
      floor,
      product: prod?.name ?? null,
      sku: prod?.sku ?? null,
    })
  }
  for (const room of d.rooms) for (const p of room.points) push(p, room.displayName, room.floorName)
  for (const p of d.points) push(p, null, p.sheetId ? (floorOf.get(p.sheetId) ?? null) : null)
  const finalQuote = d.finalQuoteId ? d.quotes.find((q) => q.id === d.finalQuoteId) : null
  return {
    version: 1,
    takenAt: new Date().toISOString(),
    platform: d.project.platform ?? null,
    quote: finalQuote
      ? { id: finalQuote.id, title: finalQuote.title, total: finalQuote.total }
      : null,
    totals: { devices: d.points.length, rooms: d.rooms.length, sheets: d.sheets.length },
    devices,
  }
}

/** 按当前点位图与定稿报价生成全屋设备台账快照 */
export async function buildServiceSnapshot(
  user: User,
  projectId: string,
): Promise<ServiceSnapshot | null> {
  const d = await loadProjectDocs(projectId, user, 'all', null).catch(() => null)
  return d ? snapshotFromDocs(d) : null
}

/** 留存一份配置备份（设备台账快照） */
export async function createConfigBackup(
  user: User,
  projectId: string,
): Promise<AfterSalesResult<{ id: string; devices: number }>> {
  const snapshot = await buildServiceSnapshot(user, projectId)
  if (!snapshot) return { ok: false, error: '项目不存在或无权访问' }
  if (!snapshot.devices.length) return { ok: false, error: '点位图里还没有设备，布置点位后再备份' }
  try {
    const payload = await getPayloadClient()
    const today = toShanghaiDay(new Date())!
    const doc = await payload.create({
      collection: 'service-records',
      data: {
        project: projectId,
        type: 'backup',
        title: `配置备份 · ${snapshot.totals.devices} 台设备 / ${snapshot.totals.rooms} 个空间`,
        serviceDate: dayToIso(today),
        status: 'done',
        billing: 'free',
        detail: snapshot.quote
          ? `依据报价：${snapshot.quote.title}（¥${snapshot.quote.total.toLocaleString('zh-CN')}）`
          : '依据当前点位图与项目默认型号',
        snapshot: snapshot as never,
      },
      user,
      overrideAccess: false,
      depth: 0,
      select: { title: true },
    })
    return { ok: true, id: String(doc.id), devices: snapshot.devices.length }
  } catch (error) {
    return { ok: false, error: failure(error, '备份失败，请稍后重试') }
  }
}
